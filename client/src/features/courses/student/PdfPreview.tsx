import { useEffect, useRef, useState } from 'react';
import { AnnotationMode, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { useTranslation } from 'react-i18next';
import { Button, Pagination, StatePanel } from '../../../components/ui/Primitives';
import { openPdf } from '../../pdf/openPdf';
import { localizedNumber } from './components';
import { courseNamespace } from './strings';

function PdfPage({ document, page }: { document: PDFDocumentProxy; page: number }) {
  const { t, i18n } = useTranslation(courseNamespace);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [text, setText] = useState('');
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    async function render(output: HTMLCanvasElement) {
      try {
        const source = await document.getPage(page);
        if (cancelled) return;
        const size = source.getViewport({ scale: 1 });
        const limit = Math.min(1440 / size.width, 2048 / size.height, 2);
        const viewport = source.getViewport({ scale: limit });
        output.width = Math.max(1, Math.floor(viewport.width));
        output.height = Math.max(1, Math.floor(viewport.height));
        task = source.render({ canvas: output, viewport, annotationMode: AnnotationMode.DISABLE });
        await task.promise;
        if (cancelled) return;
        setStatus('ready');
        const content = await source.getTextContent().catch(() => undefined);
        if (!cancelled && content) setText(content.items.flatMap(item => 'str' in item ? [item.str + (item.hasEOL ? '\n' : ' ')] : []).join('').trim());
      } catch {
        if (!cancelled) setStatus('error');
      }
    }
    void render(node);
    return () => { cancelled = true; task?.cancel(); };
  }, [document, page]);

  return <div className="learn-pdf-page">
    {status === 'loading' && <StatePanel kind="loading" title={t('loading')} />}
    {status === 'error' && <StatePanel kind="error" title={t('pdfError')} />}
    <canvas dir="ltr" ref={canvas} hidden={status !== 'ready'} role="img" aria-label={t('pdfPage', { page: localizedNumber(page, i18n.language) })} />
    {text && <details className="learn-transcripts">
      <summary>{t('pdfText')}</summary>
      <div><p className="learn-prose" dir="auto">{text}</p></div>
    </details>}
  </div>;
}

export default function PdfPreview({ url }: { url: string }) {
  const { t, i18n } = useTranslation(courseNamespace);
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(1);
  useEffect(() => {
    let cancelled = false;
    const load = openPdf(url);
    void load.promise.then(result => { if (!cancelled) setDocument(result); }, () => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; void load.destroy().catch(() => undefined); };
  }, [url, attempt]);
  if (failed) return <StatePanel kind="error" title={t('pdfError')}>
    <Button variant="secondary" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>{t('retry')}</Button>
  </StatePanel>;
  if (!document) return <StatePanel kind="loading" title={t('loading')} />;
  return <div className="learn-pdf-preview">
    {document.numPages > 1 && <Pagination page={page} pages={document.numPages} label={t('pdfPages')}
      pageLabel={t('page', { page: localizedNumber(page, i18n.language), pages: localizedNumber(document.numPages, i18n.language) })}
      previous={t('previousPage')} next={t('nextPage')} onChange={setPage} />}
    <PdfPage key={page} document={document} page={page} />
  </div>;
}
