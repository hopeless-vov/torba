import { useCurrency } from '@/composables/use-currency'
import { useInventoryStore } from '@/stores/inventory'
import { useOrdersStore } from '@/stores/orders'
import type { BatchStatus } from '@/types/models'
import { batchStatus, daysUntil } from '@/utils/batch-status'
import { computeOrderTotals } from '@/utils/orders'
import { computed } from 'vue'

export interface BurningRow {
  id: string
  name: string
  sku: string
  batch: string
  remaining: number
  expiry: string | null
  status: BatchStatus
  daysLeft: number | null
}

export function useDashboard() {
  const inventory = useInventoryStore()
  const orders = useOrdersStore()
  const { convert, convertBetween } = useCurrency()

  const enriched = computed(() =>
    inventory.batches.map((b) => ({
      batch: b,
      status: batchStatus(b.expiry_date),
      daysLeft: daysUntil(b.expiry_date),
    })),
  )

  const stats = computed(() => {
    let expired = 0
    let critical = 0
    let expiredUnits = 0
    let criticalUnits = 0
    let stockValue = 0

    for (const { batch, status } of enriched.value) {
      stockValue += batch.remaining_qty * convert(batch.product?.price_usd ?? 0)
      if (status === 'expired') {
        expired += 1
        expiredUnits += batch.remaining_qty
      } else if (status === 'critical') {
        critical += 1
        criticalUnits += batch.remaining_qty
      }
    }

    // Each order's profit is snapshotted in its own currency; convert to
    // the active one before summing so the figure is coherent.
    const profit = orders.orders.reduce(
      (sum, o) =>
        sum +
        convertBetween(
          computeOrderTotals(o.items, o.delivery_cost, o.packaging_cost).profit,
          o.currency,
        ),
      0,
    )

    const inStockPositions = new Set(
      inventory.batches.filter((b) => b.remaining_qty > 0).map((b) => b.product_id),
    ).size

    return {
      skuCount: inventory.products.length,
      inStockPositions,
      criticalWithin90: expired + critical,
      expiredCount: expired,
      criticalCount: critical,
      expiringUnits: expiredUnits + criticalUnits,
      criticalUnits,
      expiredUnits,
      stockValue,
      profit,
      ordersCount: orders.orders.length,
    }
  })

  const burning = computed<BurningRow[]>(() =>
    enriched.value
      .filter((e) => e.batch.expiry_date)
      .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
      .slice(0, 10)
      .map(({ batch, status, daysLeft }) => ({
        id: batch.id,
        name: batch.product?.name ?? '—',
        sku: batch.product?.sku ?? '',
        batch: batch.batch_number ?? '—',
        remaining: batch.remaining_qty,
        expiry: batch.expiry_date,
        status,
        daysLeft,
      })),
  )

  return { stats, burning }
}
