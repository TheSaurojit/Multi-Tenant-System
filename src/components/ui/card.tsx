import React from 'react'

export function Card({
  className = '',
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={`bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-xl shadow-xs overflow-hidden transition-all ${className}`}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  className = '',
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`p-5 pb-3 border-b border-zinc-100 dark:border-zinc-800/80 ${className}`}>
      {children}
    </div>
  )
}

export function CardTitle({
  className = '',
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <h3 className={`font-semibold text-zinc-900 dark:text-zinc-100 text-base leading-none ${className}`}>
      {children}
    </h3>
  )
}

export function CardDescription({
  className = '',
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <p className={`text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-normal ${className}`}>
      {children}
    </p>
  )
}

export function CardContent({
  className = '',
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return <div className={`p-5 ${className}`}>{children}</div>
}
