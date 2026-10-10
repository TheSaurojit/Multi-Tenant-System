'use client'

import React, { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Full details stay in the console/logs, never rendered to the user
    console.error('Unhandled app error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 text-zinc-100 text-center">
      <div className="max-w-md w-full p-8 rounded-2xl bg-zinc-900 border border-zinc-800">
        <div className="w-12 h-12 rounded-full bg-rose-950/60 border border-rose-800/60 flex items-center justify-center mx-auto mb-4 text-rose-400">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold">Something went wrong</h2>
        <p className="text-xs text-zinc-400 mt-2 mb-2">
          An unexpected error occurred while processing your request. Please try again.
        </p>
        {error?.digest && (
          <p className="text-[10px] text-zinc-600 font-mono mb-4">Ref: {error.digest}</p>
        )}
        {!error?.digest && <div className="mb-4" />}
        <div className="flex justify-center gap-3">
          <Button variant="primary" onClick={() => reset()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Try Again
          </Button>
        </div>
      </div>
    </div>
  )
}
