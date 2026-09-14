import { currencyName, currencySymbol, worldCurrencies } from '@/utils/world-currencies'
import { describe, expect, it } from 'vitest'

// "Add a currency" offers the real world's list, symbols and names included.
describe('world currencies', () => {
  it('lists the ISO currencies, each once', () => {
    const list = worldCurrencies()
    const codes = list.map((c) => c.code)
    expect(codes).toEqual(expect.arrayContaining(['UAH', 'USD', 'EUR', 'PLN', 'GBP']))
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes.every((c) => /^[A-Z]{3}$/.test(c))).toBe(true)
  })

  it('gives the short symbol a price is shown under', () => {
    expect(currencySymbol('UAH')).toBe('₴')
    expect(currencySymbol('USD')).toBe('$')
  })

  it('falls back to the code for what it cannot name', () => {
    expect(currencySymbol('not a code')).toBe('not a code')
    expect(currencyName('USD', 'en')).toMatch(/dollar/i)
  })
})
