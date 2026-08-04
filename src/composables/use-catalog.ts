import { productsApi } from '@/api/products'
import { useCurrency } from '@/composables/use-currency'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useInventoryStore } from '@/stores/inventory'
import { useUiStore } from '@/stores/ui'
import type { NewProduct, ProductPatch } from '@/types/database'
import type { ProductView } from '@/types/models'
import { applyDiscount, computeMargin } from '@/utils/pricing'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

export function useCatalog() {
  const inventory = useInventoryStore()
  const ui = useUiStore()
  const auth = useAuthStore()
  const toast = useToast()
  const { t } = useI18n()
  const { convert } = useCurrency()

  const brandFilter = ref('all')
  const categoryFilter = ref('all')
  const discount = ref(0)
  const showInactive = ref(false)

  const views = computed<ProductView[]>(() =>
    inventory.products.map((p) => {
      const purchase = convert(p.price_usd)
      const retail = p.retail_price_usd != null ? convert(p.retail_price_usd) : null
      const discounted = retail != null ? applyDiscount(retail, discount.value) : null
      return {
        ...p,
        brand: p.brand,
        category: p.category,
        purchase,
        retail,
        discounted,
        margin: computeMargin(p.price_usd, p.retail_price_usd),
        inStock: inventory.stockByProduct.get(p.id) ?? 0,
      }
    }),
  )

  const filtered = computed(() => {
    const q = ui.search.trim().toLowerCase()
    return views.value.filter((v) => {
      if (!showInactive.value && !v.is_active) return false
      if (brandFilter.value !== 'all' && v.brand_id !== brandFilter.value) return false
      if (categoryFilter.value !== 'all' && v.category_id !== categoryFilter.value) return false
      if (q && !`${v.name} ${v.sku}`.toLowerCase().includes(q)) return false
      return true
    })
  })

  async function reload() {
    if (auth.companyId) await inventory.load(auth.companyId)
  }

  async function createProduct(payload: Omit<NewProduct, 'company_id'>) {
    if (!auth.companyId) return
    try {
      await productsApi.create({ ...payload, company_id: auth.companyId })
      await reload()
      toast.success(t('toasts.saved'))
    } catch (e) {
      toast.error(t('errors.save'))
      throw e
    }
  }

  async function updateProduct(id: string, patch: ProductPatch) {
    try {
      await productsApi.update(id, patch)
      await reload()
      toast.success(t('toasts.saved'))
    } catch (e) {
      toast.error(t('errors.save'))
      throw e
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await productsApi.update(id, { is_active: isActive })
    await reload()
  }

  async function removeProduct(id: string) {
    await removeProducts([id])
  }

  async function removeProducts(ids: string[]) {
    if (ids.length === 0) return
    try {
      await productsApi.removeMany(ids)
      await reload()
      toast.success(t('toasts.deleted'))
    } catch {
      toast.error(t('errors.delete'))
    }
  }

  return {
    filtered,
    brandFilter,
    categoryFilter,
    discount,
    showInactive,
    createProduct,
    updateProduct,
    toggleActive,
    removeProduct,
    removeProducts,
    reload,
  }
}
