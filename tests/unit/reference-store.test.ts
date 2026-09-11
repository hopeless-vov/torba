import { useReferenceStore } from '@/stores/reference'
import type { Brand, BrandCategory, Category } from '@/types/database'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

const brandA = { id: 'b1', company_id: 'c', name: 'Alpha' } as Brand
const brandB = { id: 'b2', company_id: 'c', name: 'Beta' } as Brand
const care = { id: 'cat1', company_id: 'c', name: 'Care' } as Category
const tone = { id: 'cat2', company_id: 'c', name: 'Tone' } as Category
const samples = { id: 'cat3', company_id: 'c', name: 'Samples' } as Category

const links: BrandCategory[] = [
  { company_id: 'c', brand_id: 'b1', category_id: 'cat1', created_at: '' },
  { company_id: 'c', brand_id: 'b1', category_id: 'cat2', created_at: '' },
  { company_id: 'c', brand_id: 'b2', category_id: 'cat1', created_at: '' },
]

describe('reference store — brand ↔ category links', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('lists only the categories offered for a given brand, in store order', () => {
    const store = useReferenceStore()
    store.categories = [care, tone, samples]
    store.brands = [brandA, brandB]
    store.brandCategories = links

    expect(store.categoriesForBrand('b1').map((c) => c.id)).toEqual(['cat1', 'cat2'])
    expect(store.categoriesForBrand('b2').map((c) => c.id)).toEqual(['cat1'])
  })

  it('returns nothing for an unknown or empty brand', () => {
    const store = useReferenceStore()
    store.categories = [care, tone]
    store.brandCategories = links
    expect(store.categoriesForBrand('nope')).toEqual([])
    expect(store.categoriesForBrand(null)).toEqual([])
  })

  it('does not offer a category that exists but is unlinked (Samples)', () => {
    const store = useReferenceStore()
    store.categories = [care, tone, samples]
    store.brandCategories = links
    expect(store.categoriesForBrand('b1').some((c) => c.id === 'cat3')).toBe(false)
  })

  it('reports the brands a category is linked to', () => {
    const store = useReferenceStore()
    store.brandCategories = links
    expect(store.brandIdsForCategory('cat1').sort()).toEqual(['b1', 'b2'])
    expect(store.brandIdsForCategory('cat2')).toEqual(['b1'])
    expect(store.brandIdsForCategory('cat3')).toEqual([])
  })
})

describe('reference store — supplier rates', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('files each rate under its supplier and currency', () => {
    const store = useReferenceStore()
    store.supplierRates = [
      { id: 'r1', company_id: 'c', brand_id: 'b1', currency: 'USD', rate: 41.5, updated_at: '' },
      { id: 'r2', company_id: 'c', brand_id: 'b1', currency: 'EUR', rate: 45, updated_at: '' },
      { id: 'r3', company_id: 'c', brand_id: 'b2', currency: 'USD', rate: 42, updated_at: '' },
    ]

    expect(store.ratesByBrand.get('b1')?.get('USD')).toBe(41.5)
    expect(store.ratesByBrand.get('b1')?.get('EUR')).toBe(45)
    expect(store.ratesByBrand.get('b2')?.get('USD')).toBe(42)
    // No rate is not a rate of zero: the cell is simply not there.
    expect(store.ratesByBrand.get('b2')?.get('EUR')).toBeUndefined()
  })
})
