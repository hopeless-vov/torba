import { useCurrency } from '@/composables/use-currency'
import { useInventoryStore } from '@/stores/inventory'
import { useOrdersStore } from '@/stores/orders'
import { useReferenceStore } from '@/stores/reference'
import type { BatchStatus } from '@/types/models'
import { batchStatus, daysUntil } from '@/utils/batch-status'
import { computeOrderTotals } from '@/utils/orders'
import { computed, ref } from 'vue'

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

/** How wide one column of the trend chart is. */
export type Granularity = 'day' | 'month' | 'year'

/** One period of trade, in the active display currency. */
export interface PeriodTotals {
  /** 'YYYY-MM-DD' / 'YYYY-MM' / 'YYYY' — the view formats the visible label. */
  key: string
  year: number
  /** 0-indexed, ready for `new Date(year, month, day)`. */
  month: number
  day: number
  revenue: number
  cost: number
  profit: number
  orders: number
}

/** Inclusive 'YYYY-MM-DD' bounds, the same shape the orders filter uses. */
export interface DateRange {
  from: string
  to: string
}

export interface StatusSlice {
  status: BatchStatus
  units: number
  batches: number
}

/** Worst first: the point of the bar is how much stock is at risk. */
const STATUS_ORDER: BatchStatus[] = ['expired', 'critical', 'ending', 'almost', 'ok']

const DEFAULT_MONTHS_BACK = 6

// Where one column stops being readable. Under a month and a half a day per
// column is legible; past two years there are too many months to tell apart,
// so the columns become years.
const MAX_DAILY_SPAN = 45
const MAX_MONTHLY_SPAN = 730

const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** The range the dashboard opens on: this month and the five before it. */
export function defaultRange(now = new Date()): DateRange {
  const first = new Date(now.getFullYear(), now.getMonth() - (DEFAULT_MONTHS_BACK - 1), 1)
  return { from: isoDay(first), to: isoDay(now) }
}

/**
 * Bucket width for a span. Dates are compared as 'YYYY-MM-DD' strings
 * throughout — `created_at` is UTC and the bounds are plain days, so string
 * comparison keeps the two from disagreeing across a timezone offset.
 */
export function granularityFor(range: DateRange): Granularity {
  const from = Date.parse(`${range.from}T00:00:00Z`)
  const to = Date.parse(`${range.to}T00:00:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 'month'
  const days = Math.round((to - from) / 86_400_000) + 1
  if (days <= MAX_DAILY_SPAN) return 'day'
  if (days <= MAX_MONTHLY_SPAN) return 'month'
  return 'year'
}

/** Which bucket a 'YYYY-MM-DD' day falls into. */
function keyOf(day: string, granularity: Granularity) {
  if (granularity === 'day') return day
  return granularity === 'month' ? day.slice(0, 7) : day.slice(0, 4)
}

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

  // The window the trend chart covers. Editable from the dashboard; the
  // column width follows from how wide it is.
  const range = ref<DateRange>(defaultRange())
  const granularity = computed(() => granularityFor(range.value))

  function resetRange() {
    range.value = defaultRange()
  }

  // Trade over the chosen range, bucketed by when the order was placed. Empty
  // periods are kept so a gap reads as a gap rather than closing up. Every
  // order is converted from the currency it was sold in, so the bars stay
  // comparable when a company sells in more than one.
  const trend = computed<PeriodTotals[]>(() => {
    const { from, to } = range.value
    if (!from || !to || from > to) return []

    const step = granularity.value
    const buckets = new Map<string, PeriodTotals>()
    const end = new Date(`${to}T00:00:00Z`)
    const cursor = new Date(`${from}T00:00:00Z`)
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return []

    // Walk in UTC to match the keys, which come off `created_at` as strings.
    if (step === 'month') cursor.setUTCDate(1)
    if (step === 'year') { cursor.setUTCMonth(0); cursor.setUTCDate(1) }

    while (cursor <= end) {
      const key = keyOf(cursor.toISOString().slice(0, 10), step)
      buckets.set(key, {
        key,
        year: cursor.getUTCFullYear(),
        month: cursor.getUTCMonth(),
        day: cursor.getUTCDate(),
        revenue: 0,
        cost: 0,
        profit: 0,
        orders: 0,
      })
      if (step === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1)
      else if (step === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1)
      else cursor.setUTCFullYear(cursor.getUTCFullYear() + 1)
    }

    for (const order of orders.orders) {
      const day = order.created_at.slice(0, 10)
      if (day < from || day > to) continue
      const bucket = buckets.get(keyOf(day, step))
      if (!bucket) continue
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

  return { stats, burning, range, granularity, resetRange, trend, stockByStatus }
}
