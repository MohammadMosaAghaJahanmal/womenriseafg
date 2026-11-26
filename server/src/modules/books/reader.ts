import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { publishedLocale } from '../courses/reader';
import { normalizeEducationSearch } from '../education/models';
import { publicEducationEntry } from '../education/store';
import type { BookListOptions, BookRecord, BookTranslation } from './contract';

type BookProjection = Omit<BookRecord, 'translations' | 'createdAt' | 'updatedAt' | 'reviewedAt' | 'fileSizeBytes' | 'downloadAllowed'> & {
  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
  fileSizeBytes: number | string | null;
  downloadAllowed: number | boolean;
};
type TranslationProjection = BookTranslation & { bookId: string };

const fromWithPdf = `FROM books b
  LEFT JOIN media_assets pdf ON pdf.id = b.pdf_id AND pdf.kind = 'pdf' AND pdf.status <> 'deleted'`;
const from = `${fromWithPdf}
  LEFT JOIN media_assets cover ON cover.id = b.cover_id AND cover.kind = 'image' AND cover.status = 'published'`;
export const publicBook = `b.status = 'published' AND pdf.status = 'published'
  AND ${publishedLocale('b.content_language')}
  AND EXISTS (SELECT 1 FROM book_translations t WHERE t.book_id = b.id
    AND CHAR_LENGTH(TRIM(t.description)) > 0 AND ${publishedLocale('t.locale')})`;
const visibleTaxon = (column: string, kind: string) =>
  `SELECT e.id FROM education_entries e WHERE e.id = b.${column} AND e.kind = '${kind}' ${publicEducationEntry}`;
const visibleCategory = visibleTaxon('category_id', 'categories');
const visibleLevel = visibleTaxon('level_id', 'levels');
const visibleGrade = visibleTaxon('grade_id', 'grades');

function columns(publicOnly: boolean) {
  return `b.id, b.slug, b.status, b.version, b.pdf_id AS pdfId, ${publicOnly ? 'cover.id' : 'b.cover_id'} AS coverId,
    ${publicOnly ? '(' + visibleCategory + ')' : 'b.category_id'} AS categoryId,
    ${publicOnly ? '(' + visibleLevel + ')' : 'b.level_id'} AS levelId,
    ${publicOnly ? '(' + visibleGrade + ')' : 'b.grade_id'} AS gradeId,
    b.content_language AS contentLanguage, b.author, b.publisher, b.publication_year AS publicationYear, b.edition,
    b.updated_at AS updatedAt, b.created_at AS createdAt,
    ${publicOnly ? "''" : 'b.review_note'} AS reviewNote, ${publicOnly ? 'NULL' : 'b.reviewed_at'} AS reviewedAt,
    pdf.size_bytes AS fileSizeBytes, COALESCE(pdf.download_allowed, 0) AS downloadAllowed,
    COALESCE(pdf.license, '') AS license, COALESCE(pdf.source, '') AS source`;
}

export function bookReader(db: Sequelize) {
  async function records(rows: BookProjection[], transaction: Transaction, publicOnly: boolean): Promise<BookRecord[]> {
    if (!rows.length) return [];
    const translations = await db.query<TranslationProjection>(`
      SELECT t.book_id AS bookId, t.locale, t.title, t.description FROM book_translations t
      WHERE t.book_id IN (:ids) ${publicOnly ? 'AND ' + publishedLocale('t.locale') : ''}
      ORDER BY t.locale
    `, { type: QueryTypes.SELECT, transaction, replacements: { ids: rows.map(row => row.id) } });
    const byBook = new Map<string, BookTranslation[]>();
    for (const { bookId, ...translation } of translations) {
      const group = byBook.get(bookId);
      if (group) group.push(translation);
      else byBook.set(bookId, [translation]);
    }
    return rows.map(row => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      fileSizeBytes: row.fileSizeBytes === null ? null : Number(row.fileSizeBytes),
      downloadAllowed: Boolean(Number(row.downloadAllowed)),
      translations: byBook.get(row.id) ?? [],
    }));
  }

  return {
    async get(id: string, transaction: Transaction) {
      const rows = await db.query<BookProjection>(`SELECT ${columns(false)} ${from} WHERE b.id = :id`,
        { type: QueryTypes.SELECT, transaction, replacements: { id } });
      return (await records(rows, transaction, false))[0] ?? null;
    },

    list({ q, page, pageSize, publicOnly = false, categoryId, levelId, language, status }: BookListOptions) {
      return db.transaction(async transaction => {
        const search = normalizeEducationSearch(q);
        const predicates = [publicOnly ? publicBook : '1 = 1'];
        if (!publicOnly && status) predicates.push('b.status = :status');
        if (categoryId) predicates.push(`b.category_id = :categoryId ${publicOnly ? 'AND EXISTS (' + visibleCategory + ')' : ''}`);
        if (levelId) predicates.push(`b.level_id = :levelId ${publicOnly ? 'AND EXISTS (' + visibleLevel + ')' : ''}`);
        if (language) predicates.push('b.content_language = :language');
        if (search) predicates.push(`(
          LOCATE(:search, b.search_text) > 0
          OR EXISTS (SELECT 1 FROM book_translations t WHERE t.book_id = b.id
            ${publicOnly ? 'AND ' + publishedLocale('t.locale') : ''} AND LOCATE(:search, t.search_text) > 0)
        )`);
        const query = `${from} WHERE ${predicates.join(' AND ')}`;
        const queryOptions = { type: QueryTypes.SELECT as const, transaction, replacements: {
          search, categoryId, levelId, language, status, limit: pageSize, offset: (page - 1) * pageSize,
        } };
        const [count] = await db.query<{ total: string | number }>(`SELECT COUNT(*) AS total ${query}`, queryOptions);
        const rows = await db.query<BookProjection>(`SELECT ${columns(publicOnly)} ${query}
          ORDER BY b.updated_at DESC, b.id ASC LIMIT :limit OFFSET :offset`, queryOptions);
        return { items: await records(rows, transaction, publicOnly), total: Number(count?.total ?? 0), page, pageSize };
      });
    },

    findPublic(slug: string) {
      return db.transaction(async transaction => {
        const rows = await db.query<BookProjection>(`SELECT ${columns(true)} ${from} WHERE b.slug = :slug AND ${publicBook}`,
          { type: QueryTypes.SELECT, transaction, replacements: { slug } });
        return (await records(rows, transaction, true))[0] ?? null;
      });
    },

    async findPublicPdfId(slug: string) {
      const [asset] = await db.query<{ id: string }>(`SELECT pdf.id ${fromWithPdf} WHERE b.slug = :slug AND ${publicBook}`,
        { type: QueryTypes.SELECT, replacements: { slug } });
      return asset?.id ?? null;
    },
  };
}
