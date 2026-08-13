import type { BatchRow } from '@/api/batches'
import type { OrderRow } from '@/api/orders'
import { useDashboard } from '@/composables/use-dashboard'
import uk from '@/locales/uk.json'
import { useAuthStore } from '@/stores/auth'
import { useCurrencyStore } from '@/stores/currency'
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
        useCurrencyStore().setCurrency('UAH')
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

function order(createdAt: string, qty: number, price: number, cost: number): OrderRow {
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

describe('useDashboard monthly', () => {
  it('always returns six buckets, oldest first, ending on the current month', () => {
    const { dashboard } = harness()
    const keys = dashboard.monthly.value.map((m) => m.key)
    expect(keys).toEqual(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'])
  })

  it('sums revenue, cost and profit into the month the order was placed', () => {
    const { orders, dashboard } = harness()
    orders.orders = [
      order('2026-08-02T10:00:00Z', 2, 100, 60), // revenue 200, cost 120, profit 80
      order('2026-08-20T10:00:00Z', 1, 50, 20), // revenue 50, cost 20, profit 30
      order('2026-07-01T10:00:00Z', 1, 10, 4),
    ]

    const august = dashboard.monthly.value.at(-1)!
    expect(august.revenue).toBeCloseTo(250, 4)
    expect(august.cost).toBeCloseTo(140, 4)
    expect(august.profit).toBeCloseTo(110, 4)
    expect(august.orders).toBe(2)

    const july = dashboard.monthly.value.at(-2)!
    expect(july.revenue).toBeCloseTo(10, 4)
    expect(july.orders).toBe(1)
  })

  // Anything before the window would otherwise land in the first bucket and
  // silently inflate it.
  it('ignores orders older than the window', () => {
    const { orders, dashboard } = harness()
    orders.orders = [order('2024-01-05T10:00:00Z', 5, 100, 10)]
    expect(dashboard.monthly.value.every((m) => m.orders === 0)).toBe(true)
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
