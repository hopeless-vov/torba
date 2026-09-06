import { type OrderRow,ordersApi } from '@/api/orders'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useOrdersStore = defineStore('orders', () => {
  const orders = ref<OrderRow[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)

  async function load(companyId: string) {
    loading.value = true
    error.value = null
    try {
      orders.value = await ordersApi.list(companyId)
      loaded.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  // The list is newest first, and an order's date does not change, so a new
  // one belongs at the front and an edited one stays where it is.
  function upsert(row: OrderRow) {
    const i = orders.value.findIndex((o) => o.id === row.id)
    if (i >= 0) orders.value[i] = row
    else orders.value.unshift(row)
  }

  function removeLocal(ids: string[]) {
    const gone = new Set(ids)
    orders.value = orders.value.filter((o) => !gone.has(o.id))
  }

  function reset() {
    orders.value = []
    loaded.value = false
    error.value = null
  }

  return { orders, loading, loaded, error, load, upsert, removeLocal, reset }
})
