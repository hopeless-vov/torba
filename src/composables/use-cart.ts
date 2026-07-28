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
import type { CartLine, ProductView } from '@/types/models'
import { computeOrderTotals } from '@/utils/orders'
import { applyDiscount } from '@/utils/pricing'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

// Cart orchestration: turning catalog rows into lines and checking out
// into a real order. Prices are captured in the current display currency;
// stock is enforced both here (cap) and in the DB (create_order).
export function useCart() {
  const cart = useCartStore()
  const auth = useAuthStore()
  const currency = useCurrencyStore()
  const inventory = useInventoryStore()
  const orders = useOrdersStore()
  const clients = useClientsStore()
  const reference = useReferenceStore()
  const { convert } = useCurrency()
  const toast = useToast()
  const { t } = useI18n()

  const submitting = ref(false)
  const error = ref<string | null>(null)

  // Agreed discount of the selected client, applied to sale prices.
  const discountPct = computed(() => {
    const client = clients.clients.find((c) => c.id === cart.clientId)
    return client?.discount ?? 0
  })

  function linePrice(line: CartLine) {
    return applyDiscount(line.unitPrice, discountPct.value)
  }

  const totals = computed(() =>
    computeOrderTotals(
      cart.lines.map((l) => ({ qty: l.qty, unit_price: linePrice(l), unit_cost: l.unitCost })),
    ),
  )

  function addFromCatalog(product: ProductView) {
    const sale = product.retail ?? product.purchase
    const added = cart.addLine({
      product,
      brand: product.brand,
      unitPrice: sale,
      unitCost: product.purchase,
      maxQty: product.inStock,
    })
    cart.toggle(true)
    if (!added) toast.error(t('toasts.outOfStock', { name: product.name }))
  }

  // Add a catalog product (aggregate stock), computing display prices
  // from the brand rate. Used by the in-drawer "from catalog" picker.
  function addProduct(product: ProductRow) {
    const rate = reference.brandRate(product.brand_id)
    const purchase = convert(product.price_usd, rate)
    const retail = product.retail_price_usd != null ? convert(product.retail_price_usd, rate) : purchase
    const added = cart.addLine({
      product,
      brand: product.brand,
      unitPrice: retail,
      unitCost: purchase,
      maxQty: inventory.stockByProduct.get(product.id) ?? 0,
    })
    cart.toggle(true)
    if (!added) toast.error(t('toasts.outOfStock', { name: product.name }))
  }

  // Add a line tied to a specific warehouse batch (capped at its stock).
  function addFromBatch(batch: BatchRow) {
    const product = batch.product
    if (!product) return
    const rate = reference.brandRate(product.brand_id)
    const purchase = convert(product.price_usd, rate)
    const retail = product.retail_price_usd != null ? convert(product.retail_price_usd, rate) : purchase
    const added = cart.addLine({
      product,
      brand: null,
      batch,
      unitPrice: retail,
      unitCost: purchase,
      maxQty: batch.remaining_qty,
    })
    cart.toggle(true)
    if (!added) toast.error(t('toasts.outOfStock', { name: product.name }))
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
        items: cart.lines.map((l) => ({
          product_id: l.product.id,
          batch_id: l.batch?.id ?? null,
          product_name: l.product.name,
          sku: l.product.sku,
          qty: l.qty,
          unit_price: linePrice(l),
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
      if (message.includes('INSUFFICIENT_STOCK')) {
        const name = message.split('INSUFFICIENT_STOCK:')[1]?.trim() ?? ''
        toast.error(t('toasts.outOfStock', { name }))
      } else {
        toast.error(t('errors.save'))
      }
      error.value = message
    } finally {
      submitting.value = false
    }
  }

  return {
    cart,
    totals,
    discountPct,
    linePrice,
    submitting,
    error,
    addFromCatalog,
    addProduct,
    addFromBatch,
    checkout,
  }
}
