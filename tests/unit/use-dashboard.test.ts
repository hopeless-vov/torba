import type { BatchRow } from '@/api/batches'
import type { OrderRow } from '@/api/orders'
import { useDashboard } from '@/composables/use-dashboard'
import uk from '@/locales/uk.json'
import { useAuthStore } from '@/stores/auth'
import { useInventoryStore } from '@/stores/inventory'
import { useOrdersStore } from '@/stores/orders'
import type { Company, OrderItem } from '@/types/database'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The month buckets are relative to "now", so the clock is pinned — otherwise
// the test would drift into a different window every month.
const NOW = new Date('2026-08-13T10:00:00Z')

function harness() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const i18n = createI18n({ legacy: false, locale: 'uk', fallbackLocale: 'uk', messages: { uk } })
  let ctx!: {
    inventory: ReturnType<typeof useInventoryStore>
    orders: ReturnType<typeof useOrdersStore>
    dashboard: ReturnType<typeof useDashboard>
  }
  mount(
    defineComponent({
      setup() {
        const auth = useAuthStore()
        auth.memberships = [
          {
            company_id: 'c',
            user_id: 'u',
            role: 'owner',
            created_at: '',
            company: { id: 'c', name: '', base_currency: 'UAH' } as Company,
          },
        ]
        auth.activeCompanyId = 'c'
        ctx = { inventory: useInventoryStore(), orders: useOrdersStore(), dashboard: useDashboard() }
        return () => null
      },
    }),
    { global: { plugins: [pinia, i18n] } },
  )
  return ctx
}

function order(
  createdAt: string,
  qty: number,
  price: number,
  cost: number,
  extras: Partial<OrderRow> = {},
): OrderRow {
  return {
    id: `o-${createdAt}`,
    company_id: 'c',
    number: 1,
    client_id: null,
    status: 'done',
    payment_method: null,
    currency: 'UAH',
    delivery_cost: 0,
    packaging_cost: 0,
    discount: 0,
    created_at: createdAt,
    client: null,
    items: [{ qty, unit_price: price, unit_cost: cost } as OrderItem],
    ...extras,
  } as unknown as OrderRow
}

function batch(id: string, expiry: string | null, remaining: number): BatchRow {
  return { id, product_id: 'p1', expiry_date: expiry, remaining_qty: remaining } as BatchRow
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDashboard trend', () => {
  it('opens on the last six months, oldest first, ending on the current one', () => {
    const { dashboard } = harness()
    expect(dashboard.range.value).toEqual({ from: '2026-03-01', to: '2026-08-13' })
    expect(dashboard.granularity.value).toBe('month')
    expect(dashboard.trend.value.map((m) => m.key)).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ])
  })

  it('sums revenue, cost and profit into the month the order was placed', () => {
    const { orders, dashboard } = harness()
    orders.orders = [
      order('2026-08-02T10:00:00Z', 2, 100, 60), // revenue 200, cost 120, profit 80
      order('2026-08-10T10:00:00Z', 1, 50, 20), // revenue 50, cost 20, profit 30
      order('2026-07-01T10:00:00Z', 1, 10, 4),
    ]

    const august = dashboard.trend.value.at(-1)!
    expect(august.revenue).toBeCloseTo(250, 4)
    expect(august.cost).toBeCloseTo(140, 4)
    expect(august.profit).toBeCloseTo(110, 4)
    expect(august.orders).toBe(2)

    const july = dashboard.trend.value.at(-2)!
    expect(july.revenue).toBeCloseTo(10, 4)
    expect(july.orders).toBe(1)
  })

  // Anything outside the window would otherwise land in an edge bucket and
  // silently inflate it.
  it('ignores orders outside the chosen range', () => {
    const { orders, dashboard } = harness()
    orders.orders = [
      order('2024-01-05T10:00:00Z', 5, 100, 10), // before
      order('2026-08-31T10:00:00Z', 5, 100, 10), // after the default `to`
    ]
    expect(dashboard.trend.value.every((m) => m.orders === 0)).toBe(true)
  })

  it('follows a range the user picks', () => {
    const { orders, dashboard } = harness()
    orders.orders = [order('2025-04-10T10:00:00Z', 1, 100, 40)]
    dashboard.range.value = { from: '2025-03-01', to: '2025-05-31' }

    expect(dashboard.trend.value.map((m) => m.key)).toEqual(['2025-03', '2025-04', '2025-05'])
    expect(dashboard.trend.value[1].orders).toBe(1)
  })

  // A short window with one bar per month would say almost nothing, so the
  // columns become days; a very wide one would be unreadable by month.
  it('picks the bucket width from how wide the range is', () => {
    const { dashboard } = harness()

    dashboard.range.value = { from: '2026-08-01', to: '2026-08-07' }
    expect(dashboard.granularity.value).toBe('day')
    expect(dashboard.trend.value.map((d) => d.key)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ])

    dashboard.range.value = { from: '2020-01-01', to: '2026-08-13' }
    expect(dashboard.granularity.value).toBe('year')
    expect(dashboard.trend.value.map((d) => d.key)).toEqual([
      '2020',
      '2021',
      '2022',
      '2023',
      '2024',
      '2025',
      '2026',
    ])
  })

  // Buckets start at the period boundary even when the range starts mid-way,
  // so a column always covers a whole month/year.
  it('snaps the first bucket to the start of its period', () => {
    const { dashboard } = harness()
    dashboard.range.value = { from: '2026-01-17', to: '2026-04-02' }
    expect(dashboard.granularity.value).toBe('month')
    expect(dashboard.trend.value.map((m) => m.key)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ])
  })

  it('draws nothing when the range runs backwards', () => {
    const { dashboard } = harness()
    dashboard.range.value = { from: '2026-08-01', to: '2026-07-01' }
    expect(dashboard.trend.value).toEqual([])
  })

  it('goes back to the default six months on reset', () => {
    const { dashboard } = harness()
    dashboard.range.value = { from: '2020-01-01', to: '2020-02-01' }
    dashboard.resetRange()
    expect(dashboard.range.value).toEqual({ from: '2026-03-01', to: '2026-08-13' })
  })
})

describe('useDashboard stockByStatus', () => {
  it('splits units on hand across the expiry states', () => {
    const { inventory, dashboard } = harness()
    inventory.batches = [
      batch('b1', '2026-01-01', 4), // past → expired
      batch('b2', '2026-09-15', 10), // 33 days → critical (≤90)
      batch('b3', '2027-06-01', 7), // 292 days → almost (≤365)
      batch('b4', null, 3), // undated batches carry no risk → ok
      batch('b5', '2029-01-01', 5), // beyond a year → ok
    ]

    const by = Object.fromEntries(dashboard.stockByStatus.value.map((s) => [s.status, s]))
    expect(by.expired.units).toBe(4)
    expect(by.critical.units).toBe(10)
    expect(by.almost.units).toBe(7)
    expect(by.ok.units).toBe(8) // 3 undated + 5 far out
    expect(by.ok.batches).toBe(2)
    expect(by.ending.units).toBe(0)
  })

  // A batch with nothing left is not stock; counting it would misreport how
  // much is actually at risk.
  it('leaves out batches with nothing remaining', () => {
    const { inventory, dashboard } = harness()
    inventory.batches = [batch('b1', '2026-01-01', 0), batch('b2', '2026-01-02', 6)]
    const expired = dashboard.stockByStatus.value.find((s) => s.status === 'expired')!
    expect(expired.units).toBe(6)
    expect(expired.batches).toBe(1)
  })

  it('keeps every state in a stable, worst-first order', () => {
    const { dashboard } = harness()
    expect(dashboard.stockByStatus.value.map((s) => s.status)).toEqual([
      'expired',
      'critical',
      'ending',
      'almost',
      'ok',
    ])
  })
})

describe('useDashboard burning', () => {
  it('puts the soonest expiry at the top', () => {
    const { inventory, dashboard } = harness()
    inventory.batches = [batch('b1', '2027-01-01', 5), batch('b2', '2026-09-01', 2)]
    expect(dashboard.burning.value.map((r) => r.id)).toEqual(['b2', 'b1'])
  })

  // Selling the last unit closes the batch: there is no shelf life left to
  // report, so it leaves the table instead of sitting in it at zero.
  it('drops a batch once it is sold out', () => {
    const { inventory, dashboard } = harness()
    inventory.batches = [batch('b1', '2026-01-01', 0), batch('b2', '2026-09-01', 2)]
    expect(dashboard.burning.value.map((r) => r.id)).toEqual(['b2'])
  })
})

describe('useDashboard stats', () => {
  it('counts only the stock that can still go off', () => {
    const { inventory, dashboard } = harness()
    inventory.batches = [
      batch('b1', '2026-01-01', 0), // expired, but sold to the last unit
      batch('b2', '2026-01-02', 4), // expired and still on the shelf
      batch('b3', '2026-09-15', 6), // 33 days → critical
      batch('b4', '2029-01-01', 9), // years out
    ]

    const stats = dashboard.stats.value
    expect(stats.expiredCount).toBe(1)
    expect(stats.criticalCount).toBe(1)
    expect(stats.criticalWithin90).toBe(2)
    expect(stats.expiringUnits).toBe(10)
  })
})

describe('useDashboard spending', () => {
  it('splits what the period cost into goods, packaging and delivery', () => {
    const { orders, dashboard } = harness()
    orders.orders = [
      order('2026-07-10T10:00:00Z', 2, 500, 300, { delivery_cost: 80, packaging_cost: 20 }),
      order('2026-08-01T10:00:00Z', 1, 400, 250, { delivery_cost: 60, packaging_cost: 15 }),
    ]

    expect(dashboard.spending.value).toEqual({
      goods: 850, // 2 × 300 + 250
      packaging: 35,
      delivery: 140,
      total: 1025,
    })
  })

  // The split answers for the same window as the chart above it, so an older
  // order must not creep into the total.
  it('counts only the orders inside the range', () => {
    const { orders, dashboard } = harness()
    orders.orders = [
      order('2026-01-05T10:00:00Z', 1, 500, 300, { delivery_cost: 80, packaging_cost: 20 }),
      order('2026-08-01T10:00:00Z', 1, 400, 250, { delivery_cost: 60, packaging_cost: 15 }),
    ]

    expect(dashboard.spending.value.total).toBe(325)

    dashboard.range.value = { from: '2026-01-01', to: '2026-08-13' }
    expect(dashboard.spending.value.total).toBe(725)
  })

  // A discount comes off the sale, never off what was already paid out.
  it('leaves the order discount out of the cost', () => {
    const { orders, dashboard } = harness()
    orders.orders = [
      order('2026-08-01T10:00:00Z', 1, 400, 250, { delivery_cost: 60, packaging_cost: 15, discount: 50 }),
    ]

    expect(dashboard.spending.value.total).toBe(325)
  })

  it('counts nothing when the range runs backwards', () => {
    const { orders, dashboard } = harness()
    orders.orders = [order('2026-08-01T10:00:00Z', 1, 400, 250, { delivery_cost: 60, packaging_cost: 15 })]
    dashboard.range.value = { from: '2026-08-10', to: '2026-08-01' }

    expect(dashboard.spending.value.total).toBe(0)
  })
})

describe('useDashboard stock value', () => {
  // Stock is worth what it cost, and two deliveries of one product can have
  // cost different money — the promotional one must not be valued at the
  // catalogue price it never sold at.
  function priced(id: string, remaining: number, cost: number | null): BatchRow {
    return {
      id,
      product_id: 'p1',
      expiry_date: '2027-01-01',
      remaining_qty: remaining,
      cost_amount: cost,
      cost_currency: cost == null ? null : 'UAH',
      product: {
        id: 'p1',
        brand_id: null,
        cost_amount: 1500,
        cost_currency: 'UAH',
        brand: null,
      },
    } as unknown as BatchRow
  }

  it('values each batch at its own purchase price', () => {
    const { inventory, dashboard } = harness()
    inventory.batches = [priced('b1', 2, 1192), priced('b2', 3, 1500)]

    expect(dashboard.stats.value.stockValue).toBe(2 * 1192 + 3 * 1500)
  })

  it('values a batch without a price of its own at the catalogue price', () => {
    const { inventory, dashboard } = harness()
    inventory.batches = [priced('b1', 2, null)]

    expect(dashboard.stats.value.stockValue).toBe(3000)
  })
})
