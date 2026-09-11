import { brandsApi } from '@/api/brands'
import { categoriesApi } from '@/api/categories'
import { currenciesApi } from '@/api/currencies'
import { paymentMethodsApi } from '@/api/payment-methods'
import { platformCurrenciesApi } from '@/api/platform-currencies'
import { supplierRatesApi } from '@/api/supplier-rates'
import type {
  Brand,
  BrandCategory,
  Category,
  Currency,
  PaymentMethod,
  PlatformCurrency,
  SupplierRate,
} from '@/types/database'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// User-defined lookup data (brands, categories, payment methods), the
// currencies the company uses, and what each supplier says they are worth.
// Shared by catalog, rates, orders and profile. Small enough to reload
// wholesale after any edit.
export const useReferenceStore = defineStore('reference', () => {
  const brands = ref<Brand[]>([])
  const categories = ref<Category[]>([])
  const brandCategories = ref<BrandCategory[]>([])
  const paymentMethods = ref<PaymentMethod[]>([])
  // Every currency the platform offers, and the ones this company uses
  // besides its base.
  const platformCurrencies = ref<PlatformCurrency[]>([])
  const currencies = ref<Currency[]>([])
  const supplierRates = ref<SupplierRate[]>([])
  const loaded = ref(false)

  const brandsById = computed(() => new Map(brands.value.map((b) => [b.id, b])))
  const categoriesById = computed(() => new Map(categories.value.map((c) => [c.id, c])))
  const platformByCode = computed(() => new Map(platformCurrencies.value.map((c) => [c.code, c])))

  /** brand_id → currency → base units per 1 unit, as that supplier reckons it. */
  const ratesByBrand = computed(() => {
    const map = new Map<string, Map<string, number>>()
    for (const r of supplierRates.value) {
      const row = map.get(r.brand_id) ?? new Map<string, number>()
      row.set(r.currency, Number(r.rate))
      map.set(r.brand_id, row)
    }
    return map
  })

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

  async function load(companyId: string) {
    const [b, c, links, p, platform, cur, rates] = await Promise.all([
      brandsApi.list(companyId),
      categoriesApi.list(companyId),
      categoriesApi.listLinks(companyId),
      paymentMethodsApi.list(companyId),
      platformCurrenciesApi.list(),
      currenciesApi.list(companyId),
      supplierRatesApi.list(companyId),
    ])
    brands.value = b
    categories.value = c
    brandCategories.value = links
    paymentMethods.value = p
    platformCurrencies.value = platform
    currencies.value = cur
    supplierRates.value = rates
    loaded.value = true
  }

  function reset() {
    brands.value = []
    categories.value = []
    brandCategories.value = []
    paymentMethods.value = []
    platformCurrencies.value = []
    currencies.value = []
    supplierRates.value = []
    loaded.value = false
  }

  return {
    brands,
    categories,
    brandCategories,
    paymentMethods,
    platformCurrencies,
    currencies,
    supplierRates,
    loaded,
    brandsById,
    categoriesById,
    platformByCode,
    ratesByBrand,
    categoryIdsByBrand,
    categoriesForBrand,
    brandIdsForCategory,
    load,
    reset,
  }
})
