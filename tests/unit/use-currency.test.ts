import { useCurrency } from '@/composables/use-currency'
import { useAuthStore } from '@/stores/auth'
import { useReferenceStore } from '@/stores/reference'
import type { Company, Currency, PlatformCurrency, SupplierRate } from '@/types/database'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

// One currency of account — the company's base — and one kind of rate: each
// supplier's own, per currency. These pin both halves of that rule.

// uk-UA groups with a non-breaking space; normalise for stable assertions.
const norm = (s: string) => s.replace(/\s/g, ' ')

const platform: PlatformCurrency[] = [
  { code: 'UAH', symbol: '₴', sort: 10, created_at: '' },
  { code: 'USD', symbol: '$', sort: 20, created_at: '' },
  { code: 'EUR', symbol: '€', sort: 30, created_at: '' },
  { code: 'PLN', symbol: 'zł', sort: 40, created_at: '' },
]

function rate(brandId: string, currency: string, value: number): SupplierRate {
  return { id: `${brandId}-${currency}`, company_id: 'c', brand_id: brandId, currency, rate: value, updated_at: '' }
}

// The base lives on the company, which comes from the active membership.
function companyUsing(base: string, others: string[] = []) {
  const auth = useAuthStore()
  const company = {
    id: 'c',
    name: '',
    owner_id: 'u',
    base_currency: base,
    display_currency: base,
    created_at: '',
  } as Company
  auth.memberships = [{ company_id: 'c', user_id: 'u', role: 'owner', created_at: '', company }]
  auth.activeCompanyId = 'c'
  const reference = useReferenceStore()
  reference.platformCurrencies = platform
  reference.currencies = others.map((code) => ({ id: `cur-${code}`, company_id: 'c', code, created_at: '' }) as Currency)
  return reference
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useCurrency — the base', () => {
  it('takes the base from the company', () => {
    companyUsing('EUR')
    expect(useCurrency().functionalCode.value).toBe('EUR')
  })

  it('shows every amount in the base, under the platform symbol', () => {
    companyUsing('UAH')
    expect(norm(useCurrency().format(2047))).toBe('2 047 ₴')
  })

  it('shows a supplier’s own price in its own currency', () => {
    companyUsing('UAH')
    const c = useCurrency()
    expect(norm(c.formatIn('USD', 46))).toBe('46,00 $')
    expect(norm(c.formatIn('PLN', 12))).toBe('12 zł')
  })

  it('offers the base first, then the currencies the company uses', () => {
    companyUsing('UAH', ['USD', 'EUR'])
    expect(useCurrency().options.value.map((o) => o.code)).toEqual(['UAH', 'USD', 'EUR'])
  })
})

describe('useCurrency — supplier rates', () => {
  it('needs no rate for the base itself', () => {
    companyUsing('UAH')
    const c = useCurrency()
    expect(c.rateFor('b1', 'UAH')).toBe(1)
    expect(c.rateFor(null, 'UAH')).toBe(1)
  })

  // The same dollar is worth different money to two suppliers.
  it('reads each supplier’s own rate', () => {
    const reference = companyUsing('UAH', ['USD'])
    reference.supplierRates = [rate('b1', 'USD', 41.5), rate('b2', 'USD', 42)]
    const c = useCurrency()
    expect(c.toBase(10, 'USD', 'b1')).toBeCloseTo(415, 6)
    expect(c.toBase(10, 'USD', 'b2')).toBeCloseTo(420, 6)
  })

  it('never guesses a rate nobody entered', () => {
    const reference = companyUsing('UAH', ['USD', 'EUR'])
    reference.supplierRates = [rate('b1', 'USD', 41.5)]
    const c = useCurrency()
    expect(c.rateFor('b1', 'EUR')).toBeNull()
    expect(c.toBase(10, 'EUR', 'b1')).toBeNull()
    // A product without a supplier has nobody's rate to go by.
    expect(c.rateFor(null, 'USD')).toBeNull()
  })

  it('converts back from the base at the same rate', () => {
    const reference = companyUsing('UAH', ['USD'])
    reference.supplierRates = [rate('b1', 'USD', 40)]
    expect(useCurrency().fromBase(2000, 'USD', 'b1')).toBeCloseTo(50, 6)
  })
})

describe('useCurrency — prices', () => {
  // "You buy at 55, you sell at 80" — both as the supplier quotes them.
  const product = { brand_id: 'b1', cost_amount: 55, cost_currency: 'USD', retail_amount: 80, retail_currency: 'USD' }

  it('turns a supplier’s cost and retail into the base through its rate', () => {
    const reference = companyUsing('UAH', ['USD'])
    reference.supplierRates = [rate('b1', 'USD', 41)]
    const c = useCurrency()
    expect(c.costInBase(product)).toBeCloseTo(2255, 6)
    expect(c.retailInBase(product)).toBeCloseTo(3280, 6)
  })

  // Retail follows the supplier: a new rate reprices both prices at once.
  it('reprices both when the supplier’s rate moves', () => {
    const reference = companyUsing('UAH', ['USD'])
    reference.supplierRates = [rate('b1', 'USD', 41)]
    const c = useCurrency()
    reference.supplierRates = [rate('b1', 'USD', 42)]
    expect(c.costInBase(product)).toBeCloseTo(2310, 6)
    expect(c.retailInBase(product)).toBeCloseTo(3360, 6)
  })

  it('prefers a batch’s own prices, falling back to the product’s', () => {
    const reference = companyUsing('UAH', ['USD'])
    reference.supplierRates = [rate('b1', 'USD', 40)]
    const batch = { cost_amount: 50, cost_currency: 'USD', retail_amount: null, retail_currency: null }
    const c = useCurrency()
    expect(c.costInBase(product, batch)).toBeCloseTo(2000, 6)
    expect(c.retailInBase(product, batch)).toBeCloseTo(3200, 6)
  })

  it('has no retail when none is set, whatever the rates', () => {
    companyUsing('UAH')
    expect(useCurrency().retailInBase({ ...product, retail_amount: null })).toBeNull()
  })

  it('names the currency a price is still waiting for', () => {
    const reference = companyUsing('UAH', ['USD', 'EUR'])
    reference.supplierRates = [rate('b1', 'USD', 41)]
    const c = useCurrency()
    expect(c.missingRate(product)).toBeNull()
    expect(c.missingRate({ ...product, retail_currency: 'EUR' })).toBe('EUR')
    expect(c.missingRate({ ...product, cost_currency: 'EUR' })).toBe('EUR')
  })

  it('needs no rate at all for prices in the base', () => {
    companyUsing('UAH')
    const inBase = { brand_id: null, cost_amount: 100, cost_currency: 'UAH', retail_amount: 150, retail_currency: 'UAH' }
    const c = useCurrency()
    expect(c.costInBase(inBase)).toBe(100)
    expect(c.retailInBase(inBase)).toBe(150)
    expect(c.missingRate(inBase)).toBeNull()
  })
})

describe('useCurrency — retail in the supplier’s currency', () => {
  it('reads a retail price quoted in the cost’s currency as it is', () => {
    companyUsing('UAH', ['USD'])
    const product = { brand_id: 'b1', cost_amount: 55, cost_currency: 'USD', retail_amount: 80, retail_currency: 'USD' }
    expect(useCurrency().retailInCostCurrency(product)).toBe(80)
  })

  // A retail price kept in the base is brought over through the supplier's
  // rate, so the pair can still be read side by side.
  it('brings a retail price in another currency over through the base', () => {
    const reference = companyUsing('UAH', ['USD'])
    reference.supplierRates = [rate('b1', 'USD', 40)]
    const product = { brand_id: 'b1', cost_amount: 55, cost_currency: 'USD', retail_amount: 3200, retail_currency: 'UAH' }
    expect(useCurrency().retailInCostCurrency(product)).toBeCloseTo(80, 6)
  })

  it('has nothing to show without a retail price, or without the rate', () => {
    companyUsing('UAH', ['USD'])
    const c = useCurrency()
    const noRetail = { brand_id: 'b1', cost_amount: 55, cost_currency: 'USD', retail_amount: null, retail_currency: 'USD' }
    const noRate = { brand_id: 'b1', cost_amount: 55, cost_currency: 'USD', retail_amount: 3200, retail_currency: 'UAH' }
    expect(c.retailInCostCurrency(noRetail)).toBeNull()
    expect(c.retailInCostCurrency(noRate)).toBeNull()
  })
})
