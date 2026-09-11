import type { Batch, Brand, Category, Client, Order, OrderItem, Product } from '@/types/database'

// Expiry buckets, worst → best. Derived from a batch's expiry date and
// remaining quantity (see utils/batch-status).
export type BatchStatus = 'expired' | 'critical' | 'ending' | 'almost' | 'ok'

// A catalogue product joined with its brand + category, plus its prices in
// the base currency, converted through the supplier's own rates.
export interface ProductView extends Product {
  brand: Brand | null
  category: Category | null
  purchase: number | null // cost in the base; null while the supplier's rate is missing
  retail: number | null // retail in the base; null with no price, or no rate for it
  supplierRetail: number | null // retail in the supplier's own currency — the one cost is quoted in
  discounted: number | null // retail after applying the active discount
  margin: number | null // 0..1
  rateMissing: string | null // the currency a price here still needs a rate for
  inStock: number // sum of remaining_qty across batches
}

export interface BatchView extends Batch {
  product: Product | null
  brand: Brand | null
  status: BatchStatus
  daysLeft: number | null
}

export interface ClientView extends Client {
  ordersCount: number
  // Sum of the client's orders, in the base currency like every amount.
  totalSpent: number
}

export interface OrderItemView extends OrderItem {
  unitNet: number // unit_price after this line's own discount
  lineSale: number // qty * unitNet
  lineCost: number // qty * unit_cost
}

export interface OrderView extends Order {
  client: Client | null
  items: OrderItemView[]
  itemsCount: number
  saleTotal: number
  goodsCost: number
  costTotal: number // goods + delivery + packaging
  profit: number
  margin: number | null
}

// A line being assembled in the cart before an order exists.
export interface CartLine {
  key: string // stable key: productId or productId:batchId
  product: Product
  brand: Brand | null
  batch: Batch | null // set when selling from a specific warehouse batch
  qty: number
  stockQty: number // what is actually on hand — qty above this ships as a backorder
  unitPrice: number // sale price / unit, display currency — editable per line
  listPrice: number // what the catalog said when the line was added, for "reset"
  unitCost: number // purchase cost / unit, display currency
  discount: number // percent (0..100) off this line, on top of the order discount
}
