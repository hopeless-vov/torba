import { supabase } from '@/api/supabase'
import type { NewPaymentMethod, PaymentMethod } from '@/types/database'

export const paymentMethodsApi = {
  list: async (companyId: string): Promise<PaymentMethod[]> => {
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
    if (error) throw error
    return (data ?? []) as PaymentMethod[]
  },

  create: async (method: NewPaymentMethod): Promise<PaymentMethod> => {
    const { data, error } = await supabase
      .from('payment_methods')
      .insert(method)
      .select('*')
      .single()
    if (error) throw error
    return data as PaymentMethod
  },

  rename: async (id: string, name: string): Promise<PaymentMethod> => {
    const { data, error } = await supabase
      .from('payment_methods')
      .update({ name })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as PaymentMethod
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('payment_methods').delete().eq('id', id)
    if (error) throw error
  },
}
