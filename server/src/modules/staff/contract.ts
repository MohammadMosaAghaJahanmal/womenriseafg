export const contributorRoles = ['content-manager', 'teacher', 'translator', 'reviewer'] as const;
export const assignableRoles = ['admin', ...contributorRoles] as const;
export const lanes = ['edit', 'translate', 'review'] as const;
export type StaffRole = typeof assignableRoles[number];
export type Lane = typeof lanes[number];
export type AssignmentState = 'open' | 'complete' | 'revoked';

const rolesByLane: Readonly<Record<Lane, readonly string[]>> = {
  edit: ['content-manager', 'teacher'],
  translate: ['translator'],
  review: ['reviewer'],
};

export function eligibleForLane(roles: readonly string[], lane: Lane) {
  return roles.some(role => rolesByLane[lane].includes(role));
}

export interface Assignment {
  id: string;
  courseId: string;
  assigneeId: string;
  lane: Lane;
  locale: string | null;
  instructions: string;
  state: AssignmentState;
  createdAt: string;
}

export type AssignmentInput = Pick<Assignment, 'courseId' | 'assigneeId' | 'lane' | 'locale' | 'instructions'>;

export type StaffErrorCode = 'NOT_FOUND' | 'STALE_VERSION' | 'INVALID_ASSIGNMENT' | 'ROLE_UNAVAILABLE' | 'PROTECTED_ACCOUNT';
export class StaffError extends Error {
  constructor(readonly code: StaffErrorCode) { super(code); }
}
