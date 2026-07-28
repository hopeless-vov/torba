import { supabase } from '@/api/supabase'
import type { Client, NewOrder, NewOrderItem, Order, OrderItem, OrderPatch, OrderStatus } from '@/types/database'

export type OrderRow = Order & {
  client: Client | null
  items: OrderItem[]
}

const SELECT_WITH_RELATIONS = '*, client:clients(*), items:order_items(*)'

export const ordersApi = {
  list: async (companyId: string): Promise<OrderRow[]> => {
    const { data, error } = await supabase
      .from('orders')
      .select(SELECT_WITH_RELATIONS)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as OrderRow[]
  },

  nextNumber: async (companyId: string): Promise<number> => {
    const { data, error } = await supabase.rpc('next_order_number', { p_company_id: companyId })
    if (error) throw error
    return (data as number) ?? 2041
  },

  // Atomic order creation: assigns the number, inserts items and
  // decrements warehouse stock in one transaction (see create_order in
  // supabase/migrations/0002). Throws 'INSUFFICIENT_STOCK:<name>' on oversell.
  place: async (input: {
    clientId: string | null
    paymentMethod: string | null
    currency: string
    items: {
      product_id: string | null
      batch_id: string | null
      product_name: string
      sku: string | null
      qty: number
      unit_price: number
      unit_cost: number
    }[]
  }): Promise<string> => {
    const { data, error } = await supabase.rpc('create_order', {
      p_client_id: input.clientId,
      p_payment_method: input.paymentMethod,
      p_currency: input.currency,
      p_items: input.items,
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

  update: async (id: string, patch: OrderPatch): Promise<Order> => {
    const { data, error } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Order
  },

  setStatus: async (id: string, status: OrderStatus): Promise<Order> => {
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Order
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('orders').delete().eq('id', id)
    if (error) throw error
  },
}
