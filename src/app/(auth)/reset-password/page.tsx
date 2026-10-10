'use client'

import React, { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { resetPasswordAction } from '@/app/actions/auth-actions'
import { Button } from '@/components/ui/button'
import { Lock, CheckCircle2, ArrowLeft, ShieldAlert } from 'lucide-react'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!token) {
    return (
      <div className="text-center py-4 space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-950/60 border border-rose-800/80 text-rose-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Missing Reset Token</h3>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            This password reset link is invalid or incomplete. Please request a new link from the forgot password page.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/forgot-password"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Request New Reset Link →
          </Link>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must contain at least one letter and one number.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const formData = new FormData()
    formData.append('token', token)
    formData.append('password', password)

    try {
      const res = await resetPasswordAction(formData)
      if (res && 'error' in res) {
        setError(res.error || 'Failed to reset password.')
      } else if (res && 'success' in res) {
        setSuccess(true)
      }
    } catch {
      setError('An unexpected error occurred while resetting your password.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="text-center py-4 space-y-4">
        <div className="w-12 h-12 rounded-full bg-emerald-950/60 border border-emerald-800/80 text-emerald-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Password Reset Successful</h3>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Your password has been securely updated and all previous sessions have been logged out.
          </p>
        </div>
        <div className="pt-2">
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => router.push('/login')}
          >
            Sign In with New Password
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-zinc-300 mb-1">
          New Password
        </label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min 8 characters with letters & numbers"
          className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-zinc-700 bg-zinc-800/80 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-300 mb-1">
          Confirm New Password
        </label>
        <input
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter your new password"
          className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-zinc-700 bg-zinc-800/80 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
        />
      </div>

      <Button type="submit" variant="primary" size="lg" className="w-full mt-2" isLoading={loading}>
        Reset Password
      </Button>

      <div className="pt-4 text-center border-t border-zinc-800">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
        </Link>
      </div>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-indigo-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-zinc-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-500/30 mb-3">
          <Lock className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          Create New Password
        </h2>
        <p className="mt-1.5 text-xs text-zinc-400">
          Enter and confirm your new secure password below
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          <Suspense fallback={<div className="text-center py-8 text-xs text-zinc-400">Loading reset form...</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
