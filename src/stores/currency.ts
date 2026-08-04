import { safeStorage } from '@/utils/storage'
import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'torba:currency'
const BASE_KEY = 'torba:base'

// Two currency settings:
// - displayCurrency: what amounts are shown in across the app (top-bar switch).
// - baseCurrency: the currency product prices are entered in (the owner's
//   working currency). Both are resolved into USD, the internal storage base.
export const useCurrencyStore = defineStore('currency', () => {
  const displayCurrency = ref<string>(safeStorage.get(STORAGE_KEY) || 'UAH')
  const baseCurrency = ref<string>(safeStorage.get(BASE_KEY) || 'USD')

  function setCurrency(code: string) {
    displayCurrency.value = code
    safeStorage.set(STORAGE_KEY, code)
  }

  function setBase(code: string) {
    baseCurrency.value = code
    safeStorage.set(BASE_KEY, code)
  }

  return { displayCurrency, baseCurrency, setCurrency, setBase }
})
