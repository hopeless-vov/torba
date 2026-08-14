import { computeOrderTotals } from '@/utils/orders'
import { describe, expect, it } from 'vitest'

describe('computeOrderTotals', () => {
  it('rolls up sale, cost, profit and margin', () => {
    const totals = computeOrderTotals(
      [
        { qty: 2, unit_price: 100, unit_cost: 60 },
        { qty: 1, unit_price: 50, unit_cost: 30 },
      ],
      20,
      10,
    )
    expect(totals.itemsCount).toBe(3)
    expect(totals.saleTotal).toBe(250)
    expect(totals.goodsCost).toBe(150)
    expect(totals.costTotal).toBe(180) // 150 goods + 20 delivery + 10 packaging
    expect(totals.profit).toBe(70)
    expect(totals.margin).toBeCloseTo(70 / 250, 6)
  })

  it('has a null margin when nothing is sold', () => {
    const totals = computeOrderTotals([])
    expect(totals.saleTotal).toBe(0)
    expect(totals.margin).toBeNull()
  })

  it('reduces the sale total by the order discount, gross lines untouched', () => {
    const items = [{ qty: 2, unit_price: 100, unit_cost: 60 }]
    const totals = computeOrderTotals(items, 0, 0, 10) // 10% off 200
    expect(totals.saleTotal).toBe(180)
    expect(totals.goodsCost).toBe(120) // cost is not discounted
    expect(totals.profit).toBe(60) // 180 − 120
  })

  it('takes a per-line discount off that line only', () => {
    const totals = computeOrderTotals([
      { qty: 2, unit_price: 100, unit_cost: 60, discount: 25 },
      { qty: 1, unit_price: 100, unit_cost: 60 },
    ])
    expect(totals.saleTotal).toBe(250) // 2×75 + 100
    expect(totals.goodsCost).toBe(180) // cost is never discounted
  })

  // The two are separate reductions, so they compose instead of one
  // silently replacing the other.
  it('stacks a line discount under the order discount', () => {
    const items = [{ qty: 1, unit_price: 100, unit_cost: 0, discount: 20 }]
    expect(computeOrderTotals(items, 0, 0, 10).saleTotal).toBeCloseTo(72, 6)
  })

  it('clamps a line discount into 0..100 as well', () => {
    expect(computeOrderTotals([{ qty: 1, unit_price: 100, unit_cost: 0, discount: 150 }]).saleTotal).toBe(0)
    expect(computeOrderTotals([{ qty: 1, unit_price: 100, unit_cost: 0, discount: -50 }]).saleTotal).toBe(100)
  })

  it('clamps the discount into 0..100', () => {
    const items = [{ qty: 1, unit_price: 100, unit_cost: 0 }]
    expect(computeOrderTotals(items, 0, 0, 150).saleTotal).toBe(0)
    expect(computeOrderTotals(items, 0, 0, -50).saleTotal).toBe(100)
  })
})
