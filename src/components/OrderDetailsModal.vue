<script setup lang="ts">
import OrderStatusBadge from '@/components/OrderStatusBadge.vue'
import ProductInfoModal from '@/components/ProductInfoModal.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import Modal from '@/components/ui/Modal.vue'
import { useCurrency } from '@/composables/use-currency'
import { useInventoryStore } from '@/stores/inventory'
import type { OrderItemView, OrderView } from '@/types/models'
import { formatDate, formatPercent } from '@/utils/format'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

// Everything about one order on a single screen: who and where it went,
// which batch each line was taken from, and the full economics.
// `actions` off makes it read-only — that is how the client card uses it.
const props = withDefaults(
  defineProps<{
    order?: OrderView | null
    actions?: boolean
  }>(),
  {
    order: null,
    actions: true,
  },
)

const emit = defineEmits<{ edit: [order: OrderView]; delete: [order: OrderView] }>()

const { t } = useI18n()
const { formatFrom } = useCurrency()
const inventory = useInventoryStore()

// Orders are snapshots in the currency they were sold in; convert them into
// the active display currency so the whole app reads in one currency.
const fmt = (amount: number) => formatFrom(props.order?.currency ?? 'UAH', amount)
const open = defineModel<boolean>('open', { default: false })

// Clicking a line opens the product behind it — its brand, prices and stock.
const productOpen = ref(false)
const activeItem = ref<OrderItemView | null>(null)
function openProduct(item: OrderItemView) {
  activeItem.value = item
  productOpen.value = true
}

const facts = computed(() => {
  const order = props.order
  if (!order) return []
  return [
    { icon: 'fa-solid fa-circle-user', label: t('orders.details.client'), value: order.client?.name },
    { icon: 'fa-solid fa-phone', label: t('orders.details.phone'), value: order.client?.phone, mono: true },
    {
      icon: 'fa-solid fa-location-dot',
      label: t('orders.details.address'),
      value: order.delivery_address,
    },
    {
      icon: 'fa-solid fa-truck',
      label: t('orders.edit.tracking'),
      value: order.tracking_number,
      mono: true,
    },
    { icon: 'fa-solid fa-credit-card', label: t('orders.edit.payment'), value: order.payment_method },
    { icon: 'fa-solid fa-receipt', label: t('orders.details.note'), value: order.note },
  ].filter((f) => !!f.value)
})

// Lines carry a snapshot of the name/sku, but the expiry lives on the
// batch — worth surfacing, since that is what the customer receives.
function expiryOf(batchId: string | null) {
  if (!batchId) return null
  return inventory.batches.find((b) => b.id === batchId)?.expiry_date ?? null
}

const money = computed(() => {
  const order = props.order
  if (!order) return []
  return [
    { label: t('orders.details.goods'), value: fmt(order.saleTotal) },
    { label: t('cart.goodsCost'), value: `− ${fmt(order.goodsCost)}`, muted: true },
    { label: t('orders.edit.delivery'), value: `− ${fmt(order.delivery_cost)}`, muted: true },
    { label: t('orders.edit.packaging'), value: `− ${fmt(order.packaging_cost)}`, muted: true },
  ]
})
</script>

<template>
  <Modal
    v-model:open="open"
    size="lg"
    :title="t('orders.edit.title', { number: order?.number ?? '' })"
    :subtitle="order ? formatDate(order.created_at) : undefined"
  >
    <div
      v-if="order"
      class="flex flex-col gap-5"
    >
      <div class="flex flex-wrap items-center gap-2">
        <OrderStatusBadge :status="order.status" />
        <Badge
          v-if="order.payment_method"
          tone="info"
        >
          {{ order.payment_method }}
        </Badge>
        <Badge tone="neutral">
          {{ order.currency }}
        </Badge>
      </div>

      <dl
        v-if="facts.length"
        class="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2"
      >
        <div
          v-for="fact in facts"
          :key="fact.label"
          class="flex items-start gap-2.5"
        >
          <Icon
            :icon="fact.icon"
            size="xs"
            class="mt-1 shrink-0 text-faint"
          />
          <div class="min-w-0">
            <dt class="text-xs text-faint">
              {{ fact.label }}
            </dt>
            <dd
              class="text-sm break-words text-fg"
              :class="fact.mono && 'font-mono'"
            >
              {{ fact.value }}
            </dd>
          </div>
        </div>
      </dl>

      <!-- Lines -->
      <div class="overflow-hidden rounded-lg border border-line-soft">
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b border-line-soft bg-bg-2/60">
              <th class="px-3 py-2 text-left text-xs font-medium tracking-wide text-faint uppercase">
                {{ t('warehouse.cols.product') }}
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium tracking-wide text-faint uppercase">
                {{ t('warehouse.cols.expiry') }}
              </th>
              <th class="px-3 py-2 text-right text-xs font-medium tracking-wide text-faint uppercase">
                {{ t('cart.qty') }}
              </th>
              <th class="px-3 py-2 text-right text-xs font-medium tracking-wide text-faint uppercase">
                {{ t('orders.details.unitPrice') }}
              </th>
              <th class="px-3 py-2 text-right text-xs font-medium tracking-wide text-faint uppercase">
                {{ t('orders.details.lineTotal') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in order.items"
              :key="item.id"
              class="border-b border-line-soft last:border-0"
            >
              <td class="px-3 py-2.5">
                <button
                  type="button"
                  class="group flex flex-col items-start gap-0.5 text-left"
                  :title="t('orders.details.viewProduct')"
                  @click="openProduct(item)"
                >
                  <span class="flex items-center gap-1.5 text-sm text-fg transition-colors group-hover:text-accent">
                    {{ item.product_name }}
                    <Icon
                      icon="fa-solid fa-circle-info"
                      size="xs"
                      class="text-faint transition-colors group-hover:text-accent"
                    />
                  </span>
                  <span
                    v-if="item.sku"
                    class="font-mono text-xs text-faint"
                  >
                    {{ item.sku }}
                  </span>
                </button>
              </td>
              <td class="px-3 py-2.5 font-mono text-sm text-muted tabular-nums">
                {{ expiryOf(item.batch_id) ? formatDate(expiryOf(item.batch_id)) : t('common.emptyValue') }}
              </td>
              <td class="px-3 py-2.5 text-right font-mono text-sm text-fg tabular-nums">
                {{ item.qty }}
              </td>
              <td class="px-3 py-2.5 text-right font-mono text-sm text-muted tabular-nums">
                {{ fmt(item.unit_price) }}
              </td>
              <td class="px-3 py-2.5 text-right font-mono text-sm text-fg tabular-nums">
                {{ fmt(item.lineSale) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Economics -->
      <dl class="flex flex-col gap-1.5 rounded-lg border border-line-soft bg-surface p-3 text-sm">
        <div
          v-for="line in money"
          :key="line.label"
          class="flex justify-between"
        >
          <dt class="text-muted">
            {{ line.label }}
          </dt>
          <dd
            class="font-mono tabular-nums"
            :class="line.muted ? 'text-muted' : 'text-fg'"
          >
            {{ line.value }}
          </dd>
        </div>
        <div class="flex justify-between border-t border-line-soft pt-1.5">
          <dt class="text-fg">
            {{ t('orders.cols.profit') }}
          </dt>
          <dd class="font-mono font-semibold text-accent tabular-nums">
            {{ `${fmt(order.profit)} · ${formatPercent(order.margin)}` }}
          </dd>
        </div>
      </dl>
    </div>

    <template #footer>
      <Button
        v-if="order && actions"
        variant="danger"
        icon="fa-solid fa-trash"
        @click="emit('delete', order)"
      >
        {{ t('common.delete') }}
      </Button>
      <Button
        variant="ghost"
        @click="open = false"
      >
        {{ t('common.close') }}
      </Button>
      <Button
        v-if="order && actions"
        variant="primary"
        icon="fa-solid fa-pen"
        @click="emit('edit', order)"
      >
        {{ t('common.edit') }}
      </Button>
    </template>
  </Modal>

  <ProductInfoModal
    v-model:open="productOpen"
    :product-id="activeItem?.product_id"
    :fallback-name="activeItem?.product_name"
    :fallback-sku="activeItem?.sku"
  />
</template>
