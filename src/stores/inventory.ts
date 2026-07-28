import { batchesApi, type BatchRow } from '@/api/batches'
import { type ProductRow,productsApi } from '@/api/products'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// Products (catalogue) + batches (warehouse). They share the stock
// relationship, so both the Catalog and Warehouse views read from here.
export const useInventoryStore = defineStore('inventory', () => {
  const products = ref<ProductRow[]>([])
  const batches = ref<BatchRow[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const loaded = ref(false)

  const stockByProduct = computed(() => {
    const map = new Map<string, number>()
    for (const batch of batches.value) {
      map.set(batch.product_id, (map.get(batch.product_id) ?? 0) + batch.remaining_qty)
    }
    return map
  })

  async function load(companyId: string) {
    loading.value = true
    error.value = null
    try {
      const [p, b] = await Promise.all([productsApi.list(companyId), batchesApi.list(companyId)])
      products.value = p
      batches.value = b
      loaded.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  function reset() {
    products.value = []
    batches.value = []
    loaded.value = false
    error.value = null
  }

  return { products, batches, loading, error, loaded, stockByProduct, load, reset }
})
