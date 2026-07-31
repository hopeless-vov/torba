import type { BatchRow } from '@/api/batches'
import { useWarehouse } from '@/composables/use-warehouse'
import uk from '@/locales/uk.json'
import { useInventoryStore } from '@/stores/inventory'
import { useUiStore } from '@/stores/ui'
import type { Product } from '@/types/database'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

const alpha = { id: 'p1', sku: 'A-1', name: 'Alpha', brand_id: 'b1' } as Product
const beta = { id: 'p2', sku: 'B-1', name: 'Beta', brand_id: 'b2' } as Product

// Far enough out that the expiry bucket stays 'ok' regardless of when the
// suite runs; the near dates below are deliberately already expired.
function batch(over: Partial<BatchRow> & { id: string }): BatchRow {
  return {
    company_id: 'c',
    product_id: 'p1',
    batch_number: 'A-1-01',
    delivery_date: '2026-01-01',
    expiry_date: '2999-01-01',
    received_qty: 10,
    remaining_qty: 10,
    created_at: '2026-01-01',
    product: { ...alpha, brand: null } as BatchRow['product'],
    ...over,
  } as BatchRow
}

// useWarehouse uses useI18n for toasts, so exercise it inside a component.
function harness() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const i18n = createI18n({ legacy: false, locale: 'uk', fallbackLocale: 'uk', messages: { uk } })
  let ctx!: {
    inventory: ReturnType<typeof useInventoryStore>
    ui: ReturnType<typeof useUiStore>
    warehouse: ReturnType<typeof useWarehouse>
  }
  mount(
    defineComponent({
      setup() {
        ctx = { inventory: useInventoryStore(), ui: useUiStore(), warehouse: useWarehouse() }
        return () => null
      },
    }),
    { global: { plugins: [pinia, i18n] } },
  )
  return ctx
}

describe('useWarehouse rows', () => {
  it('derives how many units were sold out of a batch', () => {
    const { inventory, warehouse } = harness()
    inventory.batches = [batch({ id: 'b-1', received_qty: 12, remaining_qty: 5 })]
    expect(warehouse.filtered.value[0].sold).toBe(7)
  })

  it('never reports a negative sold count', () => {
    const { inventory, warehouse } = harness()
    inventory.batches = [batch({ id: 'b-1', received_qty: 4, remaining_qty: 6 })]
    expect(warehouse.filtered.value[0].sold).toBe(0)
  })
})

describe('useWarehouse grouped', () => {
  it('totals every batch of the same product and keeps them per expiry', () => {
    const { inventory, warehouse } = harness()
    inventory.batches = [
      batch({ id: 'b-1', expiry_date: '2999-06-01', received_qty: 10, remaining_qty: 4 }),
      batch({ id: 'b-2', expiry_date: '2999-02-01', received_qty: 8, remaining_qty: 8 }),
    ]

    const [group] = warehouse.grouped.value
    expect(group.id).toBe('p1')
    expect(group.remaining).toBe(12)
    expect(group.received).toBe(18)
    expect(group.sold).toBe(6)
    expect(group.batchesCount).toBe(2)
    // FIFO: the soonest expiry leads, and it is what the group reports.
    expect(group.batches.map((b) => b.id)).toEqual(['b-2', 'b-1'])
    expect(group.nearestExpiry).toBe('2999-02-01')
  })

  it('groups each product separately', () => {
    const { inventory, warehouse } = harness()
    inventory.batches = [
      batch({ id: 'b-1' }),
      batch({ id: 'b-2', product_id: 'p2', product: { ...beta, brand: null } as BatchRow['product'] }),
    ]
    expect(warehouse.grouped.value).toHaveLength(2)
  })

  it('takes the worst status among the batches that still hold stock', () => {
    const { inventory, warehouse } = harness()
    inventory.batches = [
      batch({ id: 'b-fresh', expiry_date: '2999-01-01', remaining_qty: 5 }),
      batch({ id: 'b-expired', expiry_date: '2020-01-01', remaining_qty: 3 }),
    ]
    expect(warehouse.grouped.value[0].status).toBe('expired')
  })

  it('ignores sold-out batches when rating a product', () => {
    const { inventory, warehouse } = harness()
    inventory.batches = [
      batch({ id: 'b-fresh', expiry_date: '2999-01-01', remaining_qty: 5 }),
      batch({ id: 'b-expired', expiry_date: '2020-01-01', received_qty: 3, remaining_qty: 0 }),
    ]
    expect(warehouse.grouped.value[0].status).toBe('ok')
  })

  it('groups only what the filters left visible', () => {
    const { inventory, ui, warehouse } = harness()
    inventory.batches = [
      batch({ id: 'b-1', remaining_qty: 4 }),
      batch({ id: 'b-2', product_id: 'p2', product: { ...beta, brand: null } as BatchRow['product'] }),
    ]
    ui.search = 'alpha'

    expect(warehouse.grouped.value).toHaveLength(1)
    expect(warehouse.grouped.value[0].remaining).toBe(4)
  })
})
