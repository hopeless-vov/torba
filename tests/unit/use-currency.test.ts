import { useCurrency } from '@/composables/use-currency'
import { useAuthStore } from '@/stores/auth'
import { useReferenceStore } from '@/stores/reference'
import type { Brand, Company, Currency } from '@/types/database'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

// Market rates: usd_rate = units of the currency per 1 USD (the numeraire).
const uah = { id: 'c-uah', company_id: 'c', code: 'UAH', symbol: '₴', usd_rate: 40 } as Currency
const euro = { id: 'cur1', company_id: 'c', code: 'EUR', symbol: '€', usd_rate: 0.92 } as Currency
const pln = { id: 'c-pln', company_id: 'c', code: 'PLN', symbol: 'zł', usd_rate: 4 } as Currency

// uk-UA groups with a non-breaking space; normalise for stable assertions.
const norm = (s: string) => s.replace(/\s/g, ' ')

// The functional (base) currency lives on the company.
function setFunctional(code: string) {
  useAuthStore().company = {
    id: 'c',
    name: '',
    owner_id: 'u',
    base_currency: code,
    display_currency: code,
    created_at: '',
  } as Company
}

describe('useCurrency', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('market rate: USD is the numeraire, a stored rate wins, a built-in default fills in', () => {
    useReferenceStore().currencies = [uah, { ...euro, usd_rate: 0.9 } as Currency]
    const c = useCurrency()
    expect(c.rateOf('USD')).toBe(1)
    expect(c.rateOf('UAH')).toBe(40) // stored
    expect(c.rateOf('EUR')).toBe(0.9) // stored overrides the built-in 0.92
    expect(c.rateOf('PLN')).toBe(0) // neither built-in nor stored
  })

  it('uses a built-in default rate before one has been set', () => {
    const c = useCurrency()
    expect(c.rateOf('UAH')).toBe(41)
    expect(c.rateOf('EUR')).toBe(0.92)
  })

  it('converts between currencies through the USD numeraire', () => {
    useReferenceStore().currencies = [uah]
    const c = useCurrency()
    expect(c.convertBetween(2000, 'UAH', 'USD')).toBeCloseTo(50, 4) // 2000 ÷ 40
    expect(c.convertBetween(50, 'USD', 'UAH')).toBeCloseTo(2000, 4) // 50 × 40
  })

  it('shows a functional amount in the active display currency', () => {
    useReferenceStore().currencies = [uah]
    setFunctional('UAH') // books kept in hryvnia
    const c = useCurrency()
    expect(c.functionalCode.value).toBe('UAH')
    c.setCurrency('UAH')
    expect(c.toDisplay(2000)).toBeCloseTo(2000, 4) // ₴ → ₴
    c.setCurrency('USD')
    expect(c.toDisplay(2000)).toBeCloseTo(50, 4) // ₴ → $
    expect(norm(c.format(50))).toBe('50,00 $')
  })

  it('derives a product cost in the functional currency from the supplier rate', () => {
    const c = useCurrency()
    const brand = { supplier_rate: 52 } as Brand
    expect(c.functionalCost(10, brand)).toBe(520) // €10 × 52 = ₴520
    expect(c.functionalCost(10, null)).toBe(0)
  })

  it('resolves a cost via the supplier rate when it is in the brand catalog currency', () => {
    useReferenceStore().currencies = [uah]
    setFunctional('UAH')
    const c = useCurrency()
    const brand = { supplier_rate: 52, catalog_currency: 'EUR' } as Brand
    // €10 × 52 = ₴520 (base); to base is unchanged, to USD divides by the rate.
    expect(c.costToDisplay(10, 'EUR', brand, 'UAH')).toBeCloseTo(520, 4)
    expect(c.costToDisplay(10, 'EUR', brand, 'USD')).toBeCloseTo(13, 4) // 520 ÷ 40
  })

  it('falls back to the market table when the cost currency is not the brand catalog one', () => {
    useReferenceStore().currencies = [uah]
    setFunctional('UAH')
    const c = useCurrency()
    const brand = { supplier_rate: 52, catalog_currency: 'EUR' } as Brand
    expect(c.costToDisplay(10, 'USD', brand, 'UAH')).toBeCloseTo(400, 4) // 10 × 40, rate ignored
    expect(c.costToDisplay(10, 'USD', null, 'UAH')).toBeCloseTo(400, 4)
  })

  it('re-expresses an order amount from its own currency into the active one', () => {
    useReferenceStore().currencies = [uah]
    const c = useCurrency()
    c.setCurrency('USD')
    expect(c.convertBetween(2000, 'UAH')).toBeCloseTo(50, 4)
    expect(norm(c.formatFrom('UAH', 2000))).toBe('50,00 $')
  })

  it('formats an amount in a specific currency with its own symbol', () => {
    useReferenceStore().currencies = [euro]
    const c = useCurrency()
    expect(norm(c.formatIn('UAH', 2047))).toBe('2 047 ₴')
    expect(norm(c.formatIn('USD', 46))).toBe('46,00 $')
    expect(norm(c.formatIn('EUR', 47))).toBe('47,00 €')
  })

  it('offers the built-ins plus whatever was added, de-duped by code', () => {
    useReferenceStore().currencies = [euro, pln] // EUR is built-in → not doubled
    expect(useCurrency().options.value.map((o) => o.code)).toEqual(['UAH', 'USD', 'EUR', 'PLN'])
  })

  it('falls back to the functional currency when the display one no longer exists', () => {
    setFunctional('USD')
    const c = useCurrency()
    c.setCurrency('PLN') // never added, or since deleted
    expect(c.code.value).toBe('USD')
  })

  it('takes the functional currency from the company, defaulting to the numeraire', () => {
    const c = useCurrency()
    expect(c.functionalCode.value).toBe('USD') // no company set yet
    setFunctional('EUR')
    expect(c.functionalCode.value).toBe('EUR')
  })
})
