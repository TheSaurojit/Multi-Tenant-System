import React from 'react'
import { prisma } from '@/lib/db'
import { getCurrentUser, setAuthCookies, setActiveOrgCookie } from '@/lib/auth'
import { logAuditEvent } from '@/lib/audit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getRoleBadgeClass } from '@/lib/permissions'
import { Users, AlertCircle, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const currentUser = await getCurrentUser()

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      organization: true,
      invitedBy: true,
    },
  })

  if (!invitation || invitation.status !== 'PENDING' || invitation.expiresAt < new Date()) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 text-zinc-100">
        <div className="max-w-md w-full p-8 rounded-2xl bg-zinc-900 border border-zinc-800 text-center">
          <div className="w-12 h-12 rounded-full bg-red-950/60 border border-red-800 flex items-center justify-center mx-auto mb-4 text-red-400">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold">Invitation Expired or Invalid</h2>
          <p className="text-xs text-zinc-400 mt-2">
            This invitation link is either invalid, already used, or expired. Please contact your workspace administrator to send a new invitation.
          </p>
          <div className="mt-6">
            <Link href="/login">
              <Button variant="primary">Return to Login</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  async function acceptInviteAction() {
    'use server'
    const user = await getCurrentUser()
    if (!user) redirect(`/login?from=/invite/${token}`)

    const activeInvite = await prisma.invitation.findUnique({
      where: { token },
    })

    if (!activeInvite || activeInvite.status !== 'PENDING') {
      redirect('/login')
    }

    // Create or update membership
    await prisma.membership.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: activeInvite.organizationId,
        },
      },
      update: {
        role: activeInvite.role,
      },
      create: {
        userId: user.id,
        organizationId: activeInvite.organizationId,
        role: activeInvite.role,
      },
    })

    // Mark invite accepted
    await prisma.invitation.update({
      where: { id: activeInvite.id },
      data: { status: 'ACCEPTED' },
    })

    // Log audit event
    await logAuditEvent({
      organizationId: activeInvite.organizationId,
      userId: user.id,
      action: 'INVITE_ACCEPTED',
      entityType: 'User',
      entityId: user.id,
      details: { email: user.email, role: activeInvite.role },
    })

    // Switch active workspace
    await setActiveOrgCookie(activeInvite.organizationId)
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-indigo-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-zinc-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6" />
          </div>

          <h2 className="text-xl font-bold text-white">Join Workspace</h2>
          <p className="text-xs text-zinc-400 mt-1">
            <strong className="text-zinc-200">{invitation.invitedBy.name}</strong> invited you to collaborate on
          </p>

          <div className="my-6 p-4 rounded-xl bg-zinc-800/60 border border-zinc-700/60">
            <p className="text-lg font-bold text-white">{invitation.organization.name}</p>
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className="text-xs text-zinc-400">Assigned Role:</span>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${getRoleBadgeClass(invitation.role)}`}>
                {invitation.role}
              </span>
            </div>
          </div>

          {currentUser ? (
            <div className="space-y-4">
              <p className="text-xs text-zinc-400">
                You are currently signed in as <strong className="text-zinc-200">{currentUser.email}</strong>.
              </p>
              <form action={acceptInviteAction}>
                <Button type="submit" variant="primary" size="lg" className="w-full">
                  Accept Invitation & Join Workspace
                </Button>
              </form>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-zinc-400">
                Sign in to your account or register to accept this workspace invitation.
              </p>
              <Link href={`/login?from=/invite/${token}`}>
                <Button variant="primary" size="lg" className="w-full">
                  Sign In to Accept
                </Button>
              </Link>
              <Link href="/signup">
                <Button variant="outline" size="sm" className="w-full">
                  Create New Account
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
