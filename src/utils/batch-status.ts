import type { BatchStatus } from '@/types/models'

// Expiry thresholds in days. A batch's status is driven purely by its
// expiry date; quantity is tracked separately.
export const EXPIRY_THRESHOLDS = {
  critical: 90,
  ending: 180,
  almost: 365,
} as const

function toUtcDay(value: string | Date): number {
  const d = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value
  return Math.floor(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000,
  )
}

/** Whole days from `today` until `expiry` (negative once expired). */
export function daysUntil(expiry: string | null, today: string | Date = new Date()): number | null {
  if (!expiry) return null
  return toUtcDay(expiry) - toUtcDay(today)
}

export function batchStatus(expiry: string | null, today: string | Date = new Date()): BatchStatus {
  const days = daysUntil(expiry, today)
  if (days == null) return 'ok'
  if (days < 0) return 'expired'
  if (days <= EXPIRY_THRESHOLDS.critical) return 'critical'
  if (days <= EXPIRY_THRESHOLDS.ending) return 'ending'
  if (days <= EXPIRY_THRESHOLDS.almost) return 'almost'
  return 'ok'
}
