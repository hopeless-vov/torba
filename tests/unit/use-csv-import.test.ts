import { useCsvImport } from '@/composables/use-csv-import'
import uk from '@/locales/uk.json'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it } from 'vitest'

// The import reads a file it has never seen before, so these cover the part
// that has to survive that: which column means what. Writing to Supabase is
// the api layer's business and is not exercised here.

const FILE = 'Артикул,Назва,Об\'єм,Ціна,Рек. ціна\nA-1,Крем,50 мл,10,18\nA-2,Гель,30 мл,7,12\n'

function csvFile(text: string, name = 'price.csv') {
  return new File([text], name, { type: 'text/csv' })
}

// useCsvImport reaches for useI18n, so it has to run inside a component.
function harness() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const i18n = createI18n({ legacy: false, locale: 'uk', fallbackLocale: 'uk', messages: { uk } })
  let ctx!: ReturnType<typeof useCsvImport>
  mount(
    defineComponent({
      setup() {
        ctx = useCsvImport()
        return () => null
      },
    }),
    { global: { plugins: [pinia, i18n] } },
  )
  return ctx
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
