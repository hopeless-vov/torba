<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
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
import { batchStatus } from '@/utils/batch-status'
import { formatPercent } from '@/utils/format'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { cart, totals, discountPct, linePrice, submitting, checkout, addProduct, addFromBatch } = useCart()
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
</script>

<template>
  <Drawer
    v-model:open="open"
    :title="t('cart.title')"
    :subtitle="t('cart.itemsCount', { count: cart.count })"
    width="28rem"
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
            <span class="text-xs text-faint tabular-nums">
              {{ `${inventory.stockByProduct.get(p.id) ?? 0} ${t('common.pcs')}` }}
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
                {{ `${b.batch_number ?? '—'} · ${b.remaining_qty} ${t('common.pcs')}` }}
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
        class="flex items-center gap-3 rounded-lg border border-line-soft bg-surface px-3 py-2.5"
      >
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
          :max="line.maxQty"
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
      </li>
    </ul>

    <template #footer>
      <div class="flex flex-col gap-3">
        <Select
          v-model="clientId"
          :label="t('cart.client')"
          :placeholder="t('cart.chooseClient')"
          :options="clientOptions"
        />
        <Select
          v-model="paymentMethod"
          :label="t('cart.payment')"
          :options="paymentOptions"
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
</template>
