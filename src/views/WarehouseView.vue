<script setup lang="ts">
import BatchModal from '@/components/BatchModal.vue'
import BatchStatusBadge from '@/components/BatchStatusBadge.vue'
import Button from '@/components/ui/Button.vue'
import DataTable, { type Column } from '@/components/ui/DataTable.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Select from '@/components/ui/Select.vue'
import Tabs from '@/components/ui/Tabs.vue'
import { useWarehouse, type WarehouseRow } from '@/composables/use-warehouse'
import { useInventoryStore } from '@/stores/inventory'
import { useReferenceStore } from '@/stores/reference'
import type { Batch, NewBatch } from '@/types/database'
import { formatDate } from '@/utils/format'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const reference = useReferenceStore()
const inventory = useInventoryStore()
const { filtered, statusFilter, brandFilter, createBatch, updateBatch, removeBatch } = useWarehouse()

const modalOpen = ref(false)
const editing = ref<Batch | null>(null)
const saving = ref(false)

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

const columns = computed<Column[]>(() => [
  { key: 'name', label: t('warehouse.cols.product') },
  { key: 'batch', label: t('warehouse.cols.batch'), mono: true },
  { key: 'delivery', label: t('warehouse.cols.delivery'), mono: true },
  { key: 'expiry', label: t('warehouse.cols.expiry'), mono: true },
  { key: 'remaining', label: t('warehouse.cols.remaining'), align: 'right', mono: true },
  { key: 'status', label: t('warehouse.cols.status') },
  { key: 'actions', label: '', width: '3rem', align: 'right' },
])

const rowMenu = [
  { value: 'edit', label: t('catalog.menu.edit'), icon: 'fa-solid fa-pen' },
  { value: 'delete', label: t('catalog.menu.delete'), icon: 'fa-solid fa-trash', danger: true },
]

function openNew() {
  editing.value = null
  modalOpen.value = true
}

function onMenu(row: WarehouseRow, action: string) {
  if (action === 'edit') {
    editing.value = inventory.batches.find((b) => b.id === row.id) ?? null
    modalOpen.value = true
  } else if (action === 'delete') {
    void removeBatch(row.id)
  }
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
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <div class="flex flex-wrap items-center gap-3">
      <Tabs
        v-model="statusFilter"
        :tabs="statusTabs"
        size="sm"
      />
      <Select
        v-model="brandFilter"
        :options="brandOptions"
        class="w-44"
      />
      <Button
        variant="primary"
        icon="fa-solid fa-plus"
        class="ml-auto"
        @click="openNew"
      >
        {{ t('warehouse.newBatch') }}
      </Button>
    </div>

    <div class="rounded-xl border border-line bg-panel">
      <DataTable
        :columns="columns"
        :rows="filtered"
        row-key="id"
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
          {{ `${(row as WarehouseRow).remaining} / ${(row as WarehouseRow).received}` }}
        </template>
        <template #cell-status="{ row }">
          <BatchStatusBadge
            :status="(row as WarehouseRow).status"
            :days-left="(row as WarehouseRow).daysLeft"
          />
        </template>
        <template #cell-actions="{ row }">
          <DropdownMenu
            :items="rowMenu"
            @select="onMenu(row as WarehouseRow, $event)"
          />
        </template>
        <template #empty>
          <EmptyState
            icon="fa-solid fa-warehouse"
            :title="t('warehouse.empty')"
            :hint="t('warehouse.emptyHint')"
          />
        </template>
      </DataTable>
    </div>

    <BatchModal
      v-model:open="modalOpen"
      :batch="editing"
      :saving="saving"
      @submit="onSubmit"
    />
  </div>
</template>
