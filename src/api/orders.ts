import { supabase } from '@/api/supabase'
import type {
  Client,
  NewOrder,
  NewOrderItem,
  Order,
  OrderItem,
  OrderPatch,
  OrderStatus,
  ProcurementStatus,
} from '@/types/database'

export type OrderRow = Order & {
  client: Client | null
  items: OrderItem[]
}

const SELECT_WITH_RELATIONS = '*, client:clients(*), items:order_items(*)'

// A line that shipped short, with enough of its order to say whose it is.
export type BackorderRow = OrderItem & {
  order: Pick<Order, 'id' | 'number' | 'created_at' | 'status'> & {
    client: Pick<Client, 'name' | 'phone'> | null
  }
}

// Deletion goes through delete_orders so the quantities drawn from
// batch-tied lines land back on the shelf (see migration 0004).
// order_items cascade with the order.
//
// The company is explicit because the RPC is SECURITY DEFINER: it cannot infer
// which of the user's organizations is active, and it checks membership
// against what we pass (migration 0011).
async function deleteOrders(ids: string[], companyId: string): Promise<number> {
  if (ids.length === 0) return 0
  const { data, error } = await supabase.rpc('delete_orders', {
    p_ids: ids,
    p_company_id: companyId,
  })
  if (error) throw error
  return (data as number) ?? 0
}

export const ordersApi = {
  // An order carries its client and every line, so the list is the heaviest
  // read in the app. `from` ('YYYY-MM-DD', inclusive) bounds it to a period;
  // omitting it still means the whole history, for the screens that need it.
  list: async (companyId: string, from?: string | null): Promise<OrderRow[]> => {
    let query = supabase
      .from('orders')
      .select(SELECT_WITH_RELATIONS)
      .eq('company_id', companyId)
    if (from) query = query.gte('created_at', from)
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as OrderRow[]
  },

  // Atomic order creation: assigns the number, inserts items and draws
  // down warehouse stock in one transaction (see create_order in
  // supabase/migrations/0004). Stock never goes negative — a line that
  // exceeds what is on hand ships short as a backorder.
  place: async (input: {
    companyId: string
    clientId: string | null
    paymentMethod: string | null
    currency: string
    discount?: number
    deliveryAddress?: string | null
    items: {
      product_id: string | null
      batch_id: string | null
      product_name: string
      sku: string | null
      qty: number
      unit_price: number
      unit_cost: number
      discount?: number // percent off this line, before the order discount
    }[]
  }): Promise<string> => {
    const { data, error } = await supabase.rpc('create_order', {
      p_client_id: input.clientId,
      p_payment_method: input.paymentMethod,
      p_currency: input.currency,
      p_items: input.items,
      p_delivery_address: input.deliveryAddress ?? null,
      p_discount: input.discount ?? 0,
      p_company_id: input.companyId,
    })
    if (error) throw error
    return data as string
  },

  create: async (order: NewOrder, items: Omit<NewOrderItem, 'order_id'>[]): Promise<OrderRow> => {
    const { data: created, error } = await supabase.from('orders').insert(order).select('*').single()
    if (error) throw error
    const orderRow = created as Order

    if (items.length > 0) {
      const payload = items.map((item) => ({ ...item, order_id: orderRow.id }))
      const { error: itemsError } = await supabase.from('order_items').insert(payload)
      if (itemsError) throw itemsError
    }

    const { data, error: readError } = await supabase
      .from('orders')
      .select(SELECT_WITH_RELATIONS)
      .eq('id', orderRow.id)
      .single()
    if (readError) throw readError
    return data as unknown as OrderRow
  },

  // Whether a company has sold anything at all. The base currency may only
  // change while it has not (0019), and the rates page says so up front.
  count: async (companyId: string): Promise<number> => {
    const { count, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
    if (error) throw error
    return count ?? 0
  },

  // One order with its client and lines — what the store holds, so a freshly
  // placed order can join the list without refetching every other one.
  get: async (id: string): Promise<OrderRow> => {
    const { data, error } = await supabase
      .from('orders')
      .select(SELECT_WITH_RELATIONS)
      .eq('id', id)
      .single()
    if (error) throw error
    return data as unknown as OrderRow
  },

  update: async (id: string, patch: OrderPatch): Promise<OrderRow> => {
    const { data, error } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', id)
      .select(SELECT_WITH_RELATIONS)
      .single()
    if (error) throw error
    return data as unknown as OrderRow
  },

  setStatus: async (id: string, status: OrderStatus): Promise<OrderRow> => {
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select(SELECT_WITH_RELATIONS)
      .single()
    if (error) throw error
    return data as unknown as OrderRow
  },

  // Every line that shipped short, newest first — however old its order, so
  // goods still to get never fall out of the list with the orders window.
  backorders: async (companyId: string): Promise<BackorderRow[]> => {
    const { data, error } = await supabase
      .from('order_items')
      .select('*, order:orders(id, number, created_at, status, client:clients(name, phone))')
      .eq('company_id', companyId)
      .gt('backorder_qty', 0)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as BackorderRow[]
  },

  setProcurementStatus: async (itemId: string, status: ProcurementStatus): Promise<OrderItem> => {
    const { data, error } = await supabase
      .from('order_items')
      .update({ procurement_status: status })
      .eq('id', itemId)
      .select('*')
      .single()
    if (error) throw error
    return data as OrderItem
  },

  remove: async (id: string, companyId: string): Promise<void> => {
    await deleteOrders([id], companyId)
  },

  removeMany: deleteOrders,
}
