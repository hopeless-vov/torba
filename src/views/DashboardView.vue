<script setup lang="ts">
import BatchStatusBadge from '@/components/BatchStatusBadge.vue'
import type { CompositionSlice } from '@/components/ui/CompositionBar.vue'
import CompositionBar from '@/components/ui/CompositionBar.vue'
import DataTable, { type Column } from '@/components/ui/DataTable.vue'
import StatCard from '@/components/ui/StatCard.vue'
import TextInput from '@/components/ui/TextInput.vue'
import type { BarPoint, BarSeries, BarTone } from '@/components/ui/TrendBars.vue'
import TrendBars from '@/components/ui/TrendBars.vue'
import { useCurrency } from '@/composables/use-currency'
import type { BurningRow, Granularity } from '@/composables/use-dashboard'
import { defaultRange, useDashboard } from '@/composables/use-dashboard'
import { useInventoryStore } from '@/stores/inventory'
import type { BatchStatus } from '@/types/models'
import { formatDate } from '@/utils/format'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t, locale } = useI18n()
const router = useRouter()
const { format } = useCurrency()
const inventory = useInventoryStore()
const { stats, burning, range, granularity, resetRange, trend, spending, stockByStatus } =
  useDashboard()

// Bind each bound separately: `range` is one object, and v-model on a field
// has to write a new one for the computed chain to notice.
const from = computed({
  get: () => range.value.from,
  set: (v: string) => (range.value = { ...range.value, from: v }),
})
const to = computed({
  get: () => range.value.to,
  set: (v: string) => (range.value = { ...range.value, to: v }),
})

const rangeIsDefault = computed(() => {
  const base = defaultRange()
  return range.value.from === base.from && range.value.to === base.to
})

const rangeIsBackwards = computed(() => !!from.value && !!to.value && from.value > to.value)

// Revenue splits into what the goods cost and what was left over, so the two
// segments stack to the bar's full height instead of competing on two scales.
const trendSeries = computed<BarSeries[]>(() => [
  { key: 'cost', label: t('dashboard.trend.cost'), tone: 'neutral' },
  { key: 'profit', label: t('dashboard.trend.profit'), tone: 'accent' },
])

// The label says what a column *is*, so it follows the bucket width: a day
// column needs the day, a year column needs only the year.
const LABEL_FORMAT: Record<Granularity, Intl.DateTimeFormatOptions> = {
  day: { day: 'numeric', month: 'short' },
  month: { month: 'short' },
  year: { year: 'numeric' },
}

const trendPoints = computed<BarPoint[]>(() => {
  const label = new Intl.DateTimeFormat(locale.value, LABEL_FORMAT[granularity.value])
  return trend.value.map((p) => ({
    key: p.key,
    label: label.format(new Date(p.year, p.month, p.day)),
    values: { cost: p.cost, profit: p.profit },
    total: p.revenue,
  }))
})

// Where the period's money went. Goods stay neutral — the same colour the
// trend chart gives cost — so the two read as the same quantity, with the
// company's own outlay picked out beside it.
const spendingSlices = computed<CompositionSlice[]>(() => [
  { key: 'goods', label: t('dashboard.spending.goods'), value: spending.value.goods, tone: 'neutral' },
  {
    key: 'packaging',
    label: t('dashboard.spending.packaging'),
    value: spending.value.packaging,
    tone: 'violet',
  },
  { key: 'delivery', label: t('dashboard.spending.delivery'), value: spending.value.delivery, tone: 'info' },
])

// The same tones the batch badges use, so a colour means the same thing on
// the dashboard as it does in the warehouse table.
const STATUS_TONE: Record<BatchStatus, BarTone> = {
  expired: 'neutral',
  critical: 'danger',
  ending: 'warn',
  almost: 'info',
  ok: 'accent',
}

const stockSlices = computed<CompositionSlice[]>(() =>
  stockByStatus.value.map((s) => ({
    key: s.status,
    label: t(`status.batch.${s.status}`),
    value: s.units,
    tone: STATUS_TONE[s.status],
  })),
)

function units(value: number) {
  return `${value} ${t('common.pcs')}`
}

const columns = computed<Column[]>(() => [
  { key: 'name', label: t('dashboard.cols.product'), card: 'title' },
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
        :hint="
          stats.unpriced > 0
            ? t('dashboard.kpi.stockValueUnpriced', { count: stats.unpriced })
            : t('dashboard.kpi.stockValueHint')
        "
      />
      <StatCard
        :label="t('dashboard.kpi.profit')"
        :value="format(stats.profit)"
        tone="accent"
        :hint="t('dashboard.kpi.profitHint', { count: stats.ordersCount })"
      />
    </div>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
      <section class="flex flex-col gap-4 rounded-xl border border-line bg-panel p-5">
        <div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div class="flex items-baseline gap-2">
            <h2 class="text-sm font-semibold text-fg">
              {{ t('dashboard.trend.title') }}
            </h2>
            <span class="text-xs text-faint">
              {{ t(`dashboard.trend.by.${granularity}`) }}
            </span>
          </div>

          <div class="flex flex-wrap items-end gap-1.5">
            <div class="w-36">
              <TextInput
                v-model="from"
                type="date"
                :label="t('orders.dateFrom')"
              />
            </div>
            <div class="w-36">
              <TextInput
                v-model="to"
                type="date"
                :label="t('orders.dateTo')"
              />
            </div>
            <button
              v-if="!rangeIsDefault"
              type="button"
              class="flex h-9 shrink-0 cursor-pointer items-center rounded-lg border border-line px-2.5 text-xs text-muted transition-colors hover:border-line-hover hover:text-fg"
              @click="resetRange"
            >
              {{ t('dashboard.trend.reset') }}
            </button>
          </div>
        </div>

        <p
          v-if="rangeIsBackwards"
          class="py-10 text-center text-sm text-warn"
        >
          {{ t('dashboard.trend.backwards') }}
        </p>
        <TrendBars
          v-else
          :points="trendPoints"
          :series="trendSeries"
          :format-value="format"
          :empty-text="t('dashboard.trend.empty')"
        />
      </section>

      <section class="flex flex-col gap-4 rounded-xl border border-line bg-panel p-5">
        <div class="flex items-baseline gap-2">
          <h2 class="text-sm font-semibold text-fg">
            {{ t('dashboard.stock.title') }}
          </h2>
          <span class="text-xs text-faint">{{ t('dashboard.stock.subtitle') }}</span>
        </div>
        <CompositionBar
          :slices="stockSlices"
          :format-value="units"
          :empty-text="t('dashboard.stock.empty')"
        />
      </section>
    </div>

    <!-- The cost half of the chart above, opened up: same period, same
         currency, but split by where the money actually went. -->
    <section class="flex flex-col gap-4 rounded-xl border border-line bg-panel p-5">
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div class="flex items-baseline gap-2">
          <h2 class="text-sm font-semibold text-fg">
            {{ t('dashboard.spending.title') }}
          </h2>
          <span class="text-xs text-faint">{{ t('dashboard.spending.subtitle') }}</span>
        </div>
        <div class="flex items-baseline gap-2">
          <span class="text-xs text-faint">{{ t('dashboard.spending.total') }}</span>
          <span class="font-mono text-sm font-semibold text-fg tabular-nums">
            {{ format(spending.total) }}
          </span>
        </div>
      </div>
      <CompositionBar
        :slices="spendingSlices"
        :format-value="format"
        :empty-text="t('dashboard.spending.empty')"
      />
    </section>

    <div class="rounded-xl border border-line bg-panel">
      <div class="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
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
        :page-size="8"
        :prev-label="t('common.prevPage')"
        :next-label="t('common.nextPage')"
        max-height="26rem"
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
