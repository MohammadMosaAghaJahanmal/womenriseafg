import type { FileHandle } from 'node:fs/promises';

interface Dimensions { width: number; height: number }
export interface IntrinsicMetadata {
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export class InvalidMediaFile extends Error {}

function fail(): never {
  throw new InvalidMediaFile('The media file does not match its supported format.');
}

export function binaryReader(file: FileHandle, size: number) {
  return { size, async read(position: number, length: number) {
    if (!Number.isSafeInteger(position) || position < 0 || length < 0 || position + length > size) return fail();
    const bytes = Buffer.alloc(length);
    let completed = 0;
    while (completed < length) {
      const { bytesRead } = await file.read(bytes, completed, length - completed, position + completed);
      if (!bytesRead) return fail();
      completed += bytesRead;
    }
    return bytes;
  } };
}

type Reader = ReturnType<typeof binaryReader>;

function dimensions(width: number, height: number): Dimensions {
  if (width < 1 || height < 1 || width > 16000 || height > 16000 || width * height > 64_000_000) return fail();
  return { width, height };
}

function duration(samples: number, rate: number) {
  const millis = Math.round(samples * 1000 / rate);
  if (!Number.isSafeInteger(millis) || millis < 1 || millis > 0xffffffff) return fail();
  return millis;
}

async function png(reader: Reader) {
  const start = await reader.read(0, 33);
  if (!start.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      start.readUInt32BE(8) !== 13 || start.toString('ascii', 12, 16) !== 'IHDR' ||
      start[26] !== 0 || start[27] !== 0 || (start[28] !== 0 && start[28] !== 1)) return fail();
  const result = dimensions(start.readUInt32BE(16), start.readUInt32BE(20));
  let hasImage = false;
  let offset = 33;
  for (let i = 0; offset + 12 <= reader.size && i < 8192; i++) {
    const chunk = await reader.read(offset, 8);
    const length = chunk.readUInt32BE(0);
    const type = chunk.toString('ascii', 4);
    offset += 12 + length;
    if (offset > reader.size) return fail();
    if (type === 'IDAT' && length > 0) hasImage = true;
    if (type === 'IEND') {
      if (length !== 0 || offset !== reader.size || !hasImage) return fail();
      return result;
    }
  }
  return fail();
}

async function jpeg(reader: Reader) {
  const start = await reader.read(0, 2);
  const end = await reader.read(reader.size - 2, 2);
  if (start.readUInt16BE() !== 0xffd8 || end.readUInt16BE() !== 0xffd9) return fail();
  let offset = 2;
  let result: Dimensions | undefined;
  for (let i = 0; offset + 4 <= reader.size && i < 512; i++) {
    const segment = await reader.read(offset, 4);
    const marker = segment[1]!;
    if (segment[0] !== 0xff) return fail();
    if (marker === 0xff) { offset++; continue; }
    const length = segment.readUInt16BE(2);
    if (length < 2 || offset + 2 + length > reader.size - 2) return fail();
    if (marker === 0xda) {
      return result && offset + 2 + length < reader.size - 2 ? result : fail();
    }
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) return fail();
      const frame = await reader.read(offset + 4, 6);
      if (frame[0] !== 8 || ![1, 3, 4].includes(frame[5]!)) return fail();
      result = dimensions(frame.readUInt16BE(3), frame.readUInt16BE(1));
    }
    offset += 2 + length;
  }
  return fail();
}

interface RiffChunk { type: string; position: number; length: number }

async function riffChunks(reader: Reader, format: string) {
  const header = await reader.read(0, 12);
  if (header.toString('ascii', 0, 4) !== 'RIFF' || header.readUInt32LE(4) + 8 !== reader.size ||
      header.toString('ascii', 8) !== format) return fail();
  const chunks: RiffChunk[] = [];
  let offset = 12;
  while (offset + 8 <= reader.size && chunks.length < 4096) {
    const chunk = await reader.read(offset, 8);
    const length = chunk.readUInt32LE(4);
    chunks.push({ type: chunk.toString('ascii', 0, 4), position: offset + 8, length });
    offset += 8 + length + length % 2;
  }
  return offset === reader.size ? chunks : fail();
}

async function webp(reader: Reader) {
  const chunks = await riffChunks(reader, 'WEBP');
  const encoded = chunks.find(chunk => ['VP8 ', 'VP8L'].includes(chunk.type));
  if (!encoded) return fail();
  if (encoded.type === 'VP8L') {
    if (encoded.length < 6) return fail();
    const header = await reader.read(encoded.position, 5);
    if (header[0] !== 0x2f || (header[4]! & 0xe0) !== 0) return fail();
    const shape = header.readUInt32LE(1);
    return dimensions((shape & 0x3fff) + 1, ((shape >>> 14) & 0x3fff) + 1);
  }
  if (encoded.length < 11) return fail();
  const header = await reader.read(encoded.position, 10);
  if ((header[0]! & 1) !== 0 || header.readUIntBE(3, 3) !== 0x9d012a) return fail();
  return dimensions(header.readUInt16LE(6) & 0x3fff, header.readUInt16LE(8) & 0x3fff);
}

async function wav(reader: Reader) {
  const chunks = await riffChunks(reader, 'WAVE');
  const fmt = chunks.find(chunk => chunk.type === 'fmt ');
  const data = chunks.find(chunk => chunk.type === 'data');
  if (!fmt || fmt.length < 16 || !data || data.length < 1) return fail();
  const header = await reader.read(fmt.position, 16);
  const format = header.readUInt16LE(0);
  const channels = header.readUInt16LE(2);
  const rate = header.readUInt32LE(4);
  const align = header.readUInt16LE(12);
  const depth = header.readUInt16LE(14);
  if ((format !== 1 && format !== 3) || channels < 1 || channels > 8 || rate < 8000 || rate > 192000 ||
      ![8, 16, 24, 32].includes(depth) || (format === 3 && depth !== 32) || align !== channels * depth / 8 ||
      header.readUInt32LE(8) !== rate * align || data.length % align !== 0) return fail();
  return duration(data.length, rate * align);
}

async function mp3(reader: Reader) {
  const header = await reader.read(0, 10);
  let offset = 0;
  if (header.toString('ascii', 0, 3) === 'ID3') {
    const length = [...header.subarray(6, 10)];
    if (header[3]! < 2 || header[3]! > 4 || length.some(byte => byte > 127)) return fail();
    offset = 10 + length.reduce((total, byte) => total * 128 + byte, 0);
    if (header[3] === 4 && (header[5]! & 0x10) !== 0) offset += 10;
  }
  const first = (await reader.read(offset, 4)).readUInt32BE();
  const version = (first >>> 19) & 3;
  const bitrateIndex = (first >>> 12) & 15;
  const rateIndex = (first >>> 10) & 3;
  if (first >>> 21 !== 0x7ff || (first >>> 17 & 3) !== 1 || version === 1 ||
      rateIndex === 3 || !bitrateIndex || bitrateIndex === 15) return fail();
  const rates = [44100, 48000, 32000];
  const bitrates = version === 3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] :
    [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
  const sampleRate = rates[rateIndex]! / (version === 3 ? 1 : version === 2 ? 2 : 4);
  const frameSize = Math.floor((version === 3 ? 144000 : 72000) * bitrates[bitrateIndex]! / sampleRate) + ((first >>> 9) & 1);
  const second = (await reader.read(offset + frameSize, 4)).readUInt32BE();
  if ((second >>> 21) !== 0x7ff || ((first ^ second) & 0x001e0c00) !== 0) return fail();
  const sideInfo = version === 3 ? ((first >>> 6 & 3) === 3 ? 17 : 32) : ((first >>> 6 & 3) === 3 ? 9 : 17);
  const xingOffset = 4 + sideInfo + ((first >>> 16 & 1) === 1 ? 0 : 2);
  if (xingOffset + 12 > frameSize) return null;
  const xing = await reader.read(offset + xingOffset, 12);
  if (!['Xing', 'Info'].includes(xing.toString('ascii', 0, 4)) || !(xing.readUInt32BE(4) & 1)) return null;
  return duration(xing.readUInt32BE(8) * (version === 3 ? 1152 : 576), sampleRate);
}

interface Box { type: string; start: number; end: number }

function isoBoxes(reader: Reader) {
  let remaining = 4096;
  return async function boxes(from: number, to: number): Promise<Box[]> {
    const result: Box[] = [];
    let offset = from;
    while (offset < to) {
      if (--remaining < 0 || to - offset < 8) return fail();
      const header = await reader.read(offset, 8);
      const type = header.toString('latin1', 4);
      const shortSize = header.readUInt32BE();
      const headerSize = shortSize === 1 ? 16 : 8;
      const length = shortSize === 0 ? to - offset : shortSize === 1
        ? Number((await reader.read(offset + 8, 8)).readBigUInt64BE()) : shortSize;
      if (!Number.isSafeInteger(length) || length < headerSize || length > to - offset) return fail();
      result.push({ type, start: offset + headerSize, end: offset + length });
      offset += length;
    }
    return result;
  };
}

function box(input: Box[], key: string) {
  const matching = input.filter(item => item.type === key);
  return matching.length === 1 ? matching[0]! : fail();
}

async function isoMedia(reader: Reader, video: boolean): Promise<IntrinsicMetadata> {
  const boxes = isoBoxes(reader);
  const root = await boxes(0, reader.size);
  const ftyp = box(root, 'ftyp');
  const brandLength = ftyp.end - ftyp.start;
  if (brandLength < 8 || brandLength > 256 || brandLength % 4 !== 0 ||
      !root.some(item => item.type === 'mdat' && item.end > item.start)) return fail();
  const brands = (await reader.read(ftyp.start, brandLength)).toString('latin1').match(/.{4}/gs) ?? [];
  brands.splice(1, 1); // Minor version is numeric, not a compatible brand.
  if (!brands.some(brand => /^(isom|iso[2-9]|mp4[12]|avc1|M4[AV] |dash)$/.test(brand))) return fail();
  const moov = box(root, 'moov');
  const movie = await boxes(moov.start, moov.end);
  const mvhd = box(movie, 'mvhd');
  if (mvhd.end - mvhd.start < 20) return fail();
  const version = (await reader.read(mvhd.start, 1))[0];
  if ((version !== 0 && version !== 1) || (version === 1 && mvhd.end - mvhd.start < 32)) return fail();
  const times = await reader.read(mvhd.start + (version === 1 ? 20 : 12), version === 1 ? 12 : 8);
  const ticks = version === 1 ? Number(times.readBigUInt64BE(4)) : times.readUInt32BE(4);
  const fragmented = movie.some(item => item.type === 'mvex') && root.some(item => item.type === 'moof');
  const durationMs = ticks === 0 && fragmented ? null : duration(ticks, times.readUInt32BE(0));
  let picture: Dimensions | undefined;
  let audio = false;
  for (const track of movie.filter(item => item.type === 'trak')) {
    const fields = await boxes(track.start, track.end);
    const mdia = box(fields, 'mdia');
    const media = await boxes(mdia.start, mdia.end);
    const hdlr = box(media, 'hdlr');
    if (hdlr.end - hdlr.start < 12) return fail();
    const handler = (await reader.read(hdlr.start + 8, 4)).toString('ascii');
    if (handler !== 'vide' && handler !== 'soun') return fail();
    const minf = box(media, 'minf');
    const stbl = box(await boxes(minf.start, minf.end), 'stbl');
    const stsd = box(await boxes(stbl.start, stbl.end), 'stsd');
    if (stsd.end - stsd.start < 16) return fail();
    const descriptionCount = (await reader.read(stsd.start + 4, 4)).readUInt32BE();
    const descriptions = await boxes(stsd.start + 8, stsd.end);
    const types = handler === 'vide' ? ['avc1', 'avc3'] : ['mp4a'];
    if (!descriptionCount || descriptions.length !== descriptionCount ||
        descriptions.some(item => !types.includes(item.type))) return fail();
    if (handler === 'soun') {
      audio = true;
    } else {
      if (!video || picture || descriptions.some(item => item.end - item.start < 78)) return fail();
      const shape = await reader.read(descriptions[0]!.start + 24, 4);
      picture = dimensions(shape.readUInt16BE(0), shape.readUInt16BE(2));
    }
  }
  if (video ? !picture : !audio) return fail();
  return { width: picture?.width ?? null, height: picture?.height ?? null, durationMs };
}

async function pdf(reader: Reader) {
  const header = (await reader.read(0, 8)).toString('ascii');
  if (!/^%PDF-[12]\.\d$/.test(header)) return fail();
  const length = Math.min(reader.size, 2048);
  const tail = (await reader.read(reader.size - length, length)).toString('latin1');
  const end = /startxref\s+(\d+)\s+%%EOF[\t\n\r\f ]*$/.exec(tail);
  if (!end) return fail();
  const offset = Number(end[1]);
  if (!Number.isSafeInteger(offset) || offset < 8 || offset > reader.size - 8) return fail();
  // A PDF cross-reference section is either a plain xref or an indirect object stream.
  const mark = (await reader.read(offset, Math.min(40, reader.size - offset))).toString('ascii');
  if (!/^(?:xref[\t\r\n ]|\d+\s+\d+\s+obj(?:\s|<))/.test(mark)) return fail();
}

function timestamp(value: string) {
  const parts = value.split(':').map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

async function text(reader: Reader, captions: boolean) {
  if (reader.size > 4 * 1024 * 1024) return fail();
  let value: string;
  try {
    value = new TextDecoder('utf-8', { fatal: true }).decode(await reader.read(0, reader.size));
  } catch { return fail(); }
  if (!value.trim()) return fail();
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if ((code < 32 && ![9, 10, 13].includes(code)) || (code >= 127 && code <= 159)) return fail();
  }
  if (captions) {
    const normalized = value.replace(/\r\n?/g, '\n');
    if (!/^WEBVTT(?:[ \t][^\n]*)?\n/.test(normalized) || /^\s*(?:STYLE|REGION)\s*$/m.test(normalized)) return fail();
    const timing = /^(?:\d{2,6}:)?[0-5]\d:[0-5]\d\.\d{3}\s+-->\s+(?:\d{2,6}:)?[0-5]\d:[0-5]\d\.\d{3}(?:[ \t][^\n]*)?$/gm;
    const cues = [...normalized.matchAll(timing)];
    if (!cues.length || cues.some(cue => {
      const pair = cue[0].split(/\s+-->\s+/, 2);
      return timestamp(pair[1]!.split(/[ \t]/, 1)[0]!) <= timestamp(pair[0]!);
    })) return fail();
  } else if (/^\s*(?:#!|<\?|<!DOCTYPE|<(?:html|script|svg|iframe|object|head|body|applet)(?:\s|>))/i.test(value)) {
    return fail();
  }
}

export async function inspectMediaBytes(extension: string, reader: Reader): Promise<IntrinsicMetadata> {
  if (reader.size < 1) return fail();
  const base: IntrinsicMetadata = { width: null, height: null, durationMs: null };
  switch (extension) {
    case 'png': return { ...base, ...await png(reader) };
    case 'jpg': return { ...base, ...await jpeg(reader) };
    case 'webp': return { ...base, ...await webp(reader) };
    case 'wav': return { ...base, durationMs: await wav(reader) };
    case 'mp3': return { ...base, durationMs: await mp3(reader) };
    case 'mp4': return isoMedia(reader, true);
    case 'm4a': return isoMedia(reader, false);
    case 'pdf': await pdf(reader); break;
    case 'vtt': await text(reader, true); break;
    case 'txt': await text(reader, false); break;
    default: return fail();
  }
  return base;
}
