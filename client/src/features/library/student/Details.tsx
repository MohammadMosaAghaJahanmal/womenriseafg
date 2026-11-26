import { useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { chooseTranslation, ContentLanguageSelect, useContentLanguage } from '../../courses/student/components';
import { sizeLabel } from '../../courses/student/LessonMedia';
import { preferredName, type EducationRecord } from '../../education/api';
import { useEducationData } from '../../education/useEducationData';
import { SaveResource } from '../../engagement/SaveResource';
import { bookTaxonomy, readBook } from './api';
import { BookCover, BookLanguage, BookReadActions, LibraryBack, LibraryState } from './Components';
import { libraryNamespace } from './strings';

function taxonomyName(records: EducationRecord[] | undefined, id: string | null, locale: string) {
  const entry = records?.find(item => item.id === id);
  if (!entry) return null;
  const text = preferredName(entry, locale);
  return <bdi lang={text.locale}>{text.name}</bdi>;
}

export default function BookDetails() {
  const { t, i18n } = useTranslation(libraryNamespace);
  const { slug = '' } = useParams();
  const language = useContentLanguage();
  const load = useCallback((signal: AbortSignal) => readBook(slug, signal), [slug]);
  const { result, reload } = useEducationData(load);
  const { result: taxonomy } = useEducationData(bookTaxonomy);
  if (result.status !== 'ready') return <div className="learn-page library-page">
    <LibraryBack />
    <LibraryState loading={result.status === 'loading'} error={result.status === 'error' ? result.error : undefined} retry={reload} />
  </div>;

  const book = result.data;
  const labels = taxonomy.status === 'ready' ? taxonomy.data : undefined;
  const description = chooseTranslation(book.translations, language.preferred);
  const fields: { key: string; value: ReactNode }[] = [
    { key: 'author', value: book.author && <bdi>{book.author}</bdi> },
    { key: 'publisher', value: book.publisher && <bdi>{book.publisher}</bdi> },
    { key: 'year', value: book.publicationYear && new Intl.NumberFormat(i18n.language, { useGrouping: false }).format(book.publicationYear) },
    { key: 'edition', value: book.edition && <bdi>{book.edition}</bdi> },
    { key: 'language', value: <BookLanguage locale={book.contentLanguage} /> },
    { key: 'category', value: taxonomyName(labels?.categories, book.categoryId, i18n.language) },
    { key: 'level', value: taxonomyName(labels?.levels, book.levelId, i18n.language) },
    { key: 'grade', value: taxonomyName(labels?.grades, book.gradeId, i18n.language) },
    { key: 'license', value: book.license && <bdi>{book.license}</bdi> },
    { key: 'source', value: book.source && <bdi>{book.source}</bdi> },
    { key: 'fileSize', value: book.fileSizeBytes != null ? sizeLabel(book.fileSizeBytes, i18n.language) : null },
  ];
  return <div className="learn-page library-page library-details">
    <LibraryBack />
    <header className="library-book-header">
      <BookCover id={book.coverId} />
      <div className="library-book-title">
        <h1 lang={description.locale} dir="auto">{description.title}</h1>
        {book.author && <p><bdi>{book.author}</bdi></p>}
        <BookReadActions book={book} detailsLanguage={language.explicit} />
        <div className="learning-actions"><SaveResource resource={{ kind: 'book', id: book.id, slug: book.slug,
          title: description.title, locale: description.locale }} /></div>
      </div>
    </header>
    <div className="library-book-info">
      {description.description && <section className="learn-panel library-description">
        <div className="library-description-head">
          <h2>{t('about')}</h2>
          <ContentLanguageSelect label={t('detailsLanguage')} locales={book.translations.map(item => item.locale)}
            selected={description.locale} onSelect={language.setLanguage} />
        </div>
        <p className="learn-prose" lang={description.locale} dir="auto">{description.description}</p>
      </section>}
      {!description.description && book.translations.length > 1 && <section className="learn-panel library-description">
        <ContentLanguageSelect label={t('detailsLanguage')} locales={book.translations.map(item => item.locale)}
          selected={description.locale} onSelect={language.setLanguage} />
      </section>}
      <section className="learn-panel library-metadata" aria-labelledby="book-metadata">
        <h2 id="book-metadata">{t('details')}</h2>
        <dl>{fields.filter(field => field.value).map(({ key, value }) => <div key={key}><dt>{t(key)}</dt><dd>{value}</dd></div>)}</dl>
      </section>
    </div>
  </div>;
}
