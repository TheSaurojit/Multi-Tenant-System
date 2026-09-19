import React from 'react'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import {
  BarChart3,
  ShieldCheck,
  UploadCloud,
  CreditCard,
  History,
  Users,
  ArrowRight,
  FileSpreadsheet,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export default async function HomePage() {
  const currentUser = await getCurrentUser()

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Navigation Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <BarChart3 className="w-5 h-5" />
            </div>
            <span className="font-bold text-base tracking-tight text-white">
              DataPulse SaaS
            </span>
          </div>

          <div className="flex items-center gap-3">
            {currentUser ? (
              <Link href="/dashboard">
                <Button variant="primary" size="sm">
                  Go to Dashboard
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" size="sm" className="text-zinc-300">
                    Sign In
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button variant="primary" size="sm">
                    Start Free
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-20 lg:py-28 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-950/40 text-indigo-300 text-xs font-semibold mb-6">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          Next.js 16 • PostgreSQL • Stripe • Multi-Tenant RBAC
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight max-w-4xl text-white leading-tight">
          Multi-Tenant SaaS Analytics <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            For Modern Data Teams
          </span>
        </h1>

        <p className="max-w-2xl text-base sm:text-lg text-zinc-400 mt-6 leading-relaxed">
          Upload CSV sales or marketing data, view instant KPIs and interactive charts, and collaborate across team workspaces with strict Role-Based Access Control and Stripe subscription plans.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link href="/login">
            <Button variant="primary" size="lg" className="text-sm px-6 py-3">
              Explore Demo Workspaces
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
          <Link href="/signup">
            <Button variant="secondary" size="lg" className="text-sm px-6 py-3 bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-750">
              Create New Organization
            </Button>
          </Link>
        </div>

        {/* Demo Credentials Pill */}
        <div className="mt-8 p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 max-w-lg w-full text-xs text-zinc-400 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            4 Pre-configured RBAC Accounts:
          </span>
          <span className="font-mono text-indigo-300 text-[11px]">
            Owner • Admin • Member • Viewer
          </span>
        </div>

        {/* Feature Grid */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 text-left w-full">
          {/* Card 1 */}
          <div className="p-6 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-xs">
            <div className="w-10 h-10 rounded-xl bg-indigo-950/60 border border-indigo-800/60 text-indigo-400 flex items-center justify-center mb-4">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Multi-Tenancy & RBAC</h3>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Strict row-level workspace partitioning. Switch between organizations seamlessly, invite team members with expiration tokens, and enforce Owner, Admin, Member, and Viewer permissions.
            </p>
          </div>

          {/* Card 2 */}
          <div className="p-6 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-xs">
            <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 flex items-center justify-center mb-4">
              <UploadCloud className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">CSV Ingestion & Validation</h3>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Drag-and-drop CSV uploader with client-side header detection, sales & marketing schema validation, row-by-row error reporting, and multi-step progress tracking.
            </p>
          </div>

          {/* Card 3 */}
          <div className="p-6 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-xs">
            <div className="w-10 h-10 rounded-xl bg-blue-950/60 border border-blue-800/60 text-blue-400 flex items-center justify-center mb-4">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Interactive Analytics & Reports</h3>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              KPI summary cards with growth trajectories, time-series area charts, category breakdowns, date/category filters, saved custom reports, and 1-click CSV export.
            </p>
          </div>

          {/* Card 4 */}
          <div className="p-6 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-xs">
            <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-800/60 text-purple-400 flex items-center justify-center mb-4">
              <CreditCard className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Stripe Test-Mode Billing</h3>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Tiered plans (Free, Pro, Enterprise) with Stripe Checkout sessions, Customer Portal billing management, usage metering, and webhook subscription synchronization.
            </p>
          </div>

          {/* Card 5 */}
          <div className="p-6 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-xs">
            <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-800/60 text-amber-400 flex items-center justify-center mb-4">
              <History className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Full Security Audit Logs</h3>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Comprehensive activity audit trail logging member invites, role changes, dataset ingestions, report creations, and plan upgrades with IP tracking and metadata.
            </p>
          </div>

          {/* Card 6 */}
          <div className="p-6 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-xs">
            <div className="w-10 h-10 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-400 flex items-center justify-center mb-4">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Enterprise UX & Error Boundaries</h3>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Built with responsive skeleton loading states, graceful empty states, friendly error boundaries, and modern dark-mode aesthetics.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/60 py-8 px-6 text-center text-xs text-zinc-500">
        Multi-Tenant SaaS Analytics Dashboard • Powered by Next.js 16, PostgreSQL & Stripe
      </footer>
    </div>
  )
}
