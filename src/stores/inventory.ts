import { batchesApi, type BatchRow } from '@/api/batches'
import { type ProductRow,productsApi } from '@/api/products'
import { compareByExpiry } from '@/utils/batch-status'
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

  // Saving one row used to refetch the whole company. These put the row the
  // server just handed back where the list keeps it, in the order `list`
  // would have returned it — products newest first, batches by expiry.
  function upsertProduct(row: ProductRow) {
    const i = products.value.findIndex((p) => p.id === row.id)
    if (i >= 0) products.value[i] = row
    else products.value.unshift(row)
  }

  // Products cascade to their batches in the database (see 0001), so the
  // shelf has to lose them here too — otherwise the warehouse shows stock of
  // a product that no longer exists until the next full load.
  function removeProducts(ids: string[]) {
    const gone = new Set(ids)
    products.value = products.value.filter((p) => !gone.has(p.id))
    batches.value = batches.value.filter((b) => !gone.has(b.product_id))
  }

  function upsertBatch(row: BatchRow) {
    const i = batches.value.findIndex((b) => b.id === row.id)
    if (i >= 0) batches.value[i] = row
    else batches.value.push(row)
    batches.value.sort(compareByExpiry)
  }

  function removeBatches(ids: string[]) {
    const gone = new Set(ids)
    batches.value = batches.value.filter((b) => !gone.has(b.id))
  }

  function reset() {
    products.value = []
    batches.value = []
    loaded.value = false
    error.value = null
  }

  return {
    products,
    batches,
    loading,
    error,
    loaded,
    stockByProduct,
    load,
    upsertProduct,
    removeProducts,
    upsertBatch,
    removeBatches,
    reset,
  }
})
