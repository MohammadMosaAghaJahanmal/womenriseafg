export const studentRole = 'student';
export const superAdminRole = 'super-admin';
export const administratorRoles = [superAdminRole, 'admin'] as const;

export const accountPermission = 'account:self';
export const administrationPermission = 'admin:access';
export const staffWorkspacePermission = 'staff:workspace';
export const staffManagePermission = 'staff:manage';

export const seededRoles = [
  studentRole, ...administratorRoles, 'content-manager', 'teacher', 'translator', 'reviewer',
] as const;
