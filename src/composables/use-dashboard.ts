import { useCurrency } from '@/composables/use-currency'
import { useInventoryStore } from '@/stores/inventory'
import { useOrdersStore } from '@/stores/orders'
import { useReferenceStore } from '@/stores/reference'
import type { BatchStatus } from '@/types/models'
import { batchStatus, daysUntil } from '@/utils/batch-status'
import { computeOrderTotals } from '@/utils/orders'
import { computed } from 'vue'

export interface BurningRow {
  id: string
  name: string
  sku: string
  batch: string
  remaining: number
  expiry: string | null
  status: BatchStatus
  daysLeft: number | null
}

/** One month of trade, in the active display currency. */
export interface MonthTotals {
  /** 'YYYY-MM' — stable key; the view formats the visible label. */
  key: string
  year: number
  /** 0-indexed, ready for `new Date(year, month)`. */
  month: number
  revenue: number
  cost: number
  profit: number
  orders: number
}

export interface StatusSlice {
  status: BatchStatus
  units: number
  batches: number
}

/** Worst first: the point of the bar is how much stock is at risk. */
const STATUS_ORDER: BatchStatus[] = ['expired', 'critical', 'ending', 'almost', 'ok']

const MONTHS_SHOWN = 6

export function useDashboard() {
  const inventory = useInventoryStore()
  const orders = useOrdersStore()
  const reference = useReferenceStore()
  const { convertBetween, costToDisplay } = useCurrency()

  const enriched = computed(() =>
    inventory.batches.map((b) => ({
      batch: b,
      status: batchStatus(b.expiry_date),
      daysLeft: daysUntil(b.expiry_date),
    })),
  )

  const stats = computed(() => {
    let expired = 0
    let critical = 0
    let expiredUnits = 0
    let criticalUnits = 0
    let stockValue = 0

    for (const { batch, status } of enriched.value) {
      const brand = reference.brandsById.get(batch.product?.brand_id ?? '') ?? null
      const unitCost = costToDisplay(batch.product?.cost_amount ?? 0, batch.product?.cost_currency ?? 'USD', brand)
      stockValue += batch.remaining_qty * unitCost
      if (status === 'expired') {
        expired += 1
        expiredUnits += batch.remaining_qty
      } else if (status === 'critical') {
        critical += 1
        criticalUnits += batch.remaining_qty
      }
    }

    // Each order's profit is snapshotted in its own currency; convert to
    // the active one before summing so the figure is coherent.
    const profit = orders.orders.reduce(
      (sum, o) =>
        sum +
        convertBetween(
          computeOrderTotals(o.items, o.delivery_cost, o.packaging_cost, o.discount).profit,
          o.currency,
        ),
      0,
    )

    const inStockPositions = new Set(
      inventory.batches.filter((b) => b.remaining_qty > 0).map((b) => b.product_id),
    ).size

    return {
      skuCount: inventory.products.length,
      inStockPositions,
      criticalWithin90: expired + critical,
      expiredCount: expired,
      criticalCount: critical,
      expiringUnits: expiredUnits + criticalUnits,
      criticalUnits,
      expiredUnits,
      stockValue,
      profit,
      ordersCount: orders.orders.length,
    }
  })

  const burning = computed<BurningRow[]>(() =>
    enriched.value
      .filter((e) => e.batch.expiry_date)
      .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
      .slice(0, 10)
      .map(({ batch, status, daysLeft }) => ({
        id: batch.id,
        name: batch.product?.name ?? '—',
        sku: batch.product?.sku ?? '',
        batch: batch.batch_number ?? '—',
        remaining: batch.remaining_qty,
        expiry: batch.expiry_date,
        status,
        daysLeft,
      })),
  )

  // Trade over the last six months, bucketed by the month the order was
  // placed. Every order is converted from the currency it was sold in, so the
  // bars stay comparable when a company sells in more than one.
  const monthly = computed<MonthTotals[]>(() => {
    const now = new Date()
    const buckets = new Map<string, MonthTotals>()

    for (let back = MONTHS_SHOWN - 1; back >= 0; back -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      buckets.set(key, {
        key,
        year: d.getFullYear(),
        month: d.getMonth(),
        revenue: 0,
        cost: 0,
        profit: 0,
        orders: 0,
      })
    }

    for (const order of orders.orders) {
      const bucket = buckets.get(order.created_at.slice(0, 7))
      if (!bucket) continue // older than the window
      const totals = computeOrderTotals(order.items, order.delivery_cost, order.packaging_cost, order.discount)
      bucket.revenue += convertBetween(totals.saleTotal, order.currency)
      bucket.cost += convertBetween(totals.costTotal, order.currency)
      bucket.profit += convertBetween(totals.profit, order.currency)
      bucket.orders += 1
    }

    return [...buckets.values()]
  })

  // How the units on the shelf split across expiry states. Batches with
  // nothing left are not stock, so they do not dilute the picture.
  const stockByStatus = computed<StatusSlice[]>(() => {
    const slices = new Map<BatchStatus, StatusSlice>(
      STATUS_ORDER.map((status) => [status, { status, units: 0, batches: 0 }]),
    )
    for (const { batch, status } of enriched.value) {
      if (batch.remaining_qty <= 0) continue
      const slice = slices.get(status)
      if (!slice) continue
      slice.units += batch.remaining_qty
      slice.batches += 1
    }
    return [...slices.values()]
  })

  return { stats, burning, monthly, stockByStatus }
}
