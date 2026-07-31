import { batchesApi } from '@/api/batches'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useInventoryStore } from '@/stores/inventory'
import { useUiStore } from '@/stores/ui'
import type { BatchPatch, NewBatch } from '@/types/database'
import type { BatchStatus } from '@/types/models'
import { batchStatus, compareByExpiry, daysUntil } from '@/utils/batch-status'
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
  status: BatchStatus // worst status among the batches that still hold stock
  nearestExpiry: string | null
  daysLeft: number | null
  batches: WarehouseRow[]
}

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
  const ui = useUiStore()
  const auth = useAuthStore()
  const toast = useToast()
  const { t } = useI18n()

  const statusFilter = ref<'all' | BatchStatus>('all')
  const brandFilter = ref('all')
  const groupByProduct = ref(false)

  const rows = computed<WarehouseRow[]>(() =>
    inventory.batches.map((b) => ({
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
      status: batchStatus(b.expiry_date),
      daysLeft: daysUntil(b.expiry_date),
    })),
  )

  const filtered = computed(() => {
    const q = ui.search.trim().toLowerCase()
    return rows.value.filter((r) => {
      if (statusFilter.value !== 'all' && r.status !== statusFilter.value) return false
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
          status: worst.status,
          nearestExpiry: nearest.expiry,
          daysLeft: nearest.daysLeft,
          batches: sorted,
        }
      })
      .sort((a, b) => STATUS_SEVERITY[a.status] - STATUS_SEVERITY[b.status] || a.name.localeCompare(b.name))
  })

  async function reload() {
    if (auth.companyId) await inventory.load(auth.companyId)
  }

  async function createBatch(payload: Omit<NewBatch, 'company_id'>) {
    if (!auth.companyId) return
    try {
      await batchesApi.create({ ...payload, company_id: auth.companyId })
      await reload()
      toast.success(t('toasts.saved'))
    } catch (e) {
      toast.error(t('errors.save'))
      throw e
    }
  }

  async function updateBatch(id: string, patch: BatchPatch) {
    try {
      await batchesApi.update(id, patch)
      await reload()
      toast.success(t('toasts.saved'))
    } catch (e) {
      toast.error(t('errors.save'))
      throw e
    }
  }

  async function removeBatch(id: string) {
    await removeBatches([id])
  }

  async function removeBatches(ids: string[]) {
    if (ids.length === 0) return
    try {
      await batchesApi.removeMany(ids)
      await reload()
      toast.success(t('toasts.deleted'))
    } catch {
      toast.error(t('errors.delete'))
    }
  }

  return {
    filtered,
    grouped,
    statusFilter,
    brandFilter,
    groupByProduct,
    createBatch,
    updateBatch,
    removeBatch,
    removeBatches,
  }
}
