import { useCurrency } from '@/composables/use-currency'
import { useReferenceStore } from '@/stores/reference'
import type { Currency } from '@/types/database'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

const BRAND_RATE = 41.5

const euro = { id: 'cur1', company_id: 'c', code: 'EUR', symbol: '€', usd_rate: 0.92 } as Currency

// uk-UA groups with a non-breaking space; normalise for stable assertions.
const norm = (s: string) => s.replace(/\s/g, ' ')

describe('useCurrency', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps USD amounts as stored', () => {
    const currency = useCurrency()
    currency.setCurrency('USD')
    expect(currency.convert(51, BRAND_RATE)).toBe(51)
    expect(norm(currency.format(51))).toBe('51,00 $')
  })

  it('converts UAH through the brand rate', () => {
    const currency = useCurrency()
    currency.setCurrency('UAH')
    expect(currency.convert(51, BRAND_RATE)).toBeCloseTo(51 * BRAND_RATE, 4)
    expect(currency.symbol.value).toBe('₴')
  })

  it('converts a user-added currency through its own flat rate', () => {
    useReferenceStore().currencies = [euro]
    const currency = useCurrency()
    currency.setCurrency('EUR')

    expect(currency.code.value).toBe('EUR')
    expect(currency.convert(51, BRAND_RATE)).toBeCloseTo(51 * 0.92, 4)
    expect(norm(currency.format(51 * 0.92))).toBe('47 €')
  })

  it('offers the built-ins plus whatever was added', () => {
    useReferenceStore().currencies = [euro]
    expect(useCurrency().options.value.map((o) => o.code)).toEqual(['UAH', 'USD', 'EUR'])
  })

  it('falls back to UAH when the saved currency no longer exists', () => {
    const currency = useCurrency()
    currency.setCurrency('EUR') // never added, or since deleted
    expect(currency.code.value).toBe('UAH')
    expect(currency.convert(51, BRAND_RATE)).toBeCloseTo(51 * BRAND_RATE, 4)
  })
})
