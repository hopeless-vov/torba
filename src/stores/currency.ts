import { safeStorage } from '@/utils/storage'
import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'torba:currency'

// Which currency prices are shown in. USD is always the stored base;
// UAH (and, later, others) are derived from each brand's rate.
export const useCurrencyStore = defineStore('currency', () => {
  const displayCurrency = ref<string>(safeStorage.get(STORAGE_KEY) || 'UAH')

  function setCurrency(code: string) {
    displayCurrency.value = code
    safeStorage.set(STORAGE_KEY, code)
  }

  return { displayCurrency, setCurrency }
})
