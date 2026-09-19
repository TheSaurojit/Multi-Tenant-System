import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { prisma } from './db'
import { Role, Plan } from '@prisma/client'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'multi-tenant-saas-jwt-secret-key-32-chars-long'
)

const COOKIE_NAME = 'saas_auth_token'
const ORG_COOKIE_NAME = 'saas_active_org'
const WORKSPACE_COOKIE_NAME = 'saas_active_workspace'

export interface SessionPayload {
  userId: string
  email: string
}

export interface CurrentUser {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  activeOrgId: string
  activeOrgName: string
  activeOrgSlug: string
  activeWorkspaceId: string
  activeWorkspaceName: string
  activeWorkspaceSlug: string
  role: Role
  workspaces: {
    id: string
    name: string
    slug: string
    description: string | null
  }[]
  memberships: {
    orgId: string
    orgName: string
    orgSlug: string
    role: Role
    plan: Plan
  }[]
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET)
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return {
      userId: payload.userId as string,
      email: payload.email as string,
    }
  } catch {
    return null
  }
}

export async function setAuthCookies(token: string, orgId?: string, workspaceId?: string) {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })

  if (orgId) {
    cookieStore.set(ORG_COOKIE_NAME, orgId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })
  }

  if (workspaceId) {
    cookieStore.set(WORKSPACE_COOKIE_NAME, workspaceId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })
  }
}

export async function setActiveOrgCookie(orgId: string) {
  const cookieStore = await cookies()
  cookieStore.set(ORG_COOKIE_NAME, orgId, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function setActiveWorkspaceCookie(workspaceId: string) {
  const cookieStore = await cookies()
  cookieStore.set(WORKSPACE_COOKIE_NAME, workspaceId, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function clearAuthCookies() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
  cookieStore.delete(ORG_COOKIE_NAME)
  cookieStore.delete(WORKSPACE_COOKIE_NAME)
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return null

    const session = await verifySessionToken(token)
    if (!session) return null

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        memberships: {
          include: {
            organization: {
              include: {
                workspaces: {
                  orderBy: { createdAt: 'asc' },
                },
              },
            },
          },
        },
      },
    })

    if (!user || user.memberships.length === 0) return null

    // Determine active org
    const activeOrgCookie = cookieStore.get(ORG_COOKIE_NAME)?.value
    const activeMembership =
      user.memberships.find((m) => m.organizationId === activeOrgCookie) ||
      user.memberships[0]

    // Determine active workspace inside the active org
    const activeWorkspaceCookie = cookieStore.get(WORKSPACE_COOKIE_NAME)?.value
    const orgWorkspaces = activeMembership.organization.workspaces || []
    const activeWorkspace =
      orgWorkspaces.find((w) => w.id === activeWorkspaceCookie) ||
      orgWorkspaces[0] || {
        id: 'default',
        name: 'Default Workspace',
        slug: 'default',
        description: null,
      }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      activeOrgId: activeMembership.organizationId,
      activeOrgName: activeMembership.organization.name,
      activeOrgSlug: activeMembership.organization.slug,
      activeWorkspaceId: activeWorkspace.id,
      activeWorkspaceName: activeWorkspace.name,
      activeWorkspaceSlug: activeWorkspace.slug,
      role: activeMembership.role,
      workspaces: orgWorkspaces.map((w) => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        description: w.description,
      })),
      memberships: user.memberships.map((m) => ({
        orgId: m.organizationId,
        orgName: m.organization.name,
        orgSlug: m.organization.slug,
        role: m.role,
        plan: m.organization.plan,
      })),
    }
  } catch (error: any) {
    if (error?.digest === 'DYNAMIC_SERVER_USAGE') throw error
    console.error('Failed to get current user:', error)
    return null
  }
})

/**
 * Server-side guard that returns the authenticated user or redirects immediately to /login.
 * Eliminates repetitive `if (!currentUser) redirect('/login')` checks across server components.
 */
export async function requireAuthUser(redirectTo: string = '/login'): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) {
    redirect(redirectTo)
  }
  return user
}

/**
 * Server-side helper that guarantees the active organization ID or redirects.
 */
export async function requireActiveOrgId(redirectTo: string = '/login'): Promise<string> {
  const user = await requireAuthUser(redirectTo)
  return user.activeOrgId
}

/**
 * Server-side helper that guarantees the active workspace ID or redirects.
 */
export async function requireActiveWorkspaceId(redirectTo: string = '/login'): Promise<string> {
  const user = await requireAuthUser(redirectTo)
  return user.activeWorkspaceId
}

