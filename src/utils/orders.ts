import type { OrderItem } from '@/types/database'
import { applyDiscount } from '@/utils/pricing'

export interface OrderTotals {
  itemsCount: number
  saleTotal: number
  goodsCost: number
  costTotal: number
  profit: number
  margin: number | null
}

type LineLike = Pick<OrderItem, 'qty' | 'unit_price' | 'unit_cost'> & { discount?: number }

/**
 * Roll up order economics from its line items plus the delivery and
 * packaging expenses.
 *
 * Two discounts compose. `unit_price` is the gross list price; a line's own
 * `discount` (0..100) comes off that line, and the order-level `discountPct`
 * then comes off the resulting total — so a 20% line inside a 10% order
 * sells at 72% of list. Cost = goods + delivery + packaging; margin is
 * profit over the discounted sale (null when nothing was sold).
 */
export function computeOrderTotals(
  items: LineLike[],
  deliveryCost = 0,
  packagingCost = 0,
  discountPct = 0,
): OrderTotals {
  let itemsCount = 0
  let lineSale = 0
  let goodsCost = 0

  for (const item of items) {
    itemsCount += item.qty
    lineSale += item.qty * applyDiscount(item.unit_price, item.discount ?? 0)
    goodsCost += item.qty * item.unit_cost
  }

  const pct = Math.min(100, Math.max(0, discountPct))
  const saleTotal = lineSale * (1 - pct / 100)
  const costTotal = goodsCost + deliveryCost + packagingCost
  const profit = saleTotal - costTotal
  const margin = saleTotal > 0 ? profit / saleTotal : null

  return { itemsCount, saleTotal, goodsCost, costTotal, profit, margin }
}
