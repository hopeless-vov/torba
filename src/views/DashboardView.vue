<script setup lang="ts">
import BatchStatusBadge from '@/components/BatchStatusBadge.vue'
import DataTable, { type Column } from '@/components/ui/DataTable.vue'
import StatCard from '@/components/ui/StatCard.vue'
import { useCurrency } from '@/composables/use-currency'
import type { BurningRow } from '@/composables/use-dashboard'
import { useDashboard } from '@/composables/use-dashboard'
import { useInventoryStore } from '@/stores/inventory'
import { formatDate } from '@/utils/format'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const { format } = useCurrency()
const inventory = useInventoryStore()
const { stats, burning } = useDashboard()

const columns = computed<Column[]>(() => [
  { key: 'name', label: t('dashboard.cols.product') },
  { key: 'batch', label: t('dashboard.cols.batch'), mono: true },
  { key: 'remaining', label: t('dashboard.cols.remaining'), align: 'right', mono: true },
  { key: 'expiry', label: t('dashboard.cols.expiry'), align: 'left', mono: true },
  { key: 'status', label: t('dashboard.cols.status') },
])
</script>

<template>
  <div class="flex flex-col gap-5 p-6">
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        :label="t('dashboard.kpi.sku')"
        :value="String(stats.skuCount)"
        :hint="t('dashboard.kpi.skuHint', { count: stats.inStockPositions })"
      />
      <StatCard
        :label="t('dashboard.kpi.critical')"
        :value="String(stats.criticalWithin90)"
        tone="danger"
        :hint="t('dashboard.kpi.criticalHint', { ending: stats.criticalCount, expired: stats.expiredCount })"
      />
      <StatCard
        :label="t('dashboard.kpi.expiring')"
        :value="String(stats.expiringUnits)"
        tone="danger"
        :hint="t('dashboard.kpi.expiringHint', { critical: stats.criticalUnits, ending: stats.expiredUnits })"
      />
      <StatCard
        :label="t('dashboard.kpi.stockValue')"
        :value="format(stats.stockValue)"
        :hint="t('dashboard.kpi.stockValueHint')"
      />
      <StatCard
        :label="t('dashboard.kpi.profit')"
        :value="format(stats.profit)"
        tone="accent"
        :hint="t('dashboard.kpi.profitHint', { count: stats.ordersCount })"
      />
    </div>

    <div class="rounded-xl border border-line bg-panel">
      <div class="flex items-center justify-between px-5 py-4">
        <div class="flex items-baseline gap-2">
          <h2 class="text-sm font-semibold text-fg">
            {{ t('dashboard.burning.title') }}
          </h2>
          <span class="text-xs text-faint">{{ t('dashboard.burning.subtitle') }}</span>
        </div>
        <button
          type="button"
          class="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:bg-hover hover:text-fg"
          @click="router.push({ name: 'warehouse' })"
        >
          {{ t('dashboard.burning.all') }}
        </button>
      </div>

      <DataTable
        :columns="columns"
        :rows="burning"
        row-key="id"
        :loading="inventory.loading"
      >
        <template #cell-name="{ row }">
          <div class="flex flex-col">
            <span class="font-medium text-fg">{{ (row as BurningRow).name }}</span>
            <span class="font-mono text-xs text-faint">{{ (row as BurningRow).sku }}</span>
          </div>
        </template>
        <template #cell-expiry="{ row }">
          {{ formatDate((row as BurningRow).expiry) }}
        </template>
        <template #cell-status="{ row }">
          <BatchStatusBadge
            :status="(row as BurningRow).status"
            :days-left="(row as BurningRow).daysLeft"
          />
        </template>
      </DataTable>
    </div>
  </div>
</template>
