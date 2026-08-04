import { type ClientPatch,clientsApi } from '@/api/clients'
import { useCurrency } from '@/composables/use-currency'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useOrdersStore } from '@/stores/orders'
import { useUiStore } from '@/stores/ui'
import type { NewClient } from '@/types/database'
import type { ClientView } from '@/types/models'
import { computeOrderTotals } from '@/utils/orders'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

export function useClients() {
  const store = useClientsStore()
  const orders = useOrdersStore()
  const ui = useUiStore()
  const auth = useAuthStore()
  const toast = useToast()
  const { t } = useI18n()
  const { convertBetween } = useCurrency()

  const views = computed<ClientView[]>(() =>
    store.clients.map((c) => {
      const own = orders.orders.filter((o) => o.client_id === c.id)
      // Each order is snapshotted in its own currency; convert to the active
      // one before summing so the spend total is coherent.
      const totalSpent = own.reduce(
        (sum, o) => sum + convertBetween(computeOrderTotals(o.items, 0, 0, o.discount).saleTotal, o.currency),
        0,
      )
      return { ...c, ordersCount: own.length, totalSpent }
    }),
  )

  const filtered = computed(() => {
    const q = ui.search.trim().toLowerCase()
    if (!q) return views.value
    return views.value.filter((c) => `${c.name} ${c.phone ?? ''}`.toLowerCase().includes(q))
  })

  async function reload() {
    if (auth.companyId) await store.load(auth.companyId)
  }

  async function createClient(payload: Omit<NewClient, 'company_id'>) {
    if (!auth.companyId) return
    try {
      const created = await clientsApi.create({ ...payload, company_id: auth.companyId })
      store.upsert(created)
      toast.success(t('toasts.saved'))
    } catch (e) {
      toast.error(t('errors.save'))
      throw e
    }
  }

  async function updateClient(id: string, patch: ClientPatch) {
    try {
      const updated = await clientsApi.update(id, patch)
      store.upsert(updated)
      toast.success(t('toasts.saved'))
    } catch (e) {
      toast.error(t('errors.save'))
      throw e
    }
  }

  async function removeClient(id: string) {
    try {
      await clientsApi.remove(id)
      store.removeLocal(id)
      toast.success(t('toasts.deleted'))
    } catch {
      toast.error(t('errors.delete'))
    }
  }

  return { filtered, createClient, updateClient, removeClient, reload }
}
