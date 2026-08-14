import { useCart } from '@/composables/use-cart'
import uk from '@/locales/uk.json'
import { useAuthStore } from '@/stores/auth'
import { useCartStore } from '@/stores/cart'
import { useClientsStore } from '@/stores/clients'
import { useCurrencyStore } from '@/stores/currency'
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
        useCurrencyStore().setCurrency('UAH')
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
