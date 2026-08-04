import { beforeEach, describe, expect, it, vi } from 'vitest'

// A chainable, awaitable stand-in for the postgrest query builder: every
// method returns the same object, and awaiting it resolves to `result`.
function builder(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'in', 'order', 'single', 'maybeSingle']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = (resolve: (value: unknown) => unknown) => resolve(result)
  return chain
}

vi.mock('@/api/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
  },
}))

import { supabase } from '@/api/supabase'

const mocked = vi.mocked(supabase, true)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('productsApi', () => {
  it('lists products for a company', async () => {
    const rows = [{ id: 'p1' }]
    mocked.from.mockReturnValue(builder({ data: rows, error: null }) as never)
    const { productsApi } = await import('@/api/products')
    const result = await productsApi.list('company-1')
    expect(mocked.from).toHaveBeenCalledWith('products')
    expect(result).toEqual(rows)
  })

  it('short-circuits an empty bulk upsert without a request', async () => {
    const { productsApi } = await import('@/api/products')
    const result = await productsApi.bulkUpsert([])
    expect(result).toEqual([])
    expect(mocked.from).not.toHaveBeenCalled()
  })

  it('throws on a query error', async () => {
    mocked.from.mockReturnValue(builder({ data: null, error: new Error('boom') }) as never)
    const { productsApi } = await import('@/api/products')
    await expect(productsApi.list('company-1')).rejects.toThrow('boom')
  })
})

describe('brandsApi.updateRate', () => {
  it('updates the brand and records history', async () => {
    const brand = { id: 'b1', company_id: 'c1', name: 'X', catalog_currency: 'USD', supplier_rate: 44 } as never
    mocked.from.mockReturnValue(builder({ data: { ...(brand as object), supplier_rate: 45 }, error: null }) as never)
    const { brandsApi } = await import('@/api/brands')
    const updated = await brandsApi.updateRate(brand, 45)
    expect(mocked.from).toHaveBeenCalledWith('brands')
    expect(mocked.from).toHaveBeenCalledWith('rate_history')
    expect((updated as { supplier_rate: number }).supplier_rate).toBe(45)
  })
})

describe('productsApi.removeMany', () => {
  it('deletes every id in one request', async () => {
    const chain = builder({ data: null, error: null })
    mocked.from.mockReturnValue(chain as never)
    const { productsApi } = await import('@/api/products')
    await productsApi.removeMany(['p1', 'p2'])
    expect(chain.in).toHaveBeenCalledWith('id', ['p1', 'p2'])
  })

  it('skips the request when nothing is selected', async () => {
    const { productsApi } = await import('@/api/products')
    await productsApi.removeMany([])
    expect(mocked.from).not.toHaveBeenCalled()
  })
})

describe('ordersApi.nextNumber', () => {
  it('reads the next number via rpc', async () => {
    mocked.rpc.mockResolvedValue({ data: 2044, error: null } as never)
    const { ordersApi } = await import('@/api/orders')
    const number = await ordersApi.nextNumber('c1')
    expect(mocked.rpc).toHaveBeenCalledWith('next_order_number', { p_company_id: 'c1' })
    expect(number).toBe(2044)
  })
})

describe('ordersApi.place', () => {
  it('passes the delivery address through to create_order', async () => {
    mocked.rpc.mockResolvedValue({ data: 'order-1', error: null } as never)
    const { ordersApi } = await import('@/api/orders')
    await ordersApi.place({
      clientId: 'cl1',
      paymentMethod: 'Готівка',
      currency: 'UAH',
      deliveryAddress: 'Львів, НП №30',
      items: [],
    })
    expect(mocked.rpc).toHaveBeenCalledWith('create_order', {
      p_client_id: 'cl1',
      p_payment_method: 'Готівка',
      p_currency: 'UAH',
      p_items: [],
      p_delivery_address: 'Львів, НП №30',
      p_discount: 0,
    })
  })

  it('sends a null address when none was given', async () => {
    mocked.rpc.mockResolvedValue({ data: 'order-1', error: null } as never)
    const { ordersApi } = await import('@/api/orders')
    await ordersApi.place({ clientId: null, paymentMethod: null, currency: 'UAH', items: [] })
    expect(mocked.rpc.mock.calls[0][1]).toMatchObject({ p_delivery_address: null })
  })
})

describe('ordersApi deletion', () => {
  it('goes through delete_orders so stock is restored', async () => {
    mocked.rpc.mockResolvedValue({ data: 2, error: null } as never)
    const { ordersApi } = await import('@/api/orders')
    const deleted = await ordersApi.removeMany(['o1', 'o2'])
    expect(mocked.rpc).toHaveBeenCalledWith('delete_orders', { p_ids: ['o1', 'o2'] })
    expect(deleted).toBe(2)
  })

  it('routes a single delete through the same rpc', async () => {
    mocked.rpc.mockResolvedValue({ data: 1, error: null } as never)
    const { ordersApi } = await import('@/api/orders')
    await ordersApi.remove('o1')
    expect(mocked.rpc).toHaveBeenCalledWith('delete_orders', { p_ids: ['o1'] })
  })

  it('skips the request when nothing is selected', async () => {
    const { ordersApi } = await import('@/api/orders')
    await ordersApi.removeMany([])
    expect(mocked.rpc).not.toHaveBeenCalled()
  })
})

describe('currenciesApi', () => {
  it('lists the company currencies by code', async () => {
    const chain = builder({ data: [{ id: 'cur1', code: 'EUR' }], error: null })
    mocked.from.mockReturnValue(chain as never)
    const { currenciesApi } = await import('@/api/currencies')
    const result = await currenciesApi.list('c1')
    expect(mocked.from).toHaveBeenCalledWith('currencies')
    expect(chain.eq).toHaveBeenCalledWith('company_id', 'c1')
    expect(result).toEqual([{ id: 'cur1', code: 'EUR' }])
  })
})

describe('authApi.signIn', () => {
  it('returns the session on success', async () => {
    const session = { access_token: 'tok' }
    mocked.auth.signInWithPassword.mockResolvedValue({ data: { session }, error: null } as never)
    const { authApi } = await import('@/api/auth')
    const result = await authApi.signIn('a@b.co', 'pw')
    expect(result).toEqual(session)
  })

  it('throws on an auth error', async () => {
    mocked.auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: new Error('Invalid login credentials'),
    } as never)
    const { authApi } = await import('@/api/auth')
    await expect(authApi.signIn('a@b.co', 'bad')).rejects.toThrow('Invalid login credentials')
  })
})
