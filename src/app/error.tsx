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
    console.error('Unhandled app error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 text-zinc-100 text-center">
      <div className="max-w-md w-full p-8 rounded-2xl bg-zinc-900 border border-zinc-800">
        <div className="w-12 h-12 rounded-2xl bg-rose-950/60 border border-rose-800/60 text-rose-400 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold">Something went wrong</h2>
        <p className="text-xs text-zinc-400 mt-2 mb-6">
          {error?.message || 'An unexpected error occurred while processing your request.'}
        </p>
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
