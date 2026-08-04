import { ordersApi } from '@/api/orders'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useInventoryStore } from '@/stores/inventory'
import { useOrdersStore } from '@/stores/orders'
import { useUiStore } from '@/stores/ui'
import type { OrderPatch, OrderStatus } from '@/types/database'
import type { OrderView } from '@/types/models'
import { computeOrderTotals } from '@/utils/orders'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

export function useOrders() {
  const store = useOrdersStore()
  const inventory = useInventoryStore()
  const ui = useUiStore()
  const auth = useAuthStore()
  const toast = useToast()
  const { t } = useI18n()

  const statusFilter = ref<'all' | OrderStatus>('all')
  const paymentFilter = ref('all')
  const clientFilter = ref('all')
  // Inclusive 'YYYY-MM-DD' bounds; either side may be left blank (open-ended).
  const fromDate = ref('')
  const toDate = ref('')

  const views = computed<OrderView[]>(() =>
    store.orders.map((o) => {
      const items = o.items.map((i) => ({
        ...i,
        lineSale: i.qty * i.unit_price,
        lineCost: i.qty * i.unit_cost,
      }))
      const totals = computeOrderTotals(o.items, o.delivery_cost, o.packaging_cost)
      return {
        ...o,
        client: o.client,
        items,
        itemsCount: o.items.length,
        saleTotal: totals.saleTotal,
        goodsCost: totals.goodsCost,
        costTotal: totals.costTotal,
        profit: totals.profit,
        margin: totals.margin,
      }
    }),
  )

  // Searching an order means "the number, or who/where it went" — a
  // leading '#' is tolerated because that is how the number is displayed.
  const filtered = computed(() => {
    const q = ui.search.trim().toLowerCase().replace(/^#/, '')
    return views.value.filter((o) => {
      if (statusFilter.value !== 'all' && o.status !== statusFilter.value) return false
      if (paymentFilter.value !== 'all' && o.payment_method !== paymentFilter.value) return false
      if (clientFilter.value !== 'all' && o.client_id !== clientFilter.value) return false
      const day = o.created_at.slice(0, 10)
      if (fromDate.value && day < fromDate.value) return false
      if (toDate.value && day > toDate.value) return false
      if (q) {
        const haystack = [
          o.number,
          o.client?.name,
          o.client?.phone,
          o.tracking_number,
          o.delivery_address,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  })

  const kpis = computed(() => {
    let revenue = 0
    let cost = 0
    let profit = 0
    for (const o of filtered.value) {
      revenue += o.saleTotal
      cost += o.costTotal
      profit += o.profit
    }
    return { revenue, cost, profit, margin: revenue > 0 ? profit / revenue : null }
  })

  // The currency the KPI totals are expressed in. Orders snapshot their
  // amounts in the currency they were transacted in, so summing across
  // currencies is only meaningful when the filtered orders share one —
  // which is the normal single-currency case. Mixed → null (ambiguous).
  const kpiCurrency = computed<string | null>(() => {
    const codes = new Set(filtered.value.map((o) => o.currency))
    return codes.size === 1 ? [...codes][0] : null
  })

  async function setStatus(id: string, status: OrderStatus) {
    try {
      await ordersApi.setStatus(id, status)
      if (auth.companyId) await store.load(auth.companyId)
      toast.success(t('toasts.statusUpdated'))
    } catch {
      toast.error(t('errors.save'))
    }
  }

  async function updateOrder(id: string, patch: OrderPatch) {
    try {
      await ordersApi.update(id, patch)
      if (auth.companyId) await store.load(auth.companyId)
      toast.success(t('toasts.saved'))
    } catch (e) {
      toast.error(t('errors.save'))
      throw e
    }
  }

  async function removeOrder(id: string) {
    await removeOrders([id])
  }

  // Deleting returns the goods to their batches (delete_orders in
  // migration 0004), so the warehouse has to be reloaded too.
  async function removeOrders(ids: string[]) {
    if (ids.length === 0) return
    try {
      await ordersApi.removeMany(ids)
      if (auth.companyId) {
        await Promise.all([store.load(auth.companyId), inventory.load(auth.companyId)])
      }
      toast.success(t('toasts.deleted'))
    } catch (e) {
      toast.error(t('errors.delete'))
      throw e
    }
  }

  return {
    views,
    filtered,
    kpis,
    kpiCurrency,
    statusFilter,
    paymentFilter,
    clientFilter,
    fromDate,
    toDate,
    setStatus,
    updateOrder,
    removeOrder,
    removeOrders,
  }
}
