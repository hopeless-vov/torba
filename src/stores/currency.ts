import { safeStorage } from '@/utils/storage'
import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'torba:currency'

// The display currency: what amounts are shown in across the app (the top-bar
// switch), remembered per browser. The functional (base) currency the books
// are kept in is a company setting (company.base_currency), not stored here.
export const useCurrencyStore = defineStore('currency', () => {
  const displayCurrency = ref<string>(safeStorage.get(STORAGE_KEY) || 'UAH')

  function setCurrency(code: string) {
    displayCurrency.value = code
    safeStorage.set(STORAGE_KEY, code)
  }

  return { displayCurrency, setCurrency }
})
