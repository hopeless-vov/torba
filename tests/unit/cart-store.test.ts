import { useCartStore } from '@/stores/cart'
import type { Brand, Product } from '@/types/database'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

const brand = { id: 'b1', name: 'Colorescience', usd_rate: 44.5 } as Brand
const productA = { id: 'p1', sku: 'A-1', name: 'Alpha' } as Product
const productB = { id: 'p2', sku: 'B-1', name: 'Beta' } as Product

describe('cart store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('adds lines and counts quantities', () => {
    const cart = useCartStore()
    cart.addLine({ product: productA, brand, unitPrice: 100, unitCost: 60, qty: 2 })
    cart.addLine({ product: productB, brand, unitPrice: 50, unitCost: 30 })
    expect(cart.lines).toHaveLength(2)
    expect(cart.count).toBe(3)
    expect(cart.isEmpty).toBe(false)
  })

  it('merges repeated products into one line', () => {
    const cart = useCartStore()
    cart.addLine({ product: productA, brand, unitPrice: 100, unitCost: 60 })
    cart.addLine({ product: productA, brand, unitPrice: 100, unitCost: 60, qty: 3 })
    expect(cart.lines).toHaveLength(1)
    expect(cart.lines[0].qty).toBe(4)
  })

  it('removes a line when quantity drops to zero', () => {
    const cart = useCartStore()
    cart.addLine({ product: productA, brand, unitPrice: 100, unitCost: 60 })
    cart.setQty(cart.lines[0].key, 0)
    expect(cart.isEmpty).toBe(true)
  })

  it('clears lines and selections', () => {
    const cart = useCartStore()
    cart.addLine({ product: productA, brand, unitPrice: 100, unitCost: 60 })
    cart.clientId = 'c1'
    cart.paymentMethod = 'Готівка'
    cart.clear()
    expect(cart.isEmpty).toBe(true)
    expect(cart.clientId).toBeNull()
    expect(cart.paymentMethod).toBeNull()
  })
})
