import { brandsApi } from '@/api/brands'
import { categoriesApi } from '@/api/categories'
import { currenciesApi } from '@/api/currencies'
import { paymentMethodsApi } from '@/api/payment-methods'
import type { Brand, Category, Currency, PaymentMethod } from '@/types/database'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// User-defined lookup data (brands + their rates, categories, payment
// methods, extra display currencies). Shared by catalog, rates, orders
// and profile. Small enough to reload wholesale after any edit.
export const useReferenceStore = defineStore('reference', () => {
  const brands = ref<Brand[]>([])
  const categories = ref<Category[]>([])
  const paymentMethods = ref<PaymentMethod[]>([])
  const currencies = ref<Currency[]>([])
  const loaded = ref(false)

  const brandsById = computed(() => new Map(brands.value.map((b) => [b.id, b])))
  const categoriesById = computed(() => new Map(categories.value.map((c) => [c.id, c])))
  const currenciesByCode = computed(() => new Map(currencies.value.map((c) => [c.code, c])))

  // A brand's supplier rate: functional-currency units per 1 unit of the
  // brand's catalog currency. Drives cost.
  function brandRate(brandId: string | null): number {
    if (!brandId) return 0
    return brandsById.value.get(brandId)?.supplier_rate ?? 0
  }

  async function load(companyId: string) {
    const [b, c, p, cur] = await Promise.all([
      brandsApi.list(companyId),
      categoriesApi.list(companyId),
      paymentMethodsApi.list(companyId),
      currenciesApi.list(companyId),
    ])
    brands.value = b
    categories.value = c
    paymentMethods.value = p
    currencies.value = cur
    loaded.value = true
  }

  function reset() {
    brands.value = []
    categories.value = []
    paymentMethods.value = []
    currencies.value = []
    loaded.value = false
  }

  return {
    brands,
    categories,
    paymentMethods,
    currencies,
    loaded,
    brandsById,
    categoriesById,
    currenciesByCode,
    brandRate,
    load,
    reset,
  }
})
