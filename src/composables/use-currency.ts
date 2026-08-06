import { useAuthStore } from '@/stores/auth'
import { useCurrencyStore } from '@/stores/currency'
import { useReferenceStore } from '@/stores/reference'
import type { Brand } from '@/types/database'
import { CURRENCY_SYMBOLS, formatAmount } from '@/utils/format'
import { computed } from 'vue'

// Three distinct rates, kept separate:
//
//   • Market rate — the bank/reference rate, used only to *display* amounts
//     in a chosen currency. Stored per company in `currencies.usd_rate` as a
//     per-USD numeraire (units of the currency per 1 USD). USD is only that
//     numeraire; it is NOT the base currency.
//   • Functional currency — `company.base_currency`, the currency the books
//     are kept in. It can be any currency. Product retail and order amounts
//     are stored in it.
//   • Supplier rate — each brand's own rate for the currency it prices its
//     goods in (`brand.supplier_rate`, functional units per catalog unit).
//     It drives cost and is deliberately independent of the market rate.
//
// A value lives in the functional currency; what the user sees is that value
// re-expressed into the top-bar *display* currency through the market rate.
export const NUMERAIRE = 'USD'

export const BUILT_IN_CURRENCIES = [
  { code: 'UAH', symbol: CURRENCY_SYMBOLS.UAH, defaultRate: 41 },
  { code: 'USD', symbol: CURRENCY_SYMBOLS.USD, defaultRate: 1 },
  { code: 'EUR', symbol: CURRENCY_SYMBOLS.EUR, defaultRate: 0.92 },
] as const

export const BUILT_IN_CODES: string[] = BUILT_IN_CURRENCIES.map((c) => c.code)

export function useCurrency() {
  const store = useCurrencyStore()
  const reference = useReferenceStore()
  const auth = useAuthStore()

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

  // The functional (base) currency: the company's book currency. Everything
  // is stored/reckoned in it. Falls back to the numeraire if unset.
  const functionalCode = computed(() => auth.company?.base_currency || NUMERAIRE)
  const functionalSymbol = computed(
    () => options.value.find((o) => o.code === functionalCode.value)?.symbol ?? functionalCode.value,
  )

  // The active display currency (top bar). A deleted currency must not strand
  // the UI on an unknown code, so it falls back to the functional currency.
  const code = computed(() =>
    options.value.some((o) => o.code === store.displayCurrency) ? store.displayCurrency : functionalCode.value,
  )
  const symbol = computed(() => options.value.find((o) => o.code === code.value)?.symbol ?? code.value)

  // Market rate: units of `c` per 1 USD (numeraire). A stored rate wins; a
  // built-in falls back to its default so the app converts sensibly before
  // any rate has been set on /rates.
  function rateOf(c: string): number {
    if (c === NUMERAIRE) return 1
    const row = reference.currenciesByCode.get(c)
    if (row && row.usd_rate > 0) return row.usd_rate
    const builtIn = BUILT_IN_CURRENCIES.find((b) => b.code === c)
    return builtIn?.defaultRate ?? row?.usd_rate ?? 0
  }

  function digitsFor(c: string) {
    return c === 'USD' || c === 'EUR' ? 2 : 0
  }

  /**
   * Re-express an amount held in `from` into `to` (default: the active display
   * currency), via the USD numeraire. Orders snapshot their totals in the
   * currency they were sold in, so this is how they follow the display switch.
   */
  function convertBetween(amount: number, from: string, to: string = code.value): number {
    if (from === to) return amount
    const rf = rateOf(from)
    return (rf > 0 ? amount / rf : amount) * rateOf(to)
  }

  /** A functional-currency amount → the active display currency. */
  function toDisplay(functionalAmount: number): number {
    return convertBetween(functionalAmount, functionalCode.value)
  }

  /**
   * A product's cost in the functional currency: its catalog-currency cost
   * multiplied by the brand's supplier rate. Reflows automatically when the
   * supplier changes their rate.
   */
  function functionalCost(costAmount: number, brand: Brand | null | undefined): number {
    return costAmount * (brand?.supplier_rate ?? 0)
  }

  /**
   * A product's cost, held in `costCurrency`, resolved into `to` (default: the
   * active display currency). When the cost is in the brand's own catalog
   * currency and that brand has a supplier rate, the supplier rate wins over
   * the market table — it converts to the functional currency, which is then
   * shown in `to`. Otherwise the shared market table converts directly.
   */
  function costToDisplay(
    costAmount: number,
    costCurrency: string,
    brand: Brand | null | undefined,
    to: string = code.value,
  ): number {
    if (brand?.supplier_rate && brand.supplier_rate > 0 && costCurrency === brand.catalog_currency) {
      return convertBetween(functionalCost(costAmount, brand), functionalCode.value, to)
    }
    return convertBetween(costAmount, costCurrency, to)
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

  /** Format a functional-currency amount in the active display currency. */
  function formatFunctional(functionalAmount: number, digits?: number): string {
    return format(toDisplay(functionalAmount), digits)
  }

  /** Change the functional (base) currency — persisted on the company. */
  async function setBase(nextCode: string): Promise<void> {
    await auth.setBaseCurrency(nextCode)
  }

  return {
    code,
    symbol,
    functionalCode,
    functionalSymbol,
    options,
    rateOf,
    convertBetween,
    toDisplay,
    functionalCost,
    costToDisplay,
    format,
    formatIn,
    formatFrom,
    formatFunctional,
    setCurrency: store.setCurrency,
    setBase,
  }
}
