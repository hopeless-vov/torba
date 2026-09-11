import { useCart } from '@/composables/use-cart'
import uk from '@/locales/uk.json'
import { useAuthStore } from '@/stores/auth'
import { useCartStore } from '@/stores/cart'
import { useClientsStore } from '@/stores/clients'
import { useInventoryStore } from '@/stores/inventory'
import type { BatchRow } from '@/api/batches'
import type { Client, Company, Product } from '@/types/database'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Only the order-placing call is stubbed; everything below it is the real
// cart, so the payload asserted here is the one the RPC would receive.
const api = vi.hoisted(() => ({ place: vi.fn(async () => 'order-1'), list: vi.fn(async () => []) }))
vi.mock('@/api/orders', () => ({ ordersApi: api }))
vi.mock('@/api/batches', () => ({ batchesApi: { list: vi.fn(async () => []) } }))
vi.mock('@/api/products', () => ({ productsApi: { list: vi.fn(async () => []) } }))

const product = { id: 'p1', sku: 'A-1', name: 'Alpha' } as Product

function harness() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const i18n = createI18n({ legacy: false, locale: 'uk', fallbackLocale: 'uk', messages: { uk } })
  let ctx!: { cart: ReturnType<typeof useCartStore>; use: ReturnType<typeof useCart> }
  mount(
    defineComponent({
      setup() {
        const auth = useAuthStore()
        auth.memberships = [
          {
            company_id: 'c',
            user_id: 'u',
            role: 'owner',
            created_at: '',
            company: { id: 'c', name: '', base_currency: 'UAH' } as Company,
          },
        ]
        auth.activeCompanyId = 'c'
        ctx = { cart: useCartStore(), use: useCart() }
        return () => null
      },
    }),
    { global: { plugins: [pinia, i18n] } },
  )
  return ctx
}

beforeEach(() => {
  api.place.mockClear()
})

describe('useCart line pricing', () => {
  it('leaves an undiscounted line at its price', () => {
    const { cart, use } = harness()
    cart.addLine({ product, brand: null, unitPrice: 200, unitCost: 100 })
    expect(use.linePrice(cart.lines[0])).toBe(200)
  })

  it('applies a line discount before the order discount', () => {
    const { cart, use } = harness()
    cart.addLine({ product, brand: null, unitPrice: 200, unitCost: 100 })
    cart.setDiscount('p1', 25)

    expect(use.lineNet(cart.lines[0])).toBe(150)
    expect(use.linePrice(cart.lines[0])).toBe(150)

    // 25% off the line, then 10% off the order: 200 × 0.75 × 0.9.
    cart.discount = 10
    expect(use.lineNet(cart.lines[0])).toBe(150)
    expect(use.linePrice(cart.lines[0])).toBeCloseTo(135, 6)
  })

  it('prices an edited line at what the user typed', () => {
    const { cart, use } = harness()
    cart.addLine({ product, brand: null, unitPrice: 200, unitCost: 100 })
    cart.setPrice('p1', 250)
    expect(use.linePrice(cart.lines[0])).toBe(250)
  })

  it('rolls line discounts into the cart totals', () => {
    const { cart, use } = harness()
    cart.addLine({ product, brand: null, unitPrice: 200, unitCost: 100, qty: 2 })
    cart.setDiscount('p1', 50)
    expect(use.totals.value.saleTotal).toBe(200) // 2 × 100
    expect(use.totals.value.goodsCost).toBe(200) // cost is untouched
    expect(use.totals.value.profit).toBe(0)
  })

  // A client's agreed discount still reaches the line when the cart has no
  // override of its own.
  it('falls back to the client discount for the order-level part', () => {
    const { cart, use } = harness()
    const clients = useClientsStore()
    clients.clients = [{ id: 'cl1', name: 'Ivan', discount: 20 } as Client]
    cart.clientId = 'cl1'
    cart.addLine({ product, brand: null, unitPrice: 100, unitCost: 40 })
    expect(use.linePrice(cart.lines[0])).toBe(80)
  })
})

describe('useCart checkout', () => {
  it('sends the gross price and the line discount separately', async () => {
    const { cart, use } = harness()
    cart.addLine({ product, brand: null, unitPrice: 200, unitCost: 100, qty: 3 })
    cart.setPrice('p1', 180)
    cart.setDiscount('p1', 15)
    await use.checkout()

    expect(api.place).toHaveBeenCalledTimes(1)
    const payload = api.place.mock.calls[0][0] as unknown as {
      items: { unit_price: number; discount: number; qty: number }[]
    }
    expect(payload.items).toEqual([
      expect.objectContaining({ qty: 3, unit_price: 180, unit_cost: 100, discount: 15 }),
    ])
  })
})

// One product, two deliveries that cost different money: a full-price one at
// 1500 and a promotional one at 1192. Which one ships decides the margin.
const priced = {
  id: 'p1',
  sku: 'A-1',
  name: 'Alpha',
  brand_id: null,
  cost_amount: 1500,
  cost_currency: 'UAH',
  retail_amount: 2000,
  retail_currency: 'UAH',
} as Product

function batchOf(id: string, cost: number | null, retail: number | null = null): BatchRow {
  return {
    id,
    company_id: 'c',
    product_id: 'p1',
    batch_number: id,
    delivery_date: '2026-06-01',
    expiry_date: id === 'promo' ? '2027-01-01' : '2027-06-01',
    received_qty: 10,
    remaining_qty: 10,
    cost_amount: cost,
    cost_currency: cost == null ? null : 'UAH',
    retail_amount: retail,
    retail_currency: retail == null ? null : 'UAH',
    created_at: '2026-06-01',
    product: { ...priced, brand: null },
  } as unknown as BatchRow
}

describe('useCart batch cost', () => {
  it('sells a promotional delivery at what that delivery cost', () => {
    const { cart, use } = harness()
    use.addFromBatch(batchOf('promo', 1192))

    expect(cart.lines[0].unitCost).toBe(1192)
  })

  it('falls back to the catalogue price for a batch without one', () => {
    const { cart, use } = harness()
    use.addFromBatch(batchOf('old', null))

    expect(cart.lines[0].unitCost).toBe(1500)
  })

  // Handing over the other delivery instead has to move the cost with it, or
  // the sale reports a margin it never made.
  it('re-prices the line when it is moved onto another batch', () => {
    const { cart, use } = harness()
    const inventory = useInventoryStore()
    inventory.batches = [batchOf('promo', 1192), batchOf('full', 1500)]

    use.addFromBatch(batchOf('promo', 1192))
    expect(cart.lines[0].unitCost).toBe(1192)

    use.selectBatch(cart.lines[0], 'full')
    expect(cart.lines[0].unitCost).toBe(1500)
  })

  it('sends the batch’s cost to the order, so the margin is the real one', async () => {
    const { use } = harness()
    use.addFromBatch(batchOf('promo', 1192))
    await use.checkout()

    expect(api.place).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({ unit_cost: 1192, batch_id: 'promo' })],
    }))
  })

  // A line added from the catalogue draws FIFO, so it costs what the batch it
  // will actually ship from costs.
  it('prices a catalogue line from the batch it would ship from', () => {
    const { cart, use } = harness()
    const inventory = useInventoryStore()
    inventory.batches = [batchOf('promo', 1192)]

    use.addProduct({ ...priced, brand: null, category: null } as never)

    expect(cart.lines[0].unitCost).toBe(1192)
  })
})

describe('useCart batch price', () => {
  it('sells a delivery at its own price when it names one', () => {
    const { cart, use } = harness()
    use.addFromBatch(batchOf('promo', 1192, 1790))

    expect(cart.lines[0].unitPrice).toBe(1790)
    expect(cart.lines[0].listPrice).toBe(1790)
  })

  it('falls back to the catalogue price for a delivery without one', () => {
    const { cart, use } = harness()
    use.addFromBatch(batchOf('old', null))

    expect(cart.lines[0].unitPrice).toBe(2000)
  })

  // Handing over the other delivery re-prices the line, the same way it
  // re-costs it — both prices belong to the goods, not to the product.
  it('re-prices the line when it is moved onto another batch', () => {
    const { cart, use } = harness()
    const inventory = useInventoryStore()
    inventory.batches = [batchOf('promo', 1192, 1790), batchOf('full', 1500, 2200)]

    use.addFromBatch(batchOf('promo', 1192, 1790))
    use.selectBatch(cart.lines[0], 'full')

    expect(cart.lines[0].unitPrice).toBe(2200)
    expect(cart.lines[0].unitCost).toBe(1500)
  })

  // But a price the user typed is a decision. Re-pricing over it would undo
  // that decision without saying so.
  it('keeps a price the user typed when the batch changes', () => {
    const { cart, use } = harness()
    const inventory = useInventoryStore()
    inventory.batches = [batchOf('promo', 1192, 1790), batchOf('full', 1500, 2200)]

    use.addFromBatch(batchOf('promo', 1192, 1790))
    cart.setPrice(cart.lines[0].key, 1650)
    use.selectBatch(cart.lines[0], 'full')

    expect(cart.lines[0].unitPrice).toBe(1650)
    // The catalogue price still moves, so "reset" offers the new batch's.
    expect(cart.lines[0].listPrice).toBe(2200)
    expect(cart.lines[0].unitCost).toBe(1500)
  })

  it('sends the batch’s price to the order', async () => {
    const { use } = harness()
    use.addFromBatch(batchOf('promo', 1192, 1790))
    await use.checkout()

    expect(api.place).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ unit_price: 1790, unit_cost: 1192 })],
      }),
    )
  })
})
