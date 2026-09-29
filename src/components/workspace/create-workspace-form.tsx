'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Layers, Sparkles, AlertCircle, ArrowLeft, Building2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createWorkspaceAction } from '@/app/actions/auth-actions'

interface CreateWorkspaceFormProps {
  activeOrgName: string
  workspacesCount: number
  maxWorkspaces: number
  isAtWorkspaceLimit: boolean
  currentPlan: string
}

export function CreateWorkspaceForm({
  activeOrgName,
  workspacesCount,
  maxWorkspaces,
  isAtWorkspaceLimit,
  currentPlan,
}: CreateWorkspaceFormProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Compute live slug preview
  const slugPreview = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Workspace name is required.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    const formData = new FormData()
    formData.append('name', name.trim())
    if (description.trim()) {
      formData.append('description', description.trim())
    }

    try {
      const res = await createWorkspaceAction(formData)
      if (res?.error) {
        setError(res.error)
        setIsSubmitting(false)
      }
    } catch {
      // Server action handles redirect to /dashboard upon success
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Top Header & Back Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Dashboard
        </Link>
        <Badge variant={currentPlan === 'PRO' ? 'info' : currentPlan === 'ADVANCED' ? 'purple' : 'default'}>
          {currentPlan} Plan
        </Badge>
      </div>

      {/* Card Container */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
        {/* Card Header */}
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/60 dark:border-indigo-900/60 flex items-center justify-center shrink-0 text-indigo-600 dark:text-indigo-400 shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Create New Workspace
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                Workspaces isolate project datasets, team activity, and reports within{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                  {activeOrgName}
                </span>
                .
              </p>
            </div>
          </div>

          {/* Quota Information Bar */}
          <div className="mt-4 flex items-center justify-between text-xs px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-750">
            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
              <Building2 className="w-4 h-4 text-zinc-400" />
              <span>Target Organization: <strong className="text-zinc-900 dark:text-zinc-100">{activeOrgName}</strong></span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              <span>Quota:</span>
              <strong className="text-zinc-800 dark:text-zinc-200">
                {workspacesCount} / {maxWorkspaces >= 100 ? 'Unlimited' : maxWorkspaces}
              </strong>
            </div>
          </div>
        </div>

        {/* Limit Warning (if applicable) */}
        {isAtWorkspaceLimit && (
          <div className="p-4 mx-6 mt-6 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-start justify-between gap-3 text-amber-800 dark:text-amber-200">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold">Workspace Limit Reached</p>
                <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                  Your current {currentPlan} plan is limited to {maxWorkspaces} workspace{maxWorkspaces === 1 ? '' : 's'}. Upgrade your organization plan to create additional workspaces.
                </p>
              </div>
            </div>
            <Link
              href="/workspace/billing"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shrink-0 transition-colors shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Upgrade Plan
            </Link>
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Workspace Name */}
          <div>
            <label
              htmlFor="name"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Workspace Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              disabled={isAtWorkspaceLimit || isSubmitting}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Growth Marketing Labs"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {slugPreview && (
              <p className="mt-1.5 text-[11px] text-zinc-400 font-mono flex items-center gap-1 truncate">
                <span>Slug preview:</span>
                <span className="text-indigo-600 dark:text-indigo-400">
                  {slugPreview}-XXXX
                </span>
              </p>
            )}
          </div>

          {/* Workspace Description */}
          <div>
            <label
              htmlFor="description"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Description <span className="text-zinc-400 font-normal">(Optional)</span>
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              disabled={isAtWorkspaceLimit || isSubmitting}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Q4 campaign analytics, retention cohort tracking, and customer conversion datasets."
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed resize-none"
            />
          </div>

          {/* Informational feature tips */}
          <div className="p-4 rounded-xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-2">
            <p className="text-xs font-semibold text-indigo-950 dark:text-indigo-200">
              What happens after creation?
            </p>
            <ul className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1.5">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>Automatically switches your active session to the new workspace</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>Grants all current organization members access based on their assigned roles</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>Logs an audit trail event under your organization activity log</span>
              </li>
            </ul>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Link href="/dashboard">
              <Button type="button" variant="outline" size="sm">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isAtWorkspaceLimit || isSubmitting || !name.trim()}
              isLoading={isSubmitting}
            >
              Create Workspace
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
