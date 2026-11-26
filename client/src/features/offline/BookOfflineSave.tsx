import { bookFile, type BookTranslation, type PublicBook } from '../library/student/api';
import { OfflineSave } from './OfflineSave';
import { offlineResourceKey } from './types';

export function BookOfflineSave({ book, translation }: { book: PublicBook; translation: BookTranslation }) {
  if (!book.downloadAllowed) return null;
  return <OfflineSave resource={{
    key: offlineResourceKey('book', book.id, book.contentLanguage), kind: 'book',
    title: translation.title, description: translation.description, locale: translation.locale,
    file: { url: bookFile(book.slug, true), sizeBytes: book.fileSizeBytes, mimeType: 'application/pdf' },
  }} />;
}
