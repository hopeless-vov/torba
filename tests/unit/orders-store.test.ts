import type { OrderRow } from '@/api/orders'
import { ordersApi } from '@/api/orders'
import { useOrdersStore } from '@/stores/orders'
import { periodStart } from '@/utils/period'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/orders', () => ({ ordersApi: { list: vi.fn(async () => []) } }))

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

describe('orders store window', () => {
  it('opens on the last few months rather than the whole history', async () => {
    const orders = useOrdersStore()
    await orders.load('c')

    expect(ordersApi.list).toHaveBeenCalledWith('c', periodStart())
    expect(orders.loadedFrom).toBe(periodStart())
  })

  it('leaves a window that already covers the day alone', async () => {
    const orders = useOrdersStore()
    await orders.load('c', '2026-01-01')
    vi.mocked(ordersApi.list).mockClear()

    await orders.ensureFrom('c', '2026-05-01')

    expect(ordersApi.list).not.toHaveBeenCalled()
  })

  // A chart pointed at an older period, or a filter set to an earlier day,
  // must not be answered out of what happens to be loaded.
  it('widens backwards when an earlier day is asked for', async () => {
    const orders = useOrdersStore()
    await orders.load('c', '2026-01-01')
    vi.mocked(ordersApi.list).mockClear()

    await orders.ensureFrom('c', '2025-03-01')

    expect(ordersApi.list).toHaveBeenCalledWith('c', '2025-03-01')
    expect(orders.loadedFrom).toBe('2025-03-01')
  })

  it('reads the whole history when asked for no bound at all', async () => {
    const orders = useOrdersStore()
    await orders.load('c', '2026-01-01')
    vi.mocked(ordersApi.list).mockClear()

    await orders.ensureFrom('c', null)
    expect(ordersApi.list).toHaveBeenCalledWith('c', null)
    expect(orders.loadedFrom).toBeNull()

    // Everything is in; nothing can be missing after this.
    vi.mocked(ordersApi.list).mockClear()
    await orders.ensureFrom('c', '2020-01-01')
    expect(ordersApi.list).not.toHaveBeenCalled()
  })
})
