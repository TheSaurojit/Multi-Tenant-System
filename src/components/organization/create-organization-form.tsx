'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Building2, ArrowLeft, CheckCircle2, AlertCircle, Shield, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createOrganizationAction } from '@/app/actions/auth-actions'

interface CreateOrganizationFormProps {
  currentOrgCount: number
}

export function CreateOrganizationForm({ currentOrgCount }: CreateOrganizationFormProps) {
  const [name, setNewOrgName] = useState('')
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
      setError('Organization name is required.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    const formData = new FormData()
    formData.append('name', name.trim())

    try {
      const res = await createOrganizationAction(formData)
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
        <Badge variant="purple">
          {currentOrgCount} Existing Org{currentOrgCount === 1 ? '' : 's'}
        </Badge>
      </div>

      {/* Card Container */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
        {/* Card Header */}
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/60 dark:border-indigo-900/60 flex items-center justify-center shrink-0 text-indigo-600 dark:text-indigo-400 shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Register New Organization
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                Organizations hold your company billing subscription, invoices, and shared team memberships.
              </p>
            </div>
          </div>
        </div>

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Organization Name */}
          <div>
            <label
              htmlFor="org-name"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Organization Name <span className="text-red-500">*</span>
            </label>
            <input
              id="org-name"
              name="name"
              type="text"
              required
              disabled={isSubmitting}
              value={name}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="e.g. Acme Corporation"
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

          {/* Informational tips */}
          <div className="p-4 rounded-xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-2">
            <p className="text-xs font-semibold text-indigo-950 dark:text-indigo-200">
              What comes with your new organization?
            </p>
            <ul className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1.5">
              <li className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>You will automatically be assigned the <strong>OWNER</strong> role</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>Includes an initial default <strong>Primary Workspace</strong></span>
              </li>
              <li className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>Starts on the <strong>FREE</strong> plan with full access to upgrade at any time</span>
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
              disabled={isSubmitting || !name.trim()}
              isLoading={isSubmitting}
            >
              Create Organization
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
