import { useCatalog } from '@/composables/use-catalog'
import { useAuthStore } from '@/stores/auth'
import { useCurrencyStore } from '@/stores/currency'
import { useInventoryStore } from '@/stores/inventory'
import { useUiStore } from '@/stores/ui'
import type { ProductRow } from '@/api/products'
import uk from '@/locales/uk.json'
import type { Batch, Company } from '@/types/database'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

// The supplier prices in USD at ₴44.5 per $; the books are kept in UAH.
const brand = {
  id: 'b1',
  name: 'Colorescience',
  catalog_currency: 'USD',
  supplier_rate: 44.5,
  company_id: 'c',
  rate_updated_at: '',
  created_at: '',
}
const category = { id: 'cat1', name: 'Тон', company_id: 'c', created_at: '' }

function product(over: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'p1',
    company_id: 'c',
    brand_id: 'b1',
    category_id: 'cat1',
    sku: 'A-1',
    name: 'Alpha',
    volume: '12 г',
    cost_amount: 51, // $51 in the catalog currency
    cost_currency: 'USD', // matches the brand → supplier rate applies
    retail_amount: 3400, // ₴3400 in the functional currency
    retail_currency: 'UAH',
    is_active: true,
    created_at: '',
    updated_at: '',
    brand,
    category,
    ...over,
  }
}

// useCatalog uses useI18n (for toasts), so exercise it inside a component
// wired with pinia + i18n. Stores are seeded through the returned handles.
function harness() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const i18n = createI18n({ legacy: false, locale: 'uk', fallbackLocale: 'uk', messages: { uk } })
  let ctx!: {
    inventory: ReturnType<typeof useInventoryStore>
    ui: ReturnType<typeof useUiStore>
    catalog: ReturnType<typeof useCatalog>
  }
  mount(
    defineComponent({
      setup() {
        useCurrencyStore().setCurrency('UAH')
        useAuthStore().company = {
          id: 'c',
          name: '',
          owner_id: 'u',
          base_currency: 'UAH',
          display_currency: 'UAH',
          created_at: '',
        } as Company
        ctx = { inventory: useInventoryStore(), ui: useUiStore(), catalog: useCatalog() }
        return () => null
      },
    }),
    { global: { plugins: [pinia, i18n] } },
  )
  return ctx
}

describe('useCatalog', () => {
  it('derives display prices, margin and stock', () => {
    const { inventory, catalog } = harness()
    inventory.products = [product()]
    inventory.batches = [
      { product_id: 'p1', remaining_qty: 5 } as Batch,
      { product_id: 'p1', remaining_qty: 3 } as Batch,
    ]

    const view = catalog.filtered.value[0]
    // Cost = $51 × 44.5 supplier rate = ₴2269.5; retail is already ₴3400.
    // Functional and display are both UAH here, so no further conversion.
    expect(view.purchase).toBeCloseTo(51 * 44.5, 4)
    expect(view.retail).toBeCloseTo(3400, 4)
    expect(view.margin).toBeCloseTo((3400 - 51 * 44.5) / 3400, 6)
    expect(view.inStock).toBe(8)
  })

  it('applies the discount to the retail price', () => {
    const { inventory, catalog } = harness()
    inventory.products = [product()]
    catalog.discount.value = 10
    expect(catalog.filtered.value[0].discounted).toBeCloseTo(3400 * 0.9, 4)
  })

  it('hides inactive products unless requested', () => {
    const { inventory, catalog } = harness()
    inventory.products = [product({ id: 'p2', sku: 'B-1', name: 'Beta', is_active: false })]
    expect(catalog.filtered.value).toHaveLength(0)
    catalog.showInactive.value = true
    expect(catalog.filtered.value).toHaveLength(1)
  })

  it('filters by search query', () => {
    const { inventory, ui, catalog } = harness()
    inventory.products = [product(), product({ id: 'p2', sku: 'B-1', name: 'Beta' })]
    ui.search = 'beta'
    expect(catalog.filtered.value).toHaveLength(1)
    expect(catalog.filtered.value[0].sku).toBe('B-1')
  })
})
