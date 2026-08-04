import { useCurrencyStore } from '@/stores/currency'
import { useReferenceStore } from '@/stores/reference'
import { CURRENCY_SYMBOLS, formatAmount } from '@/utils/format'
import { computed } from 'vue'

// USD is the internal storage base — every product price is kept in USD.
// What the user sees is converted into the *active* currency chosen in the
// top bar, using one company-wide ("central") rate per currency:
// `usd_rate` = how many units of that currency make 1 USD.
//
// UAH, USD and EUR are always available; the owner can add more and edit
// every rate on the /rates page. Per-brand supplier rates still live on
// the brand (a cost reference), but no longer drive what any screen shows —
// display is uniform, so switching the currency reconverts the whole app
// consistently (catalog, warehouse, orders, dashboard).
export const BASE_CURRENCY = 'USD'

export const BUILT_IN_CURRENCIES = [
  { code: 'UAH', symbol: CURRENCY_SYMBOLS.UAH, defaultRate: 41 },
  { code: 'USD', symbol: CURRENCY_SYMBOLS.USD, defaultRate: 1 },
  { code: 'EUR', symbol: CURRENCY_SYMBOLS.EUR, defaultRate: 0.92 },
] as const

export const BUILT_IN_CODES: string[] = BUILT_IN_CURRENCIES.map((c) => c.code)

export function useCurrency() {
  const store = useCurrencyStore()
  const reference = useReferenceStore()

  // Built-ins first, then any custom currency the owner added — de-duped by
  // code so a stored UAH/EUR rate row does not double up the built-in.
  const options = computed(() => {
    const seen = new Set<string>()
    const list: { code: string; symbol: string }[] = []
    for (const b of BUILT_IN_CURRENCIES) {
      list.push({ code: b.code, symbol: b.symbol })
      seen.add(b.code)
    }
    for (const c of reference.currencies) {
      if (seen.has(c.code)) continue
      list.push({ code: c.code, symbol: c.symbol || c.code })
      seen.add(c.code)
    }
    return list
  })

  // A currency the user deleted must not strand the UI on an unknown code.
  const code = computed(() =>
    options.value.some((o) => o.code === store.displayCurrency) ? store.displayCurrency : BASE_CURRENCY,
  )
  const symbol = computed(() => options.value.find((o) => o.code === code.value)?.symbol ?? code.value)

  // Central rate: units of `c` per 1 USD. USD is the base (1). A stored rate
  // wins; a built-in falls back to its default so the app still converts
  // sensibly before any rate has been set on /rates.
  function rateOf(c: string): number {
    if (c === BASE_CURRENCY) return 1
    const row = reference.currenciesByCode.get(c)
    if (row && row.usd_rate > 0) return row.usd_rate
    const builtIn = BUILT_IN_CURRENCIES.find((b) => b.code === c)
    return builtIn?.defaultRate ?? row?.usd_rate ?? 0
  }

  function digitsFor(c: string) {
    return c === 'USD' || c === 'EUR' ? 2 : 0
  }

  /** A USD amount → the active display currency. */
  function convert(usd: number): number {
    return usd * rateOf(code.value)
  }

  /** An amount typed in `from` (default: the active currency) → USD, for storage. */
  function toUsd(amount: number, from: string = code.value): number {
    const r = rateOf(from)
    return r > 0 ? amount / r : amount
  }

  /**
   * Re-express an amount held in `from` into `to` (default: the active
   * currency), via USD. Orders snapshot their totals in the currency they
   * were sold in, so this is how they follow the active-currency switch.
   */
  function convertBetween(amount: number, from: string, to: string = code.value): number {
    if (from === to) return amount
    return toUsd(amount, from) * rateOf(to)
  }

  function format(amount: number, digits?: number): string {
    return formatAmount(amount, symbol.value, digits ?? digitsFor(code.value))
  }

  /** Format an amount already denominated in `currencyCode`, with its own symbol. */
  function formatIn(currencyCode: string, amount: number, digits?: number): string {
    const sym = options.value.find((o) => o.code === currencyCode)?.symbol ?? currencyCode
    return formatAmount(amount, sym, digits ?? digitsFor(currencyCode))
  }

  /** An amount snapshotted in `from`, converted into and shown in the active currency. */
  function formatFrom(from: string, amount: number, digits?: number): string {
    return format(convertBetween(amount, from), digits)
  }

  return {
    code,
    symbol,
    options,
    rateOf,
    convert,
    toUsd,
    convertBetween,
    format,
    formatIn,
    formatFrom,
    setCurrency: store.setCurrency,
  }
}
