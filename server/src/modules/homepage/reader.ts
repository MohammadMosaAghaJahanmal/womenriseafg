import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { publicBook } from '../books/reader';
import { publicCourse, publishedLocale, visibleLesson } from '../courses/reader';
import { publicPath } from '../discovery/search';
import { publicEducationEntry } from '../education/store';
import { publicLearningMedia } from '../learning-media/reader';
import { publicQuiz, quizLocale } from '../quizzes/reader';
import type { HomepageItem, HomeQuery, LocalizedTitle } from './contract';

type HomepageKind = Extract<HomepageItem['kind'], 'course' | 'video' | 'short' | 'book' | 'ai' | 'path' | 'quiz' | 'subject'>;
interface Source {
  alias: string;
  from: string;
  visible: string;
  translations: string;
  translationKey: string;
  localeCheck?: (column: string) => string;
  title?: string;
  image?: string;
  contentLanguage?: string;
  subject?: string;
  category?: string;
  level?: string;
}

const courseFields = 'courses c LEFT JOIN education_entries course_subject ON course_subject.id = c.subject_id';
const mediaFields = `learning_media lm JOIN media_assets asset ON asset.id = lm.media_id
  LEFT JOIN media_links link ON link.parent_id = asset.id AND link.relation = 'thumbnail' AND link.slot = 'default'
  LEFT JOIN media_assets thumbnail ON thumbnail.id = link.asset_id AND thumbnail.kind = 'image' AND thumbnail.status = 'published'`;
const mediaSource = {
  alias: 'lm', from: mediaFields, translations: 'learning_media_translations', translationKey: 'learning_media_id',
  image: "CASE WHEN asset.kind = 'image' THEN asset.id ELSE thumbnail.id END",
};
const sources: Record<HomepageKind, Source> = {
  course: {
    alias: 'c', from: courseFields + " LEFT JOIN media_assets thumbnail ON thumbnail.id = c.thumbnail_id AND thumbnail.kind = 'image' AND thumbnail.status = 'published'",
    visible: publicCourse, translations: 'course_translations', translationKey: 'course_id', image: 'thumbnail.id',
    subject: 'c.subject_id', category: 'course_subject.category_id', level: 'c.level_id',
  },
  book: {
    alias: 'b', from: "books b JOIN media_assets pdf ON pdf.id = b.pdf_id AND pdf.kind = 'pdf' LEFT JOIN media_assets cover ON cover.id = b.cover_id AND cover.kind = 'image' AND cover.status = 'published'",
    visible: publicBook, translations: 'book_translations', translationKey: 'book_id', image: 'cover.id',
    contentLanguage: 'b.content_language', level: 'b.level_id',
  },
  video: { ...mediaSource, visible: "lm.kind = 'video' AND " + publicLearningMedia },
  short: { ...mediaSource, visible: "lm.kind = 'short' AND " + publicLearningMedia },
  ai: { ...mediaSource, visible: "lm.ai_origin <> 'human' AND " + publicLearningMedia },
  path: { alias: 'p', from: 'learning_paths p', visible: publicPath,
    translations: 'learning_path_translations', translationKey: 'path_id' },
  quiz: { alias: 'z', from: 'quizzes z', visible: publicQuiz,
    translations: 'quiz_translations', translationKey: 'quiz_id', localeCheck: quizLocale },
  subject: { alias: 'e', from: 'education_entries e', visible: "e.kind = 'subjects' " + publicEducationEntry,
    translations: 'education_translations', translationKey: 'entry_id', title: 'name' },
};

function publicTaxon(field: string) {
  return `(SELECT e.id FROM education_entries e WHERE e.id = ${field} ${publicEducationEntry})`;
}

// Publication predicates contain nested index lookups. Bound optimizer and query time on shared MySQL.
const select = "SELECT /*+ SET_VAR(optimizer_search_depth = 3) SET_VAR(optimizer_switch = 'semijoin=off') MAX_EXECUTION_TIME(4000) */";
const paths: Record<HomepageKind, string> = {
  course: '/courses/', book: '/library/', video: '/videos/', short: '/shorts/', ai: '/ai-learning/',
  path: '/learning-paths/', quiz: '/quizzes/', subject: '/search?subjectId=',
};
type Taxonomies = { subjectId: string | null; categoryId: string | null; levelId: string | null };
interface Candidate extends Taxonomies {
  item: HomepageItem;
  createdAt: Date;
}
interface Row extends Taxonomies {
  id: string;
  slug: string;
  imageId: string | null;
  createdAt: Date;
  locale: string;
  title: string;
  description: string;
  contentLanguage: string | null;
  lessonCount: number | string | null;
  estimatedMinutes: number | null;
}

export function preferredCopy<T extends { locale: string }>(translations: readonly T[], preferred = 'en') {
  return translations.find(item => item.locale === preferred) ?? translations.find(item => item.locale === 'en') ?? translations[0];
}

interface Options extends HomeQuery {
  ids?: string[];
  exclude?: string[];
  related?: Taxonomies;
  popular?: boolean;
  recent?: boolean;
  limit: number;
}

export function homepageReader(db: Sequelize) {
  async function list(kind: HomepageKind, options: Options, transaction: Transaction): Promise<Candidate[]> {
    if (options.ids?.length === 0) return [];
    const { alias, from, visible, translations, translationKey, image, contentLanguage, title,
      subject, category, level, localeCheck = publishedLocale } = sources[kind];
    const id = alias + '.id';
    const predicates = [visible];
    if (options.ids) predicates.push(`${id} IN (:ids)`);
    if (options.exclude?.length) predicates.push(`${id} NOT IN (:exclude)`);
    if (options.language) {
      if (kind === 'book') {
        predicates.push(`${contentLanguage} = :language`);
      } else {
        predicates.push(`EXISTS (SELECT 1 FROM ${translations} matching WHERE matching.${translationKey} = ${id}
          AND matching.locale = :language AND ${localeCheck('matching.locale')})`);
      }
    }
    const related = options.related;
    const affinity = related ? `IF(:subjectId IS NOT NULL AND ${subject} = :subjectId, 8, 0)
      + IF(:categoryId IS NOT NULL AND ${category} = :categoryId, 4, 0)
      + IF(:levelId IS NOT NULL AND ${level} = :levelId, 2, 0)` : '0';
    const priority = options.ids ? `-FIELD(${id}, :ids)` : options.popular ? 'counts.opens' : affinity;
    const opens = options.popular ? ' JOIN homepage_course_opens counts ON counts.course_id = c.id' : '';
    const taxon = (field?: string) => field ? publicTaxon(field) : 'NULL';
    const lessonFields = kind === 'course'
      ? `(SELECT COUNT(*) FROM lessons l WHERE l.course_id = ${id} AND ${visibleLesson}) AS lessonCount,
         c.estimated_minutes AS estimatedMinutes` : 'NULL AS lessonCount, NULL AS estimatedMinutes';
    const sortDate = alias + (options.recent ? '.created_at' : '.updated_at');
    const rows = await db.query<Row>(`WITH chosen AS (
      SELECT ${id} AS id, ${alias}.slug, ${alias}.created_at AS createdAt, ${sortDate} AS sortDate,
        ${priority} AS priority, ${image ?? 'NULL'} AS imageId, ${contentLanguage ?? 'NULL'} AS contentLanguage,
        ${taxon(subject)} AS subjectId, ${taxon(category)} AS categoryId, ${taxon(level)} AS levelId, ${lessonFields}
      FROM ${from}${opens} WHERE ${predicates.join(' AND ')}
      ORDER BY priority DESC, sortDate DESC, id ASC LIMIT :limit
    )
    ${select} chosen.*, copy.locale, copy.${title ?? 'title'} AS title, LEFT(copy.description, 320) AS description
    FROM chosen JOIN ${translations} copy ON copy.${translationKey} = chosen.id
    ${kind === 'quiz' ? 'JOIN quizzes z ON z.id = chosen.id' : ''}
    WHERE ${localeCheck('copy.locale')}
    ORDER BY chosen.priority DESC, chosen.sortDate DESC, chosen.id ASC, copy.locale ASC`, {
      type: QueryTypes.SELECT, transaction, replacements: { ...options, ...related },
    });
    const grouped = new Map<string, Row[]>();
    for (const row of rows) {
      const group = grouped.get(row.id);
      if (group) group.push(row);
      else grouped.set(row.id, [row]);
    }
    return [...grouped.values()].flatMap(translations => {
      const chosen = preferredCopy(translations, options.language ?? options.preferred);
      if (!chosen) return [];
      return [{
        subjectId: chosen.subjectId, categoryId: chosen.categoryId, levelId: chosen.levelId, createdAt: chosen.createdAt,
        item: {
          kind, id: chosen.id, href: paths[kind] + encodeURIComponent(kind === 'subject' ? chosen.id : chosen.slug),
          locale: chosen.locale, title: chosen.title, description: chosen.description,
          imageId: chosen.imageId, languages: translations.map(row => row.locale),
          ...(chosen.contentLanguage ? { contentLanguage: chosen.contentLanguage } : {}),
          ...(chosen.lessonCount !== null ? { lessonCount: Number(chosen.lessonCount) } : {}),
          ...(chosen.estimatedMinutes !== null ? { estimatedMinutes: chosen.estimatedMinutes } : {}),
        },
      }];
    });
  }

  async function taxonomyLabels(items: Candidate[], preferred: string, transaction: Transaction) {
    const ids = [...new Set(items.flatMap(item => [item.subjectId, item.levelId]).filter((id): id is string => !!id))];
    if (!ids.length) return;
    const rows = await db.query<LocalizedTitle & { id: string }>(`${select} t.entry_id AS id, t.locale, t.name AS title
      FROM education_translations t JOIN education_entries e ON e.id = t.entry_id
      WHERE e.id IN (:ids) ${publicEducationEntry} AND ${publishedLocale('t.locale')}`, {
      type: QueryTypes.SELECT, transaction, replacements: { ids },
    });
    const grouped = new Map<string, LocalizedTitle[]>();
    for (const { id, locale, title } of rows) {
      const group = grouped.get(id);
      if (group) group.push({ locale, title });
      else grouped.set(id, [{ locale, title }]);
    }
    const labels = new Map([...grouped].map(([id, copies]) => [id, preferredCopy(copies, preferred)]));
    for (const candidate of items) {
      const subject = candidate.subjectId ? labels.get(candidate.subjectId) : undefined;
      const level = candidate.levelId ? labels.get(candidate.levelId) : undefined;
      if (subject) candidate.item.subject = { locale: subject.locale, title: subject.title };
      if (level) candidate.item.level = { locale: level.locale, title: level.title };
    }
  }

  return { list, taxonomyLabels };
}

export function mergeRecentlyAdded(groups: Candidate[][], limit: number) {
  const entries = groups.flat();
  entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() ||
    a.item.href.localeCompare(b.item.href, 'en'));
  const seen = new Set<string>();
  return entries.filter(item => {
    if (seen.has(item.item.id)) return false;
    seen.add(item.item.id);
    return true;
  }).slice(0, limit);
}

export type { Candidate, HomepageKind };
