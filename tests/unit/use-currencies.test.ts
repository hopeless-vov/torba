import { useCurrencies } from '@/composables/use-currencies'
import uk from '@/locales/uk.json'
import { useAuthStore } from '@/stores/auth'
import { useInventoryStore } from '@/stores/inventory'
import { useReferenceStore } from '@/stores/reference'
import type { Company, PlatformCurrency, Product } from '@/types/database'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Which currencies a company uses. Any real currency can be picked — a new
// one joins the platform list — and one a price still needs cannot be dropped.
const api = vi.hoisted(() => ({
  create: vi.fn(async () => ({})),
  remove: vi.fn(async () => undefined),
}))
const platformApi = vi.hoisted(() => ({ ensure: vi.fn(async () => ({})) }))
vi.mock('@/api/currencies', () => ({ currenciesApi: api }))
vi.mock('@/api/platform-currencies', () => ({ platformCurrenciesApi: platformApi }))

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
  platformApi.ensure.mockClear()
})

describe('useCurrencies', () => {
  it('offers every real currency not in use yet — never the base', () => {
    const { currencies } = harness()
    const codes = currencies.available.value.map((c) => c.code)
    expect(codes).toContain('EUR')
    expect(codes).toContain('PLN')
    expect(codes).not.toContain('USD')
    expect(codes).not.toContain('UAH')
  })

  it('puts a currency the platform does not list yet on it, then adds it', async () => {
    const { currencies } = harness()
    expect(await currencies.addCurrency('PLN')).toBe(true)

    expect(platformApi.ensure).toHaveBeenCalledWith('PLN', expect.any(String))
    expect(api.create).toHaveBeenCalledWith({ company_id: 'c', code: 'PLN' })
  })

  it('adds a currency from the platform list', async () => {
    const { currencies, reference } = harness()
    await currencies.addCurrency('EUR')

    expect(api.create).toHaveBeenCalledWith({ company_id: 'c', code: 'EUR' })
    expect(reference.load).toHaveBeenCalled()
  })

  it('refuses a code that is not a currency, or one already in use', async () => {
    const { currencies } = harness()
    await currencies.addCurrency('XYZ1')
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

  it('knows which currencies each supplier’s prices are in', () => {
    const { currencies, inventory } = harness()
    inventory.products = [
      { id: 'p1', brand_id: 'b1', cost_currency: 'USD', retail_amount: null, retail_currency: 'EUR' } as Product,
    ]

    expect(currencies.supplierUses('b1', 'USD')).toBe(true)
    // A retail currency with no retail price asks for nothing.
    expect(currencies.supplierUses('b1', 'EUR')).toBe(false)
    expect(currencies.supplierUses('b2', 'USD')).toBe(false)
  })

  it('removes a currency nothing depends on', async () => {
    const { currencies } = harness()

    expect(await currencies.removeCurrency('cur-usd')).toBe(true)
    expect(api.remove).toHaveBeenCalledWith('cur-usd')
  })
})
