'use client'

import React, { useState, useEffect, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { verifyEmailAction, resendVerificationEmailAction } from '@/app/actions/auth-actions'
import { Button } from '@/components/ui/button'
import { Mail, CheckCircle2, AlertCircle, ArrowLeft, RefreshCw, Sparkles } from 'lucide-react'
import { resolveAuthRedirect } from '@/lib/auth-redirect'

function VerifyEmailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const emailParam = searchParams.get('email') || ''
  const from = searchParams.get('from') || ''
  const justSent = searchParams.get('sent') === 'true'

  const [resendEmail, setResendEmail] = useState(emailParam)
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendMessage, setResendMessage] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const hasTriggeredRef = useRef(false)

  // If a token is provided in query params, attempt verification automatically on mount
  useEffect(() => {
    if (token && !verified && !error && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true
      const verify = async () => {
        setVerifying(true)
        const formData = new FormData()
        formData.append('token', token)

        try {
          const res = await verifyEmailAction(formData)
          if (res && 'error' in res) {
            setError(res.error || 'Verification failed.')
          } else if (res && 'success' in res) {
            setVerified(true)
          }
        } catch {
          setError('An unexpected error occurred while verifying your email.')
        } finally {
          setVerifying(false)
        }
      }

      void verify()
    }
  }, [token, verified, error])

  const handleResend = async (e: React.SubmitEvent) => {
    e.preventDefault()
    setResending(true)
    setError(null)
    setResendMessage(null)

    const formData = new FormData()
    formData.append('email', resendEmail)

    try {
      const res = await resendVerificationEmailAction(formData)
      if (res && 'error' in res) {
        setError(res.error || 'Failed to resend verification email.')
      } else if (res && 'message' in res) {
        setResendMessage(res.message || 'Verification email resent.')
      }
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setResending(false)
    }
  }

  // State 1: Verification in progress
  if (verifying) {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="w-12 h-12 rounded-full bg-indigo-950/60 border border-indigo-800/80 text-indigo-400 flex items-center justify-center mx-auto animate-pulse">
          <RefreshCw className="w-6 h-6 animate-spin" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Verifying your email...</h3>
          <p className="text-xs text-zinc-400 mt-1">Please wait while we confirm your account token.</p>
        </div>
      </div>
    )
  }

  // State 2: Verification succeeded
  if (verified) {
    return (
      <div className="text-center py-4 space-y-4">
        <div className="w-12 h-12 rounded-full bg-emerald-950/60 border border-emerald-800/80 text-emerald-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Email Verified Successfully! 🎉</h3>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Your SaaS Analytics account is now fully activated and ready.
          </p>
        </div>
        <div className="pt-2">
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => {
              const target = resolveAuthRedirect(from, '/dashboard')
              router.push(target)
            }}
          >
            <Sparkles className="w-4 h-4 mr-1.5" />
            {from ? 'Continue to Invitation' : 'Continue to Dashboard'}
          </Button>
        </div>
      </div>
    )
  }

  // State 3: Error during token verification
  if (token && error) {
    return (
      <div className="text-center py-4 space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-950/60 border border-rose-800/80 text-rose-400 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Verification Link Expired or Invalid</h3>
          <p className="text-xs text-red-300 mt-1 leading-relaxed">
            {error}
          </p>
        </div>
        <form onSubmit={handleResend} className="space-y-3 pt-2 text-left">
          <label className="block text-xs font-medium text-zinc-300">
            Resend to Email
          </label>
          <input
            type="email"
            required
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
            placeholder="name@company.com"
            className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-zinc-700 bg-zinc-800/80 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          />
          <Button type="submit" variant="primary" size="md" className="w-full" isLoading={resending}>
            Resend Verification Link
          </Button>
        </form>
        {resendMessage && (
          <p className="text-xs text-emerald-400">{resendMessage}</p>
        )}
        <div className="pt-2">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  // State 4: Default - "Check your email" after signup or unverified login
  return (
    <div className="space-y-4 text-center">
      <div className="w-12 h-12 rounded-full bg-indigo-950/60 border border-indigo-800/80 text-indigo-400 flex items-center justify-center mx-auto">
        <Mail className="w-6 h-6" />
      </div>

      <div>
        <h3 className="text-base font-semibold text-white">
          {justSent ? 'Check Your Inbox' : 'Verify Your Email Address'}
        </h3>
        <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
          {resendEmail ? (
            <>
              We sent a verification link to <strong className="text-indigo-400">{resendEmail}</strong>. Please check your inbox and click the link to activate your account.
            </>
          ) : (
            'Please verify your email address to activate your account.'
          )}
        </p>
      </div>

      {resendMessage && (
        <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs">
          {resendMessage}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-red-300 text-xs">
          {error}
        </div>
      )}

      <form onSubmit={handleResend} className="space-y-3 pt-3 text-left">
        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-1">
            Didn&apos;t receive the email? Enter address to resend:
          </label>
          <input
            type="email"
            required
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
            placeholder="name@company.com"
            className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-zinc-700 bg-zinc-800/80 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          />
        </div>

        <Button type="submit" variant="secondary" size="md" className="w-full" isLoading={resending}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Resend Verification Link
        </Button>
      </form>

      <div className="pt-3 border-t border-zinc-800">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
        </Link>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-indigo-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-zinc-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-500/30 mb-3">
          <Mail className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          Email Verification
        </h2>
        <p className="mt-1.5 text-xs text-zinc-400">
          Confirm your email to secure and access your multi-tenant workspace
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          <Suspense fallback={<div className="text-center py-8 text-xs text-zinc-400">Loading verification details...</div>}>
            <VerifyEmailContent />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
