import { useCartStore } from '@/stores/cart'
import type { Batch, Brand, Product } from '@/types/database'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

const brand = { id: 'b1', name: 'Colorescience', catalog_currency: 'USD', supplier_rate: 44.5 } as Brand
const productA = { id: 'p1', sku: 'A-1', name: 'Alpha' } as Product
const productB = { id: 'p2', sku: 'B-1', name: 'Beta' } as Product
const marchBatch = { id: 'batch-march', product_id: 'p1', remaining_qty: 4 } as Batch
const juneBatch = { id: 'batch-june', product_id: 'p1', remaining_qty: 6 } as Batch

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

  it('keeps the same product on different batches as separate lines', () => {
    const cart = useCartStore()
    cart.addLine({ product: productA, brand, batch: marchBatch, unitPrice: 100, unitCost: 60 })
    cart.addLine({ product: productA, brand, batch: juneBatch, unitPrice: 100, unitCost: 60 })
    expect(cart.lines).toHaveLength(2)
    expect(cart.lines.map((l) => l.batch?.id)).toEqual(['batch-march', 'batch-june'])
  })

  it('sells more than is on hand and flags the shortfall', () => {
    const cart = useCartStore()
    cart.addLine({
      product: productA,
      brand,
      batch: marchBatch,
      unitPrice: 100,
      unitCost: 60,
      qty: 10,
      stockQty: 4,
    })
    expect(cart.lines[0].qty).toBe(10)
    expect(cart.hasBackorder).toBe(true)
  })

  it('has no backorder while quantities fit the stock', () => {
    const cart = useCartStore()
    cart.addLine({ product: productA, brand, unitPrice: 100, unitCost: 60, qty: 3, stockQty: 5 })
    expect(cart.hasBackorder).toBe(false)
  })

  it('moves a line onto another batch', () => {
    const cart = useCartStore()
    cart.addLine({
      product: productA,
      brand,
      batch: marchBatch,
      unitPrice: 100,
      unitCost: 60,
      qty: 2,
      stockQty: 4,
    })
    cart.setBatch(cart.lines[0].key, juneBatch, 6)

    expect(cart.lines).toHaveLength(1)
    expect(cart.lines[0].batch?.id).toBe('batch-june')
    expect(cart.lines[0].key).toBe('p1:batch-june')
    expect(cart.lines[0].stockQty).toBe(6)
    expect(cart.lines[0].qty).toBe(2)
  })

  it('merges into the target line when both batches are in the cart', () => {
    const cart = useCartStore()
    cart.addLine({ product: productA, brand, batch: marchBatch, unitPrice: 100, unitCost: 60, qty: 2 })
    cart.addLine({ product: productA, brand, batch: juneBatch, unitPrice: 100, unitCost: 60, qty: 3 })
    cart.setBatch('p1:batch-march', juneBatch, 6)

    expect(cart.lines).toHaveLength(1)
    expect(cart.lines[0].key).toBe('p1:batch-june')
    expect(cart.lines[0].qty).toBe(5)
  })

  it('remembers the catalog price so an override can be undone', () => {
    const cart = useCartStore()
    cart.addLine({ product: productA, brand, unitPrice: 100, unitCost: 60 })
    cart.setPrice(cart.lines[0].key, 130)
    expect(cart.lines[0].unitPrice).toBe(130)
    expect(cart.lines[0].listPrice).toBe(100)

    cart.setPrice(cart.lines[0].key, cart.lines[0].listPrice)
    expect(cart.lines[0].unitPrice).toBe(100)
  })

  it('refuses a negative price', () => {
    const cart = useCartStore()
    cart.addLine({ product: productA, brand, unitPrice: 100, unitCost: 60 })
    cart.setPrice(cart.lines[0].key, -20)
    expect(cart.lines[0].unitPrice).toBe(0)
  })

  it('holds a discount per line, clamped into 0..100', () => {
    const cart = useCartStore()
    cart.addLine({ product: productA, brand, unitPrice: 100, unitCost: 60 })
    cart.addLine({ product: productB, brand, unitPrice: 50, unitCost: 30 })

    expect(cart.lines.map((l) => l.discount)).toEqual([0, 0])

    cart.setDiscount('p1', 15)
    cart.setDiscount('p2', 400)
    expect(cart.lines[0].discount).toBe(15)
    expect(cart.lines[1].discount).toBe(100)

    cart.setDiscount('p2', -5)
    expect(cart.lines[1].discount).toBe(0)
  })

  // Adding the same product again is a quantity change, not a re-quote — a
  // price the user typed must survive it.
  it('keeps a price override when the same product is added again', () => {
    const cart = useCartStore()
    cart.addLine({ product: productA, brand, unitPrice: 100, unitCost: 60 })
    cart.setPrice('p1', 80)
    cart.setDiscount('p1', 10)
    cart.addLine({ product: productA, brand, unitPrice: 100, unitCost: 60, qty: 2 })

    expect(cart.lines).toHaveLength(1)
    expect(cart.lines[0].qty).toBe(3)
    expect(cart.lines[0].unitPrice).toBe(80)
    expect(cart.lines[0].discount).toBe(10)
  })

  it('clears lines, selections and the discount override', () => {
    const cart = useCartStore()
    cart.addLine({ product: productA, brand, unitPrice: 100, unitCost: 60 })
    cart.clientId = 'c1'
    cart.paymentMethod = 'Готівка'
    cart.discount = 15
    cart.clear()
    expect(cart.isEmpty).toBe(true)
    expect(cart.clientId).toBeNull()
    expect(cart.paymentMethod).toBeNull()
    expect(cart.discount).toBeNull()
  })
})
