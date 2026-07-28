import { applyDiscount, computeMargin, convertPrice } from '@/utils/pricing'
import { describe, expect, it } from 'vitest'

describe('convertPrice', () => {
  it('multiplies USD by the rate', () => {
    expect(convertPrice(10, 44.5)).toBe(445)
    expect(convertPrice(0, 44.5)).toBe(0)
  })
})

describe('computeMargin', () => {
  it('returns the retail/purchase margin ratio', () => {
    expect(computeMargin(51, 77)).toBeCloseTo((77 - 51) / 77, 6)
  })

  it('is null when retail is missing or non-positive', () => {
    expect(computeMargin(51, null)).toBeNull()
    expect(computeMargin(51, 0)).toBeNull()
  })
})

describe('applyDiscount', () => {
  it('applies a percentage', () => {
    expect(applyDiscount(100, 15)).toBe(85)
    expect(applyDiscount(100, 0)).toBe(100)
  })

  it('clamps the discount to 0..100', () => {
    expect(applyDiscount(100, -20)).toBe(100)
    expect(applyDiscount(100, 150)).toBe(0)
  })
})
