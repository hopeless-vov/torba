import type { OrderItem } from '@/types/database'

export interface OrderTotals {
  itemsCount: number
  saleTotal: number
  goodsCost: number
  costTotal: number
  profit: number
  margin: number | null
}

type LineLike = Pick<OrderItem, 'qty' | 'unit_price' | 'unit_cost'>

/**
 * Roll up order economics from its line items plus the delivery and
 * packaging expenses. Cost = goods + delivery + packaging; margin is
 * profit over sale (null when nothing was sold).
 */
export function computeOrderTotals(
  items: LineLike[],
  deliveryCost = 0,
  packagingCost = 0,
): OrderTotals {
  let itemsCount = 0
  let saleTotal = 0
  let goodsCost = 0

  for (const item of items) {
    itemsCount += item.qty
    saleTotal += item.qty * item.unit_price
    goodsCost += item.qty * item.unit_cost
  }

  const costTotal = goodsCost + deliveryCost + packagingCost
  const profit = saleTotal - costTotal
  const margin = saleTotal > 0 ? profit / saleTotal : null

  return { itemsCount, saleTotal, goodsCost, costTotal, profit, margin }
}
