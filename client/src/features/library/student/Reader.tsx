import { ArrowLeft, ArrowRight, Download, Maximize, Minimize, Minus, Plus } from 'lucide-react';
import { AnnotationMode, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Button, StatePanel } from '../../../components/ui/Primitives';
import { BackLink, chooseTranslation, ContentLanguageNotice, localizedNumber, useContentLanguage } from '../../courses/student/components';
import { useEducationData } from '../../education/useEducationData';
import { rememberResource, savedPosition, useLearning, type LearningResource } from '../../engagement/local';
import { BookOfflineSave } from '../../offline/BookOfflineSave';
import { openPdf } from '../../pdf/openPdf';
import { bookFile, bookPath, readBook, type PublicBook } from './api';
import { BookLanguage, LibraryBack, LibraryState } from './Components';
import { libraryNamespace } from './strings';

const zoomSteps = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3];

function PageText({ pdf, page, locale }: { pdf: PDFDocumentProxy; page: number; locale: string }) {
  const { t } = useTranslation(libraryNamespace);
  const load = useCallback(async () => {
    const source = await pdf.getPage(page);
    const content = await source.getTextContent();
    return content.items.flatMap(item => 'str' in item ? [item.str + (item.hasEOL ? '\n' : ' ')] : []).join('').trim();
  }, [page, pdf]);
  const { result } = useEducationData(load);
  if (result.status === 'loading') return <p role="status">{t('loadingText')}</p>;
  if (result.status === 'error') return <p role="alert">{t('textFailed')}</p>;
  if (!result.data) return <p>{t('noPageText')}</p>;
  return <p className="learn-prose library-page-text" lang={locale} dir="auto">{result.data}</p>;
}

function PageCanvas({ pdf, page, width, factor, fit }: {
  pdf: PDFDocumentProxy; page: number; width: number; factor: number; fit: boolean;
}) {
  const { t, i18n } = useTranslation(libraryNamespace);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const node = canvas.current;
    if (!node || !width) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    async function render(output: HTMLCanvasElement) {
      try {
        setStatus('loading');
        const source = await pdf.getPage(page);
        if (cancelled) return;
        const natural = source.getViewport({ scale: 1 });
        if (!natural.width || !natural.height) throw new Error('Invalid page size');
        const scale = Math.min((fit ? width / natural.width : 4 / 3) * factor, 12_000 / natural.width, 16_000 / natural.height);
        const display = source.getViewport({ scale });
        // A zoomed page can be larger than its raster. Bound the raster separately to limit mobile memory.
        const density = Math.min(window.devicePixelRatio || 1, 2, 2400 / display.width, 3200 / display.height,
          Math.sqrt(5_000_000 / (display.width * display.height)));
        const viewport = source.getViewport({ scale: scale * density });
        output.width = Math.max(1, Math.floor(viewport.width));
        output.height = Math.max(1, Math.floor(viewport.height));
        output.style.setProperty('width', Math.round(display.width) + 'px');
        output.style.setProperty('height', Math.round(display.height) + 'px');
        task = source.render({ canvas: output, viewport, annotationMode: AnnotationMode.DISABLE });
        await task.promise;
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    }
    void render(node);
    return () => { cancelled = true; task?.cancel(); };
  }, [attempt, factor, fit, page, pdf, width]);

  return <div className="library-paper">
    {status === 'loading' && <StatePanel kind="loading" title={t('renderPage')} />}
    {status === 'error' && <StatePanel kind="error" title={t('pageError')}>
      <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>{t('retry')}</Button>
    </StatePanel>}
    <canvas dir="ltr" hidden={status !== 'ready'} ref={canvas} role="img"
      aria-label={t('pdfPage', { page: localizedNumber(page, i18n.language) })} />
  </div>;
}

function parsePage(value: string) {
  const normalized = value.trim().replace(/[\u0660-\u0669\u06f0-\u06f9]/g, digit => String(digit.charCodeAt(0) & 15));
  return /^[0-9]+$/.test(normalized) ? Number(normalized) : 0;
}

function PageControls({ page, count, onPage }: { page: number; count: number; onPage: (page: number) => void }) {
  const { t, i18n } = useTranslation(libraryNamespace);
  const errorId = useId();
  const pageId = useId();
  const [entry, setEntry] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const number = (value: number) => localizedNumber(value, i18n.language);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { setEntry(null); setInvalid(false); }, [page]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requested = parsePage(entry ?? String(page));
    if (requested < 1 || requested > count) {
      setInvalid(true);
      field.current?.focus();
      return;
    }
    setEntry(null);
    setInvalid(false);
    onPage(requested);
  }
  return <div className="library-page-controls">
    <form className="library-page-form" onSubmit={submit}>
      <Button className="ui-icon-btn" variant="secondary" aria-disabled={page <= 1} aria-label={t('previousPage')}
        title={t('previousPage')} onClick={() => onPage(page - 1)}><ArrowLeft size={18} className="ui-direction" aria-hidden="true" /></Button>
      <label className="library-page-field" htmlFor={pageId}>
        <span className="library-visually-hidden">{t('page')}</span>
        <input ref={field} id={pageId} type="text" inputMode="numeric" dir="ltr" value={entry ?? number(page)}
          aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
          maxLength={12} onChange={event => { setEntry(event.target.value); setInvalid(false); }} />
      </label>
      <Button type="submit" variant="secondary">{t('go')}</Button>
      <Button className="ui-icon-btn" variant="secondary" aria-disabled={page >= count} aria-label={t('nextPage')}
        title={t('nextPage')} onClick={() => onPage(page + 1)}><ArrowRight size={18} className="ui-direction" aria-hidden="true" /></Button>
    </form>
    <small role="status" className="library-page-count">{t('pageOf', { page: number(page), total: number(count) })}</small>
    {invalid && <p className="library-page-error" id={errorId} role="alert">
      {t('invalidPage', { first: number(1), last: number(count) })}</p>}
  </div>;
}

function ReaderView({ book, title, titleLanguage, pdf }: {
  book: PublicBook; title: string; titleLanguage: string; pdf: PDFDocumentProxy;
}) {
  const { t, i18n } = useTranslation(libraryNamespace);
  const resource: LearningResource = { kind: 'book', id: book.id, slug: book.slug, title, locale: titleLanguage };
  const { enabled } = useLearning();
  const { id: bookId, slug: bookSlug } = book;
  const [page, setPage] = useState(() => Math.min(pdf.numPages, Math.max(1, savedPosition(resource)?.position ?? 1)));
  const [zoom, setZoom] = useState({ fit: true, step: 3 });
  const [width, setWidth] = useState(0);
  const [activeText, setActiveText] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [extended, setExtended] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const reader = useRef<HTMLElement>(null);
  const help = useId();
  useEffect(() => {
    if (enabled) rememberResource({ kind: 'book', id: bookId, slug: bookSlug, title, locale: titleLanguage },
      page, pdf.numPages, page === pdf.numPages);
  }, [enabled, bookId, bookSlug, title, titleLanguage, page, pdf.numPages]);

  useEffect(() => {
    const target = area.current;
    if (!target) return;
    const measure = () => setWidth(Math.max(1, target.clientWidth - 16));
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === reader.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  useEffect(() => {
    if (!extended) return;
    const target = reader.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setExtended(false);
      if (event.key !== 'Tab' || !target) return;
      const controls = [...target.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, summary, [tabindex="0"]')];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls.at(-1);
      const outside = !target.contains(document.activeElement);
      if (event.shiftKey ? outside || document.activeElement === first : outside || document.activeElement === last) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    };
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', close); };
  }, [extended]);

  function changePage(value: number) {
    if (value < 1 || value > pdf.numPages || value === page) return;
    setPage(value);
    setActiveText(null);
    area.current?.scrollTo(0, 0);
  }

  function turnWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || !['PageUp', 'PageDown'].includes(event.key)) return;
    event.preventDefault();
    changePage(page + (event.key === 'PageUp' ? -1 : 1));
  }

  async function toggleFullscreen() {
    if (extended) return setExtended(false);
    if (fullscreen) return void await document.exitFullscreen().catch(() => undefined);
    const target = reader.current;
    if (document.fullscreenEnabled && target?.requestFullscreen) {
      try { await target.requestFullscreen(); return; }
      catch { /* Fall back to a viewport-sized reader when native fullscreen is unavailable. */ }
    }
    setExtended(true);
  }

  const factor = zoomSteps[zoom.step]!;
  const fill = fullscreen || extended;
  const percentage = new Intl.NumberFormat(i18n.language, { style: 'percent' }).format(factor);
  return <section ref={reader} className={'library-reader' + (extended ? ' library-reader-expanded' : '')} aria-label={t('reader')}
    role={extended ? 'dialog' : undefined} aria-modal={extended || undefined}>
    {fill && <h2 className="library-fullscreen-title" lang={titleLanguage} dir="auto">{title}</h2>}
    <div className="library-toolbar" role="group" aria-label={t('readerControls')}>
      <PageControls page={page} count={pdf.numPages} onPage={changePage} />
      <div className="library-zoom" role="group" aria-label={t('zoom')}>
        <Button className="ui-icon-btn" variant="secondary" aria-label={t('zoomOut')} title={t('zoomOut')}
          disabled={zoom.step === 0} onClick={() => setZoom(current => ({ ...current, step: current.step - 1 }))}>
          <Minus size={18} aria-hidden="true" /></Button>
        <span role="status" className="library-zoom-value">{percentage}</span>
        <Button className="ui-icon-btn" variant="secondary" aria-label={t('zoomIn')} title={t('zoomIn')}
          disabled={zoom.step === zoomSteps.length - 1} onClick={() => setZoom(current => ({ ...current, step: current.step + 1 }))}>
          <Plus size={18} aria-hidden="true" /></Button>
        <Button variant="ghost" onClick={() => { setZoom({ fit: true, step: 3 }); area.current?.scrollTo(0, 0); }}>{t('fit')}</Button>
        <Button variant="ghost" onClick={() => { setZoom({ fit: false, step: 3 }); area.current?.scrollTo(0, 0); }}>{t('actual')}</Button>
      </div>
      <div className="library-reader-actions">
        <Button className="ui-icon-btn" variant="secondary" aria-label={t(fill ? 'exitFullscreen' : 'enterFullscreen')}
          title={t(fill ? 'exitFullscreen' : 'enterFullscreen')} onClick={() => void toggleFullscreen()}>
          {fill ? <Minimize size={18} aria-hidden="true" /> : <Maximize size={18} aria-hidden="true" />}</Button>
        {book.downloadAllowed && <Button variant="ghost" asChild><a href={bookFile(book.slug, true)}>
          <Download size={18} aria-hidden="true" />{t('download')}</a></Button>}
      </div>
    </div>
    <p className="library-keyboard-help" id={help}>{t('keyboardHint')}</p>
    <div ref={area} className="library-reading-area" role="region" aria-label={t('readingArea')}
      aria-describedby={help} tabIndex={0} onKeyDown={turnWithKeyboard}>
      <PageCanvas key={page} pdf={pdf} page={page} width={width} factor={factor} fit={zoom.fit} />
    </div>
    <details className="learn-transcripts library-text-section" key={page}
      onToggle={event => setActiveText(event.currentTarget.open ? page : null)}>
      <summary>{t('readPageText')}</summary>
      {activeText === page && <PageText pdf={pdf} page={page} locale={book.contentLanguage} />}
    </details>
  </section>;
}

function BookDocument({ book, title, titleLanguage }: { book: PublicBook; title: string; titleLanguage: string }) {
  const { t } = useTranslation(libraryNamespace);
  const [result, setResult] = useState<PDFDocumentProxy | 'error'>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const task = openPdf(bookFile(book.slug));
    void task.promise.then(pdf => { if (!cancelled) setResult(pdf); }, () => { if (!cancelled) setResult('error'); });
    return () => { cancelled = true; void task.destroy().catch(() => undefined); };
  }, [attempt, book.slug]);
  if (!result) return <StatePanel kind="loading" title={t('loadingPdf')} />;
  if (result === 'error') return <StatePanel kind="error" title={t('pdfError')}>
    <Button variant="secondary" onClick={() => { setResult(undefined); setAttempt(value => value + 1); }}>{t('retry')}</Button>
  </StatePanel>;
  return <ReaderView book={book} title={title} titleLanguage={titleLanguage} pdf={result} />;
}

export default function BookReader() {
  const { t } = useTranslation(libraryNamespace);
  const { slug = '' } = useParams();
  const language = useContentLanguage();
  const load = useCallback((signal: AbortSignal) => readBook(slug, signal), [slug]);
  const { result, reload } = useEducationData(load);
  if (result.status !== 'ready') return <div className="learn-page library-page">
    <LibraryBack />
    <LibraryState loading={result.status === 'loading'} error={result.status === 'error' ? result.error : undefined} retry={reload} />
  </div>;
  const title = chooseTranslation(result.data.translations, language.preferred);
  return <div className="learn-page library-page library-reader-page">
    <BackLink to={bookPath(slug, false, language.explicit)}>{t('backToBook')}</BackLink>
    <h1 lang={title.locale} dir="auto">{title.title}</h1>
    <ContentLanguageNotice preferred={language.preferred} actual={title.locale} />
    <p className="learn-muted">{t('language')} · <BookLanguage locale={result.data.contentLanguage} /></p>
    <BookOfflineSave book={result.data} translation={title} />
    <BookDocument key={slug} book={result.data} title={title.title} titleLanguage={title.locale} />
  </div>;
}
