import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { publicCourse, publishedLocale, visibleLesson } from '../courses/reader';
import { normalizeEducationSearch } from '../education/models';
import { publicEducationEntry } from '../education/store';
import type { LearningMediaListOptions, LearningMediaRecord, LearningMediaRelated, LearningMediaTranslation } from './contract';

type EntryProjection = Omit<LearningMediaRecord, 'translations' | 'durationMs' | 'createdAt' | 'updatedAt' | 'reviewedAt'> & {
  durationMs: string | number | null;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
};
type TranslationProjection = LearningMediaTranslation & { entryId: string };
type RelatedProjection = { slug: string; locale: string; title: string };
type Visibility = Pick<LearningMediaListOptions, 'kind' | 'aiOnly'>;
type RelatedIds = Pick<LearningMediaRecord, 'relatedCourseId' | 'relatedLessonId'>;

const from = `FROM learning_media lm
  LEFT JOIN media_assets asset ON asset.id = lm.media_id AND asset.status <> 'deleted'
  LEFT JOIN media_links ml ON ml.parent_id = asset.id AND ml.relation = 'thumbnail' AND ml.slot = 'default'
  LEFT JOIN media_assets thumb ON thumb.id = ml.asset_id AND thumb.status = 'published'
  LEFT JOIN courses related ON related.id = lm.related_course_id`;

const visibleCategory = `SELECT e.id FROM education_entries e
  WHERE e.id = lm.category_id AND e.kind = 'categories' ${publicEducationEntry}`;
export const publicLearningMedia = `lm.status = 'published' AND asset.status = 'published'
  AND EXISTS (SELECT 1 FROM learning_media_translations t WHERE t.learning_media_id = lm.id
    AND LENGTH(TRIM(t.description)) > 0 AND ${publishedLocale('t.locale')})`;

function columns(publicOnly: boolean) {
  return `lm.id, lm.slug, lm.kind, lm.status, lm.version, lm.media_id AS mediaId,
    ${publicOnly ? '(' + visibleCategory + ')' : 'lm.category_id'} AS categoryId,
    lm.ai_origin AS aiOrigin, lm.ai_tool AS aiTool, lm.ai_notes AS aiNotes,
    lm.related_course_id AS relatedCourseId, lm.related_lesson_id AS relatedLessonId, related.slug AS relatedCourseSlug,
    lm.review_note AS reviewNote, lm.reviewed_at AS reviewedAt, lm.updated_at AS updatedAt, lm.created_at AS createdAt,
    CASE WHEN asset.kind = 'image' AND asset.status = 'published' THEN asset.id ELSE thumb.id END AS thumbnailId,
    asset.duration_ms AS durationMs`;
}

function visibilityFilters({ kind, aiOnly }: Visibility, publicOnly: boolean) {
  const predicates = [publicOnly ? publicLearningMedia : '1 = 1'];
  if (kind) predicates.push('lm.kind = :kind');
  if (aiOnly) predicates.push("lm.ai_origin <> 'human'");
  return predicates;
}

function publicRelation(rows: RelatedProjection[]) {
  return rows[0] ? { slug: rows[0].slug, translations: rows.map(({ locale, title }) => ({ locale, title })) } : null;
}

export function learningMediaReader(db: Sequelize) {
  async function records(rows: EntryProjection[], transaction: Transaction, publicOnly: boolean) {
    if (!rows.length) return [];
    const translations = await db.query<TranslationProjection>(`
      SELECT t.learning_media_id AS entryId, t.locale, t.title, t.description, t.image_alt AS imageAlt
      FROM learning_media_translations t
      WHERE t.learning_media_id IN (:ids) ${publicOnly ? 'AND ' + publishedLocale('t.locale') : ''}
      ORDER BY t.locale
    `, { type: QueryTypes.SELECT, transaction, replacements: { ids: rows.map(row => row.id) } });
    const byEntry = new Map<string, LearningMediaTranslation[]>();
    for (const { entryId, ...translation } of translations) {
      const group = byEntry.get(entryId);
      if (group) group.push(translation);
      else byEntry.set(entryId, [translation]);
    }
    return rows.map((row): LearningMediaRecord => ({
      ...row,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      durationMs: row.durationMs === null ? null : Number(row.durationMs),
      translations: byEntry.get(row.id) ?? [],
    }));
  }

  return {
    async get(id: string, transaction: Transaction) {
      const rows = await db.query<EntryProjection>(`SELECT ${columns(false)} ${from} WHERE lm.id = :id`,
        { type: QueryTypes.SELECT, transaction, replacements: { id } });
      return (await records(rows, transaction, false))[0] ?? null;
    },

    list({ q, page, pageSize, publicOnly = false, kind, aiOnly, categoryId, language, status }: LearningMediaListOptions) {
      return db.transaction(async transaction => {
        const search = normalizeEducationSearch(q);
        const predicates = visibilityFilters({ kind, aiOnly }, publicOnly);
        if (!publicOnly && status) predicates.push('lm.status = :status');
        if (categoryId) predicates.push(`lm.category_id = :categoryId ${publicOnly ? 'AND EXISTS (' + visibleCategory + ')' : ''}`);
        const translation = `t.learning_media_id = lm.id ${publicOnly ? 'AND ' + publishedLocale('t.locale') : ''}
          ${language ? 'AND t.locale = :language' : ''}`;
        if (language) predicates.push(`EXISTS (SELECT 1 FROM learning_media_translations t WHERE ${translation})`);
        if (search) predicates.push(`(
          LOCATE(:search, CONVERT(lm.slug USING utf8mb4) COLLATE utf8mb4_unicode_ci) > 0
          OR EXISTS (SELECT 1 FROM learning_media_translations t WHERE ${translation} AND LOCATE(:search, t.search_text) > 0)
        )`);
        const query = `${from} WHERE ${predicates.join(' AND ')}`;
        const queryOptions = { type: QueryTypes.SELECT as const, transaction, replacements: {
          search, kind, categoryId, language, status, limit: pageSize, offset: (page - 1) * pageSize,
        } };
        const [count] = await db.query<{ total: string | number }>(`SELECT COUNT(*) AS total ${query}`, queryOptions);
        const rows = await db.query<EntryProjection>(`SELECT ${columns(publicOnly)} ${query}
          ORDER BY lm.updated_at DESC, lm.id ASC LIMIT :limit OFFSET :offset`, queryOptions);
        return { items: await records(rows, transaction, publicOnly), total: Number(count?.total ?? 0), page, pageSize };
      });
    },

    findPublic(slug: string, { kind, aiOnly }: Visibility) {
      return db.transaction(async transaction => {
        const predicates = visibilityFilters({ kind, aiOnly }, true);
        const rows = await db.query<EntryProjection>(`SELECT ${columns(true)} ${from} WHERE lm.slug = :slug AND ${predicates.join(' AND ')}`,
          { type: QueryTypes.SELECT, transaction, replacements: { slug, kind } });
        return (await records(rows, transaction, true))[0] ?? null;
      });
    },

    findPublicRelated({ relatedCourseId, relatedLessonId }: RelatedIds): Promise<LearningMediaRelated> {
      if (!relatedCourseId) return Promise.resolve({ course: null, lesson: null });
      return db.transaction(async transaction => {
        const queryOptions = { type: QueryTypes.SELECT as const, transaction,
          replacements: { courseId: relatedCourseId, lessonId: relatedLessonId } };
        const course = publicRelation(await db.query<RelatedProjection>(`
          SELECT c.slug, ct.locale, ct.title FROM courses c
          JOIN course_translations ct ON ct.course_id = c.id
          WHERE c.id = :courseId AND ${publicCourse} AND ${publishedLocale('ct.locale')}
          ORDER BY ct.locale
        `, queryOptions));
        const lesson = course && relatedLessonId ? publicRelation(await db.query<RelatedProjection>(`
          SELECT l.slug, lt.locale, lt.title FROM lessons l
          JOIN lesson_translations lt ON lt.lesson_id = l.id
          WHERE l.course_id = :courseId AND l.id = :lessonId AND ${visibleLesson}
            AND ${publishedLocale('lt.locale')} AND (l.kind <> 'text' OR LENGTH(TRIM(lt.body)) > 0)
          ORDER BY lt.locale
        `, queryOptions)) : null;
        return { course, lesson };
      });
    },
  };
}
