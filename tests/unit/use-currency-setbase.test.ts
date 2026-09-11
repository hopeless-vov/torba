import { useCurrency } from '@/composables/use-currency'
import { useAuthStore } from '@/stores/auth'
import { useReferenceStore } from '@/stores/reference'
import type { Company } from '@/types/database'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The rules around a base change live in the database (0019): it is refused
// once an order exists, and it resets every supplier rate. The composable's
// part is to persist the change and reload what the database moved.
const updateCompany = vi.hoisted(() =>
  vi.fn(async (id: string, patch: { base_currency: string }) => ({
    id,
    name: '',
    owner_id: 'u',
    base_currency: patch.base_currency,
    display_currency: 'UAH',
    created_at: '',
  })),
)
vi.mock('@/api/profile', () => ({ profileApi: { updateCompany } }))

function seedCompany(base: string) {
  const auth = useAuthStore()
  const company = { id: 'c', name: '', owner_id: 'u', base_currency: base, display_currency: base, created_at: '' } as Company
  auth.memberships = [{ company_id: 'c', user_id: 'u', role: 'owner', created_at: '', company }]
  auth.activeCompanyId = 'c'
}

describe('useCurrency.setBase', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    updateCompany.mockClear()
  })

  it('persists the new base and reloads the rates it reset', async () => {
    seedCompany('UAH')
    const reference = useReferenceStore()
    reference.load = vi.fn()

    await useCurrency().setBase('USD')

    expect(updateCompany).toHaveBeenCalledWith('c', { base_currency: 'USD' })
    expect(useAuthStore().company?.base_currency).toBe('USD')
    expect(reference.load).toHaveBeenCalledWith('c')
  })

  it('does nothing when the base is unchanged', async () => {
    seedCompany('UAH')
    await useCurrency().setBase('UAH')
    expect(updateCompany).not.toHaveBeenCalled()
  })

  // An order exists: the database says no, and the old base stays in place.
  it('lets a refusal from the database through, untouched', async () => {
    seedCompany('UAH')
    updateCompany.mockRejectedValueOnce({ message: 'base_currency_locked' })

    await expect(useCurrency().setBase('USD')).rejects.toMatchObject({ message: 'base_currency_locked' })
    expect(useAuthStore().company?.base_currency).toBe('UAH')
  })
})
