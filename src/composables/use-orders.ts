import { ordersApi } from '@/api/orders'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useOrdersStore } from '@/stores/orders'
import { useUiStore } from '@/stores/ui'
import type { OrderStatus } from '@/types/database'
import type { OrderView } from '@/types/models'
import { computeOrderTotals } from '@/utils/orders'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

export function useOrders() {
  const store = useOrdersStore()
  const ui = useUiStore()
  const auth = useAuthStore()
  const toast = useToast()
  const { t } = useI18n()

  const statusFilter = ref<'all' | OrderStatus>('all')
  const paymentFilter = ref('all')
  const clientFilter = ref('all')

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

  const filtered = computed(() => {
    const q = ui.search.trim().toLowerCase()
    return views.value.filter((o) => {
      if (statusFilter.value !== 'all' && o.status !== statusFilter.value) return false
      if (paymentFilter.value !== 'all' && o.payment_method !== paymentFilter.value) return false
      if (clientFilter.value !== 'all' && o.client_id !== clientFilter.value) return false
      if (q && !`${o.number} ${o.client?.name ?? ''}`.toLowerCase().includes(q)) return false
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

  async function setStatus(id: string, status: OrderStatus) {
    try {
      await ordersApi.setStatus(id, status)
      if (auth.companyId) await store.load(auth.companyId)
      toast.success(t('toasts.statusUpdated'))
    } catch {
      toast.error(t('errors.save'))
    }
  }

  return { filtered, kpis, statusFilter, paymentFilter, clientFilter, setStatus }
}
