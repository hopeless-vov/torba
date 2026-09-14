import { useCurrency } from '@/composables/use-currency'
import { useAuthStore } from '@/stores/auth'
import { useReferenceStore } from '@/stores/reference'
import type { Company } from '@/types/database'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The rules around a base change live in the database (0020): it resets
// every supplier rate, and with orders on the books it needs a rate to
// convert them. The composable's part is to pass the change on and reload
// what the database moved.
const changeBaseCurrency = vi.hoisted(() =>
  vi.fn(async (id: string, code: string) => ({
    id,
    name: '',
    owner_id: 'u',
    base_currency: code,
    display_currency: 'UAH',
    created_at: '',
  })),
)
vi.mock('@/api/profile', () => ({ profileApi: { changeBaseCurrency } }))

function seedCompany(base: string) {
  const auth = useAuthStore()
  const company = { id: 'c', name: '', owner_id: 'u', base_currency: base, display_currency: base, created_at: '' } as Company
  auth.memberships = [{ company_id: 'c', user_id: 'u', role: 'owner', created_at: '', company }]
  auth.activeCompanyId = 'c'
}

describe('useCurrency.setBase', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    changeBaseCurrency.mockClear()
  })

  it('persists the new base and reloads the rates it reset', async () => {
    seedCompany('UAH')
    const reference = useReferenceStore()
    reference.load = vi.fn()

    await useCurrency().setBase('USD')

    expect(changeBaseCurrency).toHaveBeenCalledWith('c', 'USD', null)
    expect(useAuthStore().company?.base_currency).toBe('USD')
    expect(reference.load).toHaveBeenCalledWith('c')
  })

  it('passes on the rate the orders are converted at', async () => {
    seedCompany('UAH')
    useReferenceStore().load = vi.fn()

    await useCurrency().setBase('USD', 0.024)

    expect(changeBaseCurrency).toHaveBeenCalledWith('c', 'USD', 0.024)
  })

  it('does nothing when the base is unchanged', async () => {
    seedCompany('UAH')
    await useCurrency().setBase('UAH')
    expect(changeBaseCurrency).not.toHaveBeenCalled()
  })

  // Orders exist and no rate was given: the database says no, and the old
  // base stays in place.
  it('lets a refusal from the database through, untouched', async () => {
    seedCompany('UAH')
    changeBaseCurrency.mockRejectedValueOnce({ message: 'base_currency_rate_required' })

    await expect(useCurrency().setBase('USD')).rejects.toMatchObject({ message: 'base_currency_rate_required' })
    expect(useAuthStore().company?.base_currency).toBe('UAH')
  })
})
