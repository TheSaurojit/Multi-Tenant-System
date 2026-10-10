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
import { acceptInviteAction } from '@/app/actions/team-actions'

export default async function InviteAcceptPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { token } = await params
  const { error } = await searchParams
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

  const isEmailMatch = currentUser
    ? currentUser.email.toLowerCase().trim() === invitation.email.toLowerCase().trim()
    : false

  async function handleAccept() {
    'use server'
    const res = await acceptInviteAction(token)
    if (res && 'error' in res && res.error) {
      redirect(`/invite/${token}?error=${encodeURIComponent(res.error)}`)
    }
    if (res && 'organizationId' in res && res.organizationId) {
      await setActiveOrgCookie(res.organizationId)
    }
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

          {error && (
            <div className="mt-4 p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-xs text-red-300 text-left">
              {error}
            </div>
          )}

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
            isEmailMatch ? (
              <div className="space-y-4">
                <p className="text-xs text-zinc-400">
                  You are currently signed in as <strong className="text-zinc-200">{currentUser.email}</strong>.
                </p>
                <form action={handleAccept}>
                  <Button type="submit" variant="primary" size="lg" className="w-full">
                    Accept Invitation & Join Workspace
                  </Button>
                </form>
              </div>
            ) : (
              <div className="space-y-4 text-left p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 text-xs">
                <div className="flex items-start gap-2.5 text-amber-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Account Email Mismatch</p>
                    <p className="text-zinc-400 mt-1">
                      This invitation was issued to <strong className="text-zinc-200">{invitation.email}</strong>, but you are currently signed in as <strong className="text-zinc-200">{currentUser.email}</strong>.
                    </p>
                  </div>
                </div>
                <div className="pt-2">
                  <Link href={`/login?from=/invite/${token}`}>
                    <Button variant="outline" size="sm" className="w-full">
                      Sign in as {invitation.email}
                    </Button>
                  </Link>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-zinc-400">
                Sign in to your account with <strong className="text-zinc-200">{invitation.email}</strong> or create a new account to accept this invitation.
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
