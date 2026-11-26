import { createHash, randomUUID } from 'node:crypto';
import { constants, createWriteStream } from 'node:fs';
import { link, lstat, mkdir, open, readdir, realpath, statfs, unlink, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { MediaError, type MediaKind, type StoredFile } from './contract';
import { binaryReader, inspectMediaBytes, InvalidMediaFile } from './file-formats';

const knownFormats = {
  mp4: { mimeType: 'video/mp4', kinds: ['video'] },
  mp3: { mimeType: 'audio/mpeg', kinds: ['audio'] },
  m4a: { mimeType: 'audio/mp4', kinds: ['audio'] },
  wav: { mimeType: 'audio/wav', kinds: ['audio'] },
  png: { mimeType: 'image/png', kinds: ['image'] },
  jpg: { mimeType: 'image/jpeg', kinds: ['image'] },
  webp: { mimeType: 'image/webp', kinds: ['image'] },
  pdf: { mimeType: 'application/pdf', kinds: ['pdf', 'attachment'] },
  vtt: { mimeType: 'text/vtt', kinds: ['subtitle'] },
  txt: { mimeType: 'text/plain', kinds: ['transcript', 'attachment'] },
} satisfies Record<string, { mimeType: string; kinds: MediaKind[] }>;

type Extension = keyof typeof knownFormats;
const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const uuid = new RegExp('^' + uuidPattern + '$');
const objectName = new RegExp('^' + uuidPattern + '\\.(' + Object.keys(knownFormats).join('|') + ')$');
const tempName = new RegExp('^' + uuidPattern + '\\.upload$');
const staleAgeMs = 24 * 60 * 60 * 1000;

function hasCode(error: unknown, code: string) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function nameAndExtension(name: string): { originalName: string; extension: Extension } {
  const originalName = name.normalize('NFC');
  const hasControl = [...originalName].some(character => {
    const code = character.codePointAt(0)!;
    return code < 32 || (code >= 127 && code <= 159);
  });
  if (Buffer.byteLength(originalName) > 240 || originalName.length < 3 ||
      hasControl || /^\s|\s$|[\u202a-\u202e\u2066-\u2069/\\:]/u.test(originalName) ||
      originalName.startsWith('.')) throw new MediaError('INVALID_FILE');
  const fromName = path.extname(originalName).slice(1).toLowerCase();
  const extension = fromName === 'jpeg' ? 'jpg' : fromName;
  if (!Object.hasOwn(knownFormats, extension)) throw new MediaError('INVALID_FILE');
  return { originalName, extension: extension as Extension };
}

async function validateDirectory(directory: string) {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || path.relative(directory, await realpath(directory)) !== '') {
    throw new MediaError('STORAGE_UNAVAILABLE');
  }
}

async function makeDirectory(directory: string) {
  try {
    await mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if (!hasCode(error, 'EEXIST')) throw error;
  }
  await validateDirectory(directory);
}

async function openRegularFile(file: string) {
  const expected = await lstat(file, { bigint: true });
  if (!expected.isFile() || expected.isSymbolicLink()) throw new MediaError('NOT_FOUND');
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
  const handle = await open(file, flags);
  try {
    const actual = await handle.stat({ bigint: true });
    // Windows lstat may leave the device field unset while fstat resolves the volume.
    if (!actual.isFile() || (expected.dev !== 0n && actual.dev !== expected.dev) ||
        actual.ino !== expected.ino || actual.size !== expected.size) {
      throw new MediaError('STORAGE_UNAVAILABLE');
    }
    return { handle, stat: { size: Number(actual.size), mtimeMs: Number(actual.mtimeMs), mtimeNs: actual.mtimeNs } };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function digest(handle: FileHandle) {
  const hash = createHash('sha256');
  const stream = handle.createReadStream({ autoClose: false });
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

export function parseByteRange(raw: string, size: number) {
  const match = /^bytes=(\d{0,20})-(\d{0,20})$/i.exec(raw.trim());
  if (!match || (!match[1] && !match[2]) || size < 1) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    return suffix ? { start: Math.max(0, size - suffix), end: size - 1 } : null;
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start < 0 || start >= size || end < start) return null;
  return { start, end };
}

function disposition(name: string, download: boolean) {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const utf8 = encodeURIComponent(name).replace(/['()*]/g, value => '%' + value.charCodeAt(0).toString(16).toUpperCase());
  return (download ? 'attachment' : 'inline') + '; filename="' + fallback + "\"; filename*=UTF-8''" + utf8;
}

function mappedFailure(error: unknown, missing: 'NOT_FOUND' | 'STORAGE_UNAVAILABLE') {
  if (error instanceof MediaError) return error;
  if (error instanceof InvalidMediaFile) return new MediaError('INVALID_FILE');
  return new MediaError(hasCode(error, 'ENOENT') ? missing : 'STORAGE_UNAVAILABLE');
}

export function createMediaFiles(storageRoot: string, maxBytes: number) {
  const root = path.resolve(storageRoot);
  const mediaDir = path.join(root, 'media');
  const incoming = path.join(mediaDir, 'incoming');
  const objects = path.join(mediaDir, 'objects');

  async function directories() {
    try {
      await mkdir(root, { recursive: true, mode: 0o700 });
      await validateDirectory(root);
      await makeDirectory(mediaDir);
      await Promise.all([makeDirectory(incoming), makeDirectory(objects)]);
    } catch (error) {
      throw mappedFailure(error, 'STORAGE_UNAVAILABLE');
    }
  }

  function incomingPath(file: Express.Multer.File) {
    if (!tempName.test(file.filename) || file.path !== path.join(incoming, file.filename)) {
      throw new MediaError('STORAGE_UNAVAILABLE');
    }
    return file.path;
  }

  async function removeRegular(file: string) {
    try {
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink()) throw new MediaError('STORAGE_UNAVAILABLE');
      await unlink(file);
    } catch (error) {
      if (!hasCode(error, 'ENOENT')) throw mappedFailure(error, 'STORAGE_UNAVAILABLE');
    }
  }

  async function discard(file?: Express.Multer.File) {
    if (!file) return;
    await directories();
    await removeRegular(incomingPath(file));
  }

  const storage: multer.StorageEngine = {
    _handleFile(_request, file, finish) {
      const work = async () => {
        await directories();
        const filename = randomUUID() + '.upload';
        const target = path.join(incoming, filename);
        const output = createWriteStream(target, { flags: 'wx', mode: 0o600 });
        let created = false;
        output.once('open', () => { created = true; });
        try {
          await pipeline(file.stream, output);
          return { filename, path: target, destination: incoming, size: output.bytesWritten };
        } catch (error) {
          if (created) await removeRegular(target);
          throw error;
        }
      };
      void work().then(info => finish(null, info), (error: unknown) => finish(mappedFailure(error, 'STORAGE_UNAVAILABLE')));
    },
    _removeFile(_request, file, finish) {
      void discard(file).then(() => finish(null), (error: unknown) => finish(mappedFailure(error, 'STORAGE_UNAVAILABLE')));
    },
  };

  const upload = multer({
    storage,
    preservePath: true,
    defParamCharset: 'utf8',
    limits: { files: 1, fields: 1, parts: 2, fieldSize: 24 * 1024, fieldNameSize: 32, fieldNestingDepth: 0, fileSize: maxBytes },
    fileFilter(_request, file, finish) {
      try {
        nameAndExtension(file.originalname);
      } catch {
        finish(new MediaError('INVALID_FILE'));
        return;
      }
      finish(null, true);
    },
  }).single('file');

  const receive: RequestHandler = (request, response, next) => {
    if (!request.is('multipart/form-data')) { next(new MediaError('INVALID_FILE')); return; }
    upload(request, response, (error?: unknown) => {
      if (!error) return next(request.file ? undefined : new MediaError('INVALID_FILE'));
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return next(new MediaError('UPLOAD_TOO_LARGE'));
      next(error instanceof MediaError ? error : new MediaError('INVALID_FILE'));
    });
  };

  async function persist(file: Express.Multer.File, id: string, kind: MediaKind): Promise<StoredFile> {
    await directories();
    const { originalName, extension } = nameAndExtension(file.originalname);
    const format = knownFormats[extension];
    if (!uuid.test(id) || !format.kinds.some(allowed => allowed === kind)) throw new MediaError('INVALID_FILE');
    try {
      const source = incomingPath(file);
      const { handle, stat } = await openRegularFile(source);
      try {
        if (stat.size !== file.size || stat.size < 1) throw new MediaError('INVALID_FILE');
        if (stat.size > maxBytes) throw new MediaError('UPLOAD_TOO_LARGE');
        const metadata = await inspectMediaBytes(extension, binaryReader(handle, stat.size));
        const sha256 = await digest(handle);
        const verified = await handle.stat({ bigint: true });
        if (verified.size !== BigInt(stat.size) || verified.mtimeNs !== stat.mtimeNs) throw new MediaError('STORAGE_UNAVAILABLE');

        // Linking within this private volume atomically chooses a new name.
        // Unlike rename on Linux, link cannot overwrite a previous asset.
        const storageKey = id + '.' + extension;
        await link(source, path.join(objects, storageKey));
        return { storageKey, originalName, mimeType: format.mimeType, sizeBytes: stat.size, sha256, ...metadata };
      } finally {
        await handle.close();
      }
    } catch (error) {
      throw mappedFailure(error, 'STORAGE_UNAVAILABLE');
    }
  }

  async function remove(storageKey: string) {
    if (!objectName.test(storageKey)) throw new MediaError('STORAGE_UNAVAILABLE');
    await directories();
    await removeRegular(path.join(objects, storageKey));
  }

  async function send(request: Request, response: Response, file: StoredFile, options: { public: boolean; download: boolean }) {
    const match = objectName.exec(file.storageKey);
    if (!match || !Object.hasOwn(knownFormats, match[1]!) ||
        knownFormats[match[1] as Extension].mimeType !== file.mimeType || !/^[0-9a-f]{64}$/.test(file.sha256)) {
      throw new MediaError('NOT_FOUND');
    }
    await directories();
    const opened = await openRegularFile(path.join(objects, file.storageKey)).catch((error: unknown) => {
      throw mappedFailure(error, 'NOT_FOUND');
    });
    try {
      const { handle, stat } = opened;
      if (stat.size !== file.sizeBytes || stat.size < 1) throw new MediaError('NOT_FOUND');
      const etag = '"' + file.sha256 + '"';
      const modified = Math.floor(stat.mtimeMs / 1000) * 1000;
      const contentType = file.mimeType + (file.mimeType.startsWith('text/') ? '; charset=utf-8' : '');
      response.set({
        'Content-Type': contentType,
        'Content-Disposition': disposition(file.originalName, options.download),
        'Cache-Control': options.public ? 'public, max-age=0, must-revalidate' : 'private, no-store',
        'Accept-Ranges': 'bytes',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
        ETag: etag,
        'Last-Modified': new Date(modified).toUTCString(),
      });
      if (file.mimeType === 'application/pdf' || file.mimeType.startsWith('text/')) {
        response.set('Content-Security-Policy', "sandbox; default-src 'none'");
      }
      const conditional = request.get('If-None-Match');
      if (options.public && conditional?.split(',').some(tag => ['*', etag, 'W/' + etag].includes(tag.trim()))) {
        response.status(304).end();
        return;
      }
      const ifRange = request.get('If-Range');
      const useRange = !ifRange || ifRange === etag || Date.parse(ifRange) === modified;
      const range = request.method === 'GET' && useRange ? request.get('Range') : undefined;
      const requested = range ? parseByteRange(range, stat.size) : null;
      if (range && !requested) {
        response.set('Content-Range', 'bytes */' + stat.size).set('Content-Length', '0').status(416).end();
        return;
      }
      const { start, end } = requested ?? { start: 0, end: stat.size - 1 };
      if (requested) response.set('Content-Range', 'bytes ' + start + '-' + end + '/' + stat.size);
      response.status(requested ? 206 : 200).set('Content-Length', String(end - start + 1));
      if (request.method === 'HEAD') { response.end(); return; }
      try {
        await pipeline(handle.createReadStream({ start, end, autoClose: false }), response);
      } catch (error) {
        if (!hasCode(error, 'ERR_STREAM_PREMATURE_CLOSE') || !response.destroyed) throw error;
      }
    } finally {
      await opened.handle.close();
    }
  }

  async function space() {
    await directories();
    try {
      const stat = await statfs(objects, { bigint: true });
      const asSafeNumber = (value: bigint) => Number(value > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : value);
      return { capacityBytes: asSafeNumber(stat.blocks * stat.bsize), freeBytes: asSafeNumber(stat.bavail * stat.bsize) };
    } catch (error) {
      throw mappedFailure(error, 'STORAGE_UNAVAILABLE');
    }
  }

  async function staleKeys(directory: string, pattern: RegExp) {
    await directories();
    const cutoff = Date.now() - staleAgeMs;
    const names = await readdir(directory, { withFileTypes: true });
    const stale: string[] = [];
    for (const entry of names) {
      if (!entry.isFile() || !pattern.test(entry.name)) continue;
      try {
        const info = await lstat(path.join(directory, entry.name));
        if (info.isFile() && !info.isSymbolicLink() && info.mtimeMs < cutoff) stale.push(entry.name);
      } catch (error) {
        if (!hasCode(error, 'ENOENT')) throw mappedFailure(error, 'STORAGE_UNAVAILABLE');
      }
    }
    return stale;
  }

  async function cleanupStaleUploads() {
    const stale = await staleKeys(incoming, tempName);
    for (const name of stale) await removeRegular(path.join(incoming, name));
    return stale.length;
  }

  return { receive, persist, discard, remove, send, space, cleanupStaleUploads, staleObjects: () => staleKeys(objects, objectName) };
}
