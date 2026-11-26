import { DataTypes, type Model, type Sequelize } from 'sequelize';
import type { QuestionKind, QuestionTranslation, QuizRecord, QuizTranslation } from './contract';

export interface QuizRow extends Omit<QuizRecord, 'questionIds' | 'translations' | 'questionCount' | 'courseSlug' | 'createdAt' | 'updatedAt'> {
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestionRow {
  id: string;
  kind: QuestionKind;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface QuizTranslationRow extends QuizTranslation { quizId: string; searchText: string }
interface PromptRow extends Omit<QuestionTranslation, 'options' | 'acceptedAnswers'> { questionId: string; searchText: string }
interface OptionRow { questionId: string; position: number; correct: boolean }
interface LabelRow { questionId: string; position: number; locale: string; label: string }
interface AcceptedAnswerRow { questionId: string; position: number; locale: string; answer: string }
interface LinkRow { quizId: string; questionId: string; position: number }

export function defineQuizModels(db: Sequelize) {
  const id = DataTypes.CHAR(36);
  const locale = DataTypes.STRING(35);
  const position = DataTypes.TINYINT.UNSIGNED;
  const primaryId = () => ({ type: id, primaryKey: true });
  const primaryLocale = () => ({ type: locale, primaryKey: true });
  const primaryPosition = () => ({ type: position, primaryKey: true });
  const requiredText = () => ({ type: DataTypes.TEXT, allowNull: false });
  const versioned = () => ({
    id: primaryId(),
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: { type: DataTypes.DATE(3), allowNull: false },
    updatedAt: { type: DataTypes.DATE(3), allowNull: false },
  });
  const table = (tableName: string) => ({ tableName, timestamps: false, underscored: true });

  const Quiz = db.define<Model<QuizRow>>('Quiz', {
    ...versioned(),
    slug: { type: DataTypes.STRING(80), allowNull: false },
    courseId: { type: id },
    status: { type: DataTypes.STRING(24), allowNull: false },
    passingScore: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
  }, table('quizzes'));

  const QuizTranslation = db.define<Model<QuizTranslationRow>>('QuizTranslation', {
    quizId: primaryId(), locale: primaryLocale(),
    title: { type: DataTypes.STRING(150), allowNull: false },
    description: requiredText(), searchText: requiredText(),
  }, table('quiz_translations'));

  const Question = db.define<Model<QuestionRow>>('QuizQuestion', {
    ...versioned(), kind: { type: DataTypes.STRING(16), allowNull: false },
  }, table('quiz_questions'));

  const Prompt = db.define<Model<PromptRow>>('QuizQuestionTranslation', {
    questionId: primaryId(), locale: primaryLocale(),
    prompt: requiredText(), explanation: requiredText(), searchText: requiredText(),
  }, table('quiz_question_translations'));

  const Option = db.define<Model<OptionRow>>('QuizQuestionOption', {
    questionId: primaryId(), position: primaryPosition(), correct: { type: DataTypes.BOOLEAN, allowNull: false },
  }, table('quiz_question_options'));

  const Label = db.define<Model<LabelRow>>('QuizOptionTranslation', {
    questionId: primaryId(), position: primaryPosition(), locale: primaryLocale(),
    label: { type: DataTypes.STRING(100), allowNull: false },
  }, table('quiz_option_translations'));

  const AcceptedAnswer = db.define<Model<AcceptedAnswerRow>>('QuizShortAnswer', {
    questionId: primaryId(), position: primaryPosition(), locale: primaryLocale(),
    answer: { type: DataTypes.STRING(100), allowNull: false },
  }, table('quiz_short_answers'));

  const Link = db.define<Model<LinkRow>>('QuizQuestionLink', {
    quizId: primaryId(), questionId: primaryId(), position: { type: position, allowNull: false },
  }, table('quiz_question_links'));

  return { Quiz, QuizTranslation, Question, Prompt, Option, Label, AcceptedAnswer, Link };
}

export type QuizModels = ReturnType<typeof defineQuizModels>;
