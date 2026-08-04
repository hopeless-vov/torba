import type { BatchRow } from '@/api/batches'
import type { OrderRow } from '@/api/orders'
import type { ProductRow } from '@/api/products'
import CartDrawer from '@/components/CartDrawer.vue'
import uk from '@/locales/uk.json'
import { useCartStore } from '@/stores/cart'
import { useClientsStore } from '@/stores/clients'
import { useInventoryStore } from '@/stores/inventory'
import { useOrdersStore } from '@/stores/orders'
import { useReferenceStore } from '@/stores/reference'
import type { Brand, Client, OrderItem } from '@/types/database'
import CatalogView from '@/views/CatalogView.vue'
import OrdersView from '@/views/OrdersView.vue'
import WarehouseView from '@/views/WarehouseView.vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it } from 'vitest'

// Render smoke tests: every screen is mounted against seeded stores so a
// broken template or a missing slot fails here instead of in the browser.

const brand = {
  id: 'b1',
  company_id: 'c',
  name: 'Fairy',
  usd_rate: 41.5,
  rate_updated_at: '',
  created_at: '',
} as Brand

const product = {
  id: 'p1',
  company_id: 'c',
  brand_id: 'b1',
  category_id: null,
  sku: 'FRY-500',
  name: 'Fairy Засіб для миття посуду',
  volume: '500 мл',
  price_usd: 2.1,
  retail_price_usd: 3.5,
  is_active: true,
  created_at: '',
  updated_at: '',
  brand,
  category: null,
} as ProductRow

function batch(over: Partial<BatchRow> & { id: string }): BatchRow {
  return {
    company_id: 'c',
    product_id: 'p1',
    batch_number: 'FRY-500-01',
    delivery_date: '2026-06-01',
    expiry_date: '2999-01-01',
    received_qty: 40,
    remaining_qty: 32,
    created_at: '2026-06-01',
    product: { ...product, brand: { id: 'b1', name: 'Fairy' } },
    ...over,
  } as BatchRow
}

const client = {
  id: 'cl1',
  company_id: 'c',
  name: 'Олег Петренко',
  phone: '+380671112233',
  city: 'Київ',
  delivery: 'НП №12',
  note: null,
  discount: 0,
  created_at: '',
} as Client

const order = {
  id: 'o1',
  company_id: 'c',
  number: 3001,
  client_id: 'cl1',
  status: 'sent',
  payment_method: 'Готівка',
  currency: 'UAH',
  tracking_number: '20450001112223',
  delivery_address: 'Львів, НП №30',
  delivery_cost: 60,
  packaging_cost: 20,
  note: null,
  created_at: '2026-07-01T10:00:00Z',
  updated_at: '2026-07-01T10:00:00Z',
  client,
  items: [
    {
      id: 'i1',
      company_id: 'c',
      order_id: 'o1',
      product_id: 'p1',
      batch_id: 'ba1',
      product_name: product.name,
      sku: product.sku,
      qty: 3,
      unit_price: 145,
      unit_cost: 87,
      created_at: '',
    } as OrderItem,
  ],
} as OrderRow

function render(component: Parameters<typeof mount>[0]) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const i18n = createI18n({ legacy: false, locale: 'uk', fallbackLocale: 'uk', messages: { uk } })

  useReferenceStore().brands = [brand]
  useReferenceStore().paymentMethods = [
    { id: 'pm1', company_id: 'c', name: 'Готівка', created_at: '' },
  ]
  useInventoryStore().products = [product]
  useInventoryStore().batches = [batch({ id: 'ba1' }), batch({ id: 'ba2', expiry_date: '2999-06-01' })]
  useClientsStore().clients = [client]
  useOrdersStore().orders = [order]

  return mount(component, { global: { plugins: [pinia, i18n] } })
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('CatalogView', () => {
  it('renders products with selection checkboxes', () => {
    const wrapper = render(CatalogView)
    expect(wrapper.text()).toContain('Fairy Засіб для миття посуду')
    expect(wrapper.text()).toContain('FRY-500')
    // one per row plus the select-all header, plus the "inactive" filter
    expect(wrapper.findAll('input[type="checkbox"]').length).toBeGreaterThanOrEqual(3)
  })
})

describe('WarehouseView', () => {
  it('lists batches with received and sold columns', () => {
    const wrapper = render(WarehouseView)
    expect(wrapper.text()).toContain(uk.warehouse.cols.received)
    expect(wrapper.text()).toContain(uk.warehouse.cols.sold)
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  })

  it('groups by product and expands into per-expiry batches', async () => {
    const wrapper = render(WarehouseView)
    const tabs = wrapper.findAll('button')
    const byProduct = tabs.find((b) => b.text() === uk.warehouse.view.products)
    await byProduct?.trigger('click')

    // Two batches of one product collapse into a single row totalling 64.
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.text()).toContain('64')

    await wrapper.find('tbody tr td button').trigger('click')
    expect(wrapper.text()).toContain('FRY-500-01')
    expect(wrapper.text()).toContain('32 / 40')
  })
})

describe('OrdersView', () => {
  it('shows the destination, phone and waybill instead of an item count', () => {
    const wrapper = render(OrdersView)
    expect(wrapper.text()).toContain('#3001')
    expect(wrapper.text()).toContain('+380671112233')
    expect(wrapper.text()).toContain('Львів, НП №30')
    expect(wrapper.text()).toContain('20450001112223')
    expect(wrapper.text()).toContain(uk.status.order.sent)
  })

  it('opens the details modal from a row click', async () => {
    const wrapper = render(OrdersView)
    await wrapper.find('tbody tr').trigger('click')
    // The modal teleports to body.
    expect(document.body.textContent).toContain(uk.orders.details.address)
    expect(document.body.textContent).toContain('Львів, НП №30')
  })

  it('opens the product info card from an order line', async () => {
    const wrapper = render(OrdersView)
    await wrapper.find('tbody tr').trigger('click')

    // The line's product button carries the "view product" title.
    const line = [...document.querySelectorAll('button')].find(
      (b) => b.getAttribute('title') === uk.orders.details.viewProduct,
    ) as HTMLButtonElement | undefined
    expect(line).toBeTruthy()
    line?.click()
    await wrapper.vm.$nextTick()

    // The product-info modal resolves the live product: brand + stock.
    expect(document.body.textContent).toContain('Fairy')
    expect(document.body.textContent).toContain(uk.catalog.cols.stock)
  })
})

describe('CartDrawer', () => {
  it('shows the expiry picker and the backorder warning per line', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const i18n = createI18n({ legacy: false, locale: 'uk', fallbackLocale: 'uk', messages: { uk } })
    useInventoryStore().products = [product]
    useInventoryStore().batches = [batch({ id: 'ba1' })]
    useClientsStore().clients = [client]

    const cart = useCartStore()
    cart.toggle(true)
    cart.addLine({
      product,
      brand,
      batch: batch({ id: 'ba1' }),
      unitPrice: 145,
      unitCost: 87,
      qty: 50,
      stockQty: 32,
    })

    mount(CartDrawer, { global: { plugins: [pinia, i18n] } })
    const rendered = document.body.textContent ?? ''

    expect(rendered).toContain('01.01.2999') // the batch's expiry, in the line
    expect(rendered).toContain('бракує 18') // 50 ordered, 32 on hand
  })
})
