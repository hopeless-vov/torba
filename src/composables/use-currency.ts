import { useCurrencyStore } from '@/stores/currency'
import { formatMoney } from '@/utils/format'
import { convertPrice } from '@/utils/pricing'
import { computed } from 'vue'

// Bridges the display-currency setting with the pure pricing/format
// helpers. USD is the stored base (rate is skipped); other currencies
// convert through the brand's rate.
export function useCurrency() {
  const store = useCurrencyStore()

  const code = computed(() => store.displayCurrency)
  const isBase = computed(() => code.value === 'USD')

  function defaultDigits() {
    return code.value === 'USD' ? 2 : 0
  }

  function convert(usd: number, brandRate: number): number {
    return isBase.value ? usd : convertPrice(usd, brandRate)
  }

  function format(amount: number, digits?: number): string {
    return formatMoney(amount, code.value, digits ?? defaultDigits())
  }

  return {
    code,
    isBase,
    convert,
    format,
    setCurrency: store.setCurrency,
  }
}
