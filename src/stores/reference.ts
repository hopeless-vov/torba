import { brandsApi } from '@/api/brands'
import { categoriesApi } from '@/api/categories'
import { paymentMethodsApi } from '@/api/payment-methods'
import type { Brand, Category, PaymentMethod } from '@/types/database'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// User-defined lookup data (brands + their rates, categories, payment
// methods). Shared by catalog, rates, orders and profile. Small enough
// to reload wholesale after any edit.
export const useReferenceStore = defineStore('reference', () => {
  const brands = ref<Brand[]>([])
  const categories = ref<Category[]>([])
  const paymentMethods = ref<PaymentMethod[]>([])
  const loaded = ref(false)

  const brandsById = computed(() => new Map(brands.value.map((b) => [b.id, b])))
  const categoriesById = computed(() => new Map(categories.value.map((c) => [c.id, c])))

  function brandRate(brandId: string | null): number {
    if (!brandId) return 0
    return brandsById.value.get(brandId)?.usd_rate ?? 0
  }

  async function load(companyId: string) {
    const [b, c, p] = await Promise.all([
      brandsApi.list(companyId),
      categoriesApi.list(companyId),
      paymentMethodsApi.list(companyId),
    ])
    brands.value = b
    categories.value = c
    paymentMethods.value = p
    loaded.value = true
  }

  function reset() {
    brands.value = []
    categories.value = []
    paymentMethods.value = []
    loaded.value = false
  }

  return {
    brands,
    categories,
    paymentMethods,
    loaded,
    brandsById,
    categoriesById,
    brandRate,
    load,
    reset,
  }
})
