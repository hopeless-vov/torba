import { useCurrencyStore } from '@/stores/currency'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

describe('currency store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defaults to UAH', () => {
    const store = useCurrencyStore()
    expect(store.displayCurrency).toBe('UAH')
  })

  it('updates the selected currency', () => {
    const store = useCurrencyStore()
    store.setCurrency('USD')
    expect(store.displayCurrency).toBe('USD')
  })

  it('defaults the base currency to USD and updates it', () => {
    const store = useCurrencyStore()
    expect(store.baseCurrency).toBe('USD')
    store.setBase('UAH')
    expect(store.baseCurrency).toBe('UAH')
  })
})
