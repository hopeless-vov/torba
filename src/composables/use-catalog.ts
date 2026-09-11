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
  const { costInBase, retailInBase, missingRate } = useCurrency()

  const brandFilter = ref('all')
  const categoryFilter = ref('all')
  const discount = ref(0)
  const showInactive = ref(false)

  const views = computed<ProductView[]>(() =>
    inventory.products.map((p) => {
      // Both prices go through this supplier's rates into the base. A rate
      // that was never entered leaves the figure unknown rather than invented,
      // and says which currency it is waiting for.
      const purchase = costInBase(p)
      const retail = retailInBase(p)
      const discounted = retail != null ? applyDiscount(retail, discount.value) : null
      return {
        ...p,
        brand: p.brand,
        category: p.category,
        purchase,
        retail,
        discounted,
        margin: purchase != null ? computeMargin(purchase, retail) : null,
        rateMissing: missingRate(p),
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

  // What an empty table means: nothing in the catalogue at all, or filters
  // that match nothing. The unfiltered count is what tells the two apart.
  const total = computed(() => inventory.products.length)

  function clearFilters() {
    brandFilter.value = 'all'
    categoryFilter.value = 'all'
    ui.setSearch('')
  }

  // Only for the retry button and the CSV import, which really does change
  // the whole catalogue. Everything below puts back the one row it touched.
  async function reload() {
    if (auth.companyId) await inventory.load(auth.companyId)
  }

  async function createProduct(payload: Omit<NewProduct, 'company_id'>) {
    if (!auth.companyId) return
    try {
      inventory.upsertProduct(await productsApi.create({ ...payload, company_id: auth.companyId }))
      toast.success(t('toasts.saved'))
    } catch (e) {
      toast.error(t('errors.save'))
      throw e
    }
  }

  async function updateProduct(id: string, patch: ProductPatch) {
    try {
      inventory.upsertProduct(await productsApi.update(id, patch))
      toast.success(t('toasts.saved'))
    } catch (e) {
      toast.error(t('errors.save'))
      throw e
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    inventory.upsertProduct(await productsApi.update(id, { is_active: isActive }))
  }

  async function removeProducts(ids: string[]) {
    if (ids.length === 0) return
    try {
      await productsApi.removeMany(ids)
      inventory.removeProducts(ids)
      toast.success(t('toasts.deleted'))
    } catch {
      toast.error(t('errors.delete'))
    }
  }

  return {
    filtered,
    total,
    clearFilters,
    brandFilter,
    categoryFilter,
    discount,
    showInactive,
    createProduct,
    updateProduct,
    toggleActive,
    removeProducts,
    reload,
  }
}
