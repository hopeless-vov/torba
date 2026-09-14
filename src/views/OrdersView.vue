<script setup lang="ts">
import BulkActionBar from '@/components/BulkActionBar.vue'
import ExportMenu from '@/components/ExportMenu.vue'
import ListFallback from '@/components/ListFallback.vue'
import OrderDetailsModal from '@/components/OrderDetailsModal.vue'
import OrderEditModal from '@/components/OrderEditModal.vue'
import OrderStatusBadge from '@/components/OrderStatusBadge.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Combobox from '@/components/ui/Combobox.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable, { type Column } from '@/components/ui/DataTable.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FilterSheet from '@/components/ui/FilterSheet.vue'
import Icon from '@/components/ui/Icon.vue'
import StatCard from '@/components/ui/StatCard.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useCurrency } from '@/composables/use-currency'
import { type ExportFormat, useExport } from '@/composables/use-export'
import { useOrders } from '@/composables/use-orders'
import { usePermissions } from '@/composables/use-permissions'
import { useSelection } from '@/composables/use-selection'
import { useClientsStore } from '@/stores/clients'
import { useOrdersStore } from '@/stores/orders'
import { useReferenceStore } from '@/stores/reference'
import { useUiStore } from '@/stores/ui'
import type { Order, OrderPatch, OrderStatus } from '@/types/database'
import type { OrderView } from '@/types/models'
import { formatDate, formatPercent } from '@/utils/format'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const { format } = useCurrency()
const reference = useReferenceStore()
const clients = useClientsStore()
const ordersStore = useOrdersStore()
const ui = useUiStore()
const { canTrade } = usePermissions()
const {
  filtered,
  total,
  clearFilters,
  reload,
  loadAll,
  kpis,
  statusFilter,
  paymentFilter,
  clientFilter,
  fromDate,
  toDate,
  setStatus,
  updateOrder,
  removeOrders,
} = useOrders()

const hasDateRange = computed(() => !!fromDate.value || !!toDate.value)
function clearDateRange() {
  fromDate.value = ''
  toDate.value = ''
}

// Badge on the mobile filter trigger — the status tabs stay outside the sheet,
// so they are not counted here.
const activeFilters = computed(
  () =>
    Number(paymentFilter.value !== 'all') + Number(clientFilter.value !== 'all') + Number(hasDateRange.value),
)

const editing = ref<Order | null>(null)
const editOpen = ref(false)
const saving = ref(false)

const viewing = ref<OrderView | null>(null)
const detailsOpen = ref(false)

const { selected, count: selectedCount, hasSelection, clear: clearSelection } = useSelection(filtered)
// Which orders have their line items unfolded under the row. The list shows a
// one-line summary; expanding is the cheap way to see everything ordered
// without leaving for the details modal.
const expanded = ref<string[]>([])
const pendingDelete = ref<string[]>([])
const confirmOpen = ref(false)
const deleting = ref(false)

const search = computed({
  get: () => ui.search,
  set: (v: string) => ui.setSearch(v),
})

function openDetails(order: OrderView) {
  viewing.value = order
  detailsOpen.value = true
}

function openEdit(order: Order) {
  editing.value = order
  detailsOpen.value = false
  editOpen.value = true
}

async function onSubmit(patch: OrderPatch) {
  if (!editing.value) return
  saving.value = true
  try {
    await updateOrder(editing.value.id, patch)
    editOpen.value = false
  } finally {
    saving.value = false
  }
}

function askDelete(ids: string[]) {
  pendingDelete.value = ids
  detailsOpen.value = false
  confirmOpen.value = true
}

async function confirmDelete() {
  deleting.value = true
  try {
    await removeOrders(pendingDelete.value)
    clearSelection()
    confirmOpen.value = false
  } finally {
    deleting.value = false
    pendingDelete.value = []
  }
}

const statusTabs = computed(() => [
  { value: 'all', label: t('common.all') },
  { value: 'new', label: t('status.order.new') },
  { value: 'sent', label: t('status.order.sent') },
  { value: 'done', label: t('status.order.done') },
])

const paymentOptions = computed(() => [
  { value: 'all', label: t('orders.anyPayment') },
  ...reference.paymentMethods.map((p) => ({ value: p.name, label: p.name })),
])
const clientOptions = computed(() => [
  { value: 'all', label: t('orders.allClients') },
  ...clients.clients.map((c) => ({ value: c.id, label: c.name })),
])

// Export exactly what the list shows, filters included.
const { exporting, ordersTable, download } = useExport()
function onExport(format: ExportFormat) {
  void download(format, ordersTable(filtered.value))
}

const columns = computed<Column[]>(() => [
  { key: 'number', label: t('orders.cols.number'), mono: true, card: 'title' },
  { key: 'client', label: t('orders.cols.client') },
  { key: 'products', label: t('orders.cols.products') },
  { key: 'address', label: t('orders.cols.address') },
  { key: 'tracking', label: t('orders.cols.tracking'), mono: true },
  { key: 'sale', label: t('orders.cols.sale'), align: 'right', mono: true },
  { key: 'cost', label: t('orders.cols.cost'), align: 'right', mono: true },
  { key: 'profit', label: t('orders.cols.profit'), align: 'right', mono: true },
  { key: 'margin', label: t('orders.cols.margin'), align: 'right', mono: true },
  { key: 'payment', label: t('orders.cols.payment') },
  { key: 'status', label: t('orders.cols.status') },
  { key: 'actions', label: '', width: '3rem', align: 'right' },
])

// Every status is reachable straight from the row, "Виконано" included.
const statusMenu = computed(() => [
  { value: 'new', label: t('status.order.new'), icon: 'fa-solid fa-inbox' },
  { value: 'sent', label: t('status.order.sent'), icon: 'fa-solid fa-truck' },
  { value: 'done', label: t('status.order.done'), icon: 'fa-solid fa-flag-checkered' },
])

const rowMenu = computed(() => [
  { value: 'details', label: t('orders.menu.details'), icon: 'fa-solid fa-receipt' },
  { value: 'edit', label: t('common.edit'), icon: 'fa-solid fa-pen' },
  { value: 'delete', label: t('common.delete'), icon: 'fa-solid fa-trash', danger: true },
])

function onMenu(order: OrderView, action: string) {
  if (action === 'details') openDetails(order)
  else if (action === 'edit') openEdit(order)
  else if (action === 'delete') askDelete([order.id])
}

/** Where the parcel goes: the order's own address, else the client's. */
function destination(order: OrderView) {
  return (
    order.delivery_address ?? [order.client?.city, order.client?.delivery].filter(Boolean).join(', ')
  )
}
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        :label="t('orders.kpi.revenue')"
        :value="format(kpis.revenue)"
        :hint="t('orders.kpi.revenueHint')"
      />
      <StatCard
        :label="t('orders.kpi.cost')"
        :value="format(kpis.cost)"
        :hint="t('orders.kpi.costHint')"
      />
      <StatCard
        :label="t('orders.kpi.profit')"
        :value="format(kpis.profit)"
        tone="accent"
        :hint="t('orders.kpi.profitHint')"
      />
      <StatCard
        :label="t('orders.kpi.margin')"
        :value="formatPercent(kpis.margin)"
        tone="accent"
        :hint="t('orders.kpi.marginHint')"
      />
    </div>

    <Tabs
      v-model="statusFilter"
      :tabs="statusTabs"
      size="sm"
    />

    <div class="flex flex-wrap items-end gap-3">
      <div class="w-full md:w-72">
        <TextInput
          v-model="search"
          type="search"
          icon-left="fa-solid fa-magnifying-glass"
          :placeholder="t('orders.searchPlaceholder')"
        />
      </div>

      <FilterSheet
        :title="t('common.filters')"
        :label="t('common.filters')"
        :done-label="t('common.filtersApply')"
        :count="activeFilters"
      >
        <Combobox
          v-model="paymentFilter"
          :label="t('orders.cols.payment')"
          :options="paymentOptions"
          :search-placeholder="t('common.search')"
          :empty-text="t('common.noMatches')"
          class="md:w-44"
        />
        <Combobox
          v-model="clientFilter"
          :label="t('orders.cols.client')"
          :options="clientOptions"
          :search-placeholder="t('clients.searchPlaceholder')"
          :empty-text="t('common.noMatches')"
          class="md:w-44"
        />
        <div class="flex flex-wrap items-end gap-1.5">
          <div class="min-w-0 flex-1 md:w-40 md:flex-none">
            <TextInput
              v-model="fromDate"
              type="date"
              :label="t('orders.dateFrom')"
            />
          </div>
          <span class="hidden h-9 items-center md:flex">
            <Icon
              icon="fa-solid fa-minus"
              size="xs"
              class="text-faint"
            />
          </span>
          <div class="min-w-0 flex-1 md:w-40 md:flex-none">
            <TextInput
              v-model="toDate"
              type="date"
              :label="t('orders.dateTo')"
            />
          </div>
          <button
            v-if="hasDateRange"
            type="button"
            class="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line text-faint transition-colors hover:border-line-hover hover:text-fg"
            :title="t('orders.clearDates')"
            @click="clearDateRange"
          >
            <Icon
              icon="fa-solid fa-xmark"
              size="sm"
            />
          </button>
        </div>
      </FilterSheet>

      <div class="ml-auto flex items-center gap-3">
        <span class="text-xs text-faint">{{ t('orders.count', { count: filtered.length }) }}</span>
        <ExportMenu
          :loading="exporting !== null"
          :disabled="filtered.length === 0"
          @select="onExport"
        />
      </div>
    </div>

    <BulkActionBar
      :count="selectedCount"
      :visible="hasSelection"
      :delete-label="t('common.deleteSelected')"
      :clear-label="t('common.clearSelection')"
      @delete="askDelete([...selected])"
      @clear="clearSelection"
    />

    <div class="rounded-xl border border-line bg-panel">
      <DataTable
        v-model:selected="selected"
        v-model:expanded="expanded"
        :columns="columns"
        :rows="filtered"
        row-key="id"
        :selectable="canTrade"
        expandable
        clickable
        :loading="ordersStore.loading"
        :page-size="20"
        :prev-label="t('common.prevPage')"
        :next-label="t('common.nextPage')"
        max-height="calc(100dvh - 26rem)"
        @row-click="openDetails($event as OrderView)"
      >
        <template #cell-number="{ row }">
          <div class="flex flex-col">
            <span class="font-medium text-fg">{{ `#${(row as OrderView).number}` }}</span>
            <span class="text-xs text-faint">{{ formatDate((row as OrderView).created_at) }}</span>
          </div>
        </template>
        <template #cell-client="{ row }">
          <div class="flex flex-col">
            <span class="font-medium text-fg">{{ (row as OrderView).client?.name ?? t('common.emptyValue') }}</span>
            <span
              v-if="(row as OrderView).client?.phone"
              class="font-mono text-xs text-faint"
            >{{ (row as OrderView).client?.phone }}</span>
          </div>
        </template>
        <template #cell-products="{ row }">
          <span
            v-if="(row as OrderView).items.length"
            class="flex min-w-0 items-center gap-1.5"
          >
            <span class="max-w-40 truncate text-sm text-muted">
              {{ (row as OrderView).items[0].product_name }}
            </span>
            <span
              v-if="(row as OrderView).items.length > 1"
              class="shrink-0 rounded-md bg-chip px-1.5 py-0.5 font-mono text-xs text-faint tabular-nums"
            >
              {{ t('orders.moreItems', { n: (row as OrderView).items.length - 1 }) }}
            </span>
          </span>
          <span
            v-else
            class="text-faint"
          >{{ t('common.emptyValue') }}</span>
        </template>
        <template #cell-address="{ row }">
          <span
            v-if="destination(row as OrderView)"
            class="flex max-w-56 items-start gap-1.5 text-sm text-muted"
          >
            <Icon
              icon="fa-solid fa-location-dot"
              size="xs"
              class="mt-1 shrink-0 text-faint"
            />
            <span class="truncate">{{ destination(row as OrderView) }}</span>
          </span>
          <span
            v-else
            class="text-faint"
          >{{ t('common.emptyValue') }}</span>
        </template>
        <template #cell-tracking="{ row }">
          <span
            v-if="(row as OrderView).tracking_number"
            class="text-muted"
          >{{ (row as OrderView).tracking_number }}</span>
          <span
            v-else
            class="text-faint"
          >{{ t('common.emptyValue') }}</span>
        </template>
        <template #cell-sale="{ row }">
          {{ format((row as OrderView).saleTotal) }}
        </template>
        <template #cell-cost="{ row }">
          <span class="text-muted">{{ format((row as OrderView).costTotal) }}</span>
        </template>
        <template #cell-profit="{ row }">
          <span class="text-accent">{{ format((row as OrderView).profit) }}</span>
        </template>
        <template #cell-margin="{ row }">
          {{ formatPercent((row as OrderView).margin) }}
        </template>
        <template #cell-payment="{ row }">
          <Badge
            v-if="(row as OrderView).payment_method"
            tone="info"
          >
            {{ (row as OrderView).payment_method }}
          </Badge>
          <span
            v-else
            class="text-faint"
          >{{ t('common.emptyValue') }}</span>
        </template>
        <template #cell-status="{ row }">
          <!-- A viewer cannot move an order along; show the badge as plain
               text with no menu to open. -->
          <span
            class="inline-flex"
            @click.stop
          >
            <DropdownMenu
              v-if="canTrade"
              :items="statusMenu"
              @select="setStatus((row as OrderView).id, $event as OrderStatus)"
            >
              <button
                type="button"
                class="cursor-pointer"
                :title="t('orders.changeStatus')"
              >
                <OrderStatusBadge :status="(row as OrderView).status" />
              </button>
            </DropdownMenu>
            <OrderStatusBadge
              v-else
              :status="(row as OrderView).status"
            />
          </span>
        </template>
        <template #cell-actions="{ row }">
          <span
            class="inline-flex"
            @click.stop
          >
            <DropdownMenu
              v-if="canTrade"
              :items="rowMenu"
              @select="onMenu(row as OrderView, $event)"
            />
          </span>
        </template>
        <template #expanded="{ row }">
          <ul class="flex flex-col divide-y divide-line-soft rounded-lg border border-line-soft bg-panel">
            <li
              v-for="item in (row as OrderView).items"
              :key="item.id"
              class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
            >
              <span class="min-w-0 flex-1 text-sm text-fg">{{ item.product_name }}</span>
              <span
                v-if="item.sku"
                class="shrink-0 font-mono text-xs text-faint"
              >{{ item.sku }}</span>
              <span class="shrink-0 font-mono text-xs text-muted tabular-nums">
                {{ `${item.qty} × ${format(item.unitNet)}` }}
              </span>
              <span class="shrink-0 font-mono text-sm text-fg tabular-nums">
                {{ format(item.lineSale) }}
              </span>
            </li>
            <li
              v-if="!(row as OrderView).items.length"
              class="px-3 py-3 text-center text-sm text-faint"
            >
              {{ t('orders.noItems') }}
            </li>
          </ul>
        </template>

        <template #empty>
          <ListFallback
            v-if="ordersStore.error || total > 0"
            :state="ordersStore.error ? 'error' : 'noMatches'"
            @retry="reload"
            @clear="clearFilters"
          />
          <EmptyState
            v-else
            icon="fa-solid fa-arrow-right-arrow-left"
            :title="t('orders.empty')"
          >
            <Button
              v-if="canTrade"
              variant="primary"
              icon="fa-solid fa-basket-shopping"
              @click="router.push({ name: 'cart' })"
            >
              {{ t('orders.openCart') }}
            </Button>
          </EmptyState>
        </template>
      </DataTable>

      <!-- The list opens on a recent window rather than every order ever
           placed. Saying so is the difference between a fast screen and a
           screen that has quietly lost the older half of the history. -->
      <p
        v-if="ordersStore.loadedFrom"
        class="flex flex-wrap items-center justify-center gap-2 border-t border-line-soft px-4 py-3 text-xs text-faint"
      >
        {{ t('orders.loadedFrom', { date: formatDate(ordersStore.loadedFrom) }) }}
        <button
          type="button"
          class="cursor-pointer text-accent transition-colors hover:underline"
          @click="loadAll"
        >
          {{ t('orders.loadAll') }}
        </button>
      </p>
    </div>

    <OrderDetailsModal
      v-model:open="detailsOpen"
      :order="viewing"
      :actions="canTrade"
      @edit="openEdit"
      @delete="askDelete([$event.id])"
    />

    <OrderEditModal
      v-model:open="editOpen"
      :order="editing"
      :saving="saving"
      @submit="onSubmit"
    />

    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="t('orders.deleteTitle')"
      :message="t('orders.deleteMessage', { count: pendingDelete.length })"
      :confirm-label="t('common.delete')"
      :cancel-label="t('common.cancel')"
      :loading="deleting"
      @confirm="confirmDelete"
    />
  </div>
</template>
