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
  catalog_currency: string // the currency this supplier prices its goods in
  supplier_rate: number // functional-currency units per 1 unit of catalog_currency
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

// Which categories a brand offers. Many-to-many: a category can belong to
// several brands, a brand exposes several categories. Products still carry a
// single category_id; this table only decides what the pickers offer.
export interface BrandCategory {
  company_id: string
  brand_id: string
  category_id: string
  created_at: string
}

export interface PaymentMethod {
  id: string
  company_id: string
  name: string
  created_at: string
}

// A currency the owner can display amounts in, with its market (bank) rate.
// usd_rate is a per-USD numeraire — USD is only a rate-table reference point,
// not the functional currency (that is companies.base_currency, chosen freely).
export interface Currency {
  id: string
  company_id: string
  code: string
  symbol: string
  usd_rate: number // market rate: units of this currency per 1 USD
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
  cost_amount: number // supplier cost, in cost_currency
  cost_currency: string // the currency the cost was entered in
  retail_amount: number | null // retail price, in retail_currency
  retail_currency: string // the currency the retail price was entered in
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
  discount: number
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
  discount: number // percent (0..100) applied to the order's sale total
  tracking_number: string | null
  delivery_address: string | null // where this parcel goes; prefilled from the client
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

export type NewBrand = Pick<Brand, 'company_id' | 'name' | 'catalog_currency' | 'supplier_rate'>
export type NewCategory = Pick<Category, 'company_id' | 'name'>
export type NewBrandCategory = Pick<BrandCategory, 'company_id' | 'brand_id' | 'category_id'>
export type NewPaymentMethod = Pick<PaymentMethod, 'company_id' | 'name'>
export type NewClient = Omit<Client, 'id' | 'created_at'>

export type NewCurrency = Pick<Currency, 'company_id' | 'code' | 'symbol' | 'usd_rate'>
export type CurrencyPatch = Partial<Pick<Currency, 'code' | 'symbol' | 'usd_rate'>>

export type NewProduct = Omit<Product, 'id' | 'created_at' | 'updated_at'>
export type ProductPatch = Partial<Omit<Product, 'id' | 'company_id' | 'created_at' | 'updated_at'>>

export type NewBatch = Omit<Batch, 'id' | 'created_at'>
export type BatchPatch = Partial<Omit<Batch, 'id' | 'company_id' | 'product_id' | 'created_at'>>

export type NewOrder = Omit<Order, 'id' | 'created_at' | 'updated_at'>
export type OrderPatch = Partial<Omit<Order, 'id' | 'company_id' | 'number' | 'created_at' | 'updated_at'>>
export type NewOrderItem = Omit<OrderItem, 'id' | 'created_at'>
