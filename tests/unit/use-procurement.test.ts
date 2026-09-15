import type { BackorderRow, OrderRow } from '@/api/orders'
import { useProcurement } from '@/composables/use-procurement'
import uk from '@/locales/uk.json'
import { useAuthStore } from '@/stores/auth'
import { useOrdersStore } from '@/stores/orders'
import type { Company, OrderItem, ProcurementStatus } from '@/types/database'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Goods to order: the lines an order shipped short of. The api is mocked.
const api = vi.hoisted(() => ({
  backorders: vi.fn(),
  setProcurementStatus: vi.fn(),
}))
vi.mock('@/api/orders', () => ({ ordersApi: api }))

function line(id: string, status: ProcurementStatus): BackorderRow {
  return {
    id,
    order_id: 'o1',
    product_name: `Товар ${id}`,
    qty: 3,
    backorder_qty: 1,
    procurement_status: status,
    order: { id: 'o1', number: 1, created_at: '', status: 'new', client: null },
  } as BackorderRow
}

function harness() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const i18n = createI18n({ legacy: false, locale: 'uk', fallbackLocale: 'uk', messages: { uk } })
  let use!: ReturnType<typeof useProcurement>
  mount(
    defineComponent({
      setup() {
        const auth = useAuthStore()
        auth.memberships = [
          { company_id: 'c', user_id: 'u', role: 'owner', created_at: '', company: { id: 'c' } as Company },
        ]
        auth.activeCompanyId = 'c'
        use = useProcurement()
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

describe('useProcurement', () => {
  it('puts what still needs doing first and counts it', async () => {
    api.backorders.mockResolvedValue([line('a', 'delivered'), line('b', 'ordered'), line('c', 'to_order')])
    const use = harness()
    await use.load()
    expect(api.backorders).toHaveBeenCalledWith('c')
    expect(use.rows.value.map((r) => r.id)).toEqual(['c', 'b', 'a'])
    expect(use.pending.value).toBe(2)
  })

  it('says the list could not be read', async () => {
    api.backorders.mockRejectedValue(new Error('boom'))
    const use = harness()
    await use.load()
    expect(use.error.value).toBe(true)
    expect(use.rows.value).toEqual([])
  })

  it('moves a line along here and in the loaded order', async () => {
    api.backorders.mockResolvedValue([line('a', 'to_order')])
    api.setProcurementStatus.mockResolvedValue({ id: 'a', procurement_status: 'ordered' })
    const use = harness()
    useOrdersStore().orders = [{ id: 'o1', items: [{ id: 'a', procurement_status: 'to_order' } as OrderItem] } as OrderRow]
    await use.load()

    expect(await use.setStatus('a', 'ordered')).toBe(true)
    expect(api.setProcurementStatus).toHaveBeenCalledWith('a', 'ordered')
    expect(use.rows.value[0]!.procurement_status).toBe('ordered')
    expect(useOrdersStore().orders[0]!.items[0]!.procurement_status).toBe('ordered')
  })

  it('keeps the status when saving fails', async () => {
    api.backorders.mockResolvedValue([line('a', 'to_order')])
    api.setProcurementStatus.mockRejectedValue(new Error('boom'))
    const use = harness()
    await use.load()
    expect(await use.setStatus('a', 'delivered')).toBe(false)
    expect(use.rows.value[0]!.procurement_status).toBe('to_order')
  })
})
