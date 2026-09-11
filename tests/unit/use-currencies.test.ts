import { useCurrencies } from '@/composables/use-currencies'
import uk from '@/locales/uk.json'
import { useAuthStore } from '@/stores/auth'
import { useInventoryStore } from '@/stores/inventory'
import { useReferenceStore } from '@/stores/reference'
import type { Brand, Company, PlatformCurrency, Product } from '@/types/database'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Which platform currencies a company uses. The list comes from the platform;
// the company only picks from it, and cannot drop one a price still needs.
const api = vi.hoisted(() => ({
  create: vi.fn(async () => ({})),
  remove: vi.fn(async () => undefined),
}))
vi.mock('@/api/currencies', () => ({ currenciesApi: api }))

const platform: PlatformCurrency[] = [
  { code: 'UAH', symbol: '₴', sort: 10, created_at: '' },
  { code: 'USD', symbol: '$', sort: 20, created_at: '' },
  { code: 'EUR', symbol: '€', sort: 30, created_at: '' },
]

// useCurrencies reaches for useI18n (toasts), so it runs inside a component.
function harness() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const i18n = createI18n({ legacy: false, locale: 'uk', fallbackLocale: 'uk', messages: { uk } })
  let ctx!: {
    reference: ReturnType<typeof useReferenceStore>
    inventory: ReturnType<typeof useInventoryStore>
    currencies: ReturnType<typeof useCurrencies>
  }
  mount(
    defineComponent({
      setup() {
        const auth = useAuthStore()
        const company = {
          id: 'c',
          name: '',
          owner_id: 'u',
          base_currency: 'UAH',
          display_currency: 'UAH',
          created_at: '',
        } as Company
        auth.memberships = [{ company_id: 'c', user_id: 'u', role: 'owner', created_at: '', company }]
        auth.activeCompanyId = 'c'
        const reference = useReferenceStore()
        reference.platformCurrencies = platform
        reference.currencies = [{ id: 'cur-usd', company_id: 'c', code: 'USD', created_at: '' }]
        reference.load = vi.fn()
        ctx = { reference, inventory: useInventoryStore(), currencies: useCurrencies() }
        return () => null
      },
    }),
    { global: { plugins: [pinia, i18n] } },
  )
  return ctx
}

beforeEach(() => {
  api.create.mockClear()
  api.remove.mockClear()
})

describe('useCurrencies', () => {
  it('offers the platform currencies not in use yet — never the base', () => {
    const { currencies } = harness()
    expect(currencies.available.value.map((c) => c.code)).toEqual(['EUR'])
  })

  it('adds a currency from the platform list', async () => {
    const { currencies, reference } = harness()
    await currencies.addCurrency('EUR')

    expect(api.create).toHaveBeenCalledWith({ company_id: 'c', code: 'EUR' })
    expect(reference.load).toHaveBeenCalled()
  })

  it('refuses a code the platform does not offer, or one already in use', async () => {
    const { currencies } = harness()
    await currencies.addCurrency('GBP')
    await currencies.addCurrency('USD')
    await currencies.addCurrency('UAH')

    expect(api.create).not.toHaveBeenCalled()
  })

  // A price still in the currency would be left with nothing to convert by.
  it('will not remove a currency a price still uses', async () => {
    const { currencies, inventory } = harness()
    inventory.products = [{ id: 'p1', cost_currency: 'USD', retail_currency: 'UAH' } as Product]

    expect(await currencies.removeCurrency('cur-usd')).toBe(false)
    expect(api.remove).not.toHaveBeenCalled()
  })

  it('nor one a supplier quotes in by default', async () => {
    const { currencies, reference } = harness()
    reference.brands = [{ id: 'b1', company_id: 'c', name: 'X', catalog_currency: 'USD', created_at: '' } as Brand]

    expect(await currencies.removeCurrency('cur-usd')).toBe(false)
  })

  it('removes a currency nothing depends on', async () => {
    const { currencies } = harness()

    expect(await currencies.removeCurrency('cur-usd')).toBe(true)
    expect(api.remove).toHaveBeenCalledWith('cur-usd')
  })
})
