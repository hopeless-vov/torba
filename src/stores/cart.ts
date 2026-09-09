import type { Batch, Brand, Product } from '@/types/database'
import type { CartLine } from '@/types/models'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// Order-in-progress. Lines can come from the catalog (no batch) or from a
// specific warehouse batch. Prices are held in the current display
// currency; the order is snapshotted from these at checkout.
//
// The cart has no open/closed state: it is a page of its own (`/cart`), so
// where the user is looking is the router's business, not the store's.
//
// Quantity is never capped by stock: anything in the catalog can be sold,
// and a line above `stockQty` goes out as a backorder (the database draws
// down what exists and leaves the rest — see migration 0004). The cart page
// flags such lines so the shortfall is visible before checkout.
export const useCartStore = defineStore('cart', () => {
  const lines = ref<CartLine[]>([])
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
      listPrice: input.unitPrice,
      unitCost: input.unitCost,
      discount: 0,
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
   * Sell this line at another price — higher or lower than the catalog says.
   * `listPrice` keeps the original around so the override stays visible and
   * revertable, and so it is obvious the change was deliberate.
   */
  function setPrice(key: string, price: number) {
    const line = lines.value.find((l) => l.key === key)
    if (!line) return
    line.unitPrice = Math.max(0, price || 0)
  }

  /** Percentage off this one line, on top of whatever the order gets. */
  function setDiscount(key: string, pct: number) {
    const line = lines.value.find((l) => l.key === key)
    if (!line) return
    line.discount = Math.min(100, Math.max(0, pct || 0))
  }

  /**
   * Move a line onto another batch of the same product — this is how the
   * user chooses which expiry date to ship. Landing on a batch that is
   * already in the cart merges the two lines.
   *
   * Batches can have cost different money and can sell for different money,
   * so shipping from another one moves both: `unitCost` always follows the
   * batch (it is a fact about the goods), while the sale price follows only
   * while the user has not typed one of their own — an edited price is a
   * decision, and re-pricing over it would undo it silently.
   */
  function setBatch(
    key: string,
    batch: Batch | null,
    stockQty: number,
    unitCost?: number,
    listPrice?: number,
  ) {
    const line = lines.value.find((l) => l.key === key)
    if (!line) return

    const repriced = (l: CartLine) => {
      if (listPrice == null) return
      if (l.unitPrice === l.listPrice) l.unitPrice = listPrice
      l.listPrice = listPrice
    }

    const nextKey = lineKey(line.product.id, batch?.id ?? null)
    if (nextKey === key) {
      line.stockQty = stockQty
      if (unitCost != null) line.unitCost = unitCost
      repriced(line)
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
    if (unitCost != null) line.unitCost = unitCost
    repriced(line)
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

  return {
    lines,
    clientId,
    paymentMethod,
    discount,
    count,
    isEmpty,
    hasBackorder,
    addLine,
    setQty,
    setPrice,
    setDiscount,
    setBatch,
    remove,
    clear,
  }
})
