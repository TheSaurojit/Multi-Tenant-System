'use client'

import React, { useState, useRef } from 'react'
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  Eye,
  Loader2,
} from 'lucide-react'
import Papa from 'papaparse'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { uploadCsvAction } from '@/app/actions/dataset-actions'
import { detectDatasetType } from '@/lib/csv-parser'

interface CsvUploaderProps {
  maxRows: number
  onSuccess?: () => void
}

export function CsvUploader({ maxRows, onSuccess }: CsvUploaderProps) {
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewData, setPreviewData] = useState<{
    headers: string[]
    rows: any[]
    totalRows: number
    detectedType: string
  } | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [customName, setCustomName] = useState('')

  // Processing status states: 'idle' | 'validating' | 'uploading' | 'completed' | 'error'
  const [status, setStatus] = useState<'idle' | 'validating' | 'uploading' | 'completed' | 'error'>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setErrorMessage('Please upload a valid .csv file.')
      return
    }

    setErrorMessage(null)
    setValidationErrors([])
    setSelectedFile(file)
    setCustomName(file.name.replace(/\.csv$/i, ''))
    setStatus('validating')
    setStatusMessage('Validating CSV headers and row structure...')

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        if (results.errors.length > 0) {
          setValidationErrors(results.errors.slice(0, 5).map((e) => `Row ${e.row}: ${e.message}`))
          setStatus('error')
          return
        }

        const headers = Object.keys(results.data[0] || {})
        if (headers.length === 0) {
          setValidationErrors(['The uploaded CSV contains no headers or columns.'])
          setStatus('error')
          return
        }

        if (results.data.length > maxRows) {
          setValidationErrors([
            `Dataset row count (${results.data.length}) exceeds your current plan limit (${maxRows.toLocaleString()} rows). Please upgrade to upload larger files.`,
          ])
          setStatus('error')
          return
        }

        const detected = detectDatasetType(headers)
        setPreviewData({
          headers,
          rows: results.data.slice(0, 5),
          totalRows: results.data.length,
          detectedType: detected,
        })
        setStatus('idle')
      },
      error: (err) => {
        setErrorMessage(`Failed to read CSV: ${err.message}`)
        setStatus('error')
      },
    })
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0])
    }
  }

  const handleUploadSubmit = async () => {
    if (!selectedFile) return

    setStatus('uploading')
    setStatusMessage('Uploading and indexing data points into workspace database...')

    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('name', customName)

    const res = await uploadCsvAction(formData)

    if (res?.error) {
      setStatus('error')
      setErrorMessage(res.error)
      if (res.validationErrors) {
        setValidationErrors(res.validationErrors)
      }
    } else {
      setStatus('completed')
      setStatusMessage(`Successfully imported ${res.rowCount} records as a ${res.type} dataset!`)
      if (onSuccess) onSuccess()
    }
  }

  const resetUpload = () => {
    setSelectedFile(null)
    setPreviewData(null)
    setValidationErrors([])
    setStatus('idle')
    setErrorMessage(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            CSV Ingestion Pipeline
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Upload sales transactions or marketing campaign performance data (max {maxRows.toLocaleString()} rows on your plan)
          </p>
        </div>
      </div>

      {/* Upload Dropzone */}
      {!selectedFile && (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
            dragActive
              ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20'
              : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 bg-zinc-50/50 dark:bg-zinc-800/30'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3">
            <UploadCloud className="w-6 h-6" />
          </div>
          <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            Click to browse or drag & drop your CSV file here
          </p>
          <p className="text-[11px] text-zinc-400 mt-1">
            Supports Sales schemas (Date, Revenue, Category, Region) & Marketing schemas (Date, Spend, Impressions, Conversions)
          </p>
        </div>
      )}

      {/* Error Banners */}
      {errorMessage && (
        <div className="mt-4 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{errorMessage}</p>
            {validationErrors.length > 0 && (
              <ul className="list-disc list-inside mt-1.5 space-y-0.5 text-[11px]">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Selected File & Ingestion Preview */}
      {selectedFile && previewData && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                    {selectedFile.name}
                  </span>
                  <Badge variant={previewData.detectedType === 'SALES' ? 'success' : 'info'}>
                    {previewData.detectedType} DETECTED
                  </Badge>
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {(selectedFile.size / 1024).toFixed(1)} KB • {previewData.totalRows.toLocaleString()} rows identified
                </p>
              </div>
            </div>

            <button
              onClick={resetUpload}
              className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Change File
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Dataset Name in Workspace
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Table Preview */}
          <div className="border border-zinc-200 dark:border-zinc-700/80 rounded-lg overflow-hidden">
            <div className="p-2.5 bg-zinc-100 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-300">
              <span className="font-semibold flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Data Structure Preview (First 5 Rows)
              </span>
              <span className="text-[11px] text-zinc-400 font-mono">
                {previewData.headers.length} columns
              </span>
            </div>
            <div className="overflow-x-auto max-h-48">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-zinc-50 dark:bg-zinc-850 text-zinc-500 border-b border-zinc-200 dark:border-zinc-700">
                  <tr>
                    {previewData.headers.map((h) => (
                      <th key={h} className="py-2 px-3 font-semibold whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {previewData.rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                      {previewData.headers.map((h) => (
                        <td key={h} className="py-1.5 px-3 whitespace-nowrap text-zinc-700 dark:text-zinc-300">
                          {row[h] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Processing Status Banner */}
          {status === 'uploading' && (
            <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 flex items-center gap-3 text-xs text-indigo-700 dark:text-indigo-300">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {status === 'completed' && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{statusMessage}</span>
              </div>
              <Button size="sm" variant="outline" onClick={resetUpload}>
                Upload Another
              </Button>
            </div>
          )}

          {status !== 'completed' && (
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={resetUpload}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleUploadSubmit}
                isLoading={status === 'uploading'}
              >
                Start Ingestion
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
