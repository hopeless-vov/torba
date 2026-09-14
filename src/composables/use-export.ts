import logoSvg from '@/assets/logo.svg?raw'
import { useCurrency } from '@/composables/use-currency'
import { useToast } from '@/composables/use-toast'
import type { WarehouseRow } from '@/composables/use-warehouse'
import { useAuthStore } from '@/stores/auth'
import type { ClientView, OrderView, ProductView } from '@/types/models'
import { formatDate, formatPercent } from '@/utils/format'
import { createPdfBlob } from '@/utils/pdf-export'
import { downloadBlob, exportFileName, type ExportTable,toCsv } from '@/utils/table-export'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

export type ExportFormat = 'csv' | 'pdf'

// Catalogue, warehouse, orders and clients, as files: a CSV for Excel or
// another system, or a PDF under our logo with the company's name and the
// date on it. Each export is exactly what the screen is showing — search
// and filters included. Amounts are in the base, like everywhere else.
export function useExport() {
  const auth = useAuthStore()
  const toast = useToast()
  const { t } = useI18n()
  const { functionalCode, format, formatIn } = useCurrency()

  const exporting = ref<ExportFormat | null>(null)

  const money = { align: 'right' as const, decimals: 2, format: (n: number) => format(n) }
  const percent = { align: 'right' as const, csvFormatted: true, format: (n: number) => formatPercent(n) }
  const count = { align: 'right' as const }

  function table(title: string, columns: ExportTable['columns'], rows: ExportTable['rows']): ExportTable {
    // The PDF picks portrait or landscape by what fits (see tableLayout).
    return { title, company: auth.company?.name ?? '', generatedAt: new Date(), columns, rows }
  }

  function catalogTable(products: ProductView[]): ExportTable {
    const base = functionalCode.value
    return table(
      t('nav.catalog'),
      [
        { label: t('catalog.cols.article') },
        { label: t('catalog.cols.name') },
        { label: t('catalog.form.brand') },
        { label: t('catalog.form.category') },
        { label: t('catalog.cols.supplierCost'), align: 'right' },
        { label: t('catalog.cols.supplierRetail'), align: 'right' },
        { label: `${t('catalog.cols.purchase')} ${base}`, ...money },
        { label: `${t('catalog.cols.retail')} ${base}`, ...money },
        { label: t('catalog.cols.margin'), ...percent },
        { label: t('catalog.cols.stock'), ...count },
      ],
      products.map((p) => [
        p.sku,
        p.name,
        p.brand?.name ?? null,
        p.category?.name ?? null,
        formatIn(p.cost_currency, p.cost_amount, 2),
        p.supplierRetail == null ? null : formatIn(p.cost_currency, p.supplierRetail, 2),
        p.purchase,
        p.retail,
        p.margin,
        p.inStock,
      ]),
    )
  }

  function batchStatus(row: WarehouseRow): string {
    const status = t(`status.batch.${row.status}`)
    return row.daysLeft == null ? status : `${status} · ${t('status.batch.days', { n: row.daysLeft })}`
  }

  function warehouseTable(rows: WarehouseRow[]): ExportTable {
    return table(
      t('nav.warehouse'),
      [
        { label: t('warehouse.cols.product') },
        { label: t('catalog.cols.article') },
        { label: t('warehouse.cols.batch') },
        { label: t('warehouse.cols.delivery') },
        { label: t('warehouse.cols.expiry') },
        { label: t('warehouse.cols.remaining'), ...count },
        { label: t('warehouse.cols.received'), ...count },
        { label: t('warehouse.cols.sold'), ...count },
        { label: t('warehouse.cols.cost'), ...money },
        { label: t('warehouse.cols.retail'), ...money },
        { label: t('warehouse.cols.margin'), ...percent },
        { label: t('warehouse.cols.status') },
      ],
      rows.map((r) => [
        r.name,
        r.sku,
        r.batch,
        r.delivery ? formatDate(r.delivery) : null,
        r.expiry ? formatDate(r.expiry) : null,
        r.remaining,
        r.received,
        r.sold,
        r.cost,
        r.retail,
        r.margin,
        batchStatus(r),
      ]),
    )
  }

  function ordersTable(orders: OrderView[]): ExportTable {
    return table(
      t('nav.orders'),
      [
        { label: t('export.orderNumber') },
        { label: t('export.date') },
        { label: t('orders.cols.client') },
        { label: t('clients.form.phone') },
        { label: t('orders.cols.products') },
        { label: t('orders.cols.address') },
        { label: t('orders.cols.tracking') },
        { label: t('orders.cols.sale'), ...money },
        { label: t('orders.cols.cost'), ...money },
        { label: t('orders.cols.profit'), ...money },
        { label: t('orders.cols.margin'), ...percent },
        { label: t('orders.cols.payment') },
        { label: t('orders.cols.status') },
      ],
      orders.map((o) => [
        `#${o.number}`,
        formatDate(o.created_at),
        o.client?.name ?? null,
        o.client?.phone ?? null,
        o.items.map((i) => `${i.product_name} × ${i.qty}`).join(', ') || null,
        o.delivery_address ?? ([o.client?.city, o.client?.delivery].filter(Boolean).join(', ') || null),
        o.tracking_number,
        o.saleTotal,
        o.costTotal,
        o.profit,
        o.margin,
        o.payment_method,
        t(`status.order.${o.status}`),
      ]),
    )
  }

  function clientsTable(clients: ClientView[]): ExportTable {
    return table(
      t('nav.clients'),
      [
        { label: t('clients.form.name') },
        { label: t('clients.form.phone') },
        { label: t('clients.form.city') },
        { label: t('clients.form.delivery') },
        { label: t('clients.form.note') },
        { label: t('clients.form.discount'), align: 'right' },
        { label: t('clients.orders'), ...count },
        { label: t('clients.spent'), ...money },
      ],
      clients.map((c) => [c.name, c.phone, c.city, c.delivery, c.note, c.discount, c.ordersCount, c.totalSpent]),
    )
  }

  function stamp(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  /** Build the file and hand it to the browser. False — with a toast — when it fails. */
  async function download(kind: ExportFormat, source: ExportTable): Promise<boolean> {
    if (exporting.value) return false
    exporting.value = kind
    try {
      const appName = t('app.name')
      const fileName = exportFileName(appName, source.title, source.generatedAt, kind)
      const blob =
        kind === 'csv'
          ? new Blob([toCsv(source)], { type: 'text/csv;charset=utf-8' })
          : await createPdfBlob(
              source,
              {
                appName,
                generated: t('export.generated', { date: stamp(source.generatedAt) }),
                rowsCount: t('export.rows', { count: source.rows.length }),
                page: (page, pages) => t('export.page', { page, pages }),
              },
              logoSvg,
            )
      downloadBlob(blob, fileName)
      return true
    } catch {
      toast.error(t('export.failed'))
      return false
    } finally {
      exporting.value = null
    }
  }

  return { exporting, catalogTable, warehouseTable, ordersTable, clientsTable, download }
}
