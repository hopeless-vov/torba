import { applyDiscount, computeMargin, convertPrice, costOf } from '@/utils/pricing'
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

describe('costOf', () => {
  const product = { cost_amount: 1500, cost_currency: 'UAH' }

  // The point of the whole thing: the same product bought on promotion must
  // not report the full-price delivery's margin.
  it('prefers the batch’s own purchase price', () => {
    expect(costOf({ cost_amount: 1192, cost_currency: 'UAH' }, product)).toEqual({
      amount: 1192,
      currency: 'UAH',
    })
  })

  it('falls back to the catalogue price when the batch carries none', () => {
    expect(costOf({ cost_amount: null, cost_currency: null }, product)).toEqual({
      amount: 1500,
      currency: 'UAH',
    })
    expect(costOf(null, product)).toEqual({ amount: 1500, currency: 'UAH' })
  })

  // A batch bought for nothing — a sample, a supplier's gift — costs nothing,
  // which is not the same as carrying no price at all.
  it('treats a zero price as a price', () => {
    expect(costOf({ cost_amount: 0, cost_currency: 'UAH' }, product).amount).toBe(0)
  })

  it('reads a currency-less batch price in the product’s currency', () => {
    expect(costOf({ cost_amount: 40, cost_currency: null }, { cost_amount: 50, cost_currency: 'USD' })).toEqual({
      amount: 40,
      currency: 'USD',
    })
  })
})
