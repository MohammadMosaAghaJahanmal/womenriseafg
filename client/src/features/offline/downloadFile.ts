import { OfflineError, type OfflineFile, type OfflineFileDraft } from './types';

const allowedMedia = /^\/api\/v1\/media\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\/file$/i;
const allowedBook = /^\/api\/v1\/books\/[a-z0-9]+(?:-[a-z0-9]+)*\/file$/;
const fileTypes = {
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'text/plain': 'txt',
  'text/vtt': 'vtt',
} as const;

function mimeType(value: string | null) {
  return value?.split(';')[0]?.trim().toLowerCase() ?? '';
}

export function isOfflineFileType(value: string): value is keyof typeof fileTypes {
  return Object.hasOwn(fileTypes, value);
}

export function validateFileSource(source: OfflineFileDraft, kind: string) {
  let url: URL;
  try { url = new URL(source.url, window.location.origin); }
  catch { throw new OfflineError('invalid'); }
  const isBook = allowedBook.test(url.pathname);
  if (url.origin !== window.location.origin || url.username || url.password || url.hash || url.search !== '?download=true' ||
      (kind === 'book' ? !isBook : !allowedMedia.test(url.pathname))) throw new OfflineError('invalid');
  if (source.sizeBytes != null && (!Number.isSafeInteger(source.sizeBytes) || source.sizeBytes <= 0)) {
    throw new OfflineError('invalid');
  }
  const expected = mimeType(source.mimeType ?? null);
  if (expected && !isOfflineFileType(expected)) throw new OfflineError('invalid');
  return { url: url.pathname + url.search, sizeBytes: source.sizeBytes ?? null, expected: isBook ? 'application/pdf' : expected };
}

function attachmentName(disposition: string, type: keyof typeof fileTypes) {
  const encoded = /(?:^|;)\s*filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]?.trim();
  const plain = /(?:^|;)\s*filename="([^"]+)"/i.exec(disposition)?.[1];
  let name = plain ?? '';
  if (encoded) {
    try { name = decodeURIComponent(encoded); } catch { /* Use the plain filename when available. */ }
  }
  const safe = name.replace(/[/\\\p{Cc}\p{Cf}\u2028\u2029]/gu, '').trim().slice(0, 128);
  return safe && safe !== '.' && safe !== '..' ? safe : 'resource.' + fileTypes[type];
}

export async function downloadFile(
  source: ReturnType<typeof validateFileSource>,
  signal: AbortSignal,
  checkSize: (size: number) => void,
  progress: (loaded: number, total: number | null) => void,
): Promise<{ file: OfflineFile; blob: Blob }> {
  let response: Response | undefined;
  try {
    response = await fetch(source.url, {
      method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal,
    });
    if ([401, 403, 404, 410].includes(response.status)) throw new OfflineError('denied');
    if (response.status !== 200 || response.redirected || !response.body) throw new OfflineError('network');
    const type = mimeType(response.headers.get('Content-Type'));
    const disposition = response.headers.get('Content-Disposition') ?? '';
    if (!isOfflineFileType(type) || (source.expected && source.expected !== type) || !/^attachment(?:\s*;|$)/i.test(disposition)) {
      throw new OfflineError('denied');
    }
    // The fetch stream may have been decompressed by the browser.
    const encoding = response.headers.get('Content-Encoding');
    const length = encoding && encoding !== 'identity' ? null : response.headers.get('Content-Length');
    const declared = length && /^\d+$/.test(length) ? Number(length) : null;
    if (declared !== null && (!Number.isSafeInteger(declared) || declared <= 0)) throw new OfflineError('network');
    if (declared !== null) checkSize(declared);
    progress(0, declared ?? source.sizeBytes);
    let loaded = 0;
    let lastUpdate = performance.now();
    const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        checkSize(loaded);
        if (performance.now() - lastUpdate >= 100) {
          progress(loaded, declared ?? (source.sizeBytes !== null && loaded <= source.sizeBytes ? source.sizeBytes : null));
          lastUpdate = performance.now();
        }
        controller.enqueue(chunk);
      },
    }));
    const blob = await new Response(stream, { headers: { 'Content-Type': type } }).blob();
    if (loaded === 0 || loaded !== blob.size || (declared !== null && loaded !== declared)) throw new OfflineError('network');
    progress(loaded, loaded);
    return { file: { name: attachmentName(disposition, type), mimeType: type, sizeBytes: loaded }, blob };
  } catch (error) {
    if (!response?.bodyUsed) void response?.body?.cancel().catch(() => undefined);
    if (signal.aborted) throw new OfflineError('cancelled');
    if (error instanceof OfflineError) throw error;
    throw new OfflineError('network');
  }
}
