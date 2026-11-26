import { normalizeAnswer, QuizError, type Answer, type QuestionRecord, type QuestionTranslation } from './contract';

function scoreAnswer(question: QuestionRecord, translation: QuestionTranslation, answer: Answer) {
  const { options, text } = answer;
  if (question.kind === 'short-answer') {
    if (options.length) throw new QuizError('INVALID_ATTEMPT');
    const typed = normalizeAnswer(text, translation.locale);
    return typed !== '' && translation.acceptedAnswers.some(value => normalizeAnswer(value, translation.locale) === typed);
  }

  const selected = new Set(options);
  if (text || (question.kind !== 'multiple-choice' && options.length > 1) || selected.size !== options.length ||
      options.some(position => !Number.isInteger(position) || position < 0 || position >= translation.options.length)) {
    throw new QuizError('INVALID_ATTEMPT');
  }
  return selected.size === question.correctOptions.length && question.correctOptions.every(position => selected.has(position));
}

export function scoreQuiz(questions: QuestionRecord[], language: string, passingScore: number, submitted: Answer[]) {
  const map = new Map(submitted.map(answer => [answer.questionId, answer]));
  if (questions.length === 0 || submitted.length !== questions.length || map.size !== questions.length) {
    throw new QuizError('INVALID_ATTEMPT');
  }
  const answers = questions.map(question => {
    const answer = map.get(question.id);
    if (!answer) throw new QuizError('INVALID_ATTEMPT');
    const translation = question.translations.find(item => item.locale === language);
    if (!translation) throw new QuizError('STALE_VERSION');
    return {
      questionId: question.id,
      correct: scoreAnswer(question, translation, answer),
      correctOptions: question.correctOptions,
      acceptedAnswers: translation.acceptedAnswers,
      explanation: translation.explanation,
      locale: translation.locale,
    };
  });
  const totalQuestions = answers.length;
  const correctCount = answers.filter(answer => answer.correct).length;
  const scorePercent = Math.floor(100 * correctCount / totalQuestions);
  return { answers, correctCount, totalQuestions, scorePercent, passingScore, passed: scorePercent >= passingScore };
}
