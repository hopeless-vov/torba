<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'
import Modal from '@/components/ui/Modal.vue'
import Tag from '@/components/ui/Tag.vue'
import { useCurrency } from '@/composables/use-currency'
import { useInventoryStore } from '@/stores/inventory'
import { formatNumber, formatPercent } from '@/utils/format'
import { computeMargin } from '@/utils/pricing'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// A read-only card for one catalog product — the thing an order line is
// actually selling. Opened by clicking a line in the order details, it
// resolves the live product (brand, category, prices in the display
// currency, stock) from the inventory store by id, or falls back to the
// name snapshot the line carries when the product was since deleted.
const props = withDefaults(
  defineProps<{
    productId?: string | null
    fallbackName?: string | null
    fallbackSku?: string | null
  }>(),
  {
    productId: null,
    fallbackName: null,
    fallbackSku: null,
  },
)

const { t } = useI18n()
const { format, convert } = useCurrency()
const inventory = useInventoryStore()
const open = defineModel<boolean>('open', { default: false })

const product = computed(() =>
  props.productId ? (inventory.products.find((p) => p.id === props.productId) ?? null) : null,
)

const title = computed(() => product.value?.name ?? props.fallbackName ?? t('common.emptyValue'))
const sku = computed(() => product.value?.sku ?? props.fallbackSku ?? '')

const facts = computed(() => {
  const p = product.value
  if (!p) return []
  const rate = p.brand?.usd_rate ?? 0
  const retailUsd = p.retail_price_usd
  const stock = inventory.stockByProduct.get(p.id) ?? 0
  const rows = [
    { label: t('catalog.form.volume'), value: p.volume || t('common.emptyValue') },
    { label: t('catalog.cols.purchaseUsd'), value: `${formatNumber(p.price_usd, 2)} $`, mono: true },
    { label: t('catalog.cols.purchase'), value: format(convert(p.price_usd, rate)), mono: true },
    {
      label: t('catalog.cols.retail'),
      value: retailUsd != null ? format(convert(retailUsd, rate)) : t('common.emptyValue'),
      mono: true,
    },
    { label: t('catalog.cols.margin'), value: formatPercent(computeMargin(p.price_usd, retailUsd)), mono: true },
    {
      label: t('catalog.cols.stock'),
      value: stock > 0 ? `${stock} ${t('common.pcs')}` : t('common.none'),
      mono: true,
    },
  ]
  return rows
})
</script>

<template>
  <Modal
    v-model:open="open"
    size="sm"
    :title="title"
    :subtitle="sku || undefined"
  >
    <div class="flex flex-col gap-4">
      <div
        v-if="product"
        class="flex flex-wrap items-center gap-1.5"
      >
        <Tag v-if="product.brand">
          {{ product.brand.name }}
        </Tag>
        <Tag v-if="product.category">
          {{ product.category.name }}
        </Tag>
        <Badge :tone="product.is_active ? 'accent' : 'neutral'">
          {{ product.is_active ? t('catalog.form.active') : t('catalog.inactive') }}
        </Badge>
      </div>

      <dl
        v-if="product"
        class="flex flex-col divide-y divide-line-soft rounded-lg border border-line-soft"
      >
        <div
          v-for="fact in facts"
          :key="fact.label"
          class="flex items-center justify-between gap-4 px-3 py-2.5"
        >
          <dt class="text-sm text-muted">
            {{ fact.label }}
          </dt>
          <dd
            class="text-sm text-fg"
            :class="fact.mono && 'font-mono tabular-nums'"
          >
            {{ fact.value }}
          </dd>
        </div>
      </dl>

      <p
        v-else
        class="flex items-center gap-2 rounded-lg border border-line-soft bg-surface px-3 py-4 text-sm text-muted"
      >
        <Icon
          icon="fa-solid fa-circle-info"
          size="sm"
          class="text-faint"
        />
        {{ t('orders.details.productGone') }}
      </p>
    </div>
  </Modal>
</template>
