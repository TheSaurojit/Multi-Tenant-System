import React from 'react'

export interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'
  className?: string
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const variantStyles = {
    default:
      'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    success:
      'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
    warning:
      'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
    danger:
      'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
    info:
      'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
    purple:
      'bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60',
  }[variant]

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${variantStyles} ${className}`}
    >
      {children}
    </span>
  )
}
