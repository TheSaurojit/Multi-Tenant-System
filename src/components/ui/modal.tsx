'use client'

import React, { useEffect } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'md',
}: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.body.style.overflow = 'unset'
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  }[maxWidth]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative w-full ${maxWidthClass} bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden z-10`}
      >
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
            {description && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
