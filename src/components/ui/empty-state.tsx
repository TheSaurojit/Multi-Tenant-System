import React from 'react'
import { FolderPlus, LucideIcon } from 'lucide-react'
import { Button } from './button'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  href?: string
}

export function EmptyState({
  icon: Icon = FolderPlus,
  title,
  description,
  actionLabel,
  onAction,
  href,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/30">
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 mb-4 ring-8 ring-indigo-50/50 dark:ring-indigo-950/20">
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400 mt-1.5 mb-6">{description}</p>
      {actionLabel && (
        <div>
          {href ? (
            <a href={href}>
              <Button variant="primary">{actionLabel}</Button>
            </a>
          ) : (
            <Button onClick={onAction} variant="primary">
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
