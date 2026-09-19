import { Plan } from '@prisma/client'

export interface PlanLimits {
  name: string
  priceMonthly: number
  currency: string
  formattedPrice: string
  targetAudience: string
  maxWorkspaces: number
  maxMembers: number
  monthlyUploads: number
  maxRowsPerCsv: number
  maxSavedReports: number
  retentionDays: number
  retentionLabel: string
  canExportCsv: boolean
  hasAuditLogs: boolean
  features: string[]
}

export const PLAN_CONFIGS: Record<Plan, PlanLimits> = {
  FREE: {
    name: 'Free',
    priceMonthly: 0,
    currency: '₹',
    formattedPrice: '₹0',
    targetAudience: 'For small businesses testing the platform',
    maxWorkspaces: 1,
    maxMembers: 3,
    monthlyUploads: 10,
    maxRowsPerCsv: 50000,
    maxSavedReports: 5,
    retentionDays: 30,
    retentionLabel: '30-day data retention',
    canExportCsv: true,
    hasAuditLogs: true,
    features: [
      '1 workspace',
      '3 team members',
      '10 CSV uploads/month',
      '50,000 rows/month',
      '5 saved reports',
      'Basic KPI dashboard',
      'Revenue / sales charts',
      'Date & category filters',
      'CSV export',
      '30-day data retention',
      'Basic audit logs',
    ],
  },
  PRO: {
    name: 'Pro',
    priceMonthly: 1499,
    currency: '₹',
    formattedPrice: '₹1,499',
    targetAudience: 'For growing businesses and teams',
    maxWorkspaces: 5,
    maxMembers: 15,
    monthlyUploads: 100,
    maxRowsPerCsv: 500000,
    maxSavedReports: 1000, // Unlimited
    retentionDays: 365,
    retentionLabel: '1-year data retention',
    canExportCsv: true,
    hasAuditLogs: true,
    features: [
      'Everything in Free, plus:',
      '5 workspaces',
      '15 team members',
      '100 CSV uploads/month',
      '500,000 rows/month',
      'Unlimited saved reports',
      'Advanced filters',
      'Custom dashboards',
      'More chart types',
      'Scheduled report exports',
      '1-year data retention',
      'Full audit logs',
      'Team invitations',
      'Advanced usage analytics',
    ],
  },
  ADVANCED: {
    name: 'Advanced',
    priceMonthly: 4999,
    currency: '₹',
    formattedPrice: '₹4,999',
    targetAudience: 'For larger teams and high-throughput businesses',
    maxWorkspaces: 100, // Unlimited
    maxMembers: 50, // 50+ members
    monthlyUploads: 500,
    maxRowsPerCsv: 5000000, // 5M rows/month
    maxSavedReports: 1000, // Unlimited
    retentionDays: 1095,
    retentionLabel: '3-year data retention',
    canExportCsv: true,
    hasAuditLogs: true,
    features: [
      'Everything in Pro, plus:',
      'Unlimited workspaces',
      '50+ team members',
      '500 CSV uploads/month',
      '5M rows/month',
      'Unlimited reports',
      'Dashboard sharing',
      'Advanced analytics & data comparison',
      'Cohort & trend analysis',
      'Custom metrics',
      'API access & webhook integrations',
      'Priority ingestion processing',
      '3-year data retention',
      'Advanced audit logs',
    ],
  },
}

export function getPlanLimits(plan: Plan): PlanLimits {
  return PLAN_CONFIGS[plan] ?? PLAN_CONFIGS.FREE
}
