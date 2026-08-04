import { useOrders } from '@/composables/use-orders'
import uk from '@/locales/uk.json'
import { useOrdersStore } from '@/stores/orders'
import type { OrderItem } from '@/types/database'
import type { OrderRow } from '@/api/orders'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

function order(id: string, createdAt: string): OrderRow {
  return {
    id,
    company_id: 'c',
    number: Number(id.replace(/\D/g, '')) || 1,
    client_id: null,
    status: 'new',
    payment_method: null,
    currency: 'UAH',
    tracking_number: null,
    delivery_address: null,
    delivery_cost: 0,
    packaging_cost: 0,
    note: null,
    created_at: createdAt,
    updated_at: createdAt,
    client: null,
    items: [] as OrderItem[],
  } as OrderRow
}

// useOrders uses useI18n for toasts, so exercise it inside a component.
function harness() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const i18n = createI18n({ legacy: false, locale: 'uk', fallbackLocale: 'uk', messages: { uk } })
  let ctx!: { store: ReturnType<typeof useOrdersStore>; orders: ReturnType<typeof useOrders> }
  mount(
    defineComponent({
      setup() {
        ctx = { store: useOrdersStore(), orders: useOrders() }
        return () => null
      },
    }),
    { global: { plugins: [pinia, i18n] } },
  )
  return ctx
}

describe('useOrders date range', () => {
  it('keeps every order when no bounds are set', () => {
    const { store, orders } = harness()
    store.orders = [order('o1', '2026-06-15T10:00:00Z'), order('o2', '2026-08-01T09:00:00Z')]
    expect(orders.filtered.value).toHaveLength(2)
  })

  it('includes both endpoints of the range', () => {
    const { store, orders } = harness()
    store.orders = [
      order('o1', '2026-07-01T00:00:00Z'),
      order('o2', '2026-07-15T12:00:00Z'),
      order('o3', '2026-07-31T23:59:00Z'),
    ]
    orders.fromDate.value = '2026-07-01'
    orders.toDate.value = '2026-07-31'
    expect(orders.filtered.value.map((o) => o.id)).toEqual(['o1', 'o2', 'o3'])
  })

  it('drops orders outside the range', () => {
    const { store, orders } = harness()
    store.orders = [order('o1', '2026-06-30T10:00:00Z'), order('o2', '2026-07-10T10:00:00Z')]
    orders.fromDate.value = '2026-07-01'
    expect(orders.filtered.value.map((o) => o.id)).toEqual(['o2'])

    orders.fromDate.value = ''
    orders.toDate.value = '2026-06-30'
    expect(orders.filtered.value.map((o) => o.id)).toEqual(['o1'])
  })

  it('returns nothing when the range has no orders', () => {
    const { store, orders } = harness()
    store.orders = [order('o1', '2026-06-30T10:00:00Z')]
    orders.fromDate.value = '2026-08-01'
    orders.toDate.value = '2026-08-31'
    expect(orders.filtered.value).toHaveLength(0)
  })
})
