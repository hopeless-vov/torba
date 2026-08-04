import { brandsApi } from '@/api/brands'
import { categoriesApi } from '@/api/categories'
import { productsApi } from '@/api/products'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useInventoryStore } from '@/stores/inventory'
import { useReferenceStore } from '@/stores/reference'
import type { NewProduct } from '@/types/database'
import { type ParsedPriceList,parsePriceListCsv } from '@/utils/csv'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

export function useCsvImport() {
  const auth = useAuthStore()
  const reference = useReferenceStore()
  const inventory = useInventoryStore()
  const toast = useToast()
  const { t } = useI18n()

  const step = ref<1 | 2>(1)
  const brandId = ref('')
  const fileName = ref('')
  const parsed = ref<ParsedPriceList | null>(null)
  const applyRate = ref(true)
  const importing = ref(false)
  const error = ref<string | null>(null)
  const importedCount = ref<number | null>(null)

  const productCount = computed(() => parsed.value?.products.length ?? 0)

  // Categories present in the file that don't yet exist for this company.
  const newCategories = computed(() => {
    if (!parsed.value) return []
    const known = new Set(reference.categories.map((c) => c.name))
    const seen = new Set<string>()
    const result: string[] = []
    for (const p of parsed.value.products) {
      if (p.category && !known.has(p.category) && !seen.has(p.category)) {
        seen.add(p.category)
        result.push(p.category)
      }
    }
    return result
  })

  async function parseFile(file: File) {
    error.value = null
    fileName.value = file.name
    try {
      const text = await file.text()
      const result = parsePriceListCsv(text)
      if (result.products.length === 0) {
        error.value = 'errorEmpty'
        parsed.value = null
        return
      }
      parsed.value = result
    } catch {
      error.value = 'errorParse'
      parsed.value = null
    }
  }

  async function runImport() {
    if (!auth.companyId || !brandId.value || !parsed.value) return
    importing.value = true
    error.value = null
    try {
      const companyId = auth.companyId

      // Resolve category names → ids, creating any that are missing.
      const categoryIds = new Map(reference.categories.map((c) => [c.name, c.id]))
      for (const name of newCategories.value) {
        const created = await categoriesApi.create({ company_id: companyId, name })
        categoryIds.set(name, created.id)
      }

      // A price list is in the supplier's catalog currency. Cost is stored
      // as-is; retail is re-expressed into the functional currency using the
      // rate that will apply to this brand after the import.
      const brand = reference.brandsById.get(brandId.value)
      const willApplyRate = applyRate.value && !!parsed.value.rate
      const effectiveRate = (willApplyRate ? parsed.value.rate : brand?.supplier_rate) ?? 0

      const rows: NewProduct[] = parsed.value.products.map((p) => ({
        company_id: companyId,
        brand_id: brandId.value,
        category_id: p.category ? (categoryIds.get(p.category) ?? null) : null,
        sku: p.sku,
        name: p.name,
        volume: p.volume,
        cost_amount: p.priceUsd,
        retail_amount: p.retailUsd != null && effectiveRate > 0 ? Math.round(p.retailUsd * effectiveRate * 100) / 100 : null,
        is_active: true,
      }))

      const inserted = await productsApi.bulkUpsert(rows)

      if (willApplyRate && brand) await brandsApi.updateRate(brand, parsed.value.rate as number)

      await Promise.all([reference.load(companyId), inventory.load(companyId)])
      importedCount.value = inserted.length
      toast.success(t('csv.done', { count: inserted.length }))
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'errorParse'
      toast.error(t('errors.save'))
    } finally {
      importing.value = false
    }
  }

  function reset() {
    step.value = 1
    brandId.value = ''
    fileName.value = ''
    parsed.value = null
    applyRate.value = true
    importing.value = false
    error.value = null
    importedCount.value = null
  }

  return {
    step,
    brandId,
    fileName,
    parsed,
    applyRate,
    importing,
    error,
    importedCount,
    productCount,
    newCategories,
    parseFile,
    runImport,
    reset,
  }
}
