import type { BatchRow } from '@/api/batches'
import { ordersApi } from '@/api/orders'
import type { ProductRow } from '@/api/products'
import { useCurrency } from '@/composables/use-currency'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useCartStore } from '@/stores/cart'
import { useClientsStore } from '@/stores/clients'
import { useCurrencyStore } from '@/stores/currency'
import { useInventoryStore } from '@/stores/inventory'
import { useOrdersStore } from '@/stores/orders'
import { useReferenceStore } from '@/stores/reference'
import type { Product } from '@/types/database'
import type { CartLine, ProductView } from '@/types/models'
import { compareByExpiry } from '@/utils/batch-status'
import { computeOrderTotals } from '@/utils/orders'
import { applyDiscount } from '@/utils/pricing'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

// Cart orchestration: turning catalog rows into lines and checking out
// into a real order. Prices are captured in the current display currency.
//
// Anything in the catalog can be added, in stock or not. Each line is
// pinned to a concrete batch when one exists — that is what makes two
// deliveries of the same product with different expiry dates
// distinguishable — and the user can move a line to another batch. A
// quantity above what is on hand goes out as a backorder.
export function useCart() {
  const cart = useCartStore()
  const auth = useAuthStore()
  const currency = useCurrencyStore()
  const inventory = useInventoryStore()
  const orders = useOrdersStore()
  const clients = useClientsStore()
  const reference = useReferenceStore()
  const { toDisplay, functionalCost } = useCurrency()
  const toast = useToast()
  const { t } = useI18n()

  const submitting = ref(false)
  const error = ref<string | null>(null)

  // Discount applied to sale prices: the cart's own override when set,
  // otherwise the selected client's agreed discount.
  const discountPct = computed(() => {
    if (cart.discount != null) return cart.discount
    const client = clients.clients.find((c) => c.id === cart.clientId)
    return client?.discount ?? 0
  })

  // Editable in the drawer; writing pins an override for this order.
  const discountModel = computed({
    get: () => discountPct.value,
    set: (v: number) => (cart.discount = Math.min(100, Math.max(0, v || 0))),
  })

  function linePrice(line: CartLine) {
    return applyDiscount(line.unitPrice, discountPct.value)
  }

  const totals = computed(() =>
    computeOrderTotals(
      cart.lines.map((l) => ({ qty: l.qty, unit_price: linePrice(l), unit_cost: l.unitCost })),
    ),
  )

  /** Every batch of a product, FIFO-ordered — the expiry choices for a line. */
  function batchesFor(productId: string): BatchRow[] {
    return inventory.batches.filter((b) => b.product_id === productId).sort(compareByExpiry)
  }

  /** The batch the warehouse would ship first, i.e. what a line defaults to. */
  function fifoBatch(productId: string): BatchRow | null {
    return batchesFor(productId).find((b) => b.remaining_qty > 0) ?? null
  }

  /** How many units of a line are not covered by stock. */
  function shortfall(line: CartLine): number {
    return Math.max(0, line.qty - line.stockQty)
  }

  // Display prices for a product, in the active currency. Cost comes from the
  // brand's catalog-currency price via its supplier rate; retail is stored in
  // the functional currency.
  function pricesFor(product: Product) {
    const brand = product.brand_id ? (reference.brandsById.get(product.brand_id) ?? null) : null
    const purchase = toDisplay(functionalCost(product.cost_amount, brand))
    const retail = product.retail_amount != null ? toDisplay(product.retail_amount) : purchase
    return { purchase, retail }
  }

  function addFromCatalog(product: ProductView) {
    const batch = fifoBatch(product.id)
    cart.addLine({
      product,
      brand: product.brand,
      batch,
      unitPrice: product.retail ?? product.purchase,
      unitCost: product.purchase,
      stockQty: batch ? batch.remaining_qty : product.inStock,
    })
    cart.toggle(true)
  }

  // Used by the in-drawer "from catalog" picker, where prices still need
  // to be resolved from the brand rate.
  function addProduct(product: ProductRow) {
    const { purchase, retail } = pricesFor(product)
    const batch = fifoBatch(product.id)
    cart.addLine({
      product,
      brand: product.brand,
      batch,
      unitPrice: retail,
      unitCost: purchase,
      stockQty: batch ? batch.remaining_qty : (inventory.stockByProduct.get(product.id) ?? 0),
    })
    cart.toggle(true)
  }

  /** Add a line tied to one specific warehouse batch (one expiry date). */
  function addFromBatch(batch: BatchRow) {
    const product = batch.product
    if (!product) return
    const { purchase, retail } = pricesFor(product)
    cart.addLine({
      product,
      brand: null,
      batch,
      unitPrice: retail,
      unitCost: purchase,
      stockQty: batch.remaining_qty,
    })
    cart.toggle(true)
  }

  /** Ship this line from a different batch — i.e. a different expiry date. */
  function selectBatch(line: CartLine, batchId: string) {
    const batch = batchesFor(line.product.id).find((b) => b.id === batchId)
    if (!batch) return
    cart.setBatch(line.key, batch, batch.remaining_qty)
  }

  async function checkout() {
    if (cart.isEmpty || !auth.companyId) return
    submitting.value = true
    error.value = null
    try {
      await ordersApi.place({
        clientId: cart.clientId,
        paymentMethod: cart.paymentMethod,
        currency: currency.displayCurrency,
        discount: discountPct.value,
        // Store gross prices; the order-level discount reduces the total, so
        // the discount stays visible and editable after the sale.
        items: cart.lines.map((l) => ({
          product_id: l.product.id,
          batch_id: l.batch?.id ?? null,
          product_name: l.product.name,
          sku: l.product.sku,
          qty: l.qty,
          unit_price: l.unitPrice,
          unit_cost: l.unitCost,
        })),
      })
      cart.clear()
      cart.toggle(false)
      const companyId = auth.companyId
      await Promise.all([orders.load(companyId), inventory.load(companyId)])
      toast.success(t('toasts.orderPlaced'))
    } catch (e) {
      const message = e instanceof Error ? e.message : ''
      toast.error(t('errors.save'))
      error.value = message
    } finally {
      submitting.value = false
    }
  }

  return {
    cart,
    totals,
    discountPct,
    discountModel,
    linePrice,
    submitting,
    error,
    batchesFor,
    shortfall,
    addFromCatalog,
    addProduct,
    addFromBatch,
    selectBatch,
    checkout,
  }
}
