import { currencySymbol, formatAmount, formatDate, formatMoney, formatNumber, formatPercent } from '@/utils/format'
import { describe, expect, it } from 'vitest'

// uk-UA groups with a non-breaking space; normalise for stable assertions.
const norm = (s: string) => s.replace(/\s/g, ' ')

describe('formatNumber', () => {
  it('groups thousands and uses a comma decimal', () => {
    expect(norm(formatNumber(2047, 0))).toBe('2 047')
    expect(norm(formatNumber(46, 2))).toBe('46,00')
  })
})

describe('formatMoney', () => {
  it('appends the currency symbol', () => {
    expect(norm(formatMoney(2047, 'UAH', 0))).toBe('2 047 ₴')
    expect(norm(formatMoney(46, 'USD', 2))).toBe('46,00 $')
  })
})

describe('formatAmount', () => {
  it('uses a symbol the built-in map does not know', () => {
    expect(norm(formatAmount(1200, 'zł', 0))).toBe('1 200 zł')
  })

  it('omits the trailing space when there is no symbol', () => {
    expect(norm(formatAmount(12, '', 0))).toBe('12')
  })
})

describe('currencySymbol', () => {
  it('maps known currencies and falls back to the code', () => {
    expect(currencySymbol('UAH')).toBe('₴')
    expect(currencySymbol('USD')).toBe('$')
    expect(currencySymbol('GBP')).toBe('GBP')
  })
})

describe('formatPercent', () => {
  it('renders a ratio as a percent', () => {
    expect(formatPercent(0.48)).toBe('48%')
    expect(formatPercent(null)).toBe('—')
  })
})

describe('formatDate', () => {
  it('renders dd.MM.yyyy', () => {
    expect(formatDate('2026-07-27')).toBe('27.07.2026')
    expect(formatDate(null)).toBe('—')
    expect(formatDate('not-a-date')).toBe('—')
  })
})
