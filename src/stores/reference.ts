import { brandsApi } from '@/api/brands'
import { categoriesApi } from '@/api/categories'
import { currenciesApi } from '@/api/currencies'
import { paymentMethodsApi } from '@/api/payment-methods'
import type { Brand, BrandCategory, Category, Currency, PaymentMethod } from '@/types/database'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// User-defined lookup data (brands + their rates, categories, payment
// methods, extra display currencies). Shared by catalog, rates, orders
// and profile. Small enough to reload wholesale after any edit.
export const useReferenceStore = defineStore('reference', () => {
  const brands = ref<Brand[]>([])
  const categories = ref<Category[]>([])
  const brandCategories = ref<BrandCategory[]>([])
  const paymentMethods = ref<PaymentMethod[]>([])
  const currencies = ref<Currency[]>([])
  const loaded = ref(false)

  const brandsById = computed(() => new Map(brands.value.map((b) => [b.id, b])))
  const categoriesById = computed(() => new Map(categories.value.map((c) => [c.id, c])))
  const currenciesByCode = computed(() => new Map(currencies.value.map((c) => [c.code, c])))

  // brand_id → the set of category ids linked to it.
  const categoryIdsByBrand = computed(() => {
    const map = new Map<string, Set<string>>()
    for (const link of brandCategories.value) {
      const set = map.get(link.brand_id) ?? new Set<string>()
      set.add(link.category_id)
      map.set(link.brand_id, set)
    }
    return map
  })

  // The categories a brand offers, in name order. An unknown/empty brand
  // yields none, which is what the pickers should show until a brand is picked.
  function categoriesForBrand(brandId: string | null | undefined): Category[] {
    if (!brandId) return []
    const ids = categoryIdsByBrand.value.get(brandId)
    if (!ids) return []
    return categories.value.filter((c) => ids.has(c.id))
  }

  // The brand ids a category is linked to (used by the management UI).
  function brandIdsForCategory(categoryId: string): string[] {
    return brandCategories.value.filter((l) => l.category_id === categoryId).map((l) => l.brand_id)
  }

  // A brand's supplier rate: functional-currency units per 1 unit of the
  // brand's catalog currency. Drives cost.
  function brandRate(brandId: string | null): number {
    if (!brandId) return 0
    return brandsById.value.get(brandId)?.supplier_rate ?? 0
  }

  async function load(companyId: string) {
    const [b, c, links, p, cur] = await Promise.all([
      brandsApi.list(companyId),
      categoriesApi.list(companyId),
      categoriesApi.listLinks(companyId),
      paymentMethodsApi.list(companyId),
      currenciesApi.list(companyId),
    ])
    brands.value = b
    categories.value = c
    brandCategories.value = links
    paymentMethods.value = p
    currencies.value = cur
    loaded.value = true
  }

  function reset() {
    brands.value = []
    categories.value = []
    brandCategories.value = []
    paymentMethods.value = []
    currencies.value = []
    loaded.value = false
  }

  return {
    brands,
    categories,
    brandCategories,
    paymentMethods,
    currencies,
    loaded,
    brandsById,
    categoriesById,
    currenciesByCode,
    categoryIdsByBrand,
    categoriesForBrand,
    brandIdsForCategory,
    brandRate,
    load,
    reset,
  }
})
