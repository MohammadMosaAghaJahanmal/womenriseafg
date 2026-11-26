import { useSyncExternalStore } from 'react';
import { z } from '../../validation';

export const learningStorageKey = 'womenriseafg.learning.v1';
const maxList = 150;
const maxRecords = 4000;
const resourceKinds = ['course', 'lesson', 'video', 'short', 'book', 'ai', 'quiz', 'path'] as const;
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const resourceSchema = z.object({
  kind: z.enum(resourceKinds),
  id: z.uuid(),
  slug,
  parentSlug: slug.optional(),
  title: z.string().min(1).max(200),
  locale: z.string().regex(/^[a-zA-Z0-9-]+$/).max(35),
}).refine(value => value.kind !== 'lesson' || value.parentSlug !== undefined);

export type LearningResource = z.infer<typeof resourceSchema>;
const date = z.number().int().nonnegative();
const position = z.number().int().nonnegative().max(1_000_000);
const recent = z.object({ resource: resourceSchema, position, total: position, visitedAt: date });
const result = z.object({ resource: resourceSchema, score: z.number().finite().min(0).max(100), passed: z.boolean(), takenAt: date });
const learningSchema = z.object({
  enabled: z.literal(true),
  saved: z.array(resourceSchema).max(maxList),
  recent: z.array(recent).max(maxList),
  completedLessons: z.array(z.uuid()).max(maxRecords),
  completedCourses: z.array(z.uuid()).max(maxRecords),
  completedItems: z.array(z.string().regex(/^(?:video|short|book|quiz):[0-9a-f-]{36}$/)).max(maxRecords),
  results: z.array(result).max(maxList),
});
type Learning = Omit<z.infer<typeof learningSchema>, 'enabled'> & { enabled: boolean };
const empty: Learning = { enabled: false, saved: [], recent: [], completedLessons: [], completedCourses: [], completedItems: [], results: [] };

function read(): Learning {
  try {
    const value = localStorage.getItem(learningStorageKey);
    if (!value || value.length > 900_000) return empty;
    const parsed = learningSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : empty;
  } catch { return empty; }
}

let state = read();
const listeners = new Set<() => void>();
function notify(next: Learning) {
  state = next;
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key === learningStorageKey || event.key === null) notify(read());
}

function subscribe(listener: () => void) {
  if (!listeners.size) {
    window.addEventListener('storage', onStorage);
    state = read();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener('storage', onStorage);
  };
}

export function useLearning() {
  return useSyncExternalStore(subscribe, () => state, () => empty);
}

function write(next: Learning) {
  try {
    if (next.enabled) localStorage.setItem(learningStorageKey, JSON.stringify(next));
    else localStorage.removeItem(learningStorageKey);
  } catch { return false; }
  notify(next.enabled ? next : empty);
  return true;
}

export function setLearningEnabled(enabled: boolean) {
  return write(enabled ? { ...read(), enabled: true } : empty);
}

function change(update: (current: Learning) => Learning) {
  const current = read();
  return current.enabled && write(update(current));
}

export function learningKey(resource: LearningResource) {
  return resource.kind + ':' + resource.id;
}

export function resourceUrl(resource: LearningResource, resume = false) {
  const segment = encodeURIComponent(resource.slug);
  const base = {
    course: '/courses', video: '/videos', short: '/shorts', book: '/library', ai: '/ai-learning', quiz: '/quizzes', path: '/learning-paths',
  } as const;
  const path = resource.kind === 'lesson' ? '/learn/' + encodeURIComponent(resource.parentSlug ?? '') + '/' + segment
    : base[resource.kind] + '/' + segment + (resume && resource.kind === 'book' ? '/read' : '');
  return path + '?lang=' + encodeURIComponent(resource.locale);
}

export function toggleSaved(resource: LearningResource) {
  if (!resourceSchema.safeParse(resource).success) return false;
  const key = learningKey(resource);
  return change(current => {
    const saved = current.saved.filter(item => learningKey(item) !== key);
    return { ...current, saved: saved.length === current.saved.length ? [resource, ...saved].slice(0, maxList) : saved };
  });
}

function withValue(items: string[], key: string, active: boolean) {
  const rest = items.filter(item => item !== key);
  return active ? [key, ...rest].slice(0, maxRecords) : rest;
}

export function courseCompletion(requiredIds: readonly string[], completedIds: readonly string[]) {
  const known = new Set(completedIds);
  const required = [...new Set(requiredIds)];
  return { count: required.filter(id => known.has(id)).length, total: required.length };
}

export function syncCourseCompletion(courseId: string, lessonIds: string[]) {
  const current = read();
  if (!current.enabled) return;
  const { count, total } = courseCompletion(lessonIds, current.completedLessons);
  const complete = total > 0 && count === total;
  if (current.completedCourses.includes(courseId) !== complete) {
    write({ ...current, completedCourses: withValue(current.completedCourses, courseId, complete) });
  }
}

export function toggleLesson(courseId: string, lessonIds: string[], lessonId: string) {
  if (!lessonIds.includes(lessonId)) return false;
  return change(current => {
    const completedLessons = withValue(current.completedLessons, lessonId, !current.completedLessons.includes(lessonId));
    const { count, total } = courseCompletion(lessonIds, completedLessons);
    return { ...current, completedLessons, completedCourses: withValue(current.completedCourses, courseId, total > 0 && count === total) };
  });
}

export function savedPosition(resource: LearningResource) {
  return read().recent.find(entry => learningKey(entry.resource) === learningKey(resource));
}

export function rememberResource(resource: LearningResource, current = 0, total = 0, completed = false) {
  if (!resourceSchema.safeParse(resource).success) return false;
  const key = learningKey(resource);
  return change(learning => {
    const entries = learning.recent.filter(entry => learningKey(entry.resource) !== key);
    const entry = { resource, position: Math.min(1_000_000, Math.max(0, Math.floor(current) || 0)),
      total: Math.min(1_000_000, Math.max(0, Math.floor(total) || 0)), visitedAt: Date.now() };
    const completedItems = completed && ['video', 'short', 'book'].includes(resource.kind) ?
      withValue(learning.completedItems, key, true) : learning.completedItems;
    return { ...learning, completedItems, recent: [entry, ...entries].slice(0, maxList) };
  });
}

export function recordQuizResult(resource: LearningResource, { score, passed }: { score: number; passed: boolean }) {
  if (resource.kind !== 'quiz' || !resourceSchema.safeParse(resource).success || !Number.isFinite(score) || score < 0 || score > 100) return false;
  const key = learningKey(resource);
  return change(current => ({ ...current,
    completedItems: passed ? withValue(current.completedItems, key, true) : current.completedItems,
    results: [{ resource, score, passed, takenAt: Date.now() }, ...current.results].slice(0, maxList),
  }));
}
