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

  function reset() {
    orders.value = []
    loaded.value = false
    error.value = null
  }

  return { orders, loading, loaded, error, load, reset }
})
