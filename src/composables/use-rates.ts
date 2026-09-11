import { brandsApi } from '@/api/brands'
import { ordersApi } from '@/api/orders'
import { supplierRatesApi } from '@/api/supplier-rates'
import { useCurrency } from '@/composables/use-currency'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useReferenceStore } from '@/stores/reference'
import type { RateHistoryEntry } from '@/types/database'
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
  // Whether the company has sold anything, which is what pins the base.
  // Null until known, so the page does not offer a change it might then
  // have to take back.
  const baseLocked = ref<boolean | null>(null)

  async function reload() {
    if (auth.companyId) await reference.load(auth.companyId)
  }

  /** Base units per 1 `currency`, for this supplier. */
  async function setRate(brandId: string, currency: string, rate: number): Promise<boolean> {
    if (!auth.companyId || !(rate > 0)) return false
    saving.value = true
    try {
      await supplierRatesApi.set({ company_id: auth.companyId, brand_id: brandId, currency, rate })
      await reload()
      toast.success(t('toasts.rateUpdated'))
      return true
    } catch {
      toast.error(t('errors.save'))
      return false
    } finally {
      saving.value = false
    }
  }

  /** The currency a supplier quotes in by default — for new products and price lists. */
  async function setCatalogCurrency(brandId: string, code: string) {
    try {
      await brandsApi.setCatalogCurrency(brandId, code)
      await reload()
      toast.success(t('toasts.saved'))
    } catch {
      toast.error(t('errors.save'))
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

  async function checkBaseLock() {
    if (!auth.companyId) return
    try {
      baseLocked.value = (await ordersApi.count(auth.companyId)) > 0
    } catch {
      baseLocked.value = null
    }
  }

  /**
   * Move the base. The database refuses once an order exists, and resets the
   * supplier rates when it agrees; a refusal that arrives here anyway (an
   * order placed a moment ago) is said as such, not as a generic failure.
   */
  async function changeBase(code: string): Promise<boolean> {
    try {
      await setBase(code)
      toast.success(t('toasts.saved'))
      return true
    } catch (e) {
      const message = typeof e === 'object' && e && 'message' in e ? String(e.message) : ''
      const locked = message.includes('base_currency_locked')
      if (locked) baseLocked.value = true
      toast.error(locked ? t('rates.baseLocked') : t('errors.save'))
      return false
    }
  }

  return {
    saving,
    history,
    loadingHistory,
    baseLocked,
    setRate,
    setCatalogCurrency,
    loadHistory,
    checkBaseLock,
    changeBase,
  }
}
