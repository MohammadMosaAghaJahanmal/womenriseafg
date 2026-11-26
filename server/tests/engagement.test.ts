import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { meetsCompletionRequirement } from '../src/modules/certificates/routes';
import { QuizError, type Answer, type QuestionRecord } from '../src/modules/quizzes/contract';
import { scoreQuiz } from '../src/modules/quizzes/score';
import { newQuestion } from '../src/modules/quizzes/validation';

function question(kind: QuestionRecord['kind'], correctOptions: number[], options: string[], acceptedAnswers: string[] = []): QuestionRecord {
  return {
    id: randomUUID(), kind, correctOptions, referenced: false, version: 1, createdAt: '', updatedAt: '',
    translations: [{ locale: 'en', prompt: 'Practice question', options, acceptedAnswers, explanation: 'Review the rule.' }],
  };
}

function answer(item: QuestionRecord, options: number[] = [], text = ''): Answer {
  return { questionId: item.id, options, text };
}

test('certificate completion requires every current lesson exactly once', () => {
  const lessons = [randomUUID(), randomUUID(), randomUUID()];
  assert.equal(meetsCompletionRequirement(lessons, [...lessons].reverse()), true);
  assert.equal(meetsCompletionRequirement([], []), false);
  assert.equal(meetsCompletionRequirement(lessons, lessons.slice(1)), false);
  assert.equal(meetsCompletionRequirement(lessons, [lessons[0]!, lessons[1]!, lessons[1]!]), false);
  assert.equal(meetsCompletionRequirement(lessons, [...lessons.slice(1), randomUUID()]), false);
  assert.equal(meetsCompletionRequirement(lessons, [...lessons, randomUUID()]), false);
});

test('quiz grading scores all question types in quiz order and floors the passing percentage', () => {
  const single = question('single-choice', [1], ['First', 'Second']);
  const multiple = question('multiple-choice', [0, 2], ['One', 'Two', 'Three']);
  const binary = question('true-false', [1], ['True', 'False']);
  const short = question('short-answer', [], [], ['Cell Wall']);
  const items = [single, multiple, binary, short];
  const all = [answer(short, [], '  ＣＥＬＬ\t wall '), answer(binary, [1]), answer(multiple, [2, 0]), answer(single, [1])];
  const full = scoreQuiz(items, 'en', 100, all);
  assert.deepEqual(full.answers.map(value => value.questionId), items.map(value => value.id));
  assert.equal(full.scorePercent, 100);
  assert.equal(full.passed, true);
  assert.equal(full.answers[3]?.explanation, 'Review the rule.');
  const partial = [answer(single, [1]), answer(multiple, [0]), answer(binary, [1])];
  assert.equal(scoreQuiz(items.slice(0, 3), 'en', 66, partial).passed, true);
  assert.equal(scoreQuiz(items.slice(0, 3), 'en', 67, partial).passed, false);
  assert.equal(scoreQuiz([multiple], 'en', 1, [answer(multiple, [0, 1, 2])]).correctCount, 0);
});

test('quiz grading rejects duplicate, missing, unrelated or invalid answers', () => {
  const choice = question('single-choice', [0], ['Yes', 'No']);
  const short = question('short-answer', [], [], ['Response']);
  const items = [choice, short];
  for (const submitted of [
    [], [answer(choice), answer(choice)], [answer(choice), { ...answer(short), questionId: randomUUID() }],
    [answer(choice, [2]), answer(short)], [answer(choice, [0, 0]), answer(short)], [answer(choice, [0, 1]), answer(short)],
    [answer(choice, [0], 'Answer'), answer(short)], [answer(choice), answer(short, [0])],
  ]) {
    assert.throws(() => scoreQuiz(items, 'en', 60, submitted), (error: unknown) =>
      error instanceof QuizError && error.code === 'INVALID_ATTEMPT');
  }
  assert.throws(() => scoreQuiz([choice], 'ps', 60, [answer(choice)]), (error: unknown) =>
    error instanceof QuizError && error.code === 'STALE_VERSION');
});

test('question validation requires consistent localized answer options and unique accepted text', () => {
  const translation = { locale: 'en', prompt: 'Pick two.', options: ['A', 'B', 'C'] };
  const data = { kind: 'multiple-choice', translations: [translation], correctOptions: [0, 2] };
  assert.equal(newQuestion.validate(data).error, undefined);
  assert.ok(newQuestion.validate({ ...data, correctOptions: [0] }).error);
  assert.ok(newQuestion.validate({ ...data, translations: [translation, { ...translation, locale: 'ps', options: ['الف', 'ب'] }] }).error);
  assert.ok(newQuestion.validate({ kind: 'short-answer', translations: [{ locale: 'en', prompt: 'Write a word.',
    acceptedAnswers: ['Answer', ' ＡＮＳＷＥＲ '] }] }).error);
});
