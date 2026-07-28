import type { Batch, Brand, Product } from '@/types/database'
import type { CartLine } from '@/types/models'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// Order-in-progress. Lines can come from the catalog (no batch) or from a
// specific warehouse batch. Prices are held in the current display
// currency; the order is snapshotted from these at checkout.
export const useCartStore = defineStore('cart', () => {
  const lines = ref<CartLine[]>([])
  const open = ref(false)
  const clientId = ref<string | null>(null)
  const paymentMethod = ref<string | null>(null)

  const count = computed(() => lines.value.reduce((sum, l) => sum + l.qty, 0))
  const isEmpty = computed(() => lines.value.length === 0)

  function lineKey(productId: string, batchId: string | null) {
    return batchId ? `${productId}:${batchId}` : productId
  }

  // Returns false when the requested quantity was clamped by available
  // stock (or nothing could be added), so callers can warn the user.
  function addLine(input: {
    product: Product
    brand: Brand | null
    batch?: Batch | null
    unitPrice: number
    unitCost: number
    qty?: number
    maxQty?: number
  }): boolean {
    const batch = input.batch ?? null
    const max = input.maxQty ?? Infinity
    const want = input.qty ?? 1
    const key = lineKey(input.product.id, batch?.id ?? null)
    const existing = lines.value.find((l) => l.key === key)

    if (existing) {
      const next = existing.qty + want
      existing.qty = Math.min(next, existing.maxQty)
      return next <= existing.maxQty
    }

    const qty = Math.min(want, max)
    if (qty <= 0) return false
    lines.value.push({
      key,
      product: input.product,
      brand: input.brand,
      batch,
      qty,
      maxQty: max,
      unitPrice: input.unitPrice,
      unitCost: input.unitCost,
    })
    return qty >= want
  }

  // Returns false when clamped to available stock.
  function setQty(key: string, qty: number): boolean {
    const line = lines.value.find((l) => l.key === key)
    if (!line) return true
    if (qty <= 0) {
      remove(key)
      return true
    }
    const clamped = Math.min(qty, line.maxQty)
    line.qty = clamped
    return clamped >= qty
  }

  function remove(key: string) {
    lines.value = lines.value.filter((l) => l.key !== key)
  }

  function clear() {
    lines.value = []
    clientId.value = null
    paymentMethod.value = null
  }

  function toggle(next?: boolean) {
    open.value = next ?? !open.value
  }

  return {
    lines,
    open,
    clientId,
    paymentMethod,
    count,
    isEmpty,
    addLine,
    setQty,
    remove,
    clear,
    toggle,
  }
})
