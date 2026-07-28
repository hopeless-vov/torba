import { supabase } from '@/api/supabase'
import type { Category, NewCategory } from '@/types/database'

export const categoriesApi = {
  list: async (companyId: string): Promise<Category[]> => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
    if (error) throw error
    return (data ?? []) as Category[]
  },

  create: async (category: NewCategory): Promise<Category> => {
    const { data, error } = await supabase.from('categories').insert(category).select('*').single()
    if (error) throw error
    return data as Category
  },

  rename: async (id: string, name: string): Promise<Category> => {
    const { data, error } = await supabase
      .from('categories')
      .update({ name })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Category
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) throw error
  },
}
