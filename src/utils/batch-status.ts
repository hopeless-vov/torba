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

/**
 * FIFO order — soonest expiry first, undated batches last, oldest
 * delivery breaking ties. Matches the `order by` in create_order so the
 * cart shows the batch the database would actually draw from.
 */
export function compareByExpiry(
  a: { expiry_date: string | null; created_at?: string },
  b: { expiry_date: string | null; created_at?: string },
): number {
  if (a.expiry_date !== b.expiry_date) {
    if (!a.expiry_date) return 1
    if (!b.expiry_date) return -1
    return a.expiry_date < b.expiry_date ? -1 : 1
  }
  return (a.created_at ?? '').localeCompare(b.created_at ?? '')
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
