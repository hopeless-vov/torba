import type { BatchRow } from '@/api/batches'
import type { ProductRow } from '@/api/products'
import { useInventoryStore } from '@/stores/inventory'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

// Saving one row puts that row back into the list instead of refetching the
// company, so the list has to end up in the state a fresh load would leave it.

function product(id: string, over: Partial<ProductRow> = {}): ProductRow {
  return { id, company_id: 'c', sku: id, name: id, is_active: true, ...over } as ProductRow
}

function batch(id: string, expiry: string | null, over: Partial<BatchRow> = {}): BatchRow {
  return { id, company_id: 'c', product_id: 'p1', expiry_date: expiry, remaining_qty: 5, ...over } as BatchRow
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('inventory store products', () => {
  it('replaces a row in place when it is already there', () => {
    const inventory = useInventoryStore()
    inventory.products = [product('p1', { name: 'Крем' }), product('p2')]

    inventory.upsertProduct(product('p1', { name: 'Крем оновлений' }))

    expect(inventory.products).toHaveLength(2)
    expect(inventory.products[0].name).toBe('Крем оновлений')
  })

  // `list` orders by created_at descending, so a new product belongs at the
  // front — where the user will look for what they just added.
  it('puts a new product at the front', () => {
    const inventory = useInventoryStore()
    inventory.products = [product('p1')]

    inventory.upsertProduct(product('p2'))

    expect(inventory.products.map((p) => p.id)).toEqual(['p2', 'p1'])
  })

  // Products cascade to their batches in the database. Leaving the batches
  // behind would show stock of a product that no longer exists.
  it('takes a deleted product’s batches off the shelf with it', () => {
    const inventory = useInventoryStore()
    inventory.products = [product('p1'), product('p2')]
    inventory.batches = [
      batch('b1', '2027-01-01', { product_id: 'p1' }),
      batch('b2', '2027-02-01', { product_id: 'p2' }),
    ]

    inventory.removeProducts(['p1'])

    expect(inventory.products.map((p) => p.id)).toEqual(['p2'])
    expect(inventory.batches.map((b) => b.id)).toEqual(['b2'])
  })

  it('drops several products at once', () => {
    const inventory = useInventoryStore()
    inventory.products = [product('p1'), product('p2'), product('p3')]

    inventory.removeProducts(['p1', 'p3'])

    expect(inventory.products.map((p) => p.id)).toEqual(['p2'])
  })
})

describe('inventory store batches', () => {
  // `list` orders by expiry, undated last — the FIFO order the warehouse and
  // the cart both read, so a patched-in batch has to land in its place.
  it('keeps the shelf ordered by expiry, undated last', () => {
    const inventory = useInventoryStore()
    inventory.batches = [batch('b1', '2027-01-01'), batch('b2', null)]

    inventory.upsertBatch(batch('b3', '2026-06-01'))

    expect(inventory.batches.map((b) => b.id)).toEqual(['b3', 'b1', 'b2'])
  })

  it('re-sorts when an expiry date is corrected', () => {
    const inventory = useInventoryStore()
    inventory.batches = [batch('b1', '2026-01-01'), batch('b2', '2026-02-01')]

    inventory.upsertBatch(batch('b1', '2026-03-01'))

    expect(inventory.batches.map((b) => b.id)).toEqual(['b2', 'b1'])
    expect(inventory.batches).toHaveLength(2)
  })

  it('drops only the batches it was given', () => {
    const inventory = useInventoryStore()
    inventory.batches = [batch('b1', '2026-01-01'), batch('b2', '2026-02-01')]

    inventory.removeBatches(['b1'])

    expect(inventory.batches.map((b) => b.id)).toEqual(['b2'])
  })

  it('reflects a patched batch in the per-product stock', () => {
    const inventory = useInventoryStore()
    inventory.batches = [batch('b1', '2026-01-01', { remaining_qty: 4 })]

    inventory.upsertBatch(batch('b1', '2026-01-01', { remaining_qty: 9 }))

    expect(inventory.stockByProduct.get('p1')).toBe(9)
  })
})
