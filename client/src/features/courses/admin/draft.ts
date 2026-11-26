import type { ChapterInput, CourseInput, CourseRecord, CourseTranslation, LessonInput, LessonResource, LessonTranslation } from './api';
import { blankProvenance } from '../Provenance';

type LocalResource = Omit<LessonResource, 'mediaId'> & { key: string; mediaId: string | null };
export type LocalLesson = Omit<LessonInput, 'resources'> & { key: string; resources: LocalResource[] };
export type LocalChapter = Omit<ChapterInput, 'lessons'> & { key: string; lessons: LocalLesson[] };
export type CourseDraft = Omit<CourseInput, 'estimatedMinutes' | 'chapters'> & { estimatedMinutes: string; chapters: LocalChapter[] };

function key() {
  return crypto.randomUUID();
}

export const emptyChapterTranslation = (locale: string) => ({ locale, title: '' });
export const emptyLessonTranslation = (locale: string): LessonTranslation => ({ locale, title: '', description: '', body: '' });
export const emptyCourseTranslation = (locale: string): CourseTranslation => ({ locale, title: '', description: '', objectives: '', prerequisites: '' });
export const emptyChapter = (locale: string): LocalChapter => ({ key: key(), translations: [emptyChapterTranslation(locale)], lessons: [] });
export const emptyLesson = (locale: string): LocalLesson => ({
  key: key(), slug: '', kind: 'text', mediaId: null, quizId: null, translations: [emptyLessonTranslation(locale)], resources: [],
});
export const emptyResource = (): LocalResource => ({ key: key(), mediaId: null, label: '' });

export function toDraft(record: CourseRecord | undefined, locale: string, previous?: CourseDraft): CourseDraft {
  return {
    slug: record?.slug ?? '',
    subjectId: record?.subjectId ?? null,
    levelId: record?.levelId ?? null,
    gradeId: record?.gradeId ?? null,
    thumbnailId: record?.thumbnailId ?? null,
    estimatedMinutes: record?.estimatedMinutes?.toString() ?? '',
    instructor: record?.instructor ?? '',
    provenance: record ? record.provenance : { ...blankProvenance },
    tagIds: record?.tagIds ?? [],
    relatedCourseIds: record?.relatedCourseIds ?? [],
    translations: record?.translations ?? [emptyCourseTranslation(locale)],
    chapters: record?.chapters.map((chapter, chapterIndex) => {
      const prior = previous?.chapters[chapterIndex];
      return {
        ...chapter,
        key: prior?.key ?? chapter.id ?? key(),
        lessons: chapter.lessons.map((lesson, lessonIndex) => ({
          ...lesson,
          key: prior?.lessons[lessonIndex]?.key ?? lesson.id ?? key(),
          resources: lesson.resources.map((resource, resourceIndex) => ({
            ...resource, key: prior?.lessons[lessonIndex]?.resources[resourceIndex]?.key ?? key(),
          })),
        })),
      };
    }) ?? [],
  };
}

function validSlug(value: string) {
  return value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function prepareCourse(draft: CourseDraft): { input: CourseInput } | { error: string; tab: 'details' | 'curriculum' } {
  const slug = draft.slug.trim().toLowerCase();
  if (!validSlug(slug)) return { error: 'invalidCode', tab: 'details' };
  const minutes = draft.estimatedMinutes.trim() ? Number(draft.estimatedMinutes) : null;
  if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 14400)) return { error: 'invalidMinutes', tab: 'details' };
  if (draft.translations.some(item => !item.title.trim())) return { error: 'localizeHint', tab: 'details' };
  const lessons = draft.chapters.flatMap(chapter => chapter.lessons);
  const slugs = lessons.map(lesson => lesson.slug.trim().toLowerCase());
  if (slugs.some(value => !validSlug(value))) return { error: 'invalidCode', tab: 'curriculum' };
  if (new Set(slugs).size !== slugs.length) return { error: 'duplicateLesson', tab: 'curriculum' };
  if ([...draft.chapters, ...lessons].some(item => item.translations.some(translation => !translation.title.trim()))) {
    return { error: 'localizeHint', tab: 'curriculum' };
  }
  if (lessons.some(lesson => lesson.resources.some(resource => !resource.mediaId))) return { error: 'emptyResource', tab: 'curriculum' };
  if (lessons.some(lesson => new Set(lesson.resources.map(resource => resource.mediaId)).size !== lesson.resources.length)) {
    return { error: 'duplicateResource', tab: 'curriculum' };
  }
  return { input: {
    ...draft,
    slug,
    estimatedMinutes: minutes,
    chapters: draft.chapters.map(chapter => ({
      id: chapter.id,
      translations: chapter.translations,
      lessons: chapter.lessons.map(lesson => ({
        id: lesson.id,
        slug: lesson.slug.trim().toLowerCase(),
        kind: lesson.kind,
        mediaId: lesson.mediaId,
        quizId: lesson.quizId,
        translations: lesson.translations,
        resources: lesson.resources.flatMap(resource =>
          resource.mediaId ? [{ mediaId: resource.mediaId, label: resource.label }] : []),
      })),
    })),
  } };
}

export function moveItem<T>(items: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
