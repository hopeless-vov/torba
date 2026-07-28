import { ordersApi } from '@/api/orders'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useCartStore } from '@/stores/cart'
import { useCurrencyStore } from '@/stores/currency'
import { useInventoryStore } from '@/stores/inventory'
import { useOrdersStore } from '@/stores/orders'
import type { ProductView } from '@/types/models'
import { computeOrderTotals } from '@/utils/orders'
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
  const toast = useToast()
  const { t } = useI18n()

  const submitting = ref(false)
  const error = ref<string | null>(null)

  const totals = computed(() =>
    computeOrderTotals(
      cart.lines.map((l) => ({ qty: l.qty, unit_price: l.unitPrice, unit_cost: l.unitCost })),
    ),
  )

  function addFromCatalog(product: ProductView) {
    const sale = product.discounted ?? product.retail ?? product.purchase
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

  return { cart, totals, submitting, error, addFromCatalog, checkout }
}
