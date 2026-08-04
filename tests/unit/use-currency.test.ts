import { useCurrency } from '@/composables/use-currency'
import { useReferenceStore } from '@/stores/reference'
import type { Currency } from '@/types/database'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

// Central rates: usd_rate = units of the currency per 1 USD.
const uah = { id: 'c-uah', company_id: 'c', code: 'UAH', symbol: '₴', usd_rate: 40 } as Currency
const euro = { id: 'cur1', company_id: 'c', code: 'EUR', symbol: '€', usd_rate: 0.92 } as Currency
const pln = { id: 'c-pln', company_id: 'c', code: 'PLN', symbol: 'zł', usd_rate: 4 } as Currency

// uk-UA groups with a non-breaking space; normalise for stable assertions.
const norm = (s: string) => s.replace(/\s/g, ' ')

describe('useCurrency', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps USD amounts as stored (base rate 1)', () => {
    const c = useCurrency()
    c.setCurrency('USD')
    expect(c.convert(51)).toBe(51)
    expect(norm(c.format(51))).toBe('51,00 $')
  })

  it('converts a USD amount through the central rate', () => {
    useReferenceStore().currencies = [uah]
    const c = useCurrency()
    c.setCurrency('UAH')
    expect(c.convert(51)).toBeCloseTo(51 * 40, 4)
    expect(c.symbol.value).toBe('₴')
    expect(norm(c.format(51 * 40))).toBe('2 040 ₴')
  })

  it('uses a built-in default rate before one has been set', () => {
    const c = useCurrency()
    c.setCurrency('EUR') // built-in, defaults to 0.92
    expect(c.code.value).toBe('EUR')
    expect(c.convert(51)).toBeCloseTo(51 * 0.92, 4)
    expect(norm(c.format(51 * 0.92))).toBe('46,92 €')
  })

  it('lets a stored rate override the built-in default', () => {
    useReferenceStore().currencies = [{ ...euro, usd_rate: 0.9 } as Currency]
    const c = useCurrency()
    c.setCurrency('EUR')
    expect(c.rateOf('EUR')).toBe(0.9)
    expect(c.convert(100)).toBeCloseTo(90, 4)
  })

  it('re-expresses an amount from its own currency into the active one', () => {
    useReferenceStore().currencies = [uah] // 40 ₴ per USD
    const c = useCurrency()
    c.setCurrency('USD')
    // 2000 ₴ ÷ 40 = 50 USD
    expect(c.convertBetween(2000, 'UAH')).toBeCloseTo(50, 4)
    expect(norm(c.formatFrom('UAH', 2000))).toBe('50,00 $')
  })

  it('toUsd inverts the active rate', () => {
    useReferenceStore().currencies = [uah]
    const c = useCurrency()
    c.setCurrency('UAH')
    expect(c.toUsd(2000)).toBeCloseTo(50, 4) // 2000 ÷ 40
  })

  it('formats an amount in a specific currency with its own symbol', () => {
    useReferenceStore().currencies = [euro]
    const c = useCurrency()
    expect(norm(c.formatIn('UAH', 2047))).toBe('2 047 ₴')
    expect(norm(c.formatIn('USD', 46))).toBe('46,00 $')
    expect(norm(c.formatIn('EUR', 47))).toBe('47,00 €')
  })

  it('falls back to the raw code when the currency is unknown', () => {
    expect(norm(useCurrency().formatIn('XYZ', 100))).toBe('100 XYZ')
  })

  it('offers the built-ins plus whatever was added, de-duped by code', () => {
    useReferenceStore().currencies = [euro, pln] // EUR is built-in → not doubled
    expect(useCurrency().options.value.map((o) => o.code)).toEqual(['UAH', 'USD', 'EUR', 'PLN'])
  })

  it('falls back to the base currency when the saved one no longer exists', () => {
    const c = useCurrency()
    c.setCurrency('PLN') // never added, or since deleted
    expect(c.code.value).toBe('USD')
    expect(c.convert(51)).toBe(51)
  })

  it('enters product prices in the base currency and stores them in USD', () => {
    useReferenceStore().currencies = [uah] // 40 ₴ per USD
    const c = useCurrency()
    c.setBase('UAH')
    expect(c.baseCode.value).toBe('UAH')
    // 2000 ₴ entered → 50 USD stored; 50 USD stored → 2000 ₴ shown.
    expect(c.fromBase(2000)).toBeCloseTo(50, 4)
    expect(c.toBase(50)).toBeCloseTo(2000, 4)
  })
})
