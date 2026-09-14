import { categoriesApi } from '@/api/categories'
import { currenciesApi } from '@/api/currencies'
import { productsApi } from '@/api/products'
import { supplierRatesApi } from '@/api/supplier-rates'
import { useCurrency } from '@/composables/use-currency'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useInventoryStore } from '@/stores/inventory'
import { useReferenceStore } from '@/stores/reference'
import type { NewProduct } from '@/types/database'
import type { CsvField, CsvMapping, CsvTable } from '@/utils/csv'
import { CSV_FIELDS, decodeCsv, extractProducts, guessMapping, readCsvTable } from '@/utils/csv'
import { safeStorage } from '@/utils/storage'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

// The mapping a user confirmed for a supplier, kept per brand: the next price
// list from the same supplier then needs no answering at all. It lives in
// local storage rather than the database because it describes a file, not the
// company — being wrong costs one dropdown, and being unshared costs nothing.
const MAPPING_KEY = 'torba:csv-mapping'

/** How long a cell may be when it is only there to show what a column holds. */
const SAMPLE_LENGTH = 24

function blankMapping(): CsvMapping {
  return { sku: null, name: null, volume: null, cost: null, retail: null, category: null }
}

function rememberedMapping(brandId: string): CsvMapping | null {
  const raw = safeStorage.get(`${MAPPING_KEY}:${brandId}`)
  if (!raw) return null
  try {
    const stored = JSON.parse(raw) as Partial<Record<CsvField, unknown>>
    const mapping = blankMapping()
    for (const field of CSV_FIELDS) {
      const column = stored[field]
      mapping[field] = typeof column === 'number' && column >= 0 ? column : null
    }
    return mapping
  } catch {
    return null
  }
}

export function useCsvImport() {
  const auth = useAuthStore()
  const reference = useReferenceStore()
  const inventory = useInventoryStore()
  const toast = useToast()
  const { t } = useI18n()
  const { supplierCurrency } = useCurrency()

  const step = ref<1 | 2>(1)
  const brandId = ref('')
  const fileName = ref('')
  // Shallow: a parsed file is thousands of cells that are only ever replaced
  // wholesale, and making every one of them reactive would cost for nothing.
  const table = shallowRef<CsvTable | null>(null)
  const mapping = ref<CsvMapping>(blankMapping())
  // The currency the list is priced in. Starts at the one the supplier's
  // products already use, and can be changed before importing.
  const currency = ref(supplierCurrency(null))
  watch(brandId, (id) => {
    currency.value = supplierCurrency(id)
  })
  const applyRate = ref(true)
  const importing = ref(false)
  const error = ref<string | null>(null)
  const importedCount = ref<number | null>(null)

  // Products follow from the mapping, so correcting a column re-reads the
  // whole file at once — the preview and the counts can never lag behind it.
  const parsed = computed(() => (table.value ? extractProducts(table.value, mapping.value) : null))
  const productCount = computed(() => parsed.value?.products.length ?? 0)
  const preview = computed(() => parsed.value?.products.slice(0, 3) ?? [])

  /** The file's columns, named by their header and shown with a sample cell. */
  const columnOptions = computed(() => {
    const source = table.value
    if (!source) return []
    return Array.from({ length: source.columns }, (_, i) => {
      const title = source.headers[i]?.trim() || t('csv.column', { n: i + 1 })
      const sample = source.rows
        .slice(source.headerRow + 1)
        .map((row) => (row[i] ?? '').trim())
        .find((value) => value.length > 0)
      const short = sample && sample.length > SAMPLE_LENGTH ? `${sample.slice(0, SAMPLE_LENGTH)}…` : sample
      return { value: String(i), label: short ? `${title} · ${short}` : title }
    })
  })

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

  /**
   * Point a field at a column. A column can only mean one thing, so claiming
   * one releases it from wherever it was — otherwise a correction quietly
   * leaves the same column feeding two fields.
   */
  function setColumn(field: CsvField, column: number | null) {
    const next = { ...mapping.value }
    if (column != null) {
      for (const other of CSV_FIELDS) if (next[other] === column) next[other] = null
    }
    next[field] = column
    mapping.value = next
  }

  async function parseFile(file: File) {
    error.value = null
    fileName.value = file.name
    try {
      const next = readCsvTable(decodeCsv(await file.arrayBuffer()))
      if (next.rows.length === 0) {
        error.value = 'errorEmpty'
        table.value = null
        return
      }
      table.value = next

      // What the user confirmed for this supplier last time wins — but only
      // while it still finds products; a changed file falls back to the
      // headers, and either way the next step shows what was chosen.
      const remembered = brandId.value ? rememberedMapping(brandId.value) : null
      const usable = remembered && extractProducts(next, remembered).products.length > 0
      mapping.value = usable && remembered ? remembered : guessMapping(next)

      // Not fatal any more: the columns are the next step's business, and the
      // user can point them at the right places by hand.
      if (productCount.value === 0) error.value = 'errorColumns'
    } catch {
      error.value = 'errorParse'
      table.value = null
    }
  }

  async function runImport() {
    if (!auth.companyId || !brandId.value || !parsed.value || productCount.value === 0) return
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

      // A price list is in the supplier's own currency, and both its prices
      // are kept exactly as the supplier wrote them — "you buy at 55, you
      // sell at 80" is what the catalogue stores. The supplier's rate turns
      // them into the base wherever they are shown, so a new rate reprices
      // the whole list without rewriting it.
      const brand = reference.brandsById.get(brandId.value)
      const baseCurrency = auth.company?.base_currency ?? 'UAH'
      const costCurrency = currency.value || baseCurrency
      const willApplyRate = applyRate.value && !!parsed.value.rate && costCurrency !== baseCurrency

      const rows: NewProduct[] = parsed.value.products.map((p) => ({
        company_id: companyId,
        brand_id: brandId.value,
        category_id: p.category ? (categoryIds.get(p.category) ?? null) : null,
        sku: p.sku,
        name: p.name,
        volume: p.volume,
        cost_amount: p.priceUsd,
        cost_currency: costCurrency,
        retail_amount: p.retailUsd,
        retail_currency: costCurrency,
        is_active: true,
      }))

      const inserted = await productsApi.bulkUpsert(rows)

      // Every category the file uses must be offered for the import brand.
      const usedCategoryIds = new Set(rows.map((r) => r.category_id).filter((id): id is string => !!id))
      await Promise.all(
        [...usedCategoryIds].map((categoryId) =>
          categoriesApi.link({ company_id: companyId, brand_id: brandId.value, category_id: categoryId }),
        ),
      )

      // The rate printed on the list ("Курс: 44,50") is this supplier's rate
      // for its currency: one cell of the matrix. The currency has to be in
      // use for that cell to exist on the rates page.
      if (costCurrency !== baseCurrency && !reference.currencies.some((c) => c.code === costCurrency)) {
        await currenciesApi.create({ company_id: companyId, code: costCurrency })
      }
      if (willApplyRate && brand) {
        await supplierRatesApi.set({
          company_id: companyId,
          brand_id: brand.id,
          currency: costCurrency,
          rate: parsed.value.rate as number,
        })
      }

      // It worked, so this is the layout of that supplier's files.
      safeStorage.set(`${MAPPING_KEY}:${brandId.value}`, JSON.stringify(mapping.value))

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
    currency.value = supplierCurrency(null)
    fileName.value = ''
    table.value = null
    mapping.value = blankMapping()
    applyRate.value = true
    importing.value = false
    error.value = null
    importedCount.value = null
  }

  return {
    step,
    brandId,
    currency,
    fileName,
    table,
    mapping,
    columnOptions,
    preview,
    setColumn,
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
