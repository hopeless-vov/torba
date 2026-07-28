// Row shapes mirror the Supabase/Postgres tables in
// `supabase/migrations`. We use them directly as the domain types
// (snake_case, no remapping) — this is an internal CRUD app and the
// column names are readable. Derived/computed values live in utils
// and composables, never in the persisted shape.

export type OrderStatus = 'new' | 'paid' | 'sent' | 'done'

export type UserRole = 'owner' | 'member'

export interface Company {
  id: string
  name: string
  owner_id: string
  base_currency: string
  display_currency: string
  created_at: string
}

export interface Profile {
  id: string
  company_id: string
  full_name: string | null
  role: UserRole
  created_at: string
}

export interface Brand {
  id: string
  company_id: string
  name: string
  usd_rate: number
  rate_updated_at: string
  created_at: string
}

export interface RateHistoryEntry {
  id: string
  company_id: string
  brand_id: string
  rate: number
  created_at: string
}

export interface Category {
  id: string
  company_id: string
  name: string
  created_at: string
}

export interface PaymentMethod {
  id: string
  company_id: string
  name: string
  created_at: string
}

export interface Product {
  id: string
  company_id: string
  brand_id: string | null
  category_id: string | null
  sku: string
  name: string
  volume: string | null
  price_usd: number
  retail_price_usd: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Batch {
  id: string
  company_id: string
  product_id: string
  batch_number: string | null
  delivery_date: string | null
  expiry_date: string | null
  received_qty: number
  remaining_qty: number
  created_at: string
}

export interface Client {
  id: string
  company_id: string
  name: string
  phone: string | null
  city: string | null
  delivery: string | null
  note: string | null
  created_at: string
}

export interface Order {
  id: string
  company_id: string
  number: number
  client_id: string | null
  status: OrderStatus
  payment_method: string | null
  currency: string
  tracking_number: string | null
  delivery_cost: number
  packaging_cost: number
  note: string | null
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  company_id: string
  order_id: string
  product_id: string | null
  batch_id: string | null
  product_name: string
  sku: string | null
  qty: number
  unit_price: number
  unit_cost: number
  created_at: string
}

// ── insert payloads (server fills id / created_at / company via app) ──

export type NewBrand = Pick<Brand, 'company_id' | 'name' | 'usd_rate'>
export type NewCategory = Pick<Category, 'company_id' | 'name'>
export type NewPaymentMethod = Pick<PaymentMethod, 'company_id' | 'name'>
export type NewClient = Omit<Client, 'id' | 'created_at'>

export type NewProduct = Omit<Product, 'id' | 'created_at' | 'updated_at'>
export type ProductPatch = Partial<Omit<Product, 'id' | 'company_id' | 'created_at' | 'updated_at'>>

export type NewBatch = Omit<Batch, 'id' | 'created_at'>
export type BatchPatch = Partial<Omit<Batch, 'id' | 'company_id' | 'product_id' | 'created_at'>>

export type NewOrder = Omit<Order, 'id' | 'created_at' | 'updated_at'>
export type OrderPatch = Partial<Omit<Order, 'id' | 'company_id' | 'number' | 'created_at' | 'updated_at'>>
export type NewOrderItem = Omit<OrderItem, 'id' | 'created_at'>
