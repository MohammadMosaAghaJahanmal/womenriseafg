import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export function openPdf(url: string) {
  return getDocument({
    url, enableXfa: false, useWasm: false, disableFontFace: true, useSystemFonts: true,
    useWorkerFetch: false, disableStream: true, disableAutoFetch: true, maxImageSize: 16_000_000,
  });
}
