import { batchesApi } from '@/api/batches'
import { useCurrency } from '@/composables/use-currency'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useInventoryStore } from '@/stores/inventory'
import { useReferenceStore } from '@/stores/reference'
import { useUiStore } from '@/stores/ui'
import type { BatchPatch, NewBatch } from '@/types/database'
import type { BatchStatus } from '@/types/models'
import { batchStatus, compareByExpiry, daysUntil } from '@/utils/batch-status'
import { computeMargin } from '@/utils/pricing'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

export interface WarehouseRow {
  id: string
  productId: string
  brandId: string | null
  name: string
  sku: string
  batch: string
  delivery: string | null
  expiry: string | null
  remaining: number // still on the shelf
  received: number // how many arrived in this delivery
  sold: number // received − remaining
  cost: number // what one unit of *this* delivery cost, in display currency
  retail: number | null // what it sells for; null when neither batch nor product says
  margin: number | null // 0..1, what the delivery earns per unit
  status: BatchStatus
  daysLeft: number | null
}

/** One product's whole stock, with the per-expiry batches behind it. */
export interface WarehouseGroup {
  id: string // product id — the table's row key
  name: string
  sku: string
  brandId: string | null
  remaining: number
  received: number
  sold: number
  batchesCount: number
  stockValue: number // what the remaining units cost, at each batch's own price
  status: BatchStatus // worst status among the batches that still hold stock
  nearestExpiry: string | null
  daysLeft: number | null
  batches: WarehouseRow[]
}

/** Whether a batch still has stock behind it. */
export type StockFilter = 'in' | 'out' | 'all'

// Worst → best, so a group inherits its most urgent batch.
const STATUS_SEVERITY: Record<BatchStatus, number> = {
  expired: 0,
  critical: 1,
  ending: 2,
  almost: 3,
  ok: 4,
}

export function useWarehouse() {
  const inventory = useInventoryStore()
  const reference = useReferenceStore()
  const ui = useUiStore()
  const { batchCostToDisplay, batchRetailToDisplay } = useCurrency()
  const auth = useAuthStore()
  const toast = useToast()
  const { t } = useI18n()

  const statusFilter = ref<'all' | BatchStatus>('all')
  // A batch sold to the last unit stays in the books but leaves the shelf, so
  // the warehouse opens on what can still be sold; the filter is how the user
  // looks back at closed deliveries.
  const stockFilter = ref<StockFilter>('in')
  const brandFilter = ref('all')
  const groupByProduct = ref(false)

  const rows = computed<WarehouseRow[]>(() =>
    inventory.batches.map((b) => {
      const brand = b.product ? (reference.brandsById.get(b.product.brand_id ?? '') ?? null) : null
      // A delivery bought on promotion keeps its own prices, so the shelf says
      // what is left at which cost — and what it earns — rather than one
      // blended figure. Both are converted the same way, so the margin between
      // them is the ratio it would be in any currency.
      const cost = b.product ? batchCostToDisplay(b, b.product, brand) : 0
      const retail = b.product ? batchRetailToDisplay(b, b.product) : null

      return {
        id: b.id,
        productId: b.product_id,
        brandId: b.product?.brand_id ?? null,
        name: b.product?.name ?? '—',
        sku: b.product?.sku ?? '',
        batch: b.batch_number ?? '—',
        delivery: b.delivery_date,
        expiry: b.expiry_date,
        remaining: b.remaining_qty,
        received: b.received_qty,
        sold: Math.max(0, b.received_qty - b.remaining_qty),
        cost,
        retail,
        margin: computeMargin(cost, retail),
        status: batchStatus(b.expiry_date),
        daysLeft: daysUntil(b.expiry_date),
      }
    }),
  )

  const filtered = computed(() => {
    const q = ui.search.trim().toLowerCase()
    return rows.value.filter((r) => {
      if (statusFilter.value !== 'all' && r.status !== statusFilter.value) return false
      if (stockFilter.value === 'in' && r.remaining <= 0) return false
      if (stockFilter.value === 'out' && r.remaining > 0) return false
      if (brandFilter.value !== 'all' && r.brandId !== brandFilter.value) return false
      if (q && !`${r.name} ${r.sku} ${r.batch}`.toLowerCase().includes(q)) return false
      return true
    })
  })

  // Same product, several deliveries: one row per product carrying the
  // total, with each expiry date and its quantity underneath.
  const grouped = computed<WarehouseGroup[]>(() => {
    const byProduct = new Map<string, WarehouseRow[]>()
    for (const row of filtered.value) {
      const bucket = byProduct.get(row.productId)
      if (bucket) bucket.push(row)
      else byProduct.set(row.productId, [row])
    }

    return [...byProduct.entries()]
      .map(([productId, batches]) => {
        const sorted = [...batches].sort((a, b) =>
          compareByExpiry({ expiry_date: a.expiry }, { expiry_date: b.expiry }),
        )
        // Only stock you can still sell should drive the warning colour.
        const inStock = sorted.filter((b) => b.remaining > 0)
        const rated = inStock.length > 0 ? inStock : sorted
        const worst = rated.reduce(
          (acc, b) => (STATUS_SEVERITY[b.status] < STATUS_SEVERITY[acc.status] ? b : acc),
          rated[0],
        )
        const nearest = rated.find((b) => b.expiry) ?? worst

        return {
          id: productId,
          name: sorted[0].name,
          sku: sorted[0].sku,
          brandId: sorted[0].brandId,
          remaining: sorted.reduce((sum, b) => sum + b.remaining, 0),
          received: sorted.reduce((sum, b) => sum + b.received, 0),
          sold: sorted.reduce((sum, b) => sum + b.sold, 0),
          batchesCount: sorted.length,
          stockValue: sorted.reduce((sum, b) => sum + b.remaining * b.cost, 0),
          status: worst.status,
          nearestExpiry: nearest.expiry,
          daysLeft: nearest.daysLeft,
          batches: sorted,
        }
      })
      .sort((a, b) => STATUS_SEVERITY[a.status] - STATUS_SEVERITY[b.status] || a.name.localeCompare(b.name))
  })

  // Nothing on the shelf at all, or nothing the filters let through. Note
  // that the default stock filter already hides sold-out batches, so clearing
  // has to open the warehouse right up for the answer to be honest.
  const total = computed(() => rows.value.length)

  function clearFilters() {
    statusFilter.value = 'all'
    stockFilter.value = 'all'
    brandFilter.value = 'all'
    ui.setSearch('')
  }

  async function reload() {
    if (auth.companyId) await inventory.load(auth.companyId)
  }

  async function createBatch(payload: Omit<NewBatch, 'company_id'>) {
    if (!auth.companyId) return
    try {
      inventory.upsertBatch(await batchesApi.create({ ...payload, company_id: auth.companyId }))
      toast.success(t('toasts.saved'))
    } catch (e) {
      toast.error(t('errors.save'))
      throw e
    }
  }

  async function updateBatch(id: string, patch: BatchPatch) {
    try {
      inventory.upsertBatch(await batchesApi.update(id, patch))
      toast.success(t('toasts.saved'))
    } catch (e) {
      toast.error(t('errors.save'))
      throw e
    }
  }

  async function removeBatches(ids: string[]) {
    if (ids.length === 0) return
    try {
      await batchesApi.removeMany(ids)
      inventory.removeBatches(ids)
      toast.success(t('toasts.deleted'))
    } catch {
      toast.error(t('errors.delete'))
    }
  }

  return {
    filtered,
    grouped,
    total,
    clearFilters,
    reload,
    statusFilter,
    stockFilter,
    brandFilter,
    groupByProduct,
    createBatch,
    updateBatch,
    removeBatches,
  }
}
