import type { OrderRow } from '@/api/orders'
import { useOrdersStore } from '@/stores/orders'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

// A placed or edited order goes back into the list on its own; the whole list
// is only ever read again when the user asks for a period it does not cover.

function order(id: string, over: Partial<OrderRow> = {}): OrderRow {
  return {
    id,
    company_id: 'c',
    number: 1,
    status: 'new',
    currency: 'UAH',
    created_at: '2026-08-01T10:00:00Z',
    client: null,
    items: [],
    ...over,
  } as OrderRow
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('orders store', () => {
  it('replaces an edited order where it already sits', () => {
    const orders = useOrdersStore()
    orders.orders = [order('o1', { status: 'new' }), order('o2')]

    orders.upsert(order('o1', { status: 'done' }))

    expect(orders.orders).toHaveLength(2)
    expect(orders.orders[0].status).toBe('done')
  })

  // The list is newest first, and that is where the user looks for the sale
  // they have just made.
  it('puts a newly placed order at the front', () => {
    const orders = useOrdersStore()
    orders.orders = [order('o1')]

    orders.upsert(order('o2'))

    expect(orders.orders.map((o) => o.id)).toEqual(['o2', 'o1'])
  })

  it('drops every id it is given', () => {
    const orders = useOrdersStore()
    orders.orders = [order('o1'), order('o2'), order('o3')]

    orders.removeLocal(['o1', 'o3'])

    expect(orders.orders.map((o) => o.id)).toEqual(['o2'])
  })
})
