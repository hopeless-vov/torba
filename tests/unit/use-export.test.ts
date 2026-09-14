import { useExport } from '@/composables/use-export'
import type { WarehouseRow } from '@/composables/use-warehouse'
import uk from '@/locales/uk.json'
import { useAuthStore } from '@/stores/auth'
import type { Company } from '@/types/database'
import type { ClientView, OrderView, ProductView } from '@/types/models'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Exports build a table from what a screen shows and hand a file over. The
// file machinery (download, pdfmake) is mocked at the utils boundary.
const files = vi.hoisted(() => ({ downloadBlob: vi.fn() }))
const pdf = vi.hoisted(() => ({ createPdfBlob: vi.fn(async () => new Blob(['%PDF'])) }))
vi.mock('@/utils/table-export', async (original) => ({
  ...(await original<typeof import('@/utils/table-export')>()),
  downloadBlob: files.downloadBlob,
}))
vi.mock('@/utils/pdf-export', () => pdf)

function harness() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const i18n = createI18n({ legacy: false, locale: 'uk', fallbackLocale: 'uk', messages: { uk } })
  let use!: ReturnType<typeof useExport>
  mount(
    defineComponent({
      setup() {
        const auth = useAuthStore()
        const company = {
          id: 'c',
          name: 'Моя компанія',
          owner_id: 'u',
          base_currency: 'UAH',
          display_currency: 'UAH',
          created_at: '',
        } as Company
        auth.memberships = [{ company_id: 'c', user_id: 'u', role: 'owner', created_at: '', company }]
        auth.activeCompanyId = 'c'
        use = useExport()
        return () => null
      },
    }),
    { global: { plugins: [pinia, i18n] } },
  )
  return use
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useExport — tables', () => {
  it('builds the catalogue from the products shown', () => {
    const use = harness()
    const table = use.catalogTable([
      {
        sku: 'A-1',
        name: 'Крем',
        brand: { name: 'Fairy' },
        category: null,
        cost_currency: 'USD',
        cost_amount: 55,
        supplierRetail: 80,
        purchase: 2255,
        retail: 3280,
        margin: 0.31,
        inStock: 4,
      } as unknown as ProductView,
    ])
    expect(table.title).toBe(uk.nav.catalog)
    expect(table.company).toBe('Моя компанія')
    expect(table.rows[0]).toEqual(['A-1', 'Крем', 'Fairy', null, '55,00 $', '80,00 $', 2255, 3280, 0.31, 4])
    expect(table.columns[6]!.label).toBe(`${uk.catalog.cols.purchase} UAH`)
  })

  it('builds the warehouse with dates and a readable status', () => {
    const use = harness()
    const table = use.warehouseTable([
      {
        name: 'Крем',
        sku: 'A-1',
        batch: 'A-1-01',
        delivery: '2026-06-01',
        expiry: null,
        remaining: 3,
        received: 5,
        sold: 2,
        cost: 100,
        retail: 150,
        margin: 0.33,
        status: 'ok',
        daysLeft: null,
      } as unknown as WarehouseRow,
    ])
    expect(table.rows[0]).toEqual(['Крем', 'A-1', 'A-1-01', '01.06.2026', null, 3, 5, 2, 100, 150, 0.33, uk.status.batch.ok])
  })

  it('builds orders with their lines spelled out', () => {
    const use = harness()
    const table = use.ordersTable([
      {
        number: 7,
        created_at: '2026-09-01T10:00:00Z',
        client: { name: 'Олена', phone: '+380', city: 'Київ', delivery: 'НП 5' },
        items: [
          { product_name: 'Крем', qty: 2 },
          { product_name: 'Гель', qty: 1 },
        ],
        delivery_address: null,
        tracking_number: null,
        saleTotal: 500,
        costTotal: 300,
        profit: 200,
        margin: 0.4,
        payment_method: 'Готівка',
        status: 'sent',
      } as unknown as OrderView,
    ])
    expect(table.rows[0]).toEqual([
      '#7',
      '01.09.2026',
      'Олена',
      '+380',
      'Крем × 2, Гель × 1',
      'Київ, НП 5',
      null,
      500,
      300,
      200,
      0.4,
      'Готівка',
      uk.status.order.sent,
    ])
  })

  it('builds the client list', () => {
    const use = harness()
    const table = use.clientsTable([
      {
        name: 'Олена',
        phone: null,
        city: 'Київ',
        delivery: null,
        note: null,
        discount: 5,
        ordersCount: 3,
        totalSpent: 1200,
      } as unknown as ClientView,
    ])
    expect(table.rows[0]).toEqual(['Олена', null, 'Київ', null, null, 5, 3, 1200])
  })
})

describe('useExport — download', () => {
  const sample = () => ({
    title: 'Каталог',
    company: 'X',
    generatedAt: new Date(2026, 8, 14),
    columns: [{ label: 'A' }],
    rows: [['1']],
  })

  it('saves a CSV under a dated name', async () => {
    const use = harness()
    expect(await use.download('csv', sample())).toBe(true)
    expect(files.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'torba-каталог-2026-09-14.csv')
    expect(pdf.createPdfBlob).not.toHaveBeenCalled()
  })

  it('saves a PDF made with our logo', async () => {
    const use = harness()
    expect(await use.download('pdf', sample())).toBe(true)
    expect(pdf.createPdfBlob).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Каталог' }),
      expect.objectContaining({ appName: 'torba' }),
      expect.stringContaining('<svg'),
    )
    expect(files.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'torba-каталог-2026-09-14.pdf')
  })

  it('says so when the file cannot be built', async () => {
    const use = harness()
    pdf.createPdfBlob.mockRejectedValueOnce(new Error('boom'))
    expect(await use.download('pdf', sample())).toBe(false)
    expect(files.downloadBlob).not.toHaveBeenCalled()
    expect(use.exporting.value).toBeNull()
  })
})
