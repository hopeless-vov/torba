import type { Batch, Brand, Category, Client, Order, OrderItem, Product } from '@/types/database'

// Expiry buckets, worst → best. Derived from a batch's expiry date and
// remaining quantity (see utils/batch-status).
export type BatchStatus = 'expired' | 'critical' | 'ending' | 'almost' | 'ok'

// A catalogue product joined with its brand + category, plus the
// prices/margin resolved into the current display currency.
export interface ProductView extends Product {
  brand: Brand | null
  category: Category | null
  purchase: number // price_usd converted to display currency
  retail: number | null // retail_price_usd converted to display currency
  discounted: number | null // retail after applying the active discount
  margin: number | null // 0..1, currency-independent
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
  totalSpent: number
}

export interface OrderItemView extends OrderItem {
  lineSale: number // qty * unit_price
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
  maxQty: number // available stock — qty is clamped to this
  unitPrice: number // sale price / unit, display currency
  unitCost: number // purchase cost / unit, display currency
}
