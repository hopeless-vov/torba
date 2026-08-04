<script setup lang="ts">
import QuickAddModal from '@/components/QuickAddModal.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Combobox from '@/components/ui/Combobox.vue'
import Drawer from '@/components/ui/Drawer.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import Select from '@/components/ui/Select.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useCart } from '@/composables/use-cart'
import { useCurrency } from '@/composables/use-currency'
import { useClientsStore } from '@/stores/clients'
import { useInventoryStore } from '@/stores/inventory'
import { useReferenceStore } from '@/stores/reference'
import type { CartLine } from '@/types/models'
import { batchStatus } from '@/utils/batch-status'
import { formatDate, formatPercent } from '@/utils/format'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const {
  cart,
  totals,
  discountPct,
  discountModel,
  linePrice,
  submitting,
  checkout,
  batchesFor,
  shortfall,
  addProduct,
  addFromBatch,
  selectBatch,
} = useCart()
const { format } = useCurrency()
const reference = useReferenceStore()
const inventory = useInventoryStore()
const clients = useClientsStore()

const open = computed({
  get: () => cart.open,
  set: (v: boolean) => cart.toggle(v),
})

const clientId = computed({
  get: () => cart.clientId ?? '',
  set: (v: string) => (cart.clientId = v || null),
})
const paymentMethod = computed({
  get: () => cart.paymentMethod ?? '',
  set: (v: string) => (cart.paymentMethod = v || null),
})

const clientOptions = computed(() => clients.clients.map((c) => ({ value: c.id, label: c.name })))
const paymentOptions = computed(() => reference.paymentMethods.map((p) => ({ value: p.name, label: p.name })))

// Add a missing payment method inline, without leaving the cart.
const paymentAddOpen = ref(false)
function onPaymentAdded(value: string) {
  paymentMethod.value = value
}

// ── add-items picker ──
const pickerTab = ref<'stock' | 'catalog'>('catalog')
const pickerSearch = ref('')

const inStockBatches = computed(() => inventory.batches.filter((b) => b.remaining_qty > 0))

const pickerTabs = computed(() => [
  { value: 'stock', label: t('cart.fromStock'), count: inStockBatches.value.length },
  { value: 'catalog', label: t('cart.fromCatalog') },
])

function matches(text: string) {
  const q = pickerSearch.value.trim().toLowerCase()
  return !q || text.toLowerCase().includes(q)
}

const catalogResults = computed(() =>
  inventory.products.filter((p) => p.is_active && matches(`${p.name} ${p.sku}`)).slice(0, 40),
)
const stockResults = computed(() =>
  inStockBatches.value.filter((b) => matches(`${b.product?.name ?? ''} ${b.product?.sku ?? ''} ${b.batch_number ?? ''}`)).slice(0, 40),
)

// ── which expiry ships ──
// Same product, two deliveries: the line names the batch it draws from,
// and this list lets the user hand over the other one instead.
function batchOptions(line: CartLine) {
  return batchesFor(line.product.id)
    .filter((b) => b.remaining_qty > 0 || b.id === line.batch?.id)
    .map((b) => ({
      value: b.id,
      label: `${formatDate(b.expiry_date)} · ${b.remaining_qty} ${t('common.pcs')}`,
    }))
}
</script>

<template>
  <Drawer
    v-model:open="open"
    :title="t('cart.title')"
    :subtitle="t('cart.itemsCount', { count: cart.count })"
    width="30rem"
  >
    <!-- Picker -->
    <div class="mb-4 flex flex-col gap-2">
      <Tabs
        v-model="pickerTab"
        :tabs="pickerTabs"
        size="sm"
      />
      <TextInput
        v-model="pickerSearch"
        icon-left="fa-solid fa-magnifying-glass"
        :placeholder="t('cart.pickerSearch')"
      />

      <ul class="max-h-52 overflow-y-auto rounded-lg border border-line-soft">
        <template v-if="pickerTab === 'catalog'">
          <li
            v-for="p in catalogResults"
            :key="p.id"
            class="flex items-center gap-2 border-b border-line-soft px-3 py-2 last:border-0 hover:bg-row-hover"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm text-fg">
                {{ p.name }}
              </p>
              <p class="font-mono text-xs text-faint">
                {{ p.sku }}
              </p>
            </div>
            <span
              class="text-xs tabular-nums"
              :class="(inventory.stockByProduct.get(p.id) ?? 0) > 0 ? 'text-faint' : 'text-warn'"
            >
              {{
                (inventory.stockByProduct.get(p.id) ?? 0) > 0
                  ? `${inventory.stockByProduct.get(p.id)} ${t('common.pcs')}`
                  : t('cart.underOrder')
              }}
            </span>
            <button
              type="button"
              class="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line text-muted transition-colors hover:border-accent-line hover:text-accent"
              @click="addProduct(p)"
            >
              <Icon
                icon="fa-solid fa-plus"
                size="sm"
              />
            </button>
          </li>
        </template>
        <template v-else>
          <li
            v-for="b in stockResults"
            :key="b.id"
            class="flex items-center gap-2 border-b border-line-soft px-3 py-2 last:border-0 hover:bg-row-hover"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm text-fg">
                {{ b.product?.name }}
              </p>
              <p class="font-mono text-xs text-faint">
                {{ `${formatDate(b.expiry_date)} · ${b.remaining_qty} ${t('common.pcs')}` }}
              </p>
            </div>
            <span
              class="size-1.5 rounded-full"
              :class="batchStatus(b.expiry_date) === 'expired' ? 'bg-faint' : 'bg-accent'"
            />
            <button
              type="button"
              class="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line text-muted transition-colors hover:border-accent-line hover:text-accent"
              @click="addFromBatch(b)"
            >
              <Icon
                icon="fa-solid fa-plus"
                size="sm"
              />
            </button>
          </li>
        </template>
      </ul>
    </div>

    <!-- Current lines -->
    <div
      v-if="cart.isEmpty"
      class="py-6"
    >
      <EmptyState
        icon="fa-solid fa-basket-shopping"
        :title="t('cart.empty')"
        :hint="t('cart.emptyHint')"
      />
    </div>

    <ul
      v-else
      class="flex flex-col gap-2"
    >
      <li
        v-for="line in cart.lines"
        :key="line.key"
        class="flex flex-col gap-2 rounded-lg border border-line-soft bg-surface px-3 py-2.5"
      >
        <div class="flex items-center gap-3">
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-fg">
              {{ line.product.name }}
            </p>
            <p class="font-mono text-xs text-faint">
              {{ line.product.sku }}
            </p>
          </div>
          <NumberInput
            :model-value="line.qty"
            size="sm"
            :min="1"
            align="right"
            class="w-16"
            @update:model-value="cart.setQty(line.key, $event ?? 1)"
          />
          <span class="w-24 text-right font-mono text-sm text-fg tabular-nums">
            {{ format(linePrice(line) * line.qty) }}
          </span>
          <button
            type="button"
            class="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-danger"
            @click="cart.remove(line.key)"
          >
            <Icon
              icon="fa-solid fa-xmark"
              size="sm"
            />
          </button>
        </div>

        <div class="flex items-center gap-2">
          <Icon
            icon="fa-solid fa-calendar-days"
            size="xs"
            class="shrink-0 text-faint"
          />
          <Select
            v-if="batchOptions(line).length > 0"
            :model-value="line.batch?.id ?? ''"
            :options="batchOptions(line)"
            size="sm"
            class="min-w-0 flex-1"
            @update:model-value="selectBatch(line, $event ?? '')"
          />
          <span
            v-else
            class="flex-1 text-xs text-faint"
          >{{ t('cart.noBatches') }}</span>
          <Badge
            v-if="shortfall(line) > 0"
            tone="warn"
          >
            {{ t('cart.backorder', { count: shortfall(line) }) }}
          </Badge>
        </div>
      </li>
    </ul>

    <template #footer>
      <div class="flex flex-col gap-3">
        <Combobox
          v-model="clientId"
          :label="t('cart.client')"
          :placeholder="t('cart.chooseClient')"
          :search-placeholder="t('clients.searchPlaceholder')"
          :empty-text="t('common.noMatches')"
          :options="clientOptions"
          clearable
        />
        <Combobox
          v-model="paymentMethod"
          :label="t('cart.payment')"
          :placeholder="t('orders.edit.noPayment')"
          :search-placeholder="t('common.search')"
          :empty-text="t('common.noMatches')"
          :options="paymentOptions"
          :add-label="t('profile.addPayment')"
          clearable
          @add="paymentAddOpen = true"
        />

        <NumberInput
          v-model="discountModel"
          :label="t('cart.discount')"
          :min="0"
          :max="100"
          suffix="%"
        />

        <p class="text-xs text-faint">
          {{ t('cart.expensesLater') }}
        </p>

        <dl class="flex flex-col gap-1.5 rounded-lg border border-line-soft bg-surface p-3 text-sm">
          <div class="flex justify-between">
            <dt class="text-muted">
              {{ t('cart.sale') }}
            </dt>
            <dd class="font-mono text-fg tabular-nums">
              {{ format(totals.saleTotal) }}
            </dd>
          </div>
          <div
            v-if="discountPct > 0"
            class="flex justify-between"
          >
            <dt class="text-muted">
              {{ t('cart.discount') }}
            </dt>
            <dd class="font-mono text-warn tabular-nums">
              {{ `−${formatPercent(discountPct / 100)}` }}
            </dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-muted">
              {{ t('cart.goodsCost') }}
            </dt>
            <dd class="font-mono text-muted tabular-nums">
              {{ `− ${format(totals.goodsCost)}` }}
            </dd>
          </div>
          <div class="flex justify-between border-t border-line-soft pt-1.5">
            <dt class="text-fg">
              {{ t('cart.profit') }}
            </dt>
            <dd class="font-mono font-semibold text-accent tabular-nums">
              {{ format(totals.profit) }}
            </dd>
          </div>
        </dl>

        <p
          v-if="cart.hasBackorder"
          class="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn"
        >
          <Icon
            icon="fa-solid fa-triangle-exclamation"
            size="xs"
            class="mt-0.5 shrink-0"
          />
          {{ t('cart.backorderHint') }}
        </p>

        <Button
          variant="primary"
          block
          :disabled="cart.isEmpty"
          :loading="submitting"
          @click="checkout"
        >
          {{ t('cart.checkout') }}
        </Button>
      </div>
    </template>
  </Drawer>

  <QuickAddModal
    kind="payment"
    :open="paymentAddOpen"
    @update:open="paymentAddOpen = $event"
    @added="onPaymentAdded"
  />
</template>
