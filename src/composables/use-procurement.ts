import { type BackorderRow, ordersApi } from '@/api/orders'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useOrdersStore } from '@/stores/orders'
import type { ProcurementStatus } from '@/types/database'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

// Goods to order: every order line that asked for more than the shelf held
// (create_order records the shortfall, see 0023). Each one moves along
// to order → ordered → delivered on its own, whatever its order's status.

export const PROCUREMENT_STATUSES: ProcurementStatus[] = ['to_order', 'ordered', 'delivered']

export function useProcurement() {
  const auth = useAuthStore()
  const orders = useOrdersStore()
  const toast = useToast()
  const { t } = useI18n()

  const lines = ref<BackorderRow[]>([])
  const loading = ref(false)
  const error = ref(false)

  // What still needs doing first; within a status, the newest order first
  // (the order the database already returns them in).
  const rows = computed(() =>
    lines.value
      .map((line, i) => ({ line, i }))
      .sort(
        (a, b) =>
          PROCUREMENT_STATUSES.indexOf(a.line.procurement_status ?? 'to_order') -
            PROCUREMENT_STATUSES.indexOf(b.line.procurement_status ?? 'to_order') || a.i - b.i,
      )
      .map(({ line }) => line),
  )

  /** Lines not delivered yet — the count on the tab. */
  const pending = computed(() => lines.value.filter((l) => l.procurement_status !== 'delivered').length)

  async function load() {
    if (!auth.companyId) return
    loading.value = true
    error.value = false
    try {
      lines.value = await ordersApi.backorders(auth.companyId)
    } catch {
      error.value = true
    } finally {
      loading.value = false
    }
  }

  async function setStatus(itemId: string, status: ProcurementStatus): Promise<boolean> {
    try {
      const saved = await ordersApi.setProcurementStatus(itemId, status)
      lines.value = lines.value.map((l) => (l.id === itemId ? { ...l, procurement_status: saved.procurement_status } : l))
      // The same line inside the loaded orders, so its badge there follows.
      for (const order of orders.orders) {
        const item = order.items.find((i) => i.id === itemId)
        if (item) item.procurement_status = saved.procurement_status
      }
      toast.success(t('toasts.statusUpdated'))
      return true
    } catch {
      toast.error(t('errors.save'))
      return false
    }
  }

  return { rows, pending, loading, error, load, setStatus }
}
