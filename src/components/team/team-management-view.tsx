'use client'

import React, { useState } from 'react'
import {
  UserPlus,
  Shield,
  Copy,
  Check,
  Trash2,
  Clock,
  CheckCircle2,
  Mail,
  AlertCircle,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { CurrentUser } from '@/lib/auth'
import { useAuth } from '@/contexts/auth-context'
import { getRoleBadgeClass, hasPermission } from '@/lib/permissions'
import {
  inviteMemberAction,
  revokeInviteAction,
  updateMemberRoleAction,
  removeMemberAction,
} from '@/app/actions/team-actions'
import Link from 'next/link'
import { Role } from '../../../generated/prisma'

interface TeamManagementViewProps {
  members: any[]
  invitations: any[]
  currentUser?: CurrentUser
  maxMembers: number
}

export function TeamManagementView({
  members,
  invitations,
  currentUser: propUser,
  maxMembers,
}: TeamManagementViewProps) {
  const auth = useAuth()
  const currentUser = propUser || auth.currentUser
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('MEMBER')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null)
  const [copiedUrl, setCopiedUrl] = useState(false)

  const canInvite = auth.can('members:invite')
  const canUpdateRole = auth.can('members:role_update')
  const canRemove = auth.can('members:remove')

  const totalTeamSlots = members.length + invitations.filter((i) => i.status === 'PENDING').length
  const isSlotLimitReached = totalTeamSlots >= maxMembers

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return

    setIsSubmitting(true)
    setInviteError(null)
    setGeneratedInviteUrl(null)

    const res = await inviteMemberAction({
      email: inviteEmail,
      role: inviteRole,
    })

    setIsSubmitting(false)
    if (res?.error) {
      setInviteError(res.error)
    } else if (res?.inviteUrl) {
      setGeneratedInviteUrl(res.inviteUrl)
    }
  }

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  const handleRoleChange = async (userId: string, newRole: Role) => {
    await updateMemberRoleAction({
      targetUserId: userId,
      newRole,
    })
  }

  const handleRemoveMember = async (userId: string) => {
    if (confirm('Are you sure you want to remove this member from the workspace?')) {
      await removeMemberAction(userId)
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    await revokeInviteAction(inviteId)
  }

  return (
    <div className="space-y-6">
      {/* Header Info & Invite Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            Team Workspace Members
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            You are using {totalTeamSlots} of {maxMembers === 1000 ? 'unlimited' : maxMembers} team seats on your plan.
          </p>
        </div>

        {canInvite && (
          <div>
            {isSlotLimitReached ? (
              <Link href="/workspace/billing">
                <Button variant="primary" size="sm" className="bg-gradient-to-r from-amber-500 to-indigo-600 border-0">
                  <Sparkles className="w-3.5 h-3.5" /> Upgrade to Add Seats
                </Button>
              </Link>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setGeneratedInviteUrl(null)
                  setInviteError(null)
                  setInviteEmail('')
                  setIsInviteModalOpen(true)
                }}
              >
                <UserPlus className="w-3.5 h-3.5" /> Invite Member
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Active Members Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
            Active Members ({members.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 font-semibold border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Joined Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {members.map((m) => {
                const isSelf = m.userId === currentUser.id
                const isOwner = m.role === 'OWNER'

                return (
                  <tr
                    key={m.id}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center font-bold text-xs text-zinc-700 dark:text-zinc-300">
                        {m.user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                          {m.user.name}
                          {isSelf && (
                            <span className="text-[10px] text-indigo-500 font-normal">(You)</span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400">{m.user.email}</div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {canUpdateRole && !isSelf && !isOwner ? (
                        <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.userId, e.target.value as Role)}
                          className={`px-2 py-1 rounded text-xs font-semibold border ${getRoleBadgeClass(
                            m.role
                          )} focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer`}
                        >
                          {currentUser.role === 'OWNER' && <option value="ADMIN">ADMIN</option>}
                          <option value="MEMBER">MEMBER</option>
                          <option value="VIEWER">VIEWER</option>
                        </select>
                      ) : (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${getRoleBadgeClass(
                            m.role
                          )}`}
                        >
                          {m.role}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-zinc-500 font-mono">
                      {new Date(m.createdAt).toISOString().split('T')[0]}
                    </td>

                    <td className="py-3 px-4 text-right">
                      {canRemove && !isSelf && !isOwner && (
                        <button
                          onClick={() => handleRemoveMember(m.userId)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                          title="Remove user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Invitations Table */}
      {invitations.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
              Pending Invitations ({invitations.filter((i) => i.status === 'PENDING').length})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 font-semibold border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Invited Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Expires</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {invitations.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-zinc-400" />
                      {inv.email}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${getRoleBadgeClass(
                          inv.role
                        )}`}
                      >
                        {inv.role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={inv.status === 'PENDING' ? 'warning' : 'default'}>
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-zinc-500 font-mono">
                      {new Date(inv.expiresAt).toISOString().split('T')[0]}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {inv.status === 'PENDING' && canInvite && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() =>
                              handleCopy(
                                `${window.location.origin}/invite/${inv.token}`
                              )
                            }
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copy Link
                          </button>
                          <button
                            onClick={() => handleRevokeInvite(inv.id)}
                            className="p-1 rounded text-zinc-400 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Revoke Invite"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Invite Team Member"
        description="Invited teammates can collaborate on datasets and reports based on their assigned role."
      >
        {!generatedInviteUrl ? (
          <form onSubmit={handleInviteSubmit} className="space-y-4">
            {inviteError && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs border border-red-200 dark:border-red-900/60">
                {inviteError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Colleague Work Email
              </label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Role Permission Level
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {currentUser.role === 'OWNER' && (
                  <option value="ADMIN">Admin - Full team & dataset management</option>
                )}
                <option value="MEMBER">Member - Can upload CSVs and save reports</option>
                <option value="VIEWER">Viewer - Read-only dashboard access</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsInviteModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isSubmitting}>
                Generate Invitation
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Invitation successfully created for <strong>{inviteEmail}</strong>!</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Direct Invitation Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedInviteUrl}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 font-mono text-zinc-600 dark:text-zinc-300 select-all"
                />
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => handleCopy(generatedInviteUrl)}
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedUrl ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Send this link directly to your colleague or test it in an incognito window.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIsInviteModalOpen(false)
                  setGeneratedInviteUrl(null)
                }}
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
