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

  // Returns the action's result on success (so the caller can select a
  // freshly-created item), or null on failure.
  async function run<T>(
    action: () => Promise<T>,
    successKey: string,
    errorKey: string,
  ): Promise<T | null> {
    try {
      const result = await action()
      await reload()
      toast.success(t(successKey))
      return result
    } catch {
      toast.error(t(errorKey))
      return null
    }
  }

  async function addBrand(name: string) {
    if (!auth.companyId || !name.trim()) return null
    return run(
      () =>
        brandsApi.create({
          company_id: auth.companyId as string,
          name: name.trim(),
          catalog_currency: 'USD',
          supplier_rate: 0,
        }),
      'toasts.saved',
      'errors.save',
    )
  }

  async function removeBrand(id: string) {
    await run(() => brandsApi.remove(id), 'toasts.deleted', 'errors.delete')
  }

  // Creating a category can immediately link it to a brand — used when the
  // category is added from inside the product form, where a brand is chosen.
  async function addCategory(name: string, brandId?: string) {
    if (!auth.companyId || !name.trim()) return null
    const companyId = auth.companyId
    return run(
      async () => {
        const created = await categoriesApi.create({ company_id: companyId, name: name.trim() })
        if (brandId) {
          await categoriesApi.link({ company_id: companyId, brand_id: brandId, category_id: created.id })
        }
        return created
      },
      'toasts.saved',
      'errors.save',
    )
  }

  async function removeCategory(id: string) {
    await run(() => categoriesApi.remove(id), 'toasts.deleted', 'errors.delete')
  }

  async function linkCategory(brandId: string, categoryId: string) {
    if (!auth.companyId) return
    await run(
      () => categoriesApi.link({ company_id: auth.companyId as string, brand_id: brandId, category_id: categoryId }),
      'toasts.saved',
      'errors.save',
    )
  }

  async function unlinkCategory(brandId: string, categoryId: string) {
    await run(() => categoriesApi.unlink(brandId, categoryId), 'toasts.deleted', 'errors.delete')
  }

  async function addPayment(name: string) {
    if (!auth.companyId || !name.trim()) return null
    return run(
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
    linkCategory,
    unlinkCategory,
    addPayment,
    removePayment,
  }
}
