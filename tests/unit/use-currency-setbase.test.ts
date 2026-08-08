import { useCurrency } from '@/composables/use-currency'
import { useAuthStore } from '@/stores/auth'
import { useReferenceStore } from '@/stores/reference'
import type { Brand, Company, Currency } from '@/types/database'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// setBase re-expresses brand supplier rates into the new base and persists the
// company change; mock those two api boundaries.
const setSupplierRate = vi.fn().mockResolvedValue({})
vi.mock('@/api/brands', () => ({ brandsApi: { setSupplierRate: (...a: unknown[]) => setSupplierRate(...a) } }))
vi.mock('@/api/profile', () => ({
  profileApi: {
    updateCompany: vi.fn(async (id: string, patch: { base_currency: string }) => ({
      id,
      name: '',
      owner_id: 'u',
      base_currency: patch.base_currency,
      display_currency: 'UAH',
      created_at: '',
    })),
  },
}))

const uah = { id: 'c-uah', company_id: 'c', code: 'UAH', symbol: '₴', usd_rate: 40 } as Currency

// `auth.company` is derived from the active membership, so seeding the active
// organization is how a test puts a company in place.
function seedCompany(auth: ReturnType<typeof useAuthStore>, company: Partial<Company>) {
  const full = { id: 'c', name: '', owner_id: 'u', display_currency: 'UAH', created_at: '', ...company } as Company
  auth.memberships = [
    { company_id: full.id, user_id: 'u', role: 'owner', created_at: '', company: full },
  ]
  auth.activeCompanyId = full.id
}

describe('useCurrency.setBase', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setSupplierRate.mockClear()
  })

  it('re-expresses every brand supplier rate into the new base and persists it', async () => {
    const auth = useAuthStore()
    seedCompany(auth, { base_currency: 'UAH' })
    const reference = useReferenceStore()
    // setBase reloads the workspace once the rates are rewritten; that round
    // trip is not what this test is about.
    reference.load = vi.fn()
    reference.currencies = [uah]
    reference.brands = [
      { id: 'b1', supplier_rate: 44.5, catalog_currency: 'USD' } as Brand,
      { id: 'b2', supplier_rate: 0, catalog_currency: 'USD' } as Brand, // untouched
    ]

    const c = useCurrency()
    await c.setBase('USD')

    // ₴44.5 per $ → $1.1125 per $ unit in the new USD base (44.5 ÷ 40).
    expect(setSupplierRate).toHaveBeenCalledTimes(1)
    expect(setSupplierRate).toHaveBeenCalledWith('b1', 1.1125)
    expect(auth.company?.base_currency).toBe('USD')
  })

  it('does nothing when the base is unchanged', async () => {
    const auth = useAuthStore()
    seedCompany(auth, { base_currency: 'UAH' })
    const c = useCurrency()
    await c.setBase('UAH')
    expect(setSupplierRate).not.toHaveBeenCalled()
  })
})
