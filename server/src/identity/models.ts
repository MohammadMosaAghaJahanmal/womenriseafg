import { DataTypes, Model, Sequelize } from 'sequelize';

interface UserRow {
  id: string;
  login: string;
  passwordHash: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface RoleRow { code: string }
interface PermissionRow { code: string }
interface UserRoleRow { userId: string; roleCode: string }
interface RolePermissionRow { roleCode: string; permissionCode: string }
interface SessionRow {
  tokenHash: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  adminScope: boolean;
}

export function defineIdentityModels(db: Sequelize) {
  const User = db.define<Model<UserRow>>('IdentityUser', {
    id: { type: DataTypes.CHAR(36), primaryKey: true },
    login: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: 'password_hash' },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: { type: DataTypes.DATE(3), allowNull: false, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE(3), allowNull: false, field: 'updated_at' },
  }, { tableName: 'users', timestamps: false, defaultScope: { attributes: { exclude: ['passwordHash'] } } });

  const Role = db.define<Model<RoleRow>>('IdentityRole', {
    code: { type: DataTypes.STRING(32), primaryKey: true },
  }, { tableName: 'roles', timestamps: false });

  const Permission = db.define<Model<PermissionRow>>('IdentityPermission', {
    code: { type: DataTypes.STRING(64), primaryKey: true },
  }, { tableName: 'permissions', timestamps: false });

  const UserRole = db.define<Model<UserRoleRow>>('IdentityUserRole', {
    userId: { type: DataTypes.CHAR(36), primaryKey: true, field: 'user_id' },
    roleCode: { type: DataTypes.STRING(32), primaryKey: true, field: 'role_code' },
  }, { tableName: 'user_roles', timestamps: false });

  const RolePermission = db.define<Model<RolePermissionRow>>('IdentityRolePermission', {
    roleCode: { type: DataTypes.STRING(32), primaryKey: true, field: 'role_code' },
    permissionCode: { type: DataTypes.STRING(64), primaryKey: true, field: 'permission_code' },
  }, { tableName: 'role_permissions', timestamps: false });

  const Session = db.define<Model<SessionRow>>('IdentitySession', {
    tokenHash: { type: DataTypes.CHAR(64), primaryKey: true, field: 'token_hash' },
    userId: { type: DataTypes.CHAR(36), allowNull: false, field: 'user_id' },
    createdAt: { type: DataTypes.DATE(3), allowNull: false, field: 'created_at' },
    expiresAt: { type: DataTypes.DATE(3), allowNull: false, field: 'expires_at' },
    adminScope: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'admin_scope' },
  }, { tableName: 'sessions', timestamps: false });

  return { User, Role, Permission, UserRole, RolePermission, Session };
}
