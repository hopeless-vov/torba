import { currenciesApi } from '@/api/currencies'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useInventoryStore } from '@/stores/inventory'
import { useReferenceStore } from '@/stores/reference'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// Which of the platform's currencies the company uses besides its base.
// Adding one opens a column in the supplier rate matrix; removing one closes
// it and drops its rates. A currency a price is still in cannot go: that
// price would be left with nothing to be converted by.
export function useCurrencies() {
  const auth = useAuthStore()
  const reference = useReferenceStore()
  const inventory = useInventoryStore()
  const toast = useToast()
  const { t } = useI18n()

  const base = computed(() => auth.company?.base_currency ?? '')

  /** Platform currencies not in use yet — what "add" can offer. */
  const available = computed(() => {
    const used = new Set(reference.currencies.map((c) => c.code))
    return reference.platformCurrencies.filter((c) => c.code !== base.value && !used.has(c.code))
  })

  /** Does any price, or any supplier's default, still depend on this currency? */
  function inUse(code: string): boolean {
    return (
      reference.brands.some((b) => b.catalog_currency === code) ||
      inventory.products.some((p) => p.cost_currency === code || p.retail_currency === code) ||
      inventory.batches.some((b) => b.cost_currency === code || b.retail_currency === code)
    )
  }

  async function reload() {
    if (auth.companyId) await reference.load(auth.companyId)
  }

  async function addCurrency(code: string) {
    if (!auth.companyId || !available.value.some((c) => c.code === code)) return
    try {
      await currenciesApi.create({ company_id: auth.companyId, code })
      await reload()
      toast.success(t('toasts.saved'))
    } catch {
      toast.error(t('errors.save'))
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

  return { available, inUse, addCurrency, removeCurrency }
}
