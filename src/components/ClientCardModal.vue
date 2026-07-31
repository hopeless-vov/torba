<script setup lang="ts">
import OrderStatusBadge from '@/components/OrderStatusBadge.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'
import Modal from '@/components/ui/Modal.vue'
import { useCurrency } from '@/composables/use-currency'
import { useOrdersStore } from '@/stores/orders'
import type { ClientView } from '@/types/models'
import { formatDate } from '@/utils/format'
import { computeOrderTotals } from '@/utils/orders'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ client?: ClientView | null }>()

const emit = defineEmits<{ openOrder: [orderId: string] }>()

const { t } = useI18n()
const { format } = useCurrency()
const orders = useOrdersStore()
const open = defineModel<boolean>('open', { default: false })

const meta = computed(() =>
  props.client ? [props.client.city, props.client.delivery, props.client.note].filter(Boolean).join(' · ') : '',
)

const history = computed(() => {
  if (!props.client) return []
  return orders.orders
    .filter((o) => o.client_id === props.client?.id)
    .map((o) => ({
      id: o.id,
      number: o.number,
      date: o.created_at,
      status: o.status,
      total: computeOrderTotals(o.items, o.delivery_cost, o.packaging_cost).saleTotal,
    }))
})
</script>

<template>
  <Modal
    v-model:open="open"
    :title="t('clients.cardTitle')"
  >
    <div
      v-if="client"
      class="flex flex-col gap-5"
    >
      <div class="flex items-center gap-3">
        <Avatar
          :name="client.name"
          size="md"
        />
        <div class="min-w-0 flex-1">
          <p class="text-base font-semibold text-fg">
            {{ client.name }}
          </p>
          <p
            v-if="client.phone"
            class="font-mono text-xs text-muted"
          >
            {{ client.phone }}
          </p>
        </div>
        <Badge
          v-if="client.discount > 0"
          tone="warn"
        >
          {{ t('clients.discountBadge', { pct: client.discount }) }}
        </Badge>
      </div>

      <p
        v-if="meta"
        class="text-xs leading-relaxed text-faint"
      >
        {{ meta }}
      </p>

      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-lg border border-line-soft bg-surface p-3">
          <p class="text-xs text-faint">
            {{ t('clients.orders') }}
          </p>
          <p class="font-mono text-lg text-fg tabular-nums">
            {{ client.ordersCount }}
          </p>
        </div>
        <div class="rounded-lg border border-line-soft bg-surface p-3">
          <p class="text-xs text-faint">
            {{ t('clients.spent') }}
          </p>
          <p class="font-mono text-lg font-medium text-fg tabular-nums">
            {{ format(client.totalSpent) }}
          </p>
        </div>
      </div>

      <div>
        <p class="mb-2 text-sm font-medium text-fg">
          {{ t('clients.history') }}
        </p>
        <ul
          v-if="history.length"
          class="flex flex-col divide-y divide-line-soft rounded-lg border border-line-soft"
        >
          <li
            v-for="order in history"
            :key="order.id"
            class="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-row-hover"
            :title="t('clients.openOrder')"
            @click="emit('openOrder', order.id)"
          >
            <div class="flex flex-col">
              <span class="font-mono text-sm text-fg">{{ `#${order.number}` }}</span>
              <span class="text-xs text-faint">{{ formatDate(order.date) }}</span>
            </div>
            <OrderStatusBadge :status="order.status" />
            <span class="font-mono text-sm text-fg tabular-nums">{{ format(order.total) }}</span>
            <Icon
              icon="fa-solid fa-chevron-right"
              size="xs"
              class="text-faint"
            />
          </li>
        </ul>
        <p
          v-else
          class="rounded-lg border border-line-soft py-6 text-center text-sm text-muted"
        >
          {{ t('clients.noOrders') }}
        </p>
      </div>
    </div>
  </Modal>
</template>
