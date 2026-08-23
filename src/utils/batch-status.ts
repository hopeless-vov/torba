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

/**
 * A batch worth warning about: it still holds stock and is expired or close
 * to it. A batch sold to the last unit has left the shelf, so nothing on it
 * can go off and no badge should ask the user to deal with it.
 */
export function isAtRisk(
  batch: { expiry_date: string | null; remaining_qty: number },
  today: string | Date = new Date(),
): boolean {
  if (batch.remaining_qty <= 0) return false
  const status = batchStatus(batch.expiry_date, today)
  return status === 'expired' || status === 'critical'
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
