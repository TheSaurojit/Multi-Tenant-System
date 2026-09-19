import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FileQuestion } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 text-zinc-100 text-center">
      <div className="max-w-md w-full p-8 rounded-2xl bg-zinc-900 border border-zinc-800">
        <div className="w-12 h-12 rounded-2xl bg-indigo-950/60 border border-indigo-800/60 text-indigo-400 flex items-center justify-center mx-auto mb-4">
          <FileQuestion className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold">Page Not Found</h2>
        <p className="text-xs text-zinc-400 mt-2 mb-6">
          The page or workspace resource you requested could not be located.
        </p>
        <Link href="/dashboard">
          <Button variant="primary">Return to Dashboard</Button>
        </Link>
      </div>
    </div>
  )
}
