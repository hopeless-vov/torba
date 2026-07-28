import { batchStatus, daysUntil } from '@/utils/batch-status'
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
