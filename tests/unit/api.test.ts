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

describe('supplierRatesApi.set', () => {
  // One cell of the matrix: created the first time, updated after. The
  // history row is the database's job (a trigger), so it is not written here.
  it('upserts on supplier and currency', async () => {
    const chain = builder({ data: { id: 'r1', rate: 41.5 }, error: null })
    mocked.from.mockReturnValue(chain as never)
    const { supplierRatesApi } = await import('@/api/supplier-rates')
    const row = { company_id: 'c1', brand_id: 'b1', currency: 'USD', rate: 41.5 }
    await supplierRatesApi.set(row)
    expect(mocked.from).toHaveBeenCalledWith('supplier_rates')
    expect(mocked.from).not.toHaveBeenCalledWith('rate_history')
    expect(chain.upsert).toHaveBeenCalledWith(row, { onConflict: 'brand_id,currency' })
  })
})

describe('platformCurrenciesApi', () => {
  it('reads the list the platform keeps', async () => {
    const chain = builder({ data: [{ code: 'UAH' }], error: null })
    mocked.from.mockReturnValue(chain as never)
    const { platformCurrenciesApi } = await import('@/api/platform-currencies')
    expect(await platformCurrenciesApi.list()).toEqual([{ code: 'UAH' }])
    expect(mocked.from).toHaveBeenCalledWith('platform_currencies')
  })
})

describe('currency rpcs', () => {
  it('puts a currency on the platform list', async () => {
    mocked.rpc.mockResolvedValue({ data: { code: 'PLN', symbol: 'zł' }, error: null } as never)
    const { platformCurrenciesApi } = await import('@/api/platform-currencies')
    expect(await platformCurrenciesApi.ensure('PLN', 'zł')).toEqual({ code: 'PLN', symbol: 'zł' })
    expect(mocked.rpc).toHaveBeenCalledWith('ensure_platform_currency', { p_code: 'PLN', p_symbol: 'zł' })
  })

  it('moves the base with the rate its orders convert at', async () => {
    mocked.rpc.mockResolvedValue({ data: { id: 'c1', base_currency: 'USD' }, error: null } as never)
    const { profileApi } = await import('@/api/profile')
    expect(await profileApi.changeBaseCurrency('c1', 'USD', 0.024)).toEqual({ id: 'c1', base_currency: 'USD' })
    expect(mocked.rpc).toHaveBeenCalledWith('change_base_currency', { p_company_id: 'c1', p_code: 'USD', p_rate: 0.024 })
  })

  it('throws what the database refuses with', async () => {
    mocked.rpc.mockResolvedValue({ data: null, error: { message: 'base_currency_rate_required' } } as never)
    const { profileApi } = await import('@/api/profile')
    await expect(profileApi.changeBaseCurrency('c1', 'USD', null)).rejects.toMatchObject({
      message: 'base_currency_rate_required',
    })
  })
})

describe('ordersApi.count', () => {
  it('asks for a count only, not the rows', async () => {
    const chain = builder({ data: null, error: null, count: 3 } as never)
    mocked.from.mockReturnValue(chain as never)
    const { ordersApi } = await import('@/api/orders')
    expect(await ordersApi.count('c1')).toBe(3)
    expect(chain.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
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

describe('membershipsApi', () => {
  it('lists the user’s organizations with their company joined', async () => {
    const rows = [{ company_id: 'c1', user_id: 'u1', role: 'owner', company: { id: 'c1', name: 'Mine' } }]
    const chain = builder({ data: rows, error: null })
    mocked.from.mockReturnValue(chain as never)
    const { membershipsApi } = await import('@/api/memberships')
    const result = await membershipsApi.listForUser('u1')
    expect(mocked.from).toHaveBeenCalledWith('memberships')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'u1')
    expect(result).toEqual(rows)
  })

  // RLS could in principle hide the company behind a membership; a row with no
  // company would blow up every consumer that reads `company.name`.
  it('drops a membership whose company did not come back', async () => {
    const rows = [
      { company_id: 'c1', company: { id: 'c1', name: 'Mine' } },
      { company_id: 'c2', company: null },
    ]
    mocked.from.mockReturnValue(builder({ data: rows, error: null }) as never)
    const { membershipsApi } = await import('@/api/memberships')
    const result = await membershipsApi.listForUser('u1')
    expect(result).toHaveLength(1)
    expect(result[0].company_id).toBe('c1')
  })
})

describe('ordersApi.place', () => {
  it('passes the company and delivery address through to create_order', async () => {
    mocked.rpc.mockResolvedValue({ data: 'order-1', error: null } as never)
    const { ordersApi } = await import('@/api/orders')
    await ordersApi.place({
      companyId: 'c1',
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
      p_company_id: 'c1',
    })
  })

  it('sends a null address when none was given', async () => {
    mocked.rpc.mockResolvedValue({ data: 'order-1', error: null } as never)
    const { ordersApi } = await import('@/api/orders')
    await ordersApi.place({ companyId: 'c1', clientId: null, paymentMethod: null, currency: 'UAH', items: [] })
    expect(mocked.rpc.mock.calls[0][1]).toMatchObject({ p_delivery_address: null })
  })
})

describe('ordersApi deletion', () => {
  it('goes through delete_orders so stock is restored', async () => {
    mocked.rpc.mockResolvedValue({ data: 2, error: null } as never)
    const { ordersApi } = await import('@/api/orders')
    const deleted = await ordersApi.removeMany(['o1', 'o2'], 'c1')
    expect(mocked.rpc).toHaveBeenCalledWith('delete_orders', { p_ids: ['o1', 'o2'], p_company_id: 'c1' })
    expect(deleted).toBe(2)
  })

  it('routes a single delete through the same rpc', async () => {
    mocked.rpc.mockResolvedValue({ data: 1, error: null } as never)
    const { ordersApi } = await import('@/api/orders')
    await ordersApi.remove('o1', 'c1')
    expect(mocked.rpc).toHaveBeenCalledWith('delete_orders', { p_ids: ['o1'], p_company_id: 'c1' })
  })

  it('skips the request when nothing is selected', async () => {
    const { ordersApi } = await import('@/api/orders')
    await ordersApi.removeMany([], 'c1')
    expect(mocked.rpc).not.toHaveBeenCalled()
  })
})

describe('categoriesApi links', () => {
  it('lists brand↔category links for a company', async () => {
    const chain = builder({ data: [{ brand_id: 'b1', category_id: 'c1' }], error: null })
    mocked.from.mockReturnValue(chain as never)
    const { categoriesApi } = await import('@/api/categories')
    const result = await categoriesApi.listLinks('co1')
    expect(mocked.from).toHaveBeenCalledWith('brand_categories')
    expect(chain.eq).toHaveBeenCalledWith('company_id', 'co1')
    expect(result).toEqual([{ brand_id: 'b1', category_id: 'c1' }])
  })

  it('links a category to a brand, ignoring an existing pair', async () => {
    const chain = builder({ data: null, error: null })
    mocked.from.mockReturnValue(chain as never)
    const { categoriesApi } = await import('@/api/categories')
    await categoriesApi.link({ company_id: 'co1', brand_id: 'b1', category_id: 'c1' })
    expect(mocked.from).toHaveBeenCalledWith('brand_categories')
    expect(chain.upsert).toHaveBeenCalledWith(
      { company_id: 'co1', brand_id: 'b1', category_id: 'c1' },
      { onConflict: 'brand_id,category_id', ignoreDuplicates: true },
    )
  })

  it('unlinks a category from a brand by both ids', async () => {
    const chain = builder({ data: null, error: null })
    mocked.from.mockReturnValue(chain as never)
    const { categoriesApi } = await import('@/api/categories')
    await categoriesApi.unlink('b1', 'c1')
    expect(chain.eq).toHaveBeenCalledWith('brand_id', 'b1')
    expect(chain.eq).toHaveBeenCalledWith('category_id', 'c1')
  })

  it('upserts many links in one call for the bulk action', async () => {
    const chain = builder({ data: null, error: null })
    mocked.from.mockReturnValue(chain as never)
    const { categoriesApi } = await import('@/api/categories')
    const links = [
      { company_id: 'co1', brand_id: 'b1', category_id: 'c1' },
      { company_id: 'co1', brand_id: 'b1', category_id: 'c2' },
    ]
    await categoriesApi.linkMany(links)
    expect(chain.upsert).toHaveBeenCalledWith(links, { onConflict: 'brand_id,category_id', ignoreDuplicates: true })
  })

  it('skips the request when linkMany gets an empty list', async () => {
    const { categoriesApi } = await import('@/api/categories')
    await categoriesApi.linkMany([])
    expect(mocked.from).not.toHaveBeenCalled()
  })

  it('drops every link for a brand in the clear action', async () => {
    const chain = builder({ data: null, error: null })
    mocked.from.mockReturnValue(chain as never)
    const { categoriesApi } = await import('@/api/categories')
    await categoriesApi.unlinkAllForBrand('b1')
    expect(mocked.from).toHaveBeenCalledWith('brand_categories')
    expect(chain.delete).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('brand_id', 'b1')
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
