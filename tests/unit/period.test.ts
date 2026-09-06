import { isoDay, periodStart } from '@/utils/period'
import { describe, expect, it } from 'vitest'

// The window the orders store loads and the range the dashboard opens on are
// the same computation, so they cannot drift apart.

describe('isoDay', () => {
  it('writes a local day as YYYY-MM-DD', () => {
    expect(isoDay(new Date(2026, 8, 6))).toBe('2026-09-06')
    expect(isoDay(new Date(2026, 0, 1))).toBe('2026-01-01')
  })
})

describe('periodStart', () => {
  it('starts at the first day of the month five back', () => {
    expect(periodStart(6, new Date(2026, 7, 13))).toBe('2026-03-01')
  })

  it('crosses the year boundary', () => {
    expect(periodStart(6, new Date(2026, 1, 20))).toBe('2025-09-01')
  })

  it('this month only, for one', () => {
    expect(periodStart(1, new Date(2026, 7, 13))).toBe('2026-08-01')
  })
})
