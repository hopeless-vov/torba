import { brandsApi } from '@/api/brands'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useReferenceStore } from '@/stores/reference'
import type { Brand, RateHistoryEntry } from '@/types/database'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

export function useRates() {
  const auth = useAuthStore()
  const reference = useReferenceStore()
  const toast = useToast()
  const { t } = useI18n()

  const updating = ref(false)
  const history = ref<RateHistoryEntry[]>([])
  const loadingHistory = ref(false)

  async function updateRate(brand: Brand, rate: number) {
    updating.value = true
    try {
      await brandsApi.updateRate(brand, rate)
      if (auth.companyId) await reference.load(auth.companyId)
      toast.success(t('toasts.rateUpdated'))
    } catch {
      toast.error(t('errors.save'))
    } finally {
      updating.value = false
    }
  }

  async function loadHistory(brandId: string) {
    loadingHistory.value = true
    try {
      history.value = await brandsApi.rateHistory(brandId)
    } finally {
      loadingHistory.value = false
    }
  }

  return { updating, history, loadingHistory, updateRate, loadHistory }
}
