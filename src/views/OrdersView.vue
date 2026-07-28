<script setup lang="ts">
import OrderStatusBadge from '@/components/OrderStatusBadge.vue'
import Badge from '@/components/ui/Badge.vue'
import DataTable, { type Column } from '@/components/ui/DataTable.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Select from '@/components/ui/Select.vue'
import StatCard from '@/components/ui/StatCard.vue'
import Tabs from '@/components/ui/Tabs.vue'
import { useCurrency } from '@/composables/use-currency'
import { useOrders } from '@/composables/use-orders'
import { useClientsStore } from '@/stores/clients'
import { useReferenceStore } from '@/stores/reference'
import type { OrderStatus } from '@/types/database'
import type { OrderView } from '@/types/models'
import { formatDate, formatPercent } from '@/utils/format'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { format } = useCurrency()
const reference = useReferenceStore()
const clients = useClientsStore()
const { filtered, kpis, statusFilter, paymentFilter, clientFilter, setStatus } = useOrders()

const statusTabs = computed(() => [
  { value: 'all', label: t('common.all') },
  { value: 'new', label: t('status.order.new') },
  { value: 'paid', label: t('status.order.paid') },
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

const columns = computed<Column[]>(() => [
  { key: 'number', label: t('orders.cols.number'), mono: true },
  { key: 'client', label: t('orders.cols.client') },
  { key: 'items', label: t('orders.cols.items'), align: 'right', mono: true },
  { key: 'sale', label: t('orders.cols.sale'), align: 'right', mono: true },
  { key: 'cost', label: t('orders.cols.cost'), align: 'right', mono: true },
  { key: 'profit', label: t('orders.cols.profit'), align: 'right', mono: true },
  { key: 'margin', label: t('orders.cols.margin'), align: 'right', mono: true },
  { key: 'payment', label: t('orders.cols.payment') },
  { key: 'status', label: t('orders.cols.status') },
  { key: 'actions', label: '', width: '3rem', align: 'right' },
])

const statusMenu = computed(() => [
  { value: 'paid', label: t('status.order.paid'), icon: 'fa-solid fa-circle-check' },
  { value: 'sent', label: t('status.order.sent'), icon: 'fa-solid fa-truck' },
  { value: 'done', label: t('status.order.done'), icon: 'fa-solid fa-flag-checkered' },
])

function clientMeta(order: OrderView) {
  return [order.client?.city, order.client?.delivery].filter(Boolean).join(' · ')
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

    <div class="flex flex-wrap items-center gap-3">
      <Tabs
        v-model="statusFilter"
        :tabs="statusTabs"
        size="sm"
      />
      <Select
        v-model="paymentFilter"
        :options="paymentOptions"
        class="w-48"
      />
      <Select
        v-model="clientFilter"
        :options="clientOptions"
        class="w-44"
      />
      <span class="ml-auto text-xs text-faint">{{ t('orders.count', { count: filtered.length }) }}</span>
    </div>

    <div class="rounded-xl border border-line bg-panel">
      <DataTable
        :columns="columns"
        :rows="filtered"
        row-key="id"
      >
        <template #cell-number="{ row }">
          <div class="flex flex-col">
            <span class="font-medium text-fg">{{ `#${(row as OrderView).number}` }}</span>
            <span class="text-xs text-faint">{{ formatDate((row as OrderView).created_at) }}</span>
          </div>
        </template>
        <template #cell-client="{ row }">
          <div class="flex flex-col">
            <span class="font-medium text-fg">{{ (row as OrderView).client?.name ?? '—' }}</span>
            <span class="text-xs text-faint">{{ clientMeta(row as OrderView) }}</span>
          </div>
        </template>
        <template #cell-items="{ row }">
          {{ (row as OrderView).itemsCount }}
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
          <OrderStatusBadge :status="(row as OrderView).status" />
        </template>
        <template #cell-actions="{ row }">
          <DropdownMenu
            :items="statusMenu"
            @select="setStatus((row as OrderView).id, $event as OrderStatus)"
          />
        </template>
        <template #empty>
          <EmptyState
            icon="fa-solid fa-arrow-right-arrow-left"
            :title="t('orders.empty')"
          />
        </template>
      </DataTable>
    </div>
  </div>
</template>
