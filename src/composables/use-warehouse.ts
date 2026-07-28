import { batchesApi } from '@/api/batches'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useInventoryStore } from '@/stores/inventory'
import { useUiStore } from '@/stores/ui'
import type { BatchPatch, NewBatch } from '@/types/database'
import type { BatchStatus } from '@/types/models'
import { batchStatus, daysUntil } from '@/utils/batch-status'
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
  remaining: number
  received: number
  status: BatchStatus
  daysLeft: number | null
}

export function useWarehouse() {
  const inventory = useInventoryStore()
  const ui = useUiStore()
  const auth = useAuthStore()
  const toast = useToast()
  const { t } = useI18n()

  const statusFilter = ref<'all' | BatchStatus>('all')
  const brandFilter = ref('all')

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
    try {
      await batchesApi.remove(id)
      await reload()
      toast.success(t('toasts.deleted'))
    } catch {
      toast.error(t('errors.delete'))
    }
  }

  return { filtered, statusFilter, brandFilter, createBatch, updateBatch, removeBatch }
}
