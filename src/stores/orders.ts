import { type OrderRow,ordersApi } from '@/api/orders'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useOrdersStore = defineStore('orders', () => {
  const orders = ref<OrderRow[]>([])
  const loading = ref(false)
  const loaded = ref(false)

  async function load(companyId: string) {
    loading.value = true
    try {
      orders.value = await ordersApi.list(companyId)
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  function reset() {
    orders.value = []
    loaded.value = false
  }

  return { orders, loading, loaded, load, reset }
})
