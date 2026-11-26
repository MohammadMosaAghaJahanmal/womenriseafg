export const studentRole = 'student';
export const superAdminRole = 'super-admin';
export const administratorRoles = [superAdminRole, 'admin'] as const;

export const accountPermission = 'account:self';
export const administrationPermission = 'admin:access';

export const seededRoles = [
  studentRole, ...administratorRoles, 'content-manager', 'teacher', 'translator', 'reviewer',
] as const;
