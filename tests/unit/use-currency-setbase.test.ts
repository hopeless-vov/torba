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

describe('useCurrency.setBase', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setSupplierRate.mockClear()
  })

  it('re-expresses every brand supplier rate into the new base and persists it', async () => {
    const auth = useAuthStore()
    auth.company = {
      id: 'c',
      name: '',
      owner_id: 'u',
      base_currency: 'UAH',
      display_currency: 'UAH',
      created_at: '',
    } as Company
    const reference = useReferenceStore()
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
    auth.company = { id: 'c', base_currency: 'UAH' } as Company
    const c = useCurrency()
    await c.setBase('UAH')
    expect(setSupplierRate).not.toHaveBeenCalled()
  })
})
