import { useCsvImport } from '@/composables/use-csv-import'
import uk from '@/locales/uk.json'
import { useAuthStore } from '@/stores/auth'
import { useInventoryStore } from '@/stores/inventory'
import { useReferenceStore } from '@/stores/reference'
import type { Company } from '@/types/database'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Only what the import writes is stubbed; reading the file stays real.
const products = vi.hoisted(() => ({ bulkUpsert: vi.fn(async (rows: unknown[]) => rows) }))
const rates = vi.hoisted(() => ({ set: vi.fn(async () => ({})) }))
const currencies = vi.hoisted(() => ({ create: vi.fn(async () => ({})) }))
vi.mock('@/api/products', () => ({ productsApi: products }))
vi.mock('@/api/supplier-rates', () => ({ supplierRatesApi: rates }))
vi.mock('@/api/currencies', () => ({ currenciesApi: currencies }))
vi.mock('@/api/categories', () => ({ categoriesApi: { create: vi.fn(), link: vi.fn(async () => ({})) } }))

// The import reads a file it has never seen before, so most of these cover
// the part that has to survive that: which column means what. The last group
// checks what the import then writes — prices exactly as the supplier wrote
// them, and the list's rate into the supplier's cell of the matrix.

const FILE = 'Артикул,Назва,Об\'єм,Ціна,Рек. ціна\nA-1,Крем,50 мл,10,18\nA-2,Гель,30 мл,7,12\n'

function csvFile(text: string, name = 'price.csv') {
  return new File([text], name, { type: 'text/csv' })
}

// useCsvImport reaches for useI18n, so it has to run inside a component.
// `seed` runs first, inside that component, to put stores in place.
function mountImport(seed: () => void = () => {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const i18n = createI18n({ legacy: false, locale: 'uk', fallbackLocale: 'uk', messages: { uk } })
  let ctx!: ReturnType<typeof useCsvImport>
  mount(
    defineComponent({
      setup() {
        seed()
        ctx = useCsvImport()
        return () => null
      },
    }),
    { global: { plugins: [pinia, i18n] } },
  )
  return ctx
}

function harness() {
  return mountImport()
}

beforeEach(() => {
  localStorage.clear()
})

describe('useCsvImport mapping', () => {
  it('reads the columns off the header and previews what it made of them', async () => {
    const csv = harness()
    await csv.parseFile(csvFile(FILE))

    expect(csv.mapping.value).toEqual({ sku: 0, name: 1, volume: 2, cost: 3, retail: 4, category: null })
    expect(csv.productCount.value).toBe(2)
    expect(csv.preview.value[0]).toMatchObject({ sku: 'A-1', name: 'Крем', priceUsd: 10, retailUsd: 18 })
  })

  it('names each column by its header and a sample of what is under it', async () => {
    const csv = harness()
    await csv.parseFile(csvFile(FILE))

    expect(csv.columnOptions.value[0]).toEqual({ value: '0', label: 'Артикул · A-1' })
    expect(csv.columnOptions.value).toHaveLength(5)
  })

  // Correcting a column re-reads the whole file: the products follow the
  // mapping, so nothing can be left over from the guess.
  it('re-reads the file when a column is corrected', async () => {
    const csv = harness()
    await csv.parseFile(csvFile(FILE))

    csv.setColumn('cost', 4)
    expect(csv.preview.value[0].priceUsd).toBe(18)
  })

  // A column can only mean one thing. Claiming one has to release it, or the
  // same column quietly feeds two fields.
  it('frees a column from wherever it was when another field claims it', async () => {
    const csv = harness()
    await csv.parseFile(csvFile(FILE))

    csv.setColumn('cost', 4)
    expect(csv.mapping.value.retail).toBeNull()
    expect(csv.mapping.value.cost).toBe(4)
  })

  it('can be told the file has no such column', async () => {
    const csv = harness()
    await csv.parseFile(csvFile(FILE))

    csv.setColumn('volume', null)
    expect(csv.preview.value[0].volume).toBeNull()
  })
})

describe('useCsvImport remembered mapping', () => {
  const stored = { sku: 0, name: 1, volume: null, cost: 4, retail: null, category: null }

  it('reuses what the brand was imported with last time', async () => {
    localStorage.setItem('torba:csv-mapping:b1', JSON.stringify(stored))
    const csv = harness()
    csv.brandId.value = 'b1'
    await csv.parseFile(csvFile(FILE))

    // Column 4 is the recommended price — the guess would have taken 3.
    expect(csv.preview.value[0].priceUsd).toBe(18)
  })

  // The supplier changed their layout: a remembered mapping that no longer
  // finds anything must not leave the user with an empty import.
  it('falls back to the header when the remembered mapping finds nothing', async () => {
    localStorage.setItem('torba:csv-mapping:b1', JSON.stringify({ ...stored, cost: 9 }))
    const csv = harness()
    csv.brandId.value = 'b1'
    await csv.parseFile(csvFile(FILE))

    expect(csv.productCount.value).toBe(2)
    expect(csv.preview.value[0].priceUsd).toBe(10)
  })

  it('ignores a corrupt stored mapping', async () => {
    localStorage.setItem('torba:csv-mapping:b1', 'not json')
    const csv = harness()
    csv.brandId.value = 'b1'
    await csv.parseFile(csvFile(FILE))

    expect(csv.productCount.value).toBe(2)
  })

  it('belongs to one brand only', async () => {
    localStorage.setItem('torba:csv-mapping:b1', JSON.stringify(stored))
    const csv = harness()
    csv.brandId.value = 'b2'
    await csv.parseFile(csvFile(FILE))

    expect(csv.preview.value[0].priceUsd).toBe(10)
  })
})

describe('useCsvImport errors', () => {
  it('says when the columns could not be recognised at all', async () => {
    const csv = harness()
    await csv.parseFile(csvFile('одна колонка\nінша\n'))

    expect(csv.productCount.value).toBe(0)
    expect(csv.error.value).toBe('errorColumns')
    // The table is kept, so the columns can still be set by hand.
    expect(csv.table.value).not.toBeNull()
  })

  it('reports an empty file', async () => {
    const csv = harness()
    await csv.parseFile(csvFile(''))

    expect(csv.error.value).toBe('errorEmpty')
    expect(csv.table.value).toBeNull()
  })
})

// A company in hryvnia importing from a supplier who quotes in dollars.
function importHarness() {
  let reference!: ReturnType<typeof useReferenceStore>
  const csv = mountImport(() => {
        const auth = useAuthStore()
        const company = {
          id: 'c',
          name: '',
          owner_id: 'u',
          base_currency: 'UAH',
          display_currency: 'UAH',
          created_at: '',
        } as Company
        auth.memberships = [{ company_id: 'c', user_id: 'u', role: 'owner', created_at: '', company }]
        auth.activeCompanyId = 'c'
        reference = useReferenceStore()
        reference.brands = [{ id: 'b1', company_id: 'c', name: 'Colorescience', catalog_currency: 'USD', created_at: '' }]
        reference.load = vi.fn(async () => {})
        useInventoryStore().load = vi.fn(async () => {})
  })
  return { csv, reference }
}

describe('useCsvImport import', () => {
  beforeEach(() => {
    products.bulkUpsert.mockClear()
    rates.set.mockClear()
    currencies.create.mockClear()
  })

  // "You buy at 55, you sell at 80": both prices are kept exactly as the
  // supplier wrote them, and the supplier's rate does the rest.
  it('keeps both prices in the supplier’s currency', async () => {
    const { csv } = importHarness()
    csv.brandId.value = 'b1'
    await csv.parseFile(csvFile('Артикул,Назва,Ціна,Рек. ціна\nA-1,Крем,55,80\n'))
    await csv.runImport()

    expect(products.bulkUpsert).toHaveBeenCalledWith([
      expect.objectContaining({ cost_amount: 55, cost_currency: 'USD', retail_amount: 80, retail_currency: 'USD' }),
    ])
  })

  it('reads the rate on the list into the supplier’s cell of the matrix', async () => {
    const { csv } = importHarness()
    csv.brandId.value = 'b1'
    await csv.parseFile(csvFile('"Курс: 41,50",,,\nАртикул,Назва,Ціна,Рек. ціна\nA-1,Крем,55,80\n'))
    await csv.runImport()

    expect(rates.set).toHaveBeenCalledWith({ company_id: 'c', brand_id: 'b1', currency: 'USD', rate: 41.5 })
    // USD was not in use yet, so its column is opened first.
    expect(currencies.create).toHaveBeenCalledWith({ company_id: 'c', code: 'USD' })
  })

  it('sets no rate for a supplier that quotes in the base', async () => {
    const { csv, reference } = importHarness()
    reference.brands = [{ id: 'b1', company_id: 'c', name: 'Local', catalog_currency: 'UAH', created_at: '' }]
    csv.brandId.value = 'b1'
    await csv.parseFile(csvFile('"Курс: 41,50",,,\nАртикул,Назва,Ціна\nA-1,Крем,55\n'))
    await csv.runImport()

    expect(rates.set).not.toHaveBeenCalled()
  })
})
