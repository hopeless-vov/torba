import { supabase } from '@/api/supabase'
import type { Client, NewClient } from '@/types/database'

export type ClientPatch = Partial<Omit<Client, 'id' | 'company_id' | 'created_at'>>

export const clientsApi = {
  list: async (companyId: string): Promise<Client[]> => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as Client[]
  },

  create: async (client: NewClient): Promise<Client> => {
    const { data, error } = await supabase.from('clients').insert(client).select('*').single()
    if (error) throw error
    return data as Client
  },

  update: async (id: string, patch: ClientPatch): Promise<Client> => {
    const { data, error } = await supabase
      .from('clients')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Client
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) throw error
  },
}
