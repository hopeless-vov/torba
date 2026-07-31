import { supabase } from '@/api/supabase'
import type { Batch, BatchPatch, NewBatch, Product } from '@/types/database'

export type BatchRow = Batch & {
  product: (Product & { brand: { id: string; name: string } | null }) | null
}

const SELECT_WITH_PRODUCT = '*, product:products(*, brand:brands(id, name))'

export const batchesApi = {
  list: async (companyId: string): Promise<BatchRow[]> => {
    const { data, error } = await supabase
      .from('batches')
      .select(SELECT_WITH_PRODUCT)
      .eq('company_id', companyId)
      .order('expiry_date', { ascending: true, nullsFirst: false })
    if (error) throw error
    return (data ?? []) as unknown as BatchRow[]
  },

  create: async (batch: NewBatch): Promise<Batch> => {
    const { data, error } = await supabase.from('batches').insert(batch).select('*').single()
    if (error) throw error
    return data as Batch
  },

  update: async (id: string, patch: BatchPatch): Promise<Batch> => {
    const { data, error } = await supabase
      .from('batches')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Batch
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('batches').delete().eq('id', id)
    if (error) throw error
  },

  removeMany: async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return
    const { error } = await supabase.from('batches').delete().in('id', ids)
    if (error) throw error
  },
}
