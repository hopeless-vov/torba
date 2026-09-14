import { useRates } from '@/composables/use-rates'
import uk from '@/locales/uk.json'
import { useAuthStore } from '@/stores/auth'
import { useReferenceStore } from '@/stores/reference'
import type { Company } from '@/types/database'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The rates page's logic: one cell of the supplier matrix at a time, and a
// base currency that converts the orders when it moves.
const rates = vi.hoisted(() => ({
  set: vi.fn(async () => ({})),
  history: vi.fn(async () => []),
  list: vi.fn(async () => []),
}))
const orders = vi.hoisted(() => ({ count: vi.fn(async () => 0) }))
const profile = vi.hoisted(() => ({ changeBaseCurrency: vi.fn() }))
const platform = vi.hoisted(() => ({ ensure: vi.fn(async () => ({})), list: vi.fn(async () => []) }))
vi.mock('@/api/supplier-rates', () => ({ supplierRatesApi: rates }))
vi.mock('@/api/orders', () => ({ ordersApi: orders }))
vi.mock('@/api/profile', () => ({ profileApi: profile }))
vi.mock('@/api/platform-currencies', () => ({ platformCurrenciesApi: platform }))

const company = {
  id: 'c',
  name: '',
  owner_id: 'u',
  base_currency: 'UAH',
  display_currency: 'UAH',
  created_at: '',
} as Company

function harness() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const i18n = createI18n({ legacy: false, locale: 'uk', fallbackLocale: 'uk', messages: { uk } })
  let ctx!: { reference: ReturnType<typeof useReferenceStore>; use: ReturnType<typeof useRates> }
  mount(
    defineComponent({
      setup() {
        const auth = useAuthStore()
        auth.memberships = [{ company_id: 'c', user_id: 'u', role: 'owner', created_at: '', company }]
        auth.activeCompanyId = 'c'
        const reference = useReferenceStore()
        reference.load = vi.fn()
        reference.platformCurrencies = [
          { code: 'UAH', symbol: '₴', sort: 10, created_at: '' },
          { code: 'USD', symbol: '$', sort: 20, created_at: '' },
        ]
        ctx = { reference, use: useRates() }
        return () => null
      },
    }),
    { global: { plugins: [pinia, i18n] } },
  )
  return ctx
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRates — the matrix', () => {
  it('sets one cell and reloads, so every price of that supplier follows', async () => {
    const { use, reference } = harness()

    expect(await use.setRate('b1', 'USD', 41.5)).toBe(true)
    expect(rates.set).toHaveBeenCalledWith({ company_id: 'c', brand_id: 'b1', currency: 'USD', rate: 41.5 })
    expect(reference.load).toHaveBeenCalled()
  })

  it('refuses a rate that is not positive', async () => {
    const { use } = harness()

    expect(await use.setRate('b1', 'USD', 0)).toBe(false)
    expect(rates.set).not.toHaveBeenCalled()
  })

  it('reads one cell’s history', async () => {
    const { use } = harness()
    await use.loadHistory('b1', 'EUR')
    expect(rates.history).toHaveBeenCalledWith('b1', 'EUR')
  })
})

describe('useRates — the base', () => {
  it('knows whether there are orders a base change would convert', async () => {
    const { use } = harness()
    orders.count.mockResolvedValueOnce(3)
    await use.checkOrders()
    expect(use.hasOrders.value).toBe(true)

    orders.count.mockResolvedValueOnce(0)
    await use.checkOrders()
    expect(use.hasOrders.value).toBe(false)
  })

  // An order placed a moment ago: the database asks for a rate, and the page
  // is told so instead of a generic failure.
  it('reports a missing conversion rate as such', async () => {
    const { use } = harness()
    profile.changeBaseCurrency.mockRejectedValueOnce({ message: 'base_currency_rate_required' })

    expect(await use.changeBase('USD')).toBe(false)
    expect(use.hasOrders.value).toBe(true)
  })

  it('changes the base, with the rate for the orders', async () => {
    const { use } = harness()
    profile.changeBaseCurrency.mockResolvedValueOnce({ ...company, base_currency: 'USD' })

    expect(await use.changeBase('USD', 0.024)).toBe(true)
    expect(profile.changeBaseCurrency).toHaveBeenCalledWith('c', 'USD', 0.024)
    expect(platform.ensure).not.toHaveBeenCalled()
  })

  // A currency no company has used yet joins the platform list first.
  it('puts a new currency on the platform list before making it the base', async () => {
    const { use } = harness()
    profile.changeBaseCurrency.mockResolvedValueOnce({ ...company, base_currency: 'PLN' })

    expect(await use.changeBase('PLN')).toBe(true)
    expect(platform.ensure).toHaveBeenCalledWith('PLN', expect.any(String))
  })
})
