import type { DiscoverableKind } from '../discovery/contract';

export const correctionManagePermission = 'corrections:manage';
export const correctionStates = ['open', 'resolved'] as const;
export type CorrectionState = typeof correctionStates[number];

const details = {
  courses: 'course', videos: 'video', shorts: 'short', 'ai-learning': 'ai',
  library: 'book', quizzes: 'quiz', 'learning-paths': 'path', collections: 'collection',
} as const satisfies Record<string, DiscoverableKind | 'collection'>;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function correctionTarget(href: string) {
  const [root, section, first, second, extra] = href.split('/');
  if (root !== '' || !section || !first || extra !== undefined || first.length > 80 || !slug.test(first)) return null;
  if (section === 'learn') {
    return second && second.length <= 80 && slug.test(second)
      ? { kind: 'lesson' as const, slug: second, parentSlug: first } : null;
  }
  if (!Object.hasOwn(details, section) || (second !== undefined && (section !== 'library' || second !== 'read'))) return null;
  return { kind: details[section as keyof typeof details], slug: first };
}
