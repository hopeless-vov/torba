import { brandsApi } from '@/api/brands'
import { categoriesApi } from '@/api/categories'
import { paymentMethodsApi } from '@/api/payment-methods'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useInventoryStore } from '@/stores/inventory'
import { useReferenceStore } from '@/stores/reference'
import { useI18n } from 'vue-i18n'

// CRUD for the user-defined lookups (brands / categories / payment
// methods). After each change the reference store is reloaded so every
// dropdown across the app stays in sync.
export function usePersonalization() {
  const auth = useAuthStore()
  const reference = useReferenceStore()
  const inventory = useInventoryStore()
  const toast = useToast()
  const { t } = useI18n()

  async function reload() {
    if (auth.companyId) await reference.load(auth.companyId)
  }

  function brandStats(brandId: string) {
    const owned = inventory.products.filter((p) => p.brand_id === brandId)
    const categories = new Set(owned.map((p) => p.category_id).filter(Boolean))
    return { products: owned.length, categories: categories.size }
  }

  async function run(action: () => Promise<unknown>, successKey: string, errorKey: string) {
    try {
      await action()
      await reload()
      toast.success(t(successKey))
    } catch {
      toast.error(t(errorKey))
    }
  }

  async function addBrand(name: string) {
    if (!auth.companyId || !name.trim()) return
    await run(
      () => brandsApi.create({ company_id: auth.companyId as string, name: name.trim(), usd_rate: 0 }),
      'toasts.saved',
      'errors.save',
    )
  }

  async function removeBrand(id: string) {
    await run(() => brandsApi.remove(id), 'toasts.deleted', 'errors.delete')
  }

  async function addCategory(name: string) {
    if (!auth.companyId || !name.trim()) return
    await run(
      () => categoriesApi.create({ company_id: auth.companyId as string, name: name.trim() }),
      'toasts.saved',
      'errors.save',
    )
  }

  async function removeCategory(id: string) {
    await run(() => categoriesApi.remove(id), 'toasts.deleted', 'errors.delete')
  }

  async function addPayment(name: string) {
    if (!auth.companyId || !name.trim()) return
    await run(
      () => paymentMethodsApi.create({ company_id: auth.companyId as string, name: name.trim() }),
      'toasts.saved',
      'errors.save',
    )
  }

  async function removePayment(id: string) {
    await run(() => paymentMethodsApi.remove(id), 'toasts.deleted', 'errors.delete')
  }

  return {
    brandStats,
    addBrand,
    removeBrand,
    addCategory,
    removeCategory,
    addPayment,
    removePayment,
  }
}
