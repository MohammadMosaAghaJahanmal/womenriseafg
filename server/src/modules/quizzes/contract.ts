import type { EducationStatus } from '../education/contract';
import type { ContentProvenance } from '../courses/provenance';

export const questionKinds = ['single-choice', 'multiple-choice', 'true-false', 'short-answer'] as const;
export const quizManagePermission = 'quiz:manage';
export const quizPublishPermission = 'quiz:publish';
export const quizQuestionLimit = 30;

export type QuestionKind = typeof questionKinds[number];

export interface QuestionTranslation {
  locale: string;
  prompt: string;
  options: string[];
  acceptedAnswers: string[];
  explanation: string;
  provenance?: ContentProvenance | null;
}

export interface QuestionInput {
  kind: QuestionKind;
  correctOptions: number[];
  translations: QuestionTranslation[];
  provenance?: ContentProvenance | null;
}

interface Versioned {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionRecord extends QuestionInput, Versioned {
  referenced: boolean;
}

export interface QuizTranslation {
  locale: string;
  title: string;
  description: string;
  provenance?: ContentProvenance | null;
}

export interface QuizInput {
  slug: string;
  courseId: string | null;
  passingScore: number;
  questionIds: string[];
  translations: QuizTranslation[];
  provenance?: ContentProvenance | null;
}

export interface QuizRecord extends QuizInput, Versioned {
  courseSlug: string | null;
  status: EducationStatus;
  questionCount: number;
}

export interface ListOptions {
  q: string;
  page: number;
  pageSize: number;
}

export interface QuizListOptions extends ListOptions {
  status?: EducationStatus;
  language?: string;
  courseId?: string;
  standalone?: boolean;
  publicOnly?: boolean;
}

export interface QuestionListOptions extends ListOptions {
  kind?: QuestionKind;
}

export interface Answer {
  questionId: string;
  options: number[];
  text: string;
}

export interface QuizAttempt {
  version: number;
  language: string;
  answers: Answer[];
}

export type QuizErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'STALE_VERSION' | 'INVALID_TRANSITION' | 'QUESTION_IN_USE' |
  'INVALID_REFERENCE' | 'INCOMPLETE_CONTENT' | 'INVALID_ATTEMPT' | 'QUIZ_IN_USE' | 'INCOMPLETE_PROVENANCE';

export class QuizError extends Error {
  constructor(readonly code: QuizErrorCode) {
    super(code);
  }
}

export function normalizeAnswer(value: string, locale?: string) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase(locale);
}
