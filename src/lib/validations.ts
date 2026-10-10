import { z } from 'zod'

// Non-owner roles that can be assigned or invited
export const AssignableRoleSchema = z.enum(['ADMIN', 'MEMBER', 'VIEWER'])
export type AssignableRole = z.infer<typeof AssignableRoleSchema>

export const InviteMemberSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.').toLowerCase(),
  role: AssignableRoleSchema,
})

export const UpdateMemberRoleSchema = z.object({
  targetUserId: z.string().min(1, 'Target user ID is required.'),
  newRole: AssignableRoleSchema,
})

export const LoginSchema = z.object({
  email: z.string().trim().email('Please provide a valid email address.').toLowerCase(),
  password: z.string().min(1, 'Please provide a password.'),
})

export const SignupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Name must be 100 characters or fewer.'),
  email: z.string().trim().email('Please provide a valid email address.').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    // bcrypt only hashes the first 72 bytes — reject longer input outright
    .max(72, 'Password must be 72 characters or fewer.')
    .regex(/[a-zA-Z]/, 'Password must include a letter.')
    .regex(/[0-9]/, 'Password must include a number.'),
  workspaceName: z.string().trim().min(1, 'Workspace name is required.').max(100, 'Workspace name must be 100 characters or fewer.'),
})

export const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(1, 'Workspace name is required.').max(100, 'Workspace name must be 100 characters or fewer.'),
  description: z.string().trim().max(500, 'Description must be 500 characters or fewer.').optional(),
})

export const CreateOrgSchema = z.object({
  name: z.string().trim().min(1, 'Organization name is required.').max(100, 'Organization name must be 100 characters or fewer.'),
})

export const PlanSchema = z.enum(['FREE', 'PRO', 'ADVANCED'])
export type PlanType = z.infer<typeof PlanSchema>

export const ReportFilterSchema = z.object({
  datasetId: z.string().optional(),
  range: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  category: z.string().optional(),
  categories: z.array(z.string()).optional(),
})

export const SaveReportSchema = z.object({
  name: z.string().trim().min(1, 'Report name is required.').max(100),
  description: z.string().trim().max(500).optional(),
  filters: ReportFilterSchema,
})

export const AcceptInviteSchema = z.object({
  token: z.string().trim().min(1, 'Invitation token is required.'),
})

export const ExportCsvFilterSchema = z.object({
  datasetId: z.string().optional(),
  range: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  category: z.string().optional(),
})

// Prisma cuid() IDs: 'c' followed by 10-40 lowercase alphanumerics
export const EntityIdSchema = z
  .string()
  .trim()
  .min(1, 'ID is required.')
  .regex(/^c[a-z0-9]{10,40}$/, 'Invalid ID format.')

export const ForgotPasswordSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.').toLowerCase(),
})

export const ResetPasswordSchema = z.object({
  token: z.string().trim().min(1, 'Reset token is required.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    .max(72, 'Password must be 72 characters or fewer.')
    .regex(/[a-zA-Z]/, 'Password must include a letter.')
    .regex(/[0-9]/, 'Password must include a number.'),
})

export const VerifyEmailSchema = z.object({
  token: z.string().trim().min(1, 'Verification token is required.'),
})

export const ResendVerificationSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.').toLowerCase(),
})


