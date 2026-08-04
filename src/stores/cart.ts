import type { Batch, Brand, Product } from '@/types/database'
import type { CartLine } from '@/types/models'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// Order-in-progress. Lines can come from the catalog (no batch) or from a
// specific warehouse batch. Prices are held in the current display
// currency; the order is snapshotted from these at checkout.
//
// Quantity is never capped by stock: anything in the catalog can be sold,
// and a line above `stockQty` goes out as a backorder (the database draws
// down what exists and leaves the rest — see migration 0004). The drawer
// flags such lines so the shortfall is visible before checkout.
export const useCartStore = defineStore('cart', () => {
  const lines = ref<CartLine[]>([])
  const open = ref(false)
  const clientId = ref<string | null>(null)
  const paymentMethod = ref<string | null>(null)
  // Discount override for this order. `null` = follow the selected client's
  // agreed discount; a number wins over it (a one-off deal for this order).
  const discount = ref<number | null>(null)

  const count = computed(() => lines.value.reduce((sum, l) => sum + l.qty, 0))
  const isEmpty = computed(() => lines.value.length === 0)
  const hasBackorder = computed(() => lines.value.some((l) => l.qty > l.stockQty))

  function lineKey(productId: string, batchId: string | null) {
    return batchId ? `${productId}:${batchId}` : productId
  }

  function addLine(input: {
    product: Product
    brand: Brand | null
    batch?: Batch | null
    unitPrice: number
    unitCost: number
    qty?: number
    stockQty?: number
  }) {
    const batch = input.batch ?? null
    const want = Math.max(1, input.qty ?? 1)
    const key = lineKey(input.product.id, batch?.id ?? null)
    const existing = lines.value.find((l) => l.key === key)

    if (existing) {
      existing.qty += want
      if (input.stockQty !== undefined) existing.stockQty = input.stockQty
      return
    }

    lines.value.push({
      key,
      product: input.product,
      brand: input.brand,
      batch,
      qty: want,
      stockQty: input.stockQty ?? 0,
      unitPrice: input.unitPrice,
      unitCost: input.unitCost,
    })
  }

  function setQty(key: string, qty: number) {
    const line = lines.value.find((l) => l.key === key)
    if (!line) return
    if (qty <= 0) {
      remove(key)
      return
    }
    line.qty = qty
  }

  /**
   * Move a line onto another batch of the same product — this is how the
   * user chooses which expiry date to ship. Landing on a batch that is
   * already in the cart merges the two lines.
   */
  function setBatch(key: string, batch: Batch | null, stockQty: number) {
    const line = lines.value.find((l) => l.key === key)
    if (!line) return

    const nextKey = lineKey(line.product.id, batch?.id ?? null)
    if (nextKey === key) {
      line.stockQty = stockQty
      return
    }

    const clash = lines.value.find((l) => l.key === nextKey)
    if (clash) {
      clash.qty += line.qty
      clash.stockQty = stockQty
      remove(key)
      return
    }

    line.batch = batch
    line.stockQty = stockQty
    line.key = nextKey
  }

  function remove(key: string) {
    lines.value = lines.value.filter((l) => l.key !== key)
  }

  function clear() {
    lines.value = []
    clientId.value = null
    paymentMethod.value = null
    discount.value = null
  }

  function toggle(next?: boolean) {
    open.value = next ?? !open.value
  }

  return {
    lines,
    open,
    clientId,
    paymentMethod,
    discount,
    count,
    isEmpty,
    hasBackorder,
    addLine,
    setQty,
    setBatch,
    remove,
    clear,
    toggle,
  }
})
