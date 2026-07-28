import { supabase } from '@/api/supabase'
import type { Brand, Category, NewProduct, Product, ProductPatch } from '@/types/database'

export type ProductRow = Product & {
  brand: Brand | null
  category: Category | null
}

const SELECT_WITH_RELATIONS = '*, brand:brands(*), category:categories(*)'

export const productsApi = {
  list: async (companyId: string): Promise<ProductRow[]> => {
    const { data, error } = await supabase
      .from('products')
      .select(SELECT_WITH_RELATIONS)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as ProductRow[]
  },

  create: async (product: NewProduct): Promise<Product> => {
    const { data, error } = await supabase.from('products').insert(product).select('*').single()
    if (error) throw error
    return data as Product
  },

  update: async (id: string, patch: ProductPatch): Promise<Product> => {
    const { data, error } = await supabase
      .from('products')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Product
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) throw error
  },

  // Bulk insert/update from a CSV import. Conflicts on (company_id, sku)
  // update the existing row so re-importing a refreshed price list is safe.
  bulkUpsert: async (products: NewProduct[]): Promise<Product[]> => {
    if (products.length === 0) return []
    const { data, error } = await supabase
      .from('products')
      .upsert(products, { onConflict: 'company_id,sku' })
      .select('*')
    if (error) throw error
    return (data ?? []) as Product[]
  },
}
