import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { publicCourse, publishedLocale } from '../courses/reader';
import { normalizeEducationSearch } from '../education/models';
import type { QuestionListOptions, QuestionRecord, QuizListOptions, QuizRecord, QuizTranslation } from './contract';
import type { QuestionRow, QuizModels, QuizRow } from './models';

type QuizProjection = QuizRow & { courseSlug: string | null };
type BankProjection = QuestionRow & { referenced: number | boolean };
type TranslationRow = QuizTranslation & { quizId: string };
type Bindings = Record<string, string | number | string[] | undefined>;

// A visible locale describes the quiz and all its questions so that what learners
// see is exactly the language the grader uses, including for short answers.
export const quizLocale = (field: string) => `${publishedLocale(field)}
  AND NOT EXISTS (
    SELECT 1 FROM quiz_question_links complete
    WHERE complete.quiz_id = z.id AND NOT EXISTS (
      SELECT 1 FROM quiz_question_translations prompt
      WHERE prompt.question_id = complete.question_id AND prompt.locale = ${field}
    )
  )`;

const linkedCourse = `EXISTS (SELECT 1 FROM courses c WHERE c.id = z.course_id AND ${publicCourse})`;
export const publicQuiz = `z.status = 'published'
  AND (z.course_id IS NULL OR ${linkedCourse})
  AND EXISTS (SELECT 1 FROM quiz_question_links ready WHERE ready.quiz_id = z.id)
  AND EXISTS (SELECT 1 FROM quiz_translations available WHERE available.quiz_id = z.id AND ${quizLocale('available.locale')})`;

function group<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const label = key(row);
    const list = groups.get(label);
    if (list) list.push(row);
    else groups.set(label, [row]);
  }
  return groups;
}

function dates<T extends { createdAt: Date; updatedAt: Date }>({ createdAt, updatedAt, ...values }: T) {
  return { ...values, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
}

export function quizReader(db: Sequelize, models: QuizModels) {
  const { Prompt, Option, Label, AcceptedAnswer, Link } = models;
  const select = <T extends object>(sql: string, replacements: Bindings, transaction: Transaction) =>
    db.query<T>(sql, { type: QueryTypes.SELECT, replacements, transaction });

  async function materializeQuizzes(rows: QuizProjection[], transaction: Transaction, publicOnly: boolean): Promise<QuizRecord[]> {
    if (!rows.length) return [];
    const ids = rows.map(row => row.id);
    const translations = await select<TranslationRow>(`
      SELECT qt.quiz_id AS quizId, qt.locale, qt.title, qt.description
      FROM quiz_translations qt JOIN quizzes z ON z.id = qt.quiz_id
      WHERE qt.quiz_id IN (:ids) ${publicOnly ? 'AND ' + quizLocale('qt.locale') : ''}
      ORDER BY qt.locale
    `, { ids }, transaction);
    const links = await Link.findAll({ where: { quizId: ids }, order: [['position', 'ASC']], transaction });
    const byQuiz = group(translations, ({ quizId }) => quizId);
    const byLink = group(links.map(link => link.get()), ({ quizId }) => quizId);
    return rows.map(row => {
      const questionIds = (byLink.get(row.id) ?? []).map(link => link.questionId);
      return { ...dates(row), questionIds, questionCount: questionIds.length,
        translations: (byQuiz.get(row.id) ?? []).map(({ locale, title, description }) => ({ locale, title, description })) };
    });
  }

  async function selectQuizzes(where: string, replacements: Bindings, transaction: Transaction, paginate = false) {
    return select<QuizProjection>(`
      SELECT z.id, z.slug, z.course_id AS courseId, linked.slug AS courseSlug, z.status,
        z.passing_score AS passingScore, z.version, z.created_at AS createdAt, z.updated_at AS updatedAt
      FROM quizzes z LEFT JOIN courses linked ON linked.id = z.course_id
      WHERE ${where}
      ORDER BY z.updated_at DESC, z.id ASC ${paginate ? 'LIMIT :limit OFFSET :offset' : ''}
    `, replacements, transaction);
  }

  async function selectQuestions(where: string, replacements: Bindings, transaction: Transaction, paginate = false) {
    return select<BankProjection>(`
      SELECT bank.id, bank.kind, bank.version, bank.created_at AS createdAt, bank.updated_at AS updatedAt,
        EXISTS (SELECT 1 FROM quiz_question_links ref WHERE ref.question_id = bank.id) AS referenced
      FROM quiz_questions bank
      WHERE ${where} ORDER BY bank.updated_at DESC, bank.id ASC ${paginate ? 'LIMIT :limit OFFSET :offset' : ''}
    `, replacements, transaction);
  }

  async function materializeQuestions(
    rows: BankProjection[], transaction: Transaction, options: { locales?: string[]; solutions: boolean },
  ): Promise<QuestionRecord[]> {
    if (!rows.length) return [];
    const ids = rows.map(row => row.id);
    const where = { questionId: ids, ...(options.locales ? { locale: options.locales } : {}) };
    const prompts = await Prompt.findAll({ where, attributes: options.solutions
      ? ['questionId', 'locale', 'prompt', 'explanation'] : ['questionId', 'locale', 'prompt'], order: [['locale', 'ASC']], transaction });
    const labels = await Label.findAll({ where, order: [['position', 'ASC']], transaction });
    const correct = options.solutions
      ? await Option.findAll({ where: { questionId: ids, correct: true }, order: [['position', 'ASC']], transaction }) : [];
    const short = options.solutions
      ? await AcceptedAnswer.findAll({ where, order: [['position', 'ASC']], transaction }) : [];
    const promptsById = group(prompts.map(row => row.get()), ({ questionId }) => questionId);
    const labelsByLocale = group(labels.map(row => row.get()), ({ questionId, locale }) => questionId + '/' + locale);
    const answersByLocale = group(short.map(row => row.get()), ({ questionId, locale }) => questionId + '/' + locale);
    const correctById = group(correct.map(row => row.get()), ({ questionId }) => questionId);
    return rows.map(row => ({
      ...dates(row), referenced: Boolean(Number(row.referenced)),
      correctOptions: (correctById.get(row.id) ?? []).map(({ position }) => position),
      translations: (promptsById.get(row.id) ?? []).map(({ questionId, locale, prompt, explanation }) => ({
        locale, prompt, explanation: explanation ?? '',
        options: (labelsByLocale.get(questionId + '/' + locale) ?? []).map(({ label }) => label),
        acceptedAnswers: (answersByLocale.get(questionId + '/' + locale) ?? []).map(({ answer }) => answer),
      })),
    }));
  }

  return {
    async getQuiz(id: string, transaction: Transaction) {
      const rows = await selectQuizzes('z.id = :id', { id }, transaction);
      return (await materializeQuizzes(rows, transaction, false))[0] ?? null;
    },

    async getPublicQuiz(slug: string, transaction: Transaction) {
      const rows = await selectQuizzes('z.slug = :slug AND ' + publicQuiz, { slug }, transaction);
      return (await materializeQuizzes(rows, transaction, true))[0] ?? null;
    },

    async getQuestion(id: string, transaction: Transaction) {
      const rows = await selectQuestions('bank.id = :id', { id }, transaction);
      return (await materializeQuestions(rows, transaction, { solutions: true }))[0] ?? null;
    },

    async questionsForQuiz(ids: string[], locales: string[] | undefined, solutions: boolean, transaction: Transaction) {
      if (!ids.length) return [];
      const rows = await selectQuestions('bank.id IN (:ids)', { ids }, transaction);
      const byId = new Map((await materializeQuestions(rows, transaction, { locales, solutions })).map(item => [item.id, item]));
      return ids.flatMap(id => byId.get(id) ?? []);
    },

    async eligibleLocales(id: string, transaction: Transaction) {
      return select<{ locale: string }>(`
        SELECT qt.locale FROM quiz_translations qt JOIN quizzes z ON z.id = qt.quiz_id
        WHERE z.id = :id AND ${quizLocale('qt.locale')}
      `, { id }, transaction);
    },

    listQuizzes({ q, page, pageSize, publicOnly = false, status, language, courseId }: QuizListOptions) {
      return db.transaction(async transaction => {
        const predicates = [publicOnly ? publicQuiz : '1 = 1'];
        if (!publicOnly && status) predicates.push('z.status = :status');
        if (courseId) predicates.push('z.course_id = :courseId');
        const localized = `qt.quiz_id = z.id ${publicOnly ? 'AND ' + quizLocale('qt.locale') : ''}`;
        if (language) predicates.push(`EXISTS (SELECT 1 FROM quiz_translations qt WHERE ${localized} AND qt.locale = :language)`);
        const search = normalizeEducationSearch(q);
        if (search) predicates.push(`(
          LOCATE(:search, CONVERT(z.slug USING utf8mb4) COLLATE utf8mb4_unicode_ci) > 0
          OR EXISTS (SELECT 1 FROM quiz_translations qt WHERE ${localized} AND LOCATE(:search, qt.search_text) > 0)
        )`);
        const where = predicates.join(' AND ');
        const values = { status, language, courseId, search, limit: pageSize, offset: (page - 1) * pageSize };
        const [count] = await select<{ count: number | string }>('SELECT COUNT(*) AS count FROM quizzes z WHERE ' + where, values, transaction);
        const records = await selectQuizzes(where, values, transaction, true);
        return { items: await materializeQuizzes(records, transaction, publicOnly), total: Number(count?.count ?? 0), page, pageSize };
      });
    },

    listQuestions({ q, page, pageSize, kind }: QuestionListOptions) {
      return db.transaction(async transaction => {
        const search = normalizeEducationSearch(q);
        const predicates = [kind ? 'bank.kind = :kind' : '1 = 1'];
        if (search) predicates.push(`EXISTS (
          SELECT 1 FROM quiz_question_translations bank_text
          WHERE bank_text.question_id = bank.id AND LOCATE(:search, bank_text.search_text) > 0
        )`);
        const where = predicates.join(' AND ');
        const values = { search, kind, limit: pageSize, offset: (page - 1) * pageSize };
        const [count] = await select<{ count: number | string }>('SELECT COUNT(*) AS count FROM quiz_questions bank WHERE ' + where, values, transaction);
        const records = await selectQuestions(where, values, transaction, true);
        return { items: await materializeQuestions(records, transaction, { solutions: true }), total: Number(count?.count ?? 0), page, pageSize };
      });
    },
  };
}
