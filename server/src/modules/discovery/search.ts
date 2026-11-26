import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { publicBook } from '../books/reader';
import { publicCourse, publishedLocale, visibleLesson } from '../courses/reader';
import { normalizeEducationSearch } from '../education/models';
import { publicEducationEntry } from '../education/store';
import { publicLearningMedia } from '../learning-media/reader';
import { publicQuiz, quizLocale } from '../quizzes/reader';
import { activityKinds, type DiscoverableKind, type Reference, type SearchEntry, type SearchQuery } from './contract';

const publicTaxon = (column: string) => `EXISTS (SELECT 1 FROM education_entries e WHERE e.id = ${column} ${publicEducationEntry})`;
const courseTaxonomy = {
  subject: 'c.subject_id', category: 'subject.category_id', level: 'c.level_id', grade: 'c.grade_id',
};
const pathTaxonomy = {
  subject: 'p.subject_id', category: 'subject.category_id', level: 'p.level_id',
};
const courseSubject = 'LEFT JOIN education_entries subject ON subject.id = c.subject_id';
const lessonWords = `LOWER(REGEXP_REPLACE(
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(CONCAT(t.title, ' ', t.description),
    'ي', 'ی'), 'ى','ی'), 'ك','ک'), 'ۀ','ه'), 'ة','ه'), '‌',' '), '[ً-ٰٟ]', ''))`;
const referenceCourse = `LEFT JOIN courses c ON c.id = lm.related_course_id AND ${publicCourse}`;
const pdfJoin = "JOIN media_assets pdf ON pdf.id = b.pdf_id AND pdf.kind = 'pdf'";
const mediaJoin = 'JOIN media_assets asset ON asset.id = lm.media_id';

export const publicPath = `p.status = 'published' AND EXISTS
  (SELECT 1 FROM learning_path_translations label WHERE label.path_id = p.id AND ${publishedLocale('label.locale')})`;

interface Branch {
  kinds: readonly DiscoverableKind[];
  kind: string;
  id: string;
  slug: string;
  parent?: string;
  title?: string;
  words?: string;
  from: string;
  visibility: string;
  locale?: string;
  language?: string;
  taxonomy?: { subject?: string; category?: string; level?: string; grade?: string };
}

const branches: Branch[] = [
  { kinds: ['course'], kind: "'course'", id: 'c.id', slug: 'c.slug', taxonomy: courseTaxonomy,
    from: `courses c JOIN course_translations t ON t.course_id = c.id ${courseSubject}`, visibility: publicCourse },
  { kinds: ['lesson'], kind: "'lesson'", id: 'l.id', slug: 'l.slug', parent: 'c.slug', words: lessonWords,
    taxonomy: courseTaxonomy, from: `lessons l JOIN courses c ON c.id = l.course_id
      JOIN lesson_translations t ON t.lesson_id = l.id ${courseSubject}`,
    visibility: `${publicCourse} AND ${visibleLesson} AND (l.kind <> 'text' OR LENGTH(TRIM(t.body)) > 0)` },
  { kinds: ['video', 'short', 'ai'], kind: "CASE WHEN lm.kind = 'resource' THEN 'ai' ELSE lm.kind END",
    id: 'lm.id', slug: 'lm.slug', taxonomy: { ...courseTaxonomy, category: 'COALESCE(lm.category_id, subject.category_id)' },
    from: `learning_media lm ${mediaJoin} ${referenceCourse} ${courseSubject}
      JOIN learning_media_translations t ON t.learning_media_id = lm.id`, visibility: publicLearningMedia },
  { kinds: ['book'], kind: "'book'", id: 'b.id', slug: 'b.slug', language: 'b.content_language',
    words: "CONCAT(t.search_text, ' ', b.search_text)",
    taxonomy: { category: 'b.category_id', level: 'b.level_id', grade: 'b.grade_id' },
    from: `books b ${pdfJoin} JOIN book_translations t ON t.book_id = b.id`, visibility: publicBook },
  { kinds: ['subject', 'category'], kind: "CASE WHEN e.kind = 'subjects' THEN 'subject' ELSE 'category' END",
    id: 'e.id', slug: 'e.slug', title: 't.name',
    taxonomy: { subject: "IF(e.kind = 'subjects', e.id, NULL)", category: "IF(e.kind = 'categories', e.id, e.category_id)" },
    from: 'education_entries e JOIN education_translations t ON t.entry_id = e.id',
    visibility: `e.kind IN ('subjects','categories') ${publicEducationEntry}` },
  { kinds: ['path'], kind: "'path'", id: 'p.id', slug: 'p.slug', taxonomy: pathTaxonomy,
    from: `learning_paths p JOIN learning_path_translations t ON t.path_id = p.id
      LEFT JOIN education_entries subject ON subject.id = p.subject_id`, visibility: publicPath },
  { kinds: ['quiz'], kind: "'quiz'", id: 'z.id', slug: 'z.slug', taxonomy: courseTaxonomy,
    from: `quizzes z JOIN quiz_translations t ON t.quiz_id = z.id
      LEFT JOIN courses c ON c.id = z.course_id AND ${publicCourse} ${courseSubject}`,
    visibility: publicQuiz, locale: quizLocale('t.locale') },
];

type SearchFilter = Partial<Omit<SearchQuery, 'q' | 'page' | 'pageSize'>> & {
  normalized?: string;
  ids?: string[];
  kinds?: DiscoverableKind[];
  activitiesOnly?: boolean;
};
type SearchRow = Omit<SearchEntry, 'href'> & {
  slug: string;
  parent: string | null;
  subjectId: string | null;
  categoryId: string | null;
  levelId: string | null;
  gradeId: string | null;
  score: number;
  total?: string | number;
};

// Keep visibility checks indexed and avoid exhaustive planning across their nested joins.
const select = "SELECT /*+ SET_VAR(optimizer_search_depth = 3) SET_VAR(optimizer_switch = 'semijoin=off') MAX_EXECUTION_TIME(4000) */";

function searchHref({ kind, id, slug, parent }: SearchRow) {
  const value = encodeURIComponent(slug);
  if (kind === 'course') return '/courses/' + value;
  if (kind === 'lesson') return '/learn/' + encodeURIComponent(parent ?? '') + '/' + value;
  if (kind === 'video') return '/videos/' + value;
  if (kind === 'short') return '/shorts/' + value;
  if (kind === 'ai') return '/ai-learning/' + value;
  if (kind === 'book') return '/library/' + value;
  if (kind === 'path') return '/learning-paths/' + value;
  if (kind === 'quiz') return '/quizzes/' + value;
  return '/search?' + (kind === 'subject' ? 'subjectId=' : 'categoryId=') + encodeURIComponent(id);
}

function projected(row: SearchRow): SearchEntry {
  return { kind: row.kind, id: row.id, locale: row.locale, title: row.title, description: row.description, href: searchHref(row) };
}

function candidateQuery(filter: SearchFilter) {
  return branches.filter(branch =>
    (!filter.kind || branch.kinds.includes(filter.kind)) &&
    (!filter.kinds || branch.kinds.some(kind => filter.kinds?.includes(kind))) &&
    (!filter.activitiesOnly || branch.kinds.some(kind => activityKinds.some(activity => activity === kind))))
    .map(branch => {
      const { kind, id, slug, parent, from, visibility } = branch;
      const title = branch.title ?? 't.title';
      const clauses = [visibility, branch.locale ?? publishedLocale('t.locale')];
      const taxons = branch.taxonomy ?? {};
      if (filter.kind && branch.kinds.length > 1) {
        if (branch.id === 'lm.id' && filter.kind === 'ai') clauses.push("lm.ai_origin <> 'human'");
        else clauses.push(`${kind} = :kind`);
      }
      if (filter.ids) clauses.push(`${id} IN (:ids)`);
      if (filter.language) clauses.push(`${branch.language ?? 't.locale'} = :language`);
      const selected = [
        [filter.subjectId, 'subjectId', taxons.subject],
        [filter.categoryId, 'categoryId', taxons.category],
        [filter.levelId, 'levelId', taxons.level],
        [filter.gradeId, 'gradeId', taxons.grade],
      ] as const;
      for (const [value, binding, column] of selected) {
        if (value) clauses.push(column ? `${column} = :${binding} AND ${publicTaxon(column)}` : '0 = 1');
      }
      const code = `CONVERT(${slug} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
      const words = branch.words ?? 't.search_text';
      if (filter.normalized) clauses.push(`(LOCATE(:normalized, ${words}) > 0 OR LOCATE(:normalized, ${code}) > 0)`);
      const rank = filter.normalized
        ? `CASE WHEN ${code} = :normalized OR LOWER(${title}) = :normalized THEN 4
          WHEN LOCATE(:normalized, LOWER(${title})) = 1 THEN 3
          WHEN LOCATE(:normalized, LOWER(${title})) > 0 THEN 2 ELSE 1 END`
        : '0';
      const visible = (column?: string) => column ? `IF(${publicTaxon(column)}, ${column}, NULL)` : 'NULL';
      const resultKind = filter.kind === 'ai' && branch.id === 'lm.id' ? "'ai'" : kind;
      return `SELECT ${resultKind} AS kind, ${id} AS id, ${code} AS slug, ${parent ? `CONVERT(${parent} USING utf8mb4) COLLATE utf8mb4_unicode_ci` : 'NULL'} AS parent,
        t.locale, ${title} AS title, LEFT(t.description, 320) AS description,
        ${visible(taxons.subject)} AS subjectId, ${visible(taxons.category)} AS categoryId,
        ${visible(taxons.level)} AS levelId, ${visible(taxons.grade)} AS gradeId, ${rank} AS score FROM ${from}
        WHERE ${clauses.join(' AND ')}`;
    }).join('\nUNION ALL\n');
}

function queryBase(filter: SearchFilter) {
  return `WITH candidates AS (${candidateQuery(filter)}), ranked AS (
    SELECT candidates.*, ROW_NUMBER() OVER (PARTITION BY kind, id
      ORDER BY score DESC, IF(locale = :languagePreference, 0, IF(locale = 'en', 1, 2)), locale) AS translation
      FROM candidates
  )`;
}

function parameters(filter: SearchFilter, preference = filter.language ?? 'en') {
  return { ...filter, languagePreference: preference };
}

export function discoverySearch(db: Sequelize) {
  async function search(query: SearchQuery, preference?: string) {
    const filter = { ...query, normalized: normalizeEducationSearch(query.q) };
    const offset = (query.page - 1) * query.pageSize;
    const replacements = { ...parameters(filter, preference), offset, limit: query.pageSize };
    const base = queryBase(filter);
    const rows = await db.query<SearchRow>(`${base}
      ${select} *, COUNT(*) OVER () AS total FROM ranked WHERE translation = 1
      ORDER BY score DESC, title, kind, id LIMIT :limit OFFSET :offset`,
    { type: QueryTypes.SELECT, replacements });
    let total = Number(rows[0]?.total ?? 0);
    if (!rows.length && offset > 0) {
      const [value] = await db.query<{ total: number | string }>(`${base} ${select} COUNT(*) AS total FROM ranked WHERE translation = 1`,
        { type: QueryTypes.SELECT, replacements });
      total = Number(value?.total ?? 0);
    }
    return { items: rows.map(projected), total, page: query.page, pageSize: query.pageSize };
  }

  async function locate(references: { kind: DiscoverableKind; id: string }[], preference = 'en', transaction?: Transaction) {
    if (!references.length) return [];
    const kinds = [...new Set(references.map(entry => entry.kind))];
    const filter = { ids: [...new Set(references.map(entry => entry.id))], kinds, kind: kinds.length === 1 ? kinds[0] : undefined };
    const rows = await db.query<SearchRow>(`${queryBase(filter)} ${select} * FROM ranked WHERE translation = 1`,
      { type: QueryTypes.SELECT, replacements: parameters(filter, preference), transaction });
    const selected = new Map(rows.map(row => [row.kind + ':' + row.id, row]));
    return references.map(entry => selected.get(entry.kind + ':' + entry.id) ?? null);
  }

  async function references(refs: Reference[], preference = 'en', transaction?: Transaction) {
    return (await locate(refs, preference, transaction)).map(row => row ? projected(row) : null);
  }

  async function recommendations(kind: DiscoverableKind, id: string, preference = 'en') {
    const [source] = await locate([{ kind, id }], preference);
    if (!source) return [];
    const { subjectId, categoryId, levelId, gradeId } = source;
    if (!subjectId && !categoryId) return [];
    const filter = { activitiesOnly: true };
    const rows = await db.query<SearchRow>(`${queryBase(filter)}
      ${select} * FROM ranked WHERE translation = 1 AND id <> :sourceId
      AND ((:subjectId IS NOT NULL AND subjectId = :subjectId) OR (:categoryId IS NOT NULL AND categoryId = :categoryId))
      ORDER BY (IF(subjectId = :subjectId, 8, 0) + IF(categoryId = :categoryId, 4, 0)
        + IF(levelId = :levelId, 2, 0) + IF(gradeId = :gradeId, 1, 0)) DESC, title, kind, id LIMIT 4`,
      { type: QueryTypes.SELECT, replacements: { ...parameters(filter, preference), sourceId: id, subjectId, categoryId, levelId, gradeId } });
    return rows.map(projected);
  }

  async function pickDaily(dayIndex: number, preference = 'en') {
    const filter = { activitiesOnly: true };
    const rows = await db.query<SearchRow>(`${queryBase(filter)}, daily_rank AS (
      SELECT ranked.*, ROW_NUMBER() OVER (ORDER BY kind, id) AS dayRank, COUNT(*) OVER () AS total
        FROM ranked WHERE translation = 1 AND kind IN ('lesson','short','quiz','book','course','video')
    ) ${select} * FROM daily_rank WHERE dayRank = MOD(:dayIndex, total) + 1`,
      { type: QueryTypes.SELECT, replacements: { ...parameters(filter, preference), dayIndex } });
    return rows[0] ? projected(rows[0]) : null;
  }

  return { search, references, recommendations, pickDaily };
}
