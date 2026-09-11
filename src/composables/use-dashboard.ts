import { useCurrency } from '@/composables/use-currency'
import { useAuthStore } from '@/stores/auth'
import { useInventoryStore } from '@/stores/inventory'
import { useOrdersStore } from '@/stores/orders'
import type { BatchStatus } from '@/types/models'
import { batchStatus, daysUntil } from '@/utils/batch-status'
import { computeOrderTotals } from '@/utils/orders'
import { DEFAULT_MONTHS_BACK, isoDay, periodStart } from '@/utils/period'
import { computed, ref, watch } from 'vue'

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

/** One period of trade, in the base currency. */
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

/** Where the money of a period went, in the base currency. */
export interface Spending {
  /** What the goods themselves cost — the sum of the lines' unit costs. */
  goods: number
  packaging: number
  delivery: number
  total: number
}

export interface StatusSlice {
  status: BatchStatus
  units: number
  batches: number
}

/** Worst first: the point of the bar is how much stock is at risk. */
const STATUS_ORDER: BatchStatus[] = ['expired', 'critical', 'ending', 'almost', 'ok']

// Where one column stops being readable. Under a month and a half a day per
// column is legible; past two years there are too many months to tell apart,
// so the columns become years.
const MAX_DAILY_SPAN = 45
const MAX_MONTHLY_SPAN = 730

/** The range the dashboard opens on: this month and the five before it. */
export function defaultRange(now = new Date()): DateRange {
  return { from: periodStart(DEFAULT_MONTHS_BACK, now), to: isoDay(now) }
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
  const auth = useAuthStore()
  const orders = useOrdersStore()
  const { costInBase } = useCurrency()

  // A sold-out batch is history, not stock: nothing is left on the shelf to
  // go off, so it raises no warning, takes no place in the expiry table and
  // does not dilute the mix. Everything below counts what can still be sold.
  const onShelf = computed(() =>
    inventory.batches
      .filter((b) => b.remaining_qty > 0)
      .map((b) => ({
        batch: b,
        status: batchStatus(b.expiry_date),
        daysLeft: daysUntil(b.expiry_date),
      })),
  )

  // The window the trend chart covers. Editable from the dashboard; the
  // column width follows from how wide it is.
  const range = ref<DateRange>(defaultRange())
  const granularity = computed(() => granularityFor(range.value))

  function resetRange() {
    range.value = defaultRange()
  }

  // Everything sold inside the window, shared by the chart, the figures and
  // the spending split so they can never disagree about what "the period" is.
  const ordersInRange = computed(() => {
    const { from, to } = range.value
    if (!from || !to || from > to) return []
    return orders.orders.filter((o) => {
      const day = o.created_at.slice(0, 10)
      return day >= from && day <= to
    })
  })

  // The store holds a recent window, not the whole history. Pointing the chart
  // at an older period has to fetch it, or the columns would quietly show a
  // month as empty when it was only unloaded.
  watch(
    () => range.value.from,
    (from) => {
      if (auth.companyId) void orders.ensureFrom(auth.companyId, from)
    },
    { immediate: true },
  )

  const stats = computed(() => {
    let expired = 0
    let critical = 0
    let expiredUnits = 0
    let criticalUnits = 0
    let stockValue = 0
    let unpriced = 0

    for (const { batch, status } of onShelf.value) {
      // Each batch at its own purchase price: a promotional delivery is worth
      // what it cost, not what the catalogue says the product costs. A batch
      // whose supplier rate is missing cannot be valued; it is counted apart
      // instead of passing for worthless.
      const unitCost = batch.product ? costInBase(batch.product, batch) : null
      if (unitCost == null) unpriced += 1
      else stockValue += batch.remaining_qty * unitCost
      if (status === 'expired') {
        expired += 1
        expiredUnits += batch.remaining_qty
      } else if (status === 'critical') {
        critical += 1
        criticalUnits += batch.remaining_qty
      }
    }

    // Orders are all in the base, so profit adds up as it is. The period is
    // the chart's, not "everything loaded" — which is a window now.
    const profit = ordersInRange.value.reduce(
      (sum, o) => sum + computeOrderTotals(o.items, o.delivery_cost, o.packaging_cost, o.discount).profit,
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
      unpriced,
      profit,
      ordersCount: ordersInRange.value.length,
    }
  })

  const burning = computed<BurningRow[]>(() =>
    onShelf.value
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

    for (const order of ordersInRange.value) {
      const bucket = buckets.get(keyOf(order.created_at.slice(0, 10), step))
      if (!bucket) continue
      const totals = computeOrderTotals(order.items, order.delivery_cost, order.packaging_cost, order.discount)
      bucket.revenue += totals.saleTotal
      bucket.cost += totals.costTotal
      bucket.profit += totals.profit
      bucket.orders += 1
    }

    return [...buckets.values()]
  })

  // The cost side of the trend chart, broken into where the money actually
  // went. Goods are what was bought to fill the orders; delivery and packaging
  // are the company's own outlay on top, tracked per order and worth seeing
  // apart — they are the two a business can act on without touching supply.
  const spending = computed<Spending>(() => {
    let goods = 0
    let packaging = 0
    let delivery = 0

    for (const order of ordersInRange.value) {
      const totals = computeOrderTotals(order.items, order.delivery_cost, order.packaging_cost, order.discount)
      goods += totals.goodsCost
      packaging += order.packaging_cost
      delivery += order.delivery_cost
    }

    return { goods, packaging, delivery, total: goods + packaging + delivery }
  })

  // How the units on the shelf split across expiry states.
  const stockByStatus = computed<StatusSlice[]>(() => {
    const slices = new Map<BatchStatus, StatusSlice>(
      STATUS_ORDER.map((status) => [status, { status, units: 0, batches: 0 }]),
    )
    for (const { batch, status } of onShelf.value) {
      const slice = slices.get(status)
      if (!slice) continue
      slice.units += batch.remaining_qty
      slice.batches += 1
    }
    return [...slices.values()]
  })

  return { stats, burning, range, granularity, resetRange, trend, spending, stockByStatus }
}
