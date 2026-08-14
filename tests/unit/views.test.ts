import type { BatchRow } from '@/api/batches'
import type { OrderRow } from '@/api/orders'
import type { ProductRow } from '@/api/products'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import uk from '@/locales/uk.json'
import { useAuthStore } from '@/stores/auth'
import { useCartStore } from '@/stores/cart'
import { useClientsStore } from '@/stores/clients'
import { useInventoryStore } from '@/stores/inventory'
import { useOrdersStore } from '@/stores/orders'
import { useReferenceStore } from '@/stores/reference'
import type { Brand, Client, Company, MembershipRole, OrderItem } from '@/types/database'
import CartView from '@/views/CartView.vue'
import CatalogView from '@/views/CatalogView.vue'
import ClientsView from '@/views/ClientsView.vue'
import LinksView from '@/views/LinksView.vue'
import OrdersView from '@/views/OrdersView.vue'
import WarehouseView from '@/views/WarehouseView.vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'

// Render smoke tests: every screen is mounted against seeded stores so a
// broken template or a missing slot fails here instead of in the browser.

const brand = {
  id: 'b1',
  company_id: 'c',
  name: 'Fairy',
  catalog_currency: 'USD',
  supplier_rate: 41.5,
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
  cost_amount: 2.1,
  retail_amount: 87,
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

// Write controls are gated on the caller's role (migration 0013), so a screen
// mounted without a membership renders read-only. These smoke tests are about
// the templates, so they run as an owner unless a case says otherwise.
function seedRole(role: MembershipRole = 'owner') {
  const auth = useAuthStore()
  auth.session = { user: { id: 'u1', email: 'me@x.com' } } as never
  auth.memberships = [
    {
      company_id: 'c',
      user_id: 'u1',
      role,
      created_at: '',
      company: { id: 'c', name: 'Co', base_currency: 'UAH' } as Company,
    },
  ]
  auth.activeCompanyId = 'c'
}

// Views navigate (the cart sends a placed order to the order list, an empty
// order list points at the cart), so they need a router to inject. A memory
// one with the two named targets is enough — nothing here follows a link.
function testRouter() {
  const blank = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: blank },
      { path: '/orders', name: 'orders', component: blank },
      { path: '/cart', name: 'cart', component: blank },
    ],
  })
}

function render(component: Parameters<typeof mount>[0], role: MembershipRole = 'owner') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const i18n = createI18n({ legacy: false, locale: 'uk', fallbackLocale: 'uk', messages: { uk } })

  seedRole(role)
  useReferenceStore().brands = [brand]
  useReferenceStore().categories = [{ id: 'cat1', company_id: 'c', name: 'Сироватки', created_at: '' }]
  useReferenceStore().brandCategories = [
    { company_id: 'c', brand_id: 'b1', category_id: 'cat1', created_at: '' },
  ]
  useReferenceStore().paymentMethods = [
    { id: 'pm1', company_id: 'c', name: 'Готівка', created_at: '' },
  ]
  useInventoryStore().products = [product]
  useInventoryStore().batches = [batch({ id: 'ba1' }), batch({ id: 'ba2', expiry_date: '2999-06-01' })]
  useClientsStore().clients = [client]
  useOrdersStore().orders = [order]

  return mount(component, { global: { plugins: [pinia, i18n, testRouter()] } })
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

  // A viewer reads the catalogue and changes nothing; the database refuses the
  // writes anyway (migration 0013), so offering the controls would only lie.
  it('hides the add, import and selection controls from a viewer', () => {
    const wrapper = render(CatalogView, 'viewer')
    expect(wrapper.text()).toContain('Fairy Засіб для миття посуду')
    expect(wrapper.text()).not.toContain(uk.catalog.newProduct)
    expect(wrapper.text()).not.toContain(uk.catalog.importCsv)
    // Only the "inactive" filter checkbox is left — no row selection.
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(1)
  })

  // The row's edit/delete menu is a DropdownMenu, not plain text, so it has
  // to be checked as a component — a viewer must not even have it to open.
  it('hides the row edit/delete menu and add-to-cart button from a viewer', () => {
    const wrapper = render(CatalogView, 'viewer')
    expect(wrapper.findComponent(DropdownMenu).exists()).toBe(false)
    expect(wrapper.find(`[title="${uk.catalog.addToCart}"]`).exists()).toBe(false)
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

  // Same reasoning as Catalog: a viewer can see what is on the shelf, but the
  // edit/delete menu and add-to-cart button on each row must not be offered.
  it('hides the row edit/delete menu and add-to-cart button from a viewer', () => {
    const wrapper = render(WarehouseView, 'viewer')
    expect(wrapper.findComponent(DropdownMenu).exists()).toBe(false)
    expect(wrapper.find(`[title="${uk.catalog.addToCart}"]`).exists()).toBe(false)
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

  // A viewer reads orders but moves nothing: no status menu to open, no row
  // actions. The database refuses those writes anyway (migration 0013).
  it('hides the status menu and row actions from a viewer', () => {
    const wrapper = render(OrdersView, 'viewer')
    expect(wrapper.text()).toContain('#3001')
    const statusBtn = wrapper
      .findAll('button')
      .find((b) => b.attributes('title') === uk.orders.changeStatus)
    expect(statusBtn).toBeUndefined()
  })

  it('opens the details modal from a row click', async () => {
    const wrapper = render(OrdersView)
    await wrapper.find('tbody tr').trigger('click')
    // The modal teleports to body.
    expect(document.body.textContent).toContain(uk.orders.details.address)
    expect(document.body.textContent).toContain('Львів, НП №30')
  })

  // Nothing to show yet, so the screen hands the user the one thing that
  // creates an order — the cart, which is now a page to go to.
  it('sends the user to the cart when there are no orders', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const i18n = createI18n({ legacy: false, locale: 'uk', fallbackLocale: 'uk', messages: { uk } })
    const router = testRouter()
    seedRole()
    useOrdersStore().orders = []

    const wrapper = mount(OrdersView, { global: { plugins: [pinia, i18n, router] } })
    const openCart = wrapper.findAll('button').find((b) => b.text() === uk.orders.openCart)
    expect(openCart).toBeTruthy()
    await openCart?.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('cart')
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

describe('ClientsView', () => {
  it('asks for confirmation before removing a client', async () => {
    const wrapper = render(ClientsView)
    const del = wrapper.findAll('button').find((b) => b.attributes('title') === uk.common.delete)
    expect(del).toBeTruthy()
    await del?.trigger('click')
    // The confirm dialog teleports to body with the client's name.
    expect(document.body.textContent).toContain(uk.clients.deleteTitle)
    expect(document.body.textContent).toContain('Олег Петренко')
  })

  // The grid's own edit/delete buttons are gone for a viewer (canTrade),
  // but the card modal is a second route to the same actions and has to be
  // gated independently — it teleports to body, so the check reads there.
  it('hides the row buttons and the card modal actions from a viewer', async () => {
    const wrapper = render(ClientsView, 'viewer')
    expect(wrapper.findAll('button').find((b) => b.attributes('title') === uk.common.delete)).toBeUndefined()
    expect(wrapper.findAll('button').find((b) => b.attributes('title') === uk.common.edit)).toBeUndefined()

    // The card itself (not the row buttons, already gone) opens the modal.
    await wrapper.find('.p-5').trigger('click')
    expect(document.body.textContent).toContain('Олег Петренко')
    expect(document.body.textContent).not.toContain(uk.common.delete)
    expect(document.body.textContent).not.toContain(uk.common.edit)
  })
})

describe('LinksView', () => {
  it('renders brands beside the selected brand’s categories', () => {
    const wrapper = render(LinksView)
    expect(wrapper.text()).toContain('Fairy')
    expect(wrapper.text()).toContain('Сироватки')
    expect(wrapper.text()).toContain(uk.links.markAll)
    // The selected brand's only link shows as 1 of 1 categories.
    expect(wrapper.text()).toContain(uk.links.savedImmediately)
  })

  it('confirms before deleting a brand', async () => {
    const wrapper = render(LinksView)
    const del = wrapper.findAll('button').find((b) => b.attributes('title') === uk.common.delete)
    expect(del).toBeTruthy()
    await del?.trigger('click')
    // The confirm dialog teleports to body with the brand's name.
    expect(document.body.textContent).toContain('Fairy')
  })

  // Links sit at canConfigure (admin+), not canTrade — a plain member can
  // sell but must not be able to unlink a brand from a category or delete it.
  // The bulk mark-all/clear pair writes the same links, so it goes too.
  it('hides brand/category delete and the bulk link buttons from a member', () => {
    const wrapper = render(LinksView, 'member')
    expect(wrapper.findAll('button').find((b) => b.attributes('title') === uk.common.delete)).toBeUndefined()
    expect(wrapper.text()).not.toContain(uk.links.markAll)
    expect(wrapper.text()).not.toContain(uk.links.clear)
  })
})

describe('CartView', () => {
  it('shows the expiry picker and the backorder warning per line', async () => {
    const wrapper = render(CartView)
    useCartStore().addLine({
      product,
      brand,
      batch: batch({ id: 'ba1' }),
      unitPrice: 145,
      unitCost: 87,
      qty: 50,
      stockQty: 32,
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('01.01.2999') // the batch's expiry, in the line
    expect(wrapper.text()).toContain('бракує 18') // 50 ordered, 32 on hand
  })

  // The route guard and the hidden nav links already keep a viewer off this
  // page; this is its own lock in case a line survives a role change.
  it('hides the checkout button for a viewer', () => {
    const wrapper = render(CartView, 'viewer')
    expect(wrapper.text()).not.toContain(uk.cart.checkout)
  })

  // Picking and settling the terms are one job now, so both live on the page
  // at once — no panel to open, nothing pinned over the product list.
  it('puts the picker, the lines and the order terms on one page', () => {
    const wrapper = render(CartView)
    expect(wrapper.text()).toContain(uk.cart.addTitle)
    expect(wrapper.text()).toContain(uk.cart.linesTitle)
    expect(wrapper.text()).toContain(uk.cart.client)
    expect(wrapper.text()).toContain(uk.cart.payment)
    expect(wrapper.text()).toContain(uk.cart.checkout)
    // The empty cart says so rather than showing an empty list.
    expect(wrapper.text()).toContain(uk.cart.empty)
  })

  // A row the user already added says so, instead of looking untouched and
  // inviting a second click.
  it('marks a product that is already in the cart', async () => {
    const wrapper = render(CartView)
    expect(wrapper.text()).not.toContain('у кошику: 2')

    useCartStore().addLine({ product, brand, unitPrice: 145, unitCost: 87, qty: 2, stockQty: 5 })
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('у кошику: 2')
  })

  it('lets a line be re-priced and discounted, and offers the catalog price back', async () => {
    const wrapper = render(CartView)
    const cart = useCartStore()
    cart.addLine({ product, brand, unitPrice: 145, unitCost: 87, qty: 1, stockQty: 5 })
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain(uk.cart.unitPrice)
    // Nothing overridden yet, so no undo is offered.
    expect(wrapper.text()).not.toContain('повернути ціну')

    cart.setPrice('p1', 200)
    cart.setDiscount('p1', 10)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('повернути ціну')
    expect(cart.lines[0].listPrice).toBe(145)
  })
})
