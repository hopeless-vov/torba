<script setup lang="ts">
import QuickAddModal from '@/components/QuickAddModal.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Combobox from '@/components/ui/Combobox.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import Select from '@/components/ui/Select.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useCart } from '@/composables/use-cart'
import { useCurrency } from '@/composables/use-currency'
import { usePermissions } from '@/composables/use-permissions'
import { useClientsStore } from '@/stores/clients'
import { useInventoryStore } from '@/stores/inventory'
import { useReferenceStore } from '@/stores/reference'
import type { CartLine } from '@/types/models'
import { batchStatus } from '@/utils/batch-status'
import { formatDate, formatPercent } from '@/utils/format'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

// The order being assembled, as a page rather than a drawer: picking goods
// and settling the terms are one continuous job, and a panel over the app
// made it feel like an interruption of the screen underneath.
const { t } = useI18n()
const router = useRouter()
const {
  cart,
  totals,
  discountPct,
  discountModel,
  lineNet,
  linePrice,
  submitting,
  checkout,
  batchesFor,
  shortfall,
  inCart,
  inCartFromBatch,
  addProduct,
  addFromBatch,
  selectBatch,
} = useCart()
const { format } = useCurrency()
const { canTrade } = usePermissions()
const reference = useReferenceStore()
const inventory = useInventoryStore()
const clients = useClientsStore()

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
  inStockBatches.value
    .filter((b) => matches(`${b.product?.name ?? ''} ${b.product?.sku ?? ''} ${b.batch_number ?? ''}`))
    .slice(0, 40),
)

const noResults = computed(() =>
  pickerTab.value === 'catalog' ? catalogResults.value.length === 0 : stockResults.value.length === 0,
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

// A placed order is no longer a cart, so there is nothing to come back to:
// the user is sent to the order list, where the new one is waiting.
async function placeOrder() {
  if (await checkout()) router.push({ name: 'orders' })
}
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <div class="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <div class="flex min-w-0 flex-col gap-4">
        <!-- Picker: stays on screen the whole time, so adding the fifth
             product costs the same as the first. -->
        <section class="rounded-xl border border-line bg-panel">
          <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <h2 class="text-sm font-semibold text-fg">
              {{ t('cart.addTitle') }}
            </h2>
            <Tabs
              v-model="pickerTab"
              :tabs="pickerTabs"
              size="sm"
            />
          </div>

          <div class="flex flex-col gap-3 px-5 pb-5">
            <TextInput
              v-model="pickerSearch"
              type="search"
              icon-left="fa-solid fa-magnifying-glass"
              :placeholder="t('cart.pickerSearch')"
            />

            <p
              v-if="noResults"
              class="rounded-lg border border-line-soft py-10 text-center text-sm text-faint"
            >
              {{ t('common.noMatches') }}
            </p>
            <ul
              v-else
              class="max-h-96 divide-y divide-line-soft overflow-y-auto rounded-lg border border-line-soft"
            >
              <template v-if="pickerTab === 'catalog'">
                <li
                  v-for="p in catalogResults"
                  :key="p.id"
                  class="flex items-center gap-3 px-3 py-2.5 hover:bg-row-hover"
                >
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm text-fg">
                      {{ p.name }}
                    </p>
                    <p class="font-mono text-xs text-faint">
                      {{ p.sku }}
                    </p>
                  </div>
                  <Badge
                    v-if="inCart(p.id) > 0"
                    tone="accent"
                  >
                    {{ t('cart.alreadyIn', { count: inCart(p.id) }) }}
                  </Badge>
                  <span
                    class="shrink-0 text-xs tabular-nums"
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
                    class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-accent-line hover:text-accent"
                    :title="t('catalog.addToCart')"
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
                  class="flex items-center gap-3 px-3 py-2.5 hover:bg-row-hover"
                >
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm text-fg">
                      {{ b.product?.name }}
                    </p>
                    <p class="font-mono text-xs text-faint">
                      {{ `${formatDate(b.expiry_date)} · ${b.remaining_qty} ${t('common.pcs')}` }}
                    </p>
                  </div>
                  <Badge
                    v-if="inCartFromBatch(b.id) > 0"
                    tone="accent"
                  >
                    {{ t('cart.alreadyIn', { count: inCartFromBatch(b.id) }) }}
                  </Badge>
                  <span
                    class="size-1.5 shrink-0 rounded-full"
                    :class="batchStatus(b.expiry_date) === 'expired' ? 'bg-faint' : 'bg-accent'"
                  />
                  <button
                    type="button"
                    class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-accent-line hover:text-accent"
                    :title="t('catalog.addToCart')"
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
        </section>

        <!-- Lines -->
        <section class="rounded-xl border border-line bg-panel">
          <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div class="flex items-baseline gap-2">
              <h2 class="text-sm font-semibold text-fg">
                {{ t('cart.linesTitle') }}
              </h2>
              <span class="text-xs text-faint">{{ t('cart.itemsCount', { count: cart.count }) }}</span>
            </div>
            <button
              v-if="!cart.isEmpty"
              type="button"
              class="cursor-pointer text-xs text-faint transition-colors hover:text-danger"
              @click="cart.clear()"
            >
              {{ t('cart.clearAll') }}
            </button>
          </div>

          <EmptyState
            v-if="cart.isEmpty"
            icon="fa-solid fa-basket-shopping"
            :title="t('cart.empty')"
            :hint="t('cart.emptyHint')"
          />

          <ul
            v-else
            class="flex flex-col gap-3 px-5 pb-5"
          >
            <li
              v-for="line in cart.lines"
              :key="line.key"
              class="flex flex-col gap-3 rounded-lg border border-line-soft bg-surface px-4 py-3"
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
                <span class="text-right font-mono text-sm text-fg tabular-nums">
                  {{ format(linePrice(line) * line.qty) }}
                </span>
                <button
                  type="button"
                  class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-danger"
                  :title="t('common.delete')"
                  @click="cart.remove(line.key)"
                >
                  <Icon
                    icon="fa-solid fa-xmark"
                    size="sm"
                  />
                </button>
              </div>

              <!-- Quantity, the price this line goes out at, a discount that
                   applies to this product only — on top of the order's — and
                   the delivery it ships from. -->
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NumberInput
                  :model-value="line.qty"
                  :label="t('cart.qty')"
                  size="sm"
                  :min="1"
                  align="right"
                  @update:model-value="cart.setQty(line.key, $event ?? 1)"
                />
                <NumberInput
                  :model-value="line.unitPrice"
                  :label="t('cart.unitPrice')"
                  size="sm"
                  :min="0"
                  :step="0.01"
                  align="right"
                  @update:model-value="cart.setPrice(line.key, $event ?? 0)"
                />
                <NumberInput
                  :model-value="line.discount"
                  :label="t('cart.lineDiscount')"
                  size="sm"
                  :min="0"
                  :max="100"
                  align="right"
                  suffix="%"
                  @update:model-value="cart.setDiscount(line.key, $event ?? 0)"
                />
                <Select
                  v-if="batchOptions(line).length > 0"
                  :model-value="line.batch?.id ?? ''"
                  :label="t('cart.batch')"
                  :options="batchOptions(line)"
                  size="sm"
                  @update:model-value="selectBatch(line, $event ?? '')"
                />
                <div
                  v-else
                  class="flex flex-col gap-1.5"
                >
                  <span class="text-xs font-medium text-muted">{{ t('cart.batch') }}</span>
                  <span class="flex h-8 items-center text-xs text-faint">{{ t('cart.noBatches') }}</span>
                </div>
              </div>

              <div
                v-if="line.discount > 0 || line.unitPrice !== line.listPrice || shortfall(line) > 0"
                class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs"
              >
                <span
                  v-if="line.discount > 0"
                  class="text-muted"
                >
                  {{ t('cart.netUnit', { price: format(lineNet(line)) }) }}
                </span>
                <button
                  v-if="line.unitPrice !== line.listPrice"
                  type="button"
                  class="cursor-pointer text-faint underline decoration-dotted underline-offset-2 transition-colors hover:text-fg"
                  @click="cart.setPrice(line.key, line.listPrice)"
                >
                  {{ t('cart.resetPrice', { price: format(line.listPrice) }) }}
                </button>
                <Badge
                  v-if="shortfall(line) > 0"
                  tone="warn"
                >
                  {{ t('cart.backorder', { count: shortfall(line) }) }}
                </Badge>
              </div>
            </li>
          </ul>
        </section>
      </div>

      <!-- The terms of the sale and what it comes to. Sticky on a wide
           screen so the total stays in sight while the list grows. -->
      <aside class="flex flex-col gap-4 xl:sticky xl:top-6">
        <section class="flex flex-col gap-3 rounded-xl border border-line bg-panel p-5">
          <h2 class="text-sm font-semibold text-fg">
            {{ t('cart.orderSection') }}
          </h2>
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
            :hint="t('cart.discountHint')"
            :min="0"
            :max="100"
            suffix="%"
          />
          <p class="text-xs leading-relaxed text-faint">
            {{ t('cart.expensesLater') }}
          </p>
        </section>

        <section class="flex flex-col gap-3 rounded-xl border border-line bg-panel p-5">
          <dl class="flex flex-col gap-1.5 text-sm">
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

          <!-- The page is only reachable through a route guard already gated
               on the member role; this is a second lock in case a line
               survived a mid-session role change. -->
          <Button
            v-if="canTrade"
            variant="primary"
            block
            :disabled="cart.isEmpty"
            :loading="submitting"
            @click="placeOrder"
          >
            {{ t('cart.checkout') }}
          </Button>
        </section>
      </aside>
    </div>

    <QuickAddModal
      kind="payment"
      :open="paymentAddOpen"
      @update:open="paymentAddOpen = $event"
      @added="onPaymentAdded"
    />
  </div>
</template>
