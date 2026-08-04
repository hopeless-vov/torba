import { useCurrencyStore } from '@/stores/currency'
import { useReferenceStore } from '@/stores/reference'
import { CURRENCY_SYMBOLS, formatAmount } from '@/utils/format'
import { convertPrice } from '@/utils/pricing'
import { computed } from 'vue'

// The two currencies the app always understands: USD is the stored base,
// and UAH is derived from each brand's own rate. Anything else is added
// by the owner (see `currencies` in migration 0004) and converts with one
// flat company-wide rate.
export const BUILT_IN_CURRENCIES = [
  { code: 'UAH', symbol: CURRENCY_SYMBOLS.UAH },
  { code: 'USD', symbol: CURRENCY_SYMBOLS.USD },
] as const

// Bridges the display-currency setting with the pure pricing/format
// helpers. USD is the stored base (rate is skipped); other currencies
// convert through the brand's rate (UAH) or their own rate.
export function useCurrency() {
  const store = useCurrencyStore()
  const reference = useReferenceStore()

  const options = computed(() => [
    ...BUILT_IN_CURRENCIES.map((c) => ({ code: c.code, symbol: c.symbol })),
    ...reference.currencies.map((c) => ({ code: c.code, symbol: c.symbol || c.code })),
  ])

  // A currency the user deleted must not strand the whole UI on an
  // unknown code.
  const code = computed(() =>
    options.value.some((o) => o.code === store.displayCurrency) ? store.displayCurrency : 'UAH',
  )
  const isBase = computed(() => code.value === 'USD')
  const symbol = computed(() => options.value.find((o) => o.code === code.value)?.symbol ?? code.value)

  function defaultDigits() {
    return code.value === 'USD' ? 2 : 0
  }

  function convert(usd: number, brandRate: number): number {
    if (isBase.value) return usd
    if (code.value === 'UAH') return convertPrice(usd, brandRate)
    return convertPrice(usd, reference.currenciesByCode.get(code.value)?.usd_rate ?? 0)
  }

  function format(amount: number, digits?: number): string {
    return formatAmount(amount, symbol.value, digits ?? defaultDigits())
  }

  // Format an amount that is already denominated in `currencyCode`, using
  // that currency's own symbol — independent of the current display
  // selection. Orders snapshot their amounts in the currency they were
  // transacted in (`order.currency`); they must not be re-labelled just
  // because the top-bar display currency later changed.
  function formatIn(currencyCode: string, amount: number, digits?: number): string {
    const sym = options.value.find((o) => o.code === currencyCode)?.symbol ?? currencyCode
    return formatAmount(amount, sym, digits ?? (currencyCode === 'USD' ? 2 : 0))
  }

  return {
    code,
    symbol,
    options,
    isBase,
    convert,
    format,
    formatIn,
    setCurrency: store.setCurrency,
  }
}
