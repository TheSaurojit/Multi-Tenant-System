'use client'

import React, { useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { loginAction } from '@/app/actions/auth-actions'
import { Button } from '@/components/ui/button'
import { BarChart3, ShieldCheck, UserCheck, Eye, Sparkles } from 'lucide-react'

function LoginForm() {
  const searchParams = useSearchParams()
  const from = searchParams.get('from') || ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleQuickFill = (demoEmail: string) => {
    setEmail(demoEmail)
    setPassword('password123')
    setError(null)
    setUnverifiedEmail(null)
  }

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setUnverifiedEmail(null)

    const formData = new FormData()
    formData.append('email', email)
    formData.append('password', password)
    if (from) {
      formData.append('from', from)
    }

    const res = await loginAction(formData)
    if (res?.error) {
      setError(res.error)
      if ('unverified' in res && res.unverified && 'email' in res && res.email) {
        setUnverifiedEmail(res.email as string)
      }
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-indigo-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-zinc-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-500/30 mb-3">
          <BarChart3 className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          Multi-Tenant SaaS Analytics
        </h2>
        <p className="mt-1.5 text-xs text-zinc-400">
          Sign in to your organization workspace to access dashboards & reports
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-red-300 text-xs">
              <p>{error}</p>
              {unverifiedEmail && (
                <div className="mt-2 pt-2 border-t border-red-800/50">
                  <Link
                    href={`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`}
                    className="font-semibold text-indigo-400 hover:text-indigo-300 underline inline-flex items-center gap-1"
                  >
                    Go to email verification page →
                  </Link>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {from && <input type="hidden" name="from" value={from} />}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Work Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-zinc-700 bg-zinc-800/80 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-zinc-300">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-zinc-700 bg-zinc-800/80 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
              />
            </div>

            <Button type="submit" variant="primary" size="lg" className="w-full mt-2" isLoading={loading}>
              Sign In
            </Button>
          </form>

          {/* Demo Quick-Fill Buttons for RBAC testing */}
          <div className="mt-6 pt-6 border-t border-zinc-800">
            <div className="flex items-center gap-1.5 mb-2.5 text-xs font-semibold text-zinc-400">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Test RBAC Roles (1-Click Fill):</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleQuickFill('owner@acme.com')}
                className="p-2 rounded-lg border border-purple-800/50 bg-purple-950/30 hover:bg-purple-900/40 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5 font-semibold text-purple-300">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Owner
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5 truncate">Full Control & Billing</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill('admin@acme.com')}
                className="p-2 rounded-lg border border-blue-800/50 bg-blue-950/30 hover:bg-blue-900/40 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5 font-semibold text-blue-300">
                  <UserCheck className="w-3.5 h-3.5" />
                  Admin
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5 truncate">Manage Team & Data</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill('member@acme.com')}
                className="p-2 rounded-lg border border-emerald-800/50 bg-emerald-950/30 hover:bg-emerald-900/40 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
                  <UserCheck className="w-3.5 h-3.5" />
                  Member
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5 truncate">Upload & Reports</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill('viewer@acme.com')}
                className="p-2 rounded-lg border border-zinc-700 bg-zinc-800/60 hover:bg-zinc-800 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5 font-semibold text-zinc-300">
                  <Eye className="w-3.5 h-3.5" />
                  Viewer
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5 truncate">Read-Only Access</div>
              </button>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-zinc-400">
            Don&apos;t have an organization workspace?{' '}
            <Link
              href={from ? `/signup?from=${encodeURIComponent(from)}` : '/signup'}
              className="font-semibold text-indigo-400 hover:text-indigo-300"
            >
              Create one now
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-indigo-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-zinc-100">
          <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-500/30 mb-3 animate-pulse">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Multi-Tenant SaaS Analytics
            </h2>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
