import { BookOpen, Download, LibraryBig } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, StatePanel } from '../../../components/ui/Primitives';
import { fileUrl } from '../../courses/student/api';
import { BackLink, learnerLanguageName, lowDataConnection } from '../../courses/student/components';
import { bookFile, bookPath, unavailableBook, type PublicBook } from './api';
import { libraryNamespace } from './strings';
import './library.css';

export function LibraryBanner() {
  const { t } = useTranslation(libraryNamespace);
  return <header className="library-banner">
    <div><h1>{t('library')}</h1><p>{t('intro')}</p></div>
    <LibraryBig className="library-banner-icon" size={44} strokeWidth={1.45} aria-hidden="true" />
  </header>;
}

export function LibraryState({ loading, error, retry }: { loading: boolean; error?: unknown; retry: () => void }) {
  const { t } = useTranslation(libraryNamespace);
  if (loading) return <StatePanel kind="loading" title={t('loading')} />;
  const missing = unavailableBook(error);
  return <StatePanel kind="error" title={t(missing ? 'missing' : 'loadFailed')}>
    {missing ? <Button variant="secondary" asChild><Link to="/library">{t('backToLibrary')}</Link></Button>
      : <Button variant="secondary" onClick={retry}>{t('retry')}</Button>}
  </StatePanel>;
}

export function LibraryBack() {
  const { t } = useTranslation(libraryNamespace);
  return <BackLink to="/library">{t('backToLibrary')}</BackLink>;
}

export function BookCover({ id }: { id: string | null }) {
  const [failed, setFailed] = useState<string>();
  return <div className="library-cover" aria-hidden="true">
    <div className="library-cover-frame">
      {id && id !== failed && !lowDataConnection()
        ? <img src={fileUrl(id)} alt="" decoding="async" loading="lazy" onError={() => setFailed(id)} />
        : <BookOpen size={35} strokeWidth={1.5} />}
    </div>
  </div>;
}

export function BookLanguage({ locale }: { locale: string }) {
  return <bdi lang={locale}>{learnerLanguageName(locale)}</bdi>;
}

export function BookReadActions({ book, detailsLanguage }: { book: PublicBook; detailsLanguage?: string }) {
  const { t } = useTranslation(libraryNamespace);
  return <div className="library-actions">
    <Button asChild><Link to={bookPath(book.slug, true, detailsLanguage)}>
      <BookOpen size={18} aria-hidden="true" />{t('read')}
    </Link></Button>
    {book.downloadAllowed && <Button variant="secondary" asChild><a href={bookFile(book.slug, true)}>
      <Download size={18} aria-hidden="true" />{t('download')}
    </a></Button>}
  </div>;
}
