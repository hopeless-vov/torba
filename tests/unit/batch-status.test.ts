import { batchStatus, compareByExpiry, daysUntil } from '@/utils/batch-status'
import { describe, expect, it } from 'vitest'

const TODAY = '2026-07-28'

function plusDays(days: number): string {
  const base = Date.UTC(2026, 6, 28)
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10)
}

describe('daysUntil', () => {
  it('counts whole days to the expiry date', () => {
    expect(daysUntil(plusDays(4), TODAY)).toBe(4)
    expect(daysUntil(plusDays(-3), TODAY)).toBe(-3)
    expect(daysUntil(TODAY, TODAY)).toBe(0)
  })

  it('is null without a date', () => {
    expect(daysUntil(null, TODAY)).toBeNull()
  })
})

describe('batchStatus', () => {
  it('buckets by days to expiry', () => {
    expect(batchStatus(plusDays(-1), TODAY)).toBe('expired')
    expect(batchStatus(plusDays(30), TODAY)).toBe('critical')
    expect(batchStatus(plusDays(90), TODAY)).toBe('critical')
    expect(batchStatus(plusDays(120), TODAY)).toBe('ending')
    expect(batchStatus(plusDays(300), TODAY)).toBe('almost')
    expect(batchStatus(plusDays(400), TODAY)).toBe('ok')
  })

  it('treats a missing date as ok', () => {
    expect(batchStatus(null, TODAY)).toBe('ok')
  })
})

describe('compareByExpiry', () => {
  it('sorts the soonest expiry first and undated batches last', () => {
    const sorted = [
      { expiry_date: null },
      { expiry_date: '2027-01-01' },
      { expiry_date: '2026-09-01' },
    ].sort(compareByExpiry)

    expect(sorted.map((b) => b.expiry_date)).toEqual(['2026-09-01', '2027-01-01', null])
  })

  it('breaks ties on the older delivery', () => {
    const sorted = [
      { expiry_date: '2026-09-01', created_at: '2026-05-02' },
      { expiry_date: '2026-09-01', created_at: '2026-03-11' },
    ].sort(compareByExpiry)

    expect(sorted.map((b) => b.created_at)).toEqual(['2026-03-11', '2026-05-02'])
  })
})
