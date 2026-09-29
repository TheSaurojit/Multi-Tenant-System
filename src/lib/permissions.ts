import { Role } from '../../generated/prisma'

export type AppPermission =
  | 'org:delete'
  | 'org:update'
  | 'billing:manage'
  | 'billing:view'
  | 'members:invite'
  | 'members:remove'
  | 'members:role_update'
  | 'datasets:upload'
  | 'datasets:delete'
  | 'reports:create'
  | 'reports:delete'
  | 'data:export'
  | 'data:view'
  | 'audit:view'

const ROLE_PERMISSIONS: Record<Role, AppPermission[]> = {
  OWNER: [
    'org:delete',
    'org:update',
    'billing:manage',
    'billing:view',
    'members:invite',
    'members:remove',
    'members:role_update',
    'datasets:upload',
    'datasets:delete',
    'reports:create',
    'reports:delete',
    'data:export',
    'data:view',
    'audit:view',
  ],
  ADMIN: [
    'org:update',
    'billing:manage',
    'billing:view',
    'members:invite',
    'members:remove',
    'members:role_update',
    'datasets:upload',
    'datasets:delete',
    'reports:create',
    'reports:delete',
    'data:export',
    'data:view',
    'audit:view',
  ],
  MEMBER: [
    'datasets:upload',
    'datasets:delete',
    'reports:create',
    'reports:delete',
    'data:export',
    'data:view',
  ],
  VIEWER: [
    'data:view',
    'data:export',
  ],
}

export function hasPermission(role: Role, permission: AppPermission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function assertPermission(role: Role, permission: AppPermission): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Forbidden: Role '${role}' lacks permission '${permission}'`)
  }
}

export function getRoleBadgeClass(role: Role): string {
  switch (role) {
    case 'OWNER':
      return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800'
    case 'ADMIN':
      return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
    case 'MEMBER':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
    case 'VIEWER':
      return 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
  }
}
