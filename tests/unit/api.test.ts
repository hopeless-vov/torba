import { beforeEach, describe, expect, it, vi } from 'vitest'

// A chainable, awaitable stand-in for the postgrest query builder: every
// method returns the same object, and awaiting it resolves to `result`.
function builder(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'order', 'single', 'maybeSingle']) {
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
    const brand = { id: 'b1', company_id: 'c1', name: 'X', usd_rate: 44 } as never
    mocked.from.mockReturnValue(builder({ data: { ...(brand as object), usd_rate: 45 }, error: null }) as never)
    const { brandsApi } = await import('@/api/brands')
    const updated = await brandsApi.updateRate(brand, 45)
    expect(mocked.from).toHaveBeenCalledWith('brands')
    expect(mocked.from).toHaveBeenCalledWith('rate_history')
    expect((updated as { usd_rate: number }).usd_rate).toBe(45)
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
