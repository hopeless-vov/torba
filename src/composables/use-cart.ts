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
import type { Batch, Product } from '@/types/database'
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
//
// Adding never navigates. The user is picking through a list; taking them
// to the cart on every "+" would cost them their place. The line is added,
// a toast says so, and the counter in the top bar carries the running
// total until they choose to go there.
export function useCart() {
  const cart = useCartStore()
  const auth = useAuthStore()
  const currency = useCurrencyStore()
  const inventory = useInventoryStore()
  const orders = useOrdersStore()
  const clients = useClientsStore()
  const reference = useReferenceStore()
  const { batchCostToDisplay, batchRetailToDisplay } = useCurrency()
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

  /** Unit price after this line's own discount, before the order's. */
  function lineNet(line: CartLine) {
    return applyDiscount(line.unitPrice, line.discount)
  }

  /** What the customer actually pays per unit: both discounts, in order. */
  function linePrice(line: CartLine) {
    return applyDiscount(lineNet(line), discountPct.value)
  }

  const totals = computed(() =>
    computeOrderTotals(
      cart.lines.map((l) => ({ qty: l.qty, unit_price: linePrice(l), unit_cost: l.unitCost })),
    ),
  )

  /**
   * What one unit drawn from this batch cost us, in the display currency.
   * The batch's own purchase price when it has one — a promotional delivery
   * must not be sold at the full-price delivery's margin — and the product's
   * catalogue price otherwise.
   */
  function batchCost(product: Product, batch: Batch | null): number {
    const brand = product.brand_id ? (reference.brandsById.get(product.brand_id) ?? null) : null
    return batchCostToDisplay(batch, product, brand)
  }

  /**
   * What a unit drawn from this batch goes out at, in the display currency:
   * the batch's own selling price when it names one, the product's otherwise,
   * and the purchase price as a last resort when neither does.
   */
  function batchPrice(product: Product, batch: Batch | null): number {
    return batchRetailToDisplay(batch, product) ?? batchCost(product, batch)
  }

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

  // What the picker reports back: a row the user already added says so,
  // instead of looking untouched and inviting a second click.
  /** Units of a product already in the cart, across all of its lines. */
  function inCart(productId: string): number {
    return cart.lines.filter((l) => l.product.id === productId).reduce((sum, l) => sum + l.qty, 0)
  }

  /** Units already taken from one specific batch. */
  function inCartFromBatch(batchId: string): number {
    return cart.lines.filter((l) => l.batch?.id === batchId).reduce((sum, l) => sum + l.qty, 0)
  }

  /** Confirms the line landed, and says how much is waiting in the cart. */
  function announce(name: string) {
    toast.success(t('toasts.addedToCart', { name, count: cart.count }))
  }

  function addFromCatalog(product: ProductView) {
    const batch = fifoBatch(product.id)
    cart.addLine({
      product,
      brand: product.brand,
      batch,
      unitPrice: batchPrice(product, batch),
      unitCost: batchCost(product, batch),
      stockQty: batch ? batch.remaining_qty : product.inStock,
    })
    announce(product.name)
  }

  // Used by the cart page's "from catalog" picker, where prices still need
  // to be resolved from the brand rate.
  function addProduct(product: ProductRow) {
    const batch = fifoBatch(product.id)
    cart.addLine({
      product,
      brand: product.brand,
      batch,
      unitPrice: batchPrice(product, batch),
      unitCost: batchCost(product, batch),
      stockQty: batch ? batch.remaining_qty : (inventory.stockByProduct.get(product.id) ?? 0),
    })
    announce(product.name)
  }

  /** Add a line tied to one specific warehouse batch (one expiry date). */
  function addFromBatch(batch: BatchRow) {
    const product = batch.product
    if (!product) return
    cart.addLine({
      product,
      brand: null,
      batch,
      unitPrice: batchPrice(product, batch),
      unitCost: batchCost(product, batch),
      stockQty: batch.remaining_qty,
    })
    announce(product.name)
  }

  /** Ship this line from a different batch — i.e. a different expiry date. */
  function selectBatch(line: CartLine, batchId: string) {
    const batch = batchesFor(line.product.id).find((b) => b.id === batchId)
    if (!batch) return
    cart.setBatch(
      line.key,
      batch,
      batch.remaining_qty,
      batchCost(line.product, batch),
      batchPrice(line.product, batch),
    )
  }

  /** Places the order. Returns whether it went through, so the caller can
   *  decide where to send the user next. */
  async function checkout(): Promise<boolean> {
    const companyId = auth.companyId
    if (cart.isEmpty || !companyId) return false
    submitting.value = true
    error.value = null
    try {
      const placedId = await ordersApi.place({
        companyId,
        clientId: cart.clientId,
        paymentMethod: cart.paymentMethod,
        currency: currency.displayCurrency,
        discount: discountPct.value,
        // Store gross prices and both discounts as percentages; the totals are
        // derived from them, so every reduction stays visible and editable
        // after the sale instead of being baked into a number.
        items: cart.lines.map((l) => ({
          product_id: l.product.id,
          batch_id: l.batch?.id ?? null,
          product_name: l.product.name,
          sku: l.product.sku,
          qty: l.qty,
          unit_price: l.unitPrice,
          unit_cost: l.unitCost,
          discount: l.discount,
        })),
      })
      cart.clear()
      // The sale drew stock down across batches the RPC does not report, so
      // the warehouse is read back in full — but the order list only gains
      // the one order that was just placed.
      const [placed] = await Promise.all([ordersApi.get(placedId), inventory.load(companyId)])
      orders.upsert(placed)
      toast.success(t('toasts.orderPlaced'))
      return true
    } catch (e) {
      const message = e instanceof Error ? e.message : ''
      toast.error(t('errors.save'))
      error.value = message
      return false
    } finally {
      submitting.value = false
    }
  }

  return {
    cart,
    totals,
    discountPct,
    discountModel,
    lineNet,
    linePrice,
    submitting,
    error,
    batchesFor,
    batchCost,
    batchPrice,
    shortfall,
    inCart,
    inCartFromBatch,
    addFromCatalog,
    addProduct,
    addFromBatch,
    selectBatch,
    checkout,
  }
}
