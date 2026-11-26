import axios from 'axios';
import { authError, authStatus } from '../auth/api';
import type { EducationRecord, Status } from '../education/api';
import type { ContentProvenance, PublicProvenance } from '../courses/Provenance';

export const quizAdminPath = '/admin/quizzes';
export const questionBankPath = quizAdminPath + '/questions';
export const questionKinds = ['single-choice', 'multiple-choice', 'true-false', 'short-answer'] as const;
export type QuestionKind = typeof questionKinds[number];
export const questionLabels = {
  'single-choice': 'choice',
  'multiple-choice': 'multiple',
  'true-false': 'boolean',
  'short-answer': 'short',
} as const;
type Description = { locale: string; title: string; description: string };
export type QuizTranslation = Description & { provenance?: ContentProvenance | null };
export type PublicQuestionTranslation = { locale: string; prompt: string; options: string[]; provenance?: PublicProvenance | null };
export type QuestionTranslation = Omit<PublicQuestionTranslation, 'provenance'> & {
  acceptedAnswers: string[]; explanation: string; provenance?: ContentProvenance | null;
};

export interface QuestionInput {
  kind: QuestionKind;
  correctOptions: number[];
  translations: QuestionTranslation[];
  provenance?: ContentProvenance | null;
}

export interface BankQuestion extends QuestionInput {
  id: string;
  version: number;
  referenced: boolean;
}

export interface PublicQuestion {
  id: string;
  kind: QuestionKind;
  translations: PublicQuestionTranslation[];
  provenance?: PublicProvenance | null;
}

export interface QuizInput {
  slug: string;
  courseId: string | null;
  passingScore: number;
  questionIds: string[];
  translations: QuizTranslation[];
  provenance?: ContentProvenance | null;
}

export interface QuizSummary {
  id: string;
  slug: string;
  courseId: string | null;
  passingScore: number;
  questionCount: number;
  translations: QuizTranslation[];
}

export interface AdminQuiz extends QuizInput, QuizSummary {
  status: Status;
  version: number;
  courseSlug?: string | null;
  questions?: { id: string; kind: QuestionKind; translations: { locale: string; prompt: string }[] }[];
}

export interface PublicQuiz extends Omit<QuizSummary, 'translations'> {
  version: number;
  questions: PublicQuestion[];
  translations: (Description & { provenance?: PublicProvenance | null })[];
  provenance?: PublicProvenance | null;
}

export interface Answer {
  questionId: string;
  options: number[];
  text: string;
}

export interface QuizResult {
  scorePercent: number;
  correctCount: number;
  totalQuestions: number;
  passed: boolean;
  passingScore: number;
  answers: { questionId: string; correct: boolean; correctOptions: number[];
    acceptedAnswers: string[]; explanation: string; locale: string }[];
}

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
type ListOptions = { q: string; page: number; pageSize: number };
const service = axios.create({ baseURL: '/api/v1', timeout: 12000 });

export function quizPath(slug: string, language?: string) {
  const suffix = language ? '?' + new URLSearchParams({ lang: language }) : '';
  return '/quizzes/' + encodeURIComponent(slug) + suffix;
}

export async function listPublishedQuizzes(options: ListOptions & { language?: string; courseId?: string; standalone?: boolean }, signal: AbortSignal) {
  const result = await service.get<Page<QuizSummary>>('/quizzes', { params: options, signal });
  return result.data;
}

export async function getPublishedQuiz(slug: string, signal: AbortSignal) {
  const result = await service.get<{ quiz: PublicQuiz }>('/quizzes/' + encodeURIComponent(slug), { signal });
  return result.data.quiz;
}

export async function submitQuiz(quiz: PublicQuiz, language: string, answers: Answer[], signal: AbortSignal) {
  const result = await service.post<QuizResult>('/quizzes/' + encodeURIComponent(quiz.slug) + '/attempts',
    { version: quiz.version, language, answers }, { signal });
  return result.data;
}

export async function listAdminQuizzes(options: ListOptions & { status?: Status }, signal: AbortSignal) {
  const result = await service.get<Page<AdminQuiz>>(quizAdminPath, { params: options, signal });
  return result.data;
}

export async function listBankQuestions(options: ListOptions & { kind?: QuestionKind }, signal: AbortSignal) {
  const result = await service.get<Page<BankQuestion>>(questionBankPath, { params: options, signal });
  return result.data;
}

export async function getAdminQuiz(id: string, signal: AbortSignal) {
  const result = await service.get<{ item: AdminQuiz }>(quizAdminPath + '/' + id, { signal });
  return result.data.item;
}

export async function getBankQuestion(id: string, signal: AbortSignal) {
  const result = await service.get<{ item: BankQuestion }>(questionBankPath + '/' + id, { signal });
  return result.data.item;
}

export async function loadQuizLanguages(signal: AbortSignal) {
  const choices: EducationRecord[] = [];
  for (let page = 1; ; page++) {
    const { data } = await service.get<Page<EducationRecord>>('/education/languages', { params: { page, pageSize: 50 }, signal });
    choices.push(...data.items);
    if (choices.length >= data.total || !data.items.length) return choices;
  }
}

export async function saveQuiz(input: QuizInput, quiz?: AdminQuiz) {
  const result = quiz
    ? await service.put<{ item: AdminQuiz }>(quizAdminPath + '/' + quiz.id, { ...input, version: quiz.version })
    : await service.post<{ item: AdminQuiz }>(quizAdminPath, input);
  return result.data.item;
}

export async function saveQuestion(input: QuestionInput, question?: BankQuestion) {
  const result = question
    ? await service.put<{ item: BankQuestion }>(questionBankPath + '/' + question.id, { ...input, version: question.version })
    : await service.post<{ item: BankQuestion }>(questionBankPath, input);
  return result.data.item;
}

export async function changeQuizStatus(quiz: AdminQuiz, status: Status) {
  const result = await service.patch<{ item: AdminQuiz }>(quizAdminPath + '/' + quiz.id + '/status', { version: quiz.version, status });
  return result.data.item;
}

export async function deleteQuiz(quiz: AdminQuiz) {
  await service.delete(quizAdminPath + '/' + quiz.id, { data: { version: quiz.version, confirm: true } });
}

export async function deleteQuestion(question: BankQuestion) {
  await service.delete(questionBankPath + '/' + question.id, { data: { version: question.version, confirm: true } });
}

export function quizError(error: unknown, fallback: string) {
  const status = authStatus(error);
  if (status === 401 || status === 403) return 'denied';
  switch (authError(error)) {
    case 'INVALID_INPUT': return 'invalid';
    case 'INVALID_REFERENCE': return 'unavailableReference';
    case 'INCOMPLETE_CONTENT': return 'incompleteContent';
    case 'INCOMPLETE_PROVENANCE': return 'incompleteProvenance';
    case 'QUESTION_IN_USE': return 'questionInUse';
    case 'QUIZ_IN_USE': return 'quizInUse';
    case 'INVALID_TRANSITION': return 'invalidTransition';
    case 'STALE_VERSION': return 'conflict';
    case 'CONFLICT': return 'duplicate';
    case 'NOT_FOUND': return 'unavailable';
    default: return fallback;
  }
}
