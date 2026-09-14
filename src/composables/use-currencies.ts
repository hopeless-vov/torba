import { currenciesApi } from '@/api/currencies'
import { platformCurrenciesApi } from '@/api/platform-currencies'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useInventoryStore } from '@/stores/inventory'
import { useReferenceStore } from '@/stores/reference'
import { isOffered, worldCurrencies, type WorldCurrency } from '@/utils/world-currencies'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// Which currencies the company uses besides its base. Any real currency can
// be added — the first company to use a code puts it on the platform list —
// and adding one opens a column in the supplier rate matrix. Removing one
// closes it and drops its rates; a currency a price is still in cannot go,
// since that price would be left with nothing to be converted by.
export function useCurrencies() {
  const auth = useAuthStore()
  const reference = useReferenceStore()
  const inventory = useInventoryStore()
  const toast = useToast()
  const { t, locale } = useI18n()

  const base = computed(() => auth.company?.base_currency ?? '')

  /** Every real currency, with the platform's symbol where it has one. */
  const world = computed<WorldCurrency[]>(() => {
    const list = worldCurrencies(locale.value)
    const known = new Set(list.map((c) => c.code))
    // A platform code the runtime does not know is still offered.
    for (const c of reference.platformCurrencies) {
      if (!known.has(c.code) && isOffered(c.code)) list.push({ code: c.code, symbol: c.symbol, name: c.code })
    }
    return list.map((c) => ({ ...c, symbol: reference.platformByCode.get(c.code)?.symbol ?? c.symbol }))
  })

  /** Currencies not in use yet — what "add" can offer. */
  const available = computed(() => {
    const used = new Set(reference.currencies.map((c) => c.code))
    return world.value.filter((c) => c.code !== base.value && !used.has(c.code))
  })

  /** Does any price still depend on this currency? */
  function inUse(code: string): boolean {
    return (
      inventory.products.some((p) => p.cost_currency === code || p.retail_currency === code) ||
      inventory.batches.some((b) => b.cost_currency === code || b.retail_currency === code)
    )
  }

  /** brand_id → the currencies that supplier's prices (products and batches) are in. */
  const usedBySupplier = computed(() => {
    const map = new Map<string, Set<string>>()
    const brandOf = new Map<string, string>()
    const note = (brandId: string | null, code: string | null) => {
      if (!brandId || !code) return
      const set = map.get(brandId) ?? new Set<string>()
      set.add(code)
      map.set(brandId, set)
    }
    for (const p of inventory.products) {
      if (p.brand_id) brandOf.set(p.id, p.brand_id)
      note(p.brand_id, p.cost_currency)
      if (p.retail_amount != null) note(p.brand_id, p.retail_currency)
    }
    for (const b of inventory.batches) {
      const brandId = brandOf.get(b.product_id) ?? null
      if (b.cost_amount != null) note(brandId, b.cost_currency)
      if (b.retail_amount != null) note(brandId, b.retail_currency)
    }
    return map
  })

  /** Does this supplier have any price in this currency — so needs a rate for it? */
  function supplierUses(brandId: string, code: string): boolean {
    return usedBySupplier.value.get(brandId)?.has(code) ?? false
  }

  async function reload() {
    if (auth.companyId) await reference.load(auth.companyId)
  }

  async function addCurrency(code: string): Promise<boolean> {
    const pick = available.value.find((c) => c.code === code)
    if (!auth.companyId || !pick) return false
    try {
      if (!reference.platformByCode.has(code)) await platformCurrenciesApi.ensure(code, pick.symbol)
      await currenciesApi.create({ company_id: auth.companyId, code })
      await reload()
      toast.success(t('toasts.saved'))
      return true
    } catch {
      toast.error(t('errors.save'))
      return false
    }
  }

  /** False — with the reason said out loud — when a price still needs it. */
  async function removeCurrency(id: string): Promise<boolean> {
    const row = reference.currencies.find((c) => c.id === id)
    if (!row) return false
    if (inUse(row.code)) {
      toast.error(t('rates.currencyInUse', { code: row.code }))
      return false
    }
    try {
      await currenciesApi.remove(id)
      await reload()
      toast.success(t('toasts.deleted'))
      return true
    } catch {
      toast.error(t('errors.delete'))
      return false
    }
  }

  return { world, available, inUse, supplierUses, addCurrency, removeCurrency }
}
