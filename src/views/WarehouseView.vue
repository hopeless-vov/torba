<script setup lang="ts">
import BatchModal from '@/components/BatchModal.vue'
import BatchStatusBadge from '@/components/BatchStatusBadge.vue'
import BulkActionBar from '@/components/BulkActionBar.vue'
import Button from '@/components/ui/Button.vue'
import Combobox from '@/components/ui/Combobox.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable, { type Column } from '@/components/ui/DataTable.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FilterSheet from '@/components/ui/FilterSheet.vue'
import Icon from '@/components/ui/Icon.vue'
import Select from '@/components/ui/Select.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useCart } from '@/composables/use-cart'
import { useSelection } from '@/composables/use-selection'
import { useWarehouse, type WarehouseGroup, type WarehouseRow } from '@/composables/use-warehouse'
import { useInventoryStore } from '@/stores/inventory'
import { useReferenceStore } from '@/stores/reference'
import { useUiStore } from '@/stores/ui'
import type { Batch, NewBatch } from '@/types/database'
import { formatDate } from '@/utils/format'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const reference = useReferenceStore()
const inventory = useInventoryStore()
const ui = useUiStore()
const { addFromBatch } = useCart()
const {
  filtered,
  grouped,
  statusFilter,
  brandFilter,
  createBatch,
  updateBatch,
  removeBatch,
  removeBatches,
} = useWarehouse()

const modalOpen = ref(false)
const editing = ref<Batch | null>(null)
const saving = ref(false)
const view = ref<'batches' | 'products'>('batches')
const expanded = ref<string[]>([])

const { selected, count: selectedCount, hasSelection, clear: clearSelection } = useSelection(filtered)
const confirmOpen = ref(false)
const deleting = ref(false)

const search = computed({
  get: () => ui.search,
  set: (v: string) => ui.setSearch(v),
})

const viewTabs = computed(() => [
  { value: 'batches', label: t('warehouse.view.batches') },
  { value: 'products', label: t('warehouse.view.products') },
])

const statusTabs = computed(() => [
  { value: 'all', label: t('common.all') },
  { value: 'critical', label: t('status.batch.critical') },
  { value: 'ending', label: t('status.batch.ending') },
  { value: 'almost', label: t('status.batch.almost') },
  { value: 'ok', label: t('status.batch.ok') },
  { value: 'expired', label: t('status.batch.expired') },
])

const brandOptions = computed(() => [
  { value: 'all', label: t('catalog.allBrands') },
  ...reference.brands.map((b) => ({ value: b.id, label: b.name })),
])

const batchColumns = computed<Column[]>(() => [
  { key: 'name', label: t('warehouse.cols.product'), card: 'title' },
  { key: 'batch', label: t('warehouse.cols.batch'), mono: true },
  { key: 'delivery', label: t('warehouse.cols.delivery'), mono: true },
  { key: 'expiry', label: t('warehouse.cols.expiry'), mono: true },
  {
    key: 'remaining',
    label: t('warehouse.cols.remaining'),
    align: 'right',
    mono: true,
    hint: t('warehouse.hint.remaining'),
  },
  {
    key: 'received',
    label: t('warehouse.cols.received'),
    align: 'right',
    mono: true,
    hint: t('warehouse.hint.received'),
  },
  {
    key: 'sold',
    label: t('warehouse.cols.sold'),
    align: 'right',
    mono: true,
    hint: t('warehouse.hint.sold'),
  },
  { key: 'status', label: t('warehouse.cols.status') },
  { key: 'actions', label: '', width: '5.5rem', align: 'right' },
])

const groupColumns = computed<Column[]>(() => [
  { key: 'name', label: t('warehouse.cols.product'), card: 'title' },
  { key: 'batchesCount', label: t('warehouse.cols.batches'), align: 'right', mono: true },
  {
    key: 'remaining',
    label: t('warehouse.cols.totalRemaining'),
    align: 'right',
    mono: true,
    hint: t('warehouse.hint.totalRemaining'),
  },
  {
    key: 'received',
    label: t('warehouse.cols.received'),
    align: 'right',
    mono: true,
    hint: t('warehouse.hint.received'),
  },
  {
    key: 'sold',
    label: t('warehouse.cols.sold'),
    align: 'right',
    mono: true,
    hint: t('warehouse.hint.sold'),
  },
  { key: 'nearestExpiry', label: t('warehouse.cols.nearestExpiry'), mono: true },
  { key: 'status', label: t('warehouse.cols.status') },
])

const rowMenu = computed(() => [
  { value: 'edit', label: t('catalog.menu.edit'), icon: 'fa-solid fa-pen' },
  { value: 'delete', label: t('catalog.menu.delete'), icon: 'fa-solid fa-trash', danger: true },
])

function openNew() {
  editing.value = null
  modalOpen.value = true
}

function openEdit(batchId: string) {
  editing.value = inventory.batches.find((b) => b.id === batchId) ?? null
  modalOpen.value = true
}

function onMenu(row: WarehouseRow, action: string) {
  if (action === 'edit') openEdit(row.id)
  else if (action === 'delete') void removeBatch(row.id)
}

// Sell straight from a warehouse batch, like the catalog's add-to-cart —
// the line is pinned to this exact batch (and therefore its expiry date).
function addToCart(batchId: string) {
  const batch = inventory.batches.find((b) => b.id === batchId)
  if (batch) addFromBatch(batch)
}

async function onSubmit(payload: Omit<NewBatch, 'company_id'>) {
  saving.value = true
  try {
    if (editing.value) await updateBatch(editing.value.id, payload)
    else await createBatch(payload)
    modalOpen.value = false
  } finally {
    saving.value = false
  }
}

async function deleteSelected() {
  deleting.value = true
  try {
    await removeBatches([...selected.value])
    clearSelection()
    confirmOpen.value = false
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <div class="flex flex-wrap items-center gap-3">
      <Tabs
        v-model="view"
        :tabs="viewTabs"
        size="sm"
      />
      <!-- Wrapped, not given `hidden md:*` directly — Tabs' own root sets
           `inline-flex`, which wins over `hidden` on CSS source order. -->
      <span class="hidden md:inline-flex">
        <Tabs
          v-model="statusFilter"
          :tabs="statusTabs"
          size="sm"
        />
      </span>

      <div class="w-full md:w-64">
        <TextInput
          v-model="search"
          type="search"
          icon-left="fa-solid fa-magnifying-glass"
          :placeholder="t('warehouse.searchPlaceholder')"
        />
      </div>

      <FilterSheet
        :title="t('common.filters')"
        :label="t('common.filters')"
        :done-label="t('common.filtersApply')"
        :count="Number(brandFilter !== 'all') + Number(statusFilter !== 'all')"
      >
        <!-- Status is a tab strip at md+, but inside the sheet it reads better
             as a plain list of choices. -->
        <Select
          v-model="statusFilter"
          class="md:hidden"
          :label="t('warehouse.cols.status')"
          :options="statusTabs"
        />
        <Combobox
          v-model="brandFilter"
          :label="t('catalog.form.brand')"
          :options="brandOptions"
          :search-placeholder="t('common.search')"
          :empty-text="t('common.noMatches')"
          class="md:w-44"
        />
      </FilterSheet>

      <Button
        variant="primary"
        icon="fa-solid fa-plus"
        class="ml-auto"
        :title="t('warehouse.newBatch')"
        @click="openNew"
      >
        <span class="hidden sm:inline">{{ t('warehouse.newBatch') }}</span>
      </Button>
    </div>

    <BulkActionBar
      :count="selectedCount"
      :visible="hasSelection && view === 'batches'"
      :delete-label="t('common.deleteSelected')"
      :clear-label="t('common.clearSelection')"
      @delete="confirmOpen = true"
      @clear="clearSelection"
    />

    <!-- Per batch: one row per delivery -->
    <div
      v-if="view === 'batches'"
      class="rounded-xl border border-line bg-panel"
    >
      <DataTable
        v-model:selected="selected"
        :columns="batchColumns"
        :rows="filtered"
        row-key="id"
        selectable
        :loading="inventory.loading"
      >
        <template #cell-name="{ row }">
          <div
            class="flex flex-col"
            :class="(row as WarehouseRow).status === 'expired' && 'text-faint line-through'"
          >
            <span
              class="font-medium"
              :class="(row as WarehouseRow).status === 'expired' ? 'text-faint' : 'text-fg'"
            >{{ (row as WarehouseRow).name }}</span>
            <span class="font-mono text-xs text-faint">{{ (row as WarehouseRow).sku }}</span>
          </div>
        </template>
        <template #cell-delivery="{ row }">
          {{ formatDate((row as WarehouseRow).delivery) }}
        </template>
        <template #cell-expiry="{ row }">
          {{ formatDate((row as WarehouseRow).expiry) }}
        </template>
        <template #cell-remaining="{ row }">
          <span
            class="font-medium"
            :class="(row as WarehouseRow).remaining > 0 ? 'text-fg' : 'text-faint'"
          >{{ (row as WarehouseRow).remaining }}</span>
        </template>
        <template #cell-received="{ row }">
          <span class="text-muted">{{ (row as WarehouseRow).received }}</span>
        </template>
        <template #cell-sold="{ row }">
          <span class="text-muted">{{ (row as WarehouseRow).sold }}</span>
        </template>
        <template #cell-status="{ row }">
          <BatchStatusBadge
            :status="(row as WarehouseRow).status"
            :days-left="(row as WarehouseRow).daysLeft"
          />
        </template>
        <template #cell-actions="{ row }">
          <div class="flex items-center justify-end gap-1">
            <button
              type="button"
              class="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-accent-line hover:text-accent"
              :title="t('catalog.addToCart')"
              @click="addToCart((row as WarehouseRow).id)"
            >
              <Icon
                icon="fa-solid fa-plus"
                size="sm"
              />
            </button>
            <DropdownMenu
              :items="rowMenu"
              @select="onMenu(row as WarehouseRow, $event)"
            />
          </div>
        </template>
        <template #empty>
          <EmptyState
            icon="fa-solid fa-warehouse"
            :title="t('warehouse.empty')"
            :hint="t('warehouse.emptyHint')"
          >
            <Button
              variant="primary"
              icon="fa-solid fa-plus"
              @click="openNew"
            >
              {{ t('warehouse.newBatch') }}
            </Button>
          </EmptyState>
        </template>
      </DataTable>
    </div>

    <!-- Per product: total stock, expanded into its expiry dates -->
    <div
      v-else
      class="rounded-xl border border-line bg-panel"
    >
      <DataTable
        v-model:expanded="expanded"
        :columns="groupColumns"
        :rows="grouped"
        row-key="id"
        expandable
        :loading="inventory.loading"
      >
        <template #cell-name="{ row }">
          <div class="flex flex-col">
            <span class="font-medium text-fg">{{ (row as WarehouseGroup).name }}</span>
            <span class="font-mono text-xs text-faint">{{ (row as WarehouseGroup).sku }}</span>
          </div>
        </template>
        <template #cell-batchesCount="{ row }">
          <span class="text-muted">{{ (row as WarehouseGroup).batchesCount }}</span>
        </template>
        <template #cell-remaining="{ row }">
          <span
            class="font-semibold"
            :class="(row as WarehouseGroup).remaining > 0 ? 'text-fg' : 'text-faint'"
          >{{ `${(row as WarehouseGroup).remaining} ${t('common.pcs')}` }}</span>
        </template>
        <template #cell-received="{ row }">
          <span class="text-muted">{{ (row as WarehouseGroup).received }}</span>
        </template>
        <template #cell-sold="{ row }">
          <span class="text-muted">{{ (row as WarehouseGroup).sold }}</span>
        </template>
        <template #cell-nearestExpiry="{ row }">
          {{ formatDate((row as WarehouseGroup).nearestExpiry) }}
        </template>
        <template #cell-status="{ row }">
          <BatchStatusBadge
            :status="(row as WarehouseGroup).status"
            :days-left="(row as WarehouseGroup).daysLeft"
          />
        </template>

        <template #expanded="{ row }">
          <ul class="flex flex-col divide-y divide-line-soft rounded-lg border border-line-soft bg-panel">
            <li
              v-for="batch in (row as WarehouseGroup).batches"
              :key="batch.id"
              class="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2"
            >
              <Icon
                icon="fa-solid fa-calendar-days"
                size="xs"
                class="shrink-0 text-faint"
              />
              <span class="shrink-0 font-mono text-sm text-fg tabular-nums">
                {{ formatDate(batch.expiry) }}
              </span>
              <span class="shrink-0 font-mono text-xs text-faint">{{ batch.batch }}</span>
              <BatchStatusBadge
                :status="batch.status"
                :days-left="batch.daysLeft"
              />
              <span class="ml-auto shrink-0 font-mono text-sm text-fg tabular-nums">
                {{ `${batch.remaining} / ${batch.received} ${t('common.pcs')}` }}
              </span>
              <button
                type="button"
                class="flex size-7 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-accent"
                :title="t('catalog.addToCart')"
                @click="addToCart(batch.id)"
              >
                <Icon
                  icon="fa-solid fa-plus"
                  size="xs"
                />
              </button>
              <button
                type="button"
                class="flex size-7 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-fg"
                :title="t('catalog.menu.edit')"
                @click="openEdit(batch.id)"
              >
                <Icon
                  icon="fa-solid fa-pen"
                  size="xs"
                />
              </button>
              <button
                type="button"
                class="flex size-7 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-danger"
                :title="t('catalog.menu.delete')"
                @click="removeBatch(batch.id)"
              >
                <Icon
                  icon="fa-solid fa-trash"
                  size="xs"
                />
              </button>
            </li>
          </ul>
        </template>

        <template #empty>
          <EmptyState
            icon="fa-solid fa-warehouse"
            :title="t('warehouse.empty')"
            :hint="t('warehouse.emptyHint')"
          >
            <Button
              variant="primary"
              icon="fa-solid fa-plus"
              @click="openNew"
            >
              {{ t('warehouse.newBatch') }}
            </Button>
          </EmptyState>
        </template>
      </DataTable>
    </div>

    <BatchModal
      v-model:open="modalOpen"
      :batch="editing"
      :saving="saving"
      @submit="onSubmit"
    />

    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="t('warehouse.deleteTitle')"
      :message="t('warehouse.deleteMessage', { count: selectedCount })"
      :confirm-label="t('common.delete')"
      :cancel-label="t('common.cancel')"
      :loading="deleting"
      @confirm="deleteSelected"
    />
  </div>
</template>
