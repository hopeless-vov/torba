import { ordersApi } from '@/api/orders'
import { platformCurrenciesApi } from '@/api/platform-currencies'
import { supplierRatesApi } from '@/api/supplier-rates'
import { useCurrency } from '@/composables/use-currency'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useReferenceStore } from '@/stores/reference'
import type { RateHistoryEntry } from '@/types/database'
import { currencySymbol } from '@/utils/world-currencies'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

// The rates page: the supplier rate matrix — one cell per supplier and
// currency — and the base currency it is all expressed against.
//
// Setting a cell reprices that supplier's goods in that currency everywhere
// at once, because every price is converted at render time through it. The
// database keeps each cell's history.
export function useRates() {
  const auth = useAuthStore()
  const reference = useReferenceStore()
  const toast = useToast()
  const { t } = useI18n()
  const { setBase } = useCurrency()

  const saving = ref(false)
  const history = ref<RateHistoryEntry[]>([])
  const loadingHistory = ref(false)
  // Whether the company has orders, which a base change then has to convert
  // — and for that it needs a rate from the old base to the new one. Null
  // until known.
  const hasOrders = ref<boolean | null>(null)

  async function reload() {
    if (auth.companyId) await reference.load(auth.companyId)
  }

  /** Base units per 1 `currency`, for this supplier. */
  async function setRate(brandId: string, currency: string, rate: number, quiet = false): Promise<boolean> {
    if (!auth.companyId || !(rate > 0)) return false
    saving.value = true
    try {
      await supplierRatesApi.set({ company_id: auth.companyId, brand_id: brandId, currency, rate })
      await reload()
      if (!quiet) toast.success(t('toasts.rateUpdated'))
      return true
    } catch {
      toast.error(t('errors.save'))
      return false
    } finally {
      saving.value = false
    }
  }

  async function loadHistory(brandId: string, currency: string) {
    loadingHistory.value = true
    try {
      history.value = await supplierRatesApi.history(brandId, currency)
    } catch {
      history.value = []
    } finally {
      loadingHistory.value = false
    }
  }

  async function checkOrders() {
    if (!auth.companyId) return
    try {
      hasOrders.value = (await ordersApi.count(auth.companyId)) > 0
    } catch {
      hasOrders.value = null
    }
  }

  /**
   * Move the base. Every supplier rate is reset; orders on the books are
   * converted with `rate` (new base per 1 unit of the old). If an order
   * appeared since the page looked, the database asks for that rate, and the
   * page is told so rather than shown a generic failure.
   */
  async function changeBase(code: string, rate: number | null = null): Promise<boolean> {
    try {
      // A currency no company has used yet joins the platform list first.
      if (!reference.platformByCode.has(code)) await platformCurrenciesApi.ensure(code, currencySymbol(code))
      await setBase(code, rate)
      toast.success(t('toasts.saved'))
      return true
    } catch (e) {
      const message = typeof e === 'object' && e && 'message' in e ? String(e.message) : ''
      const needsRate = message.includes('base_currency_rate_required') || message.includes('base_currency_locked')
      if (needsRate) hasOrders.value = true
      toast.error(needsRate ? t('rates.baseRateRequired') : t('errors.save'))
      return false
    }
  }

  return {
    saving,
    history,
    loadingHistory,
    hasOrders,
    setRate,
    loadHistory,
    checkOrders,
    changeBase,
  }
}
