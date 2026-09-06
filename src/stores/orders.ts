import { type OrderRow,ordersApi } from '@/api/orders'
import { periodStart } from '@/utils/period'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useOrdersStore = defineStore('orders', () => {
  const orders = ref<OrderRow[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)
  // The earliest day held, or null once the whole history is in. Orders carry
  // their lines and their client, so reading every one of them on every app
  // start is the heaviest thing the app could do — and the screens that open
  // first only ever look at recent months.
  const loadedFrom = ref<string | null>(null)

  async function load(companyId: string, from: string | null = periodStart()) {
    loading.value = true
    error.value = null
    try {
      orders.value = await ordersApi.list(companyId, from)
      loadedFrom.value = from
      loaded.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  /**
   * Widen the window backwards for a screen that asks about an earlier day —
   * `null` for one that needs the whole history. A window already wide enough
   * is left alone, so this is safe to call on every filter change.
   */
  async function ensureFrom(companyId: string, day: string | null) {
    if (loadedFrom.value === null) return
    if (day !== null && day >= loadedFrom.value) return
    await load(companyId, day)
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
    loadedFrom.value = null
  }

  return { orders, loading, loaded, error, loadedFrom, load, ensureFrom, upsert, removeLocal, reset }
})
