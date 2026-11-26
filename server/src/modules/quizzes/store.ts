import { randomUUID } from 'node:crypto';
import { ForeignKeyConstraintError, QueryTypes, UniqueConstraintError, type Sequelize, type Transaction } from 'sequelize';
import { publicCourse } from '../courses/reader';
import { transitionAllowed, type EducationStatus } from '../education/contract';
import { normalizeEducationSearch } from '../education/models';
import { QuizError, type QuestionInput, type QuizAttempt, type QuizInput } from './contract';
import { defineQuizModels } from './models';
import { quizReader } from './reader';
import { scoreQuiz } from './score';

const editable: EducationStatus[] = ['draft', 'educational-review', 'translation-review'];
const removable: EducationStatus[] = ['draft', 'archived'];

export function createQuizStore(db: Sequelize) {
  const models = defineQuizModels(db);
  const { Quiz, QuizTranslation, Question, Prompt, Option, Label, AcceptedAnswer, Link } = models;
  const reader = quizReader(db, models);

  async function write<T>(operation: (transaction: Transaction) => Promise<T>) {
    try {
      return await db.transaction(operation);
    } catch (error) {
      if (error instanceof UniqueConstraintError) throw new QuizError('CONFLICT');
      if (error instanceof ForeignKeyConstraintError) throw new QuizError('INVALID_REFERENCE');
      throw error;
    }
  }

  async function requireQuiz(id: string, transaction: Transaction) {
    const quiz = await reader.getQuiz(id, transaction);
    if (!quiz) throw new QuizError('NOT_FOUND');
    return quiz;
  }

  async function requireQuestion(id: string, transaction: Transaction) {
    const question = await reader.getQuestion(id, transaction);
    if (!question) throw new QuizError('NOT_FOUND');
    return question;
  }

  async function lockedQuiz(id: string, version: number, transaction: Transaction) {
    const quiz = await Quiz.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!quiz) throw new QuizError('NOT_FOUND');
    if (quiz.getDataValue('version') !== version) throw new QuizError('STALE_VERSION');
    return quiz;
  }

  async function lockedUnlinkedQuestion(id: string, version: number, transaction: Transaction) {
    const question = await Question.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!question) throw new QuizError('NOT_FOUND');
    if (question.getDataValue('version') !== version) throw new QuizError('STALE_VERSION');
    const linked = await Link.findOne({ where: { questionId: id }, transaction });
    if (linked) throw new QuizError('QUESTION_IN_USE');
    return question;
  }

  async function checkLocales(values: { locale: string }[], transaction: Transaction) {
    const locales = values.map(value => value.locale);
    const available = await db.query<{ locale: string }>('SELECT locale FROM education_languages WHERE locale IN (:locales)',
      { type: QueryTypes.SELECT, replacements: { locales }, transaction });
    if (available.length !== locales.length) throw new QuizError('INVALID_REFERENCE');
  }

  async function checkCourse(courseId: string | null, publicOnly: boolean, transaction: Transaction) {
    if (!courseId) return;
    const [course] = await db.query<{ id: string }>(`SELECT c.id FROM courses c WHERE c.id = :courseId
      ${publicOnly ? 'AND ' + publicCourse : ''} FOR SHARE`,
    { type: QueryTypes.SELECT, replacements: { courseId }, transaction });
    if (!course) throw new QuizError('INVALID_REFERENCE');
  }

  async function checkQuiz(input: QuizInput, transaction: Transaction) {
    await checkLocales(input.translations, transaction);
    await checkCourse(input.courseId, false, transaction);
    if (input.questionIds.length) {
      // Editors and question-bank mutations use the same rows as locks.
      const linked = await Question.findAll({
        where: { id: input.questionIds }, attributes: ['id'], order: [['id', 'ASC']],
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (linked.length !== input.questionIds.length) throw new QuizError('INVALID_REFERENCE');
    }
  }

  async function saveQuizParts(quizId: string, input: QuizInput, transaction: Transaction) {
    await QuizTranslation.bulkCreate(input.translations.map(translation => ({
      ...translation, quizId, searchText: normalizeEducationSearch(translation.title + ' ' + translation.description),
    })), { transaction });
    if (input.questionIds.length) {
      await Link.bulkCreate(input.questionIds.map((questionId, position) => ({ quizId, questionId, position })), { transaction });
    }
  }

  async function saveQuestionParts(questionId: string, input: QuestionInput, transaction: Transaction) {
    await Prompt.bulkCreate(input.translations.map(({ locale, prompt, explanation }) => ({
      questionId, locale, prompt, explanation, searchText: normalizeEducationSearch(prompt),
    })), { transaction });
    if (input.kind === 'short-answer') {
      await AcceptedAnswer.bulkCreate(input.translations.flatMap(({ locale, acceptedAnswers }) =>
        acceptedAnswers.map((answer, position) => ({ questionId, locale, position, answer }))), { transaction });
      return;
    }
    await Option.bulkCreate(input.translations[0]!.options.map((_label, position) =>
      ({ questionId, position, correct: input.correctOptions.includes(position) })), { transaction });
    await Label.bulkCreate(input.translations.flatMap(({ locale, options }) =>
      options.map((label, position) => ({ questionId, locale, position, label }))), { transaction });
  }

  function summary(question: Awaited<ReturnType<typeof requireQuestion>>) {
    return { id: question.id, kind: question.kind, translations: question.translations.map(({ locale, prompt, options }) =>
      ({ locale, prompt, options })) };
  }

  return {
    listQuizzes: reader.listQuizzes,
    listQuestions: reader.listQuestions,

    getQuiz(id: string) {
      return db.transaction(async transaction => {
        const quiz = await requireQuiz(id, transaction);
        const questions = await reader.questionsForQuiz(quiz.questionIds, undefined, false, transaction);
        return { ...quiz, questions: questions.map(summary) };
      });
    },

    getQuestion(id: string) {
      return db.transaction(transaction => requireQuestion(id, transaction));
    },

    getPublicQuiz(slug: string) {
      return db.transaction(async transaction => {
        const quiz = await reader.getPublicQuiz(slug, transaction);
        if (!quiz) throw new QuizError('NOT_FOUND');
        const questions = await reader.questionsForQuiz(quiz.questionIds, quiz.translations.map(item => item.locale), false, transaction);
        return { ...quiz, questions: questions.map(summary) };
      });
    },

    grade(slug: string, attempt: QuizAttempt) {
      return db.transaction(async transaction => {
        const quiz = await reader.getPublicQuiz(slug, transaction);
        if (!quiz) throw new QuizError('NOT_FOUND');
        if (quiz.version !== attempt.version || !quiz.translations.some(item => item.locale === attempt.language)) {
          throw new QuizError('STALE_VERSION');
        }
        const questions = await reader.questionsForQuiz(quiz.questionIds, [attempt.language], true, transaction);
        return scoreQuiz(questions, attempt.language, quiz.passingScore, attempt.answers);
      });
    },

    createQuestion(input: QuestionInput) {
      return write(async transaction => {
        await checkLocales(input.translations, transaction);
        const id = randomUUID();
        const now = new Date();
        await Question.create({ id, version: 1, createdAt: now, updatedAt: now, kind: input.kind }, { transaction });
        await saveQuestionParts(id, input, transaction);
        return requireQuestion(id, transaction);
      });
    },

    updateQuestion(id: string, input: QuestionInput, version: number) {
      return write(async transaction => {
        const question = await lockedUnlinkedQuestion(id, version, transaction);
        await checkLocales(input.translations, transaction);
        await question.update({ kind: input.kind, version: version + 1, updatedAt: new Date() }, { transaction });
        await Option.destroy({ where: { questionId: id }, transaction });
        await Prompt.destroy({ where: { questionId: id }, transaction });
        await saveQuestionParts(id, input, transaction);
        return requireQuestion(id, transaction);
      });
    },

    removeQuestion(id: string, version: number) {
      return write(async transaction => (await lockedUnlinkedQuestion(id, version, transaction)).destroy({ transaction }));
    },

    createQuiz(input: QuizInput) {
      return write(async transaction => {
        await checkQuiz(input, transaction);
        const id = randomUUID();
        const now = new Date();
        const { slug, courseId, passingScore } = input;
        await Quiz.create({ id, slug, courseId, passingScore, status: 'draft', version: 1, createdAt: now, updatedAt: now }, { transaction });
        await saveQuizParts(id, input, transaction);
        return requireQuiz(id, transaction);
      });
    },

    updateQuiz(id: string, input: QuizInput, version: number) {
      return write(async transaction => {
        const quiz = await lockedQuiz(id, version, transaction);
        if (!editable.includes(quiz.getDataValue('status'))) throw new QuizError('INVALID_TRANSITION');
        await checkQuiz(input, transaction);
        const { slug, courseId, passingScore } = input;
        await quiz.update({ slug, courseId, passingScore, version: version + 1, updatedAt: new Date() }, { transaction });
        await Link.destroy({ where: { quizId: id }, transaction });
        await QuizTranslation.destroy({ where: { quizId: id }, transaction });
        await saveQuizParts(id, input, transaction);
        return requireQuiz(id, transaction);
      });
    },

    changeStatus(id: string, status: EducationStatus, version: number) {
      return write(async transaction => {
        const quiz = await lockedQuiz(id, version, transaction);
        if (!transitionAllowed(quiz.getDataValue('status'), status)) throw new QuizError('INVALID_TRANSITION');
        if (status === 'approved' || status === 'published') {
          const linked = await Link.findOne({ where: { quizId: id }, transaction });
          if (!linked || !(await reader.eligibleLocales(id, transaction)).length) throw new QuizError('INCOMPLETE_CONTENT');
          await checkCourse(quiz.getDataValue('courseId'), true, transaction);
        }
        await quiz.update({ status, version: version + 1, updatedAt: new Date() }, { transaction });
        return requireQuiz(id, transaction);
      });
    },

    removeQuiz(id: string, version: number) {
      return write(async transaction => {
        const quiz = await lockedQuiz(id, version, transaction);
        if (!removable.includes(quiz.getDataValue('status'))) throw new QuizError('INVALID_TRANSITION');
        await quiz.destroy({ transaction });
      });
    },
  };
}

export type QuizStore = ReturnType<typeof createQuizStore>;
