import { Router, type ErrorRequestHandler, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Logger } from 'pino';
import { administrationPermission } from '../../identity/roles';
import type { IdentitySession, IdentityStore } from '../../identity/store';
import { ApiError } from '../../middleware/errors';
import { validateInput } from '../../middleware/validation';
import { requireOriginAndJson, requireSecureTransport } from '../auth/request';
import { publicProvenance } from '../courses/provenance';
import { loadIdentity, requirePermission, sessionCookie } from '../auth/session';
import type { EducationStatus } from '../education/contract';
import {
  QuizError, quizManagePermission, quizPublishPermission, type QuestionInput, type QuestionListOptions,
  type QuizAttempt, type QuizInput, type QuizListOptions, type QuizRecord,
} from './contract';
import type { QuizStore } from './store';
import {
  adminQuery, attempt, bankQuery, deletion, itemId, itemSlug, newQuestion, newQuiz, publicQuery, quizStatus,
  updateQuestion, updateQuiz,
} from './validation';

interface RouteOptions {
  origins: readonly string[];
  production: boolean;
  logger: Pick<Logger, 'info'>;
}

const failures = {
  NOT_FOUND: [404, 'This quiz or question is unavailable.'],
  CONFLICT: [409, 'That quiz code or position is already in use.'],
  STALE_VERSION: [409, 'This quiz or question has changed. Reload and try again.'],
  INVALID_TRANSITION: [409, 'That status change is unavailable.'],
  QUESTION_IN_USE: [409, 'This question is used in a quiz. Unlink it or add a replacement question.'],
  INVALID_REFERENCE: [422, 'Select valid languages, questions or a course.'],
  INCOMPLETE_CONTENT: [422, 'Add questions and a published language shared by the quiz and all questions.'],
  INCOMPLETE_PROVENANCE: [422, 'Record the source, creator, license, and any AI use for the quiz and questions.'],
  QUIZ_IN_USE: [409, 'This quiz is used by a lesson. Remove the reference before making this change.'],
  INVALID_ATTEMPT: [400, 'Submit one valid response for each question.'],
} as const;

const handleError: ErrorRequestHandler = (error: unknown, _request, _response, next) => {
  if (error instanceof QuizError) {
    const [status, message] = failures[error.code];
    return next(new ApiError(status, error.code, message));
  }
  next(error);
};

function publicQuiz(quiz: QuizRecord) {
  const { id, slug, courseId, courseSlug, version, passingScore, translations, questionCount } = quiz;
  return { id, slug, courseId, courseSlug, version, passingScore, questionCount, provenance: publicProvenance(quiz.provenance),
    translations: translations.map(({ provenance, ...translation }) => ({ ...translation, provenance: publicProvenance(provenance) })) };
}

function key(response: Response) {
  return (response.locals.validated.params as { id: string }).id;
}

function slug(response: Response) {
  return (response.locals.validated.params as { slug: string }).slug;
}

export function createQuizRoutes(store: QuizStore, identity: IdentityStore, options: RouteOptions) {
  const router = Router();
  const admin = Router();
  const secure = requireSecureTransport(options.production);
  const json = requireOriginAndJson(options.origins);
  const publish = requirePermission(quizPublishPermission);
  const validateId = validateInput('params', itemId);
  const validateSlug = validateInput('params', itemSlug);
  const attemptLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, _response, next) => next(new ApiError(429, 'RATE_LIMITED', 'Too many quiz attempts. Try again later.')),
  });

  function audit(response: Response, action: string, id: string) {
    const actor = response.locals.identity as IdentitySession;
    options.logger.info({ event: 'quiz_changed', actorId: actor.id, action, targetId: id });
  }

  router.get('/quizzes', validateInput('query', publicQuery), async (_request, response) => {
    const filters = response.locals.validated.query as QuizListOptions;
    const result = await store.listQuizzes({ ...filters, publicOnly: true });
    response.json({ ...result, items: result.items.map(publicQuiz) });
  });
  router.get('/quizzes/:slug', validateSlug, async (_request, response) => {
    const quiz = await store.getPublicQuiz(slug(response));
    response.json({ quiz: { ...publicQuiz(quiz), questions: quiz.questions } });
  });
  router.post('/quizzes/:slug/attempts', secure, json, attemptLimiter, validateSlug, validateInput('body', attempt),
    async (_request, response) => {
      const result = await store.grade(slug(response), response.locals.validated.body as QuizAttempt);
      response.json(result);
    });

  admin.use(secure, loadIdentity(identity, sessionCookie(options.production).name),
    requirePermission(administrationPermission), requirePermission(quizManagePermission));
  admin.get('/', validateInput('query', adminQuery), async (_request, response) => {
    response.json(await store.listQuizzes(response.locals.validated.query as QuizListOptions));
  });
  admin.get('/questions', validateInput('query', bankQuery), async (_request, response) => {
    response.json(await store.listQuestions(response.locals.validated.query as QuestionListOptions));
  });
  admin.get('/questions/:id', validateId, async (_request, response) => {
    response.json({ item: await store.getQuestion(key(response)) });
  });
  admin.post('/questions', json, validateInput('body', newQuestion), async (_request, response) => {
    const item = await store.createQuestion(response.locals.validated.body as QuestionInput);
    audit(response, 'question:created', item.id);
    response.status(201).json({ item });
  });
  admin.put('/questions/:id', json, validateId, validateInput('body', updateQuestion), async (_request, response) => {
    const { version, ...input } = response.locals.validated.body as QuestionInput & { version: number };
    const item = await store.updateQuestion(key(response), input, version);
    audit(response, 'question:updated', item.id);
    response.json({ item });
  });
  admin.delete('/questions/:id', json, validateId, validateInput('body', deletion), async (_request, response) => {
    const id = key(response);
    await store.removeQuestion(id, (response.locals.validated.body as { version: number }).version);
    audit(response, 'question:deleted', id);
    response.status(204).end();
  });
  admin.get('/:id', validateId, async (_request, response) => {
    response.json({ item: await store.getQuiz(key(response)) });
  });
  admin.post('/', json, validateInput('body', newQuiz), async (_request, response) => {
    const item = await store.createQuiz(response.locals.validated.body as QuizInput);
    audit(response, 'created', item.id);
    response.status(201).json({ item });
  });
  admin.put('/:id', json, validateId, validateInput('body', updateQuiz), async (_request, response) => {
    const { version, ...input } = response.locals.validated.body as QuizInput & { version: number };
    const item = await store.updateQuiz(key(response), input, version);
    audit(response, 'updated', item.id);
    response.json({ item });
  });
  admin.patch('/:id/status', json, validateId, validateInput('body', quizStatus), (request, response, next) => {
    const { status } = response.locals.validated.body as { status: EducationStatus };
    if (status === 'approved' || status === 'published' || status === 'archived') return publish(request, response, next);
    next();
  }, async (_request, response) => {
    const { status, version } = response.locals.validated.body as { status: EducationStatus; version: number };
    const item = await store.changeStatus(key(response), status, version);
    audit(response, 'status:' + status, item.id);
    response.json({ item });
  });
  admin.delete('/:id', json, validateId, validateInput('body', deletion), async (_request, response) => {
    const id = key(response);
    await store.removeQuiz(id, (response.locals.validated.body as { version: number }).version);
    audit(response, 'deleted', id);
    response.status(204).end();
  });
  router.use('/admin/quizzes', admin);
  router.use(handleError);
  return router;
}
