import { useAuthStore } from '@/stores/auth'
import { useReferenceStore } from '@/stores/reference'
import { CURRENCY_SYMBOLS, formatAmount } from '@/utils/format'
import { costOf, retailOf } from '@/utils/pricing'
import { computed } from 'vue'

// One currency of account. The company keeps its books in its base currency
// (`company.base_currency`), and every amount the app shows, sums or stores
// is in it — orders included; the database makes sure of that (0019).
//
// The only exchange rates are the suppliers'. A price is entered in whatever
// currency its supplier quotes, and every supplier has its own rate for every
// currency the company uses: how much of the base one unit is worth to them.
// Converting a price therefore always asks whose price it is — the same
// dollar is worth 41.5 ₴ to one supplier and 42 ₴ to another, and changing
// one supplier's rate reprices that supplier's goods and nothing else.
//
// A rate nobody entered is never guessed at: conversions return null, and
// the screens say which rate is missing and where to add it.

/** A price as a product carries it. */
type CostSource = { brand_id: string | null; cost_amount: number; cost_currency: string }
type RetailSource = { brand_id: string | null; retail_amount: number | null; retail_currency: string }
/** A batch's own prices, which win over the product's when set. */
type BatchCost = { cost_amount: number | null; cost_currency: string | null }
type BatchRetail = { retail_amount: number | null; retail_currency: string | null }

/** Only for the moment before a company has loaded. */
const DEFAULT_BASE = 'UAH'

export function useCurrency() {
  const reference = useReferenceStore()
  const auth = useAuthStore()

  const functionalCode = computed(() => auth.company?.base_currency || DEFAULT_BASE)

  function symbolOf(code: string): string {
    return reference.platformByCode.get(code)?.symbol || CURRENCY_SYMBOLS[code] || code
  }

  const functionalSymbol = computed(() => symbolOf(functionalCode.value))

  /** What a price may be entered in: the base first, then the company's others. */
  const options = computed(() => {
    const base = functionalCode.value
    const codes = [base, ...reference.currencies.map((c) => c.code).filter((c) => c !== base)]
    return codes.map((code) => ({ code, symbol: symbolOf(code) }))
  })

  /**
   * Base units per 1 unit of `currency`, as this supplier reckons it: 1 for
   * the base itself, null while nobody has entered it.
   */
  function rateFor(brandId: string | null | undefined, currency: string): number | null {
    if (currency === functionalCode.value) return 1
    if (!brandId) return null
    const rate = reference.ratesByBrand.get(brandId)?.get(currency)
    return rate != null && rate > 0 ? rate : null
  }

  function hasRate(brandId: string | null | undefined, currency: string): boolean {
    return rateFor(brandId, currency) != null
  }

  /** An amount in `currency`, in the base, at this supplier's rate. */
  function toBase(amount: number, currency: string, brandId: string | null | undefined): number | null {
    const rate = rateFor(brandId, currency)
    return rate == null ? null : amount * rate
  }

  /** The other way round: a base amount expressed in `currency` at this supplier's rate. */
  function fromBase(amount: number, currency: string, brandId: string | null | undefined): number | null {
    const rate = rateFor(brandId, currency)
    return rate == null ? null : amount / rate
  }

  /** What one unit cost, in the base — the batch's own price when it has one. */
  function costInBase(product: CostSource, batch?: BatchCost | null): number | null {
    const { amount, currency } = costOf(batch, product)
    return toBase(amount, currency, product.brand_id)
  }

  /** What one unit sells for, in the base; null with no price, or no rate for it. */
  function retailInBase(product: RetailSource, batch?: BatchRetail | null): number | null {
    const { amount, currency } = retailOf(batch, product)
    return amount == null ? null : toBase(amount, currency, product.brand_id)
  }

  /**
   * The retail price in the currency the supplier quotes the cost in — the
   * pair a price list prints side by side: "you buy at 55, you sell at 80".
   * A retail price kept in another currency is brought over through the base;
   * null with no retail price, or when a rate it needs is missing.
   */
  function retailInCostCurrency(product: CostSource & RetailSource): number | null {
    if (product.retail_amount == null) return null
    if (product.retail_currency === product.cost_currency) return product.retail_amount
    const base = retailInBase(product)
    return base == null ? null : fromBase(base, product.cost_currency, product.brand_id)
  }

  /**
   * The currency a price is still waiting for a rate in, or null when all it
   * needs is known. Cost first: without it there is no margin to speak of.
   */
  function missingRate(
    product: CostSource & RetailSource,
    batch?: (BatchCost & BatchRetail) | null,
  ): string | null {
    const cost = costOf(batch, product)
    if (!hasRate(product.brand_id, cost.currency)) return cost.currency
    const retail = retailOf(batch, product)
    if (retail.amount != null && !hasRate(product.brand_id, retail.currency)) return retail.currency
    return null
  }

  function digitsFor(code: string) {
    return code === 'USD' || code === 'EUR' ? 2 : 0
  }

  /** A base-currency amount, formatted — which is every amount the app shows. */
  function format(amount: number, digits?: number): string {
    return formatAmount(amount, functionalSymbol.value, digits ?? digitsFor(functionalCode.value))
  }

  /** An amount in `code` — a supplier's own price — under that currency's symbol. */
  function formatIn(code: string, amount: number, digits?: number): string {
    return formatAmount(amount, symbolOf(code), digits ?? digitsFor(code))
  }

  /**
   * Make another currency the base. Allowed only while the company has no
   * orders, and it resets every supplier rate — both enforced by the
   * database (0019), so this persists the change and reloads what it moved.
   */
  async function setBase(code: string): Promise<void> {
    if (code === functionalCode.value) return
    await auth.setBaseCurrency(code)
    if (auth.companyId) await reference.load(auth.companyId)
  }

  return {
    functionalCode,
    functionalSymbol,
    options,
    symbolOf,
    rateFor,
    hasRate,
    toBase,
    fromBase,
    costInBase,
    retailInBase,
    retailInCostCurrency,
    missingRate,
    format,
    formatIn,
    setBase,
  }
}
