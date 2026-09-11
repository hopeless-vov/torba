<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Combobox from '@/components/ui/Combobox.vue'
import Modal from '@/components/ui/Modal.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useCurrency } from '@/composables/use-currency'
import { useInventoryStore } from '@/stores/inventory'
import type { Batch, NewBatch } from '@/types/database'
import { generateBatchNumber } from '@/utils/batch-number'
import { formatPercent } from '@/utils/format'
import { computeMargin } from '@/utils/pricing'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  batch?: Batch | null
  saving?: boolean
}>()

const emit = defineEmits<{ submit: [payload: Omit<NewBatch, 'company_id'>] }>()

const { t } = useI18n()
const { options, toBase, functionalCode, formatIn } = useCurrency()
const inventory = useInventoryStore()
const open = defineModel<boolean>('open', { default: false })

const form = reactive({
  product_id: '',
  delivery_date: '',
  expiry_date: '',
})
// A new delivery arrives whole, so "received" is the only number worth
// asking for; the remainder is editable afterwards, when stock has been
// sold or written off.
const received = ref(0)
const remaining = ref(0)
// What this delivery cost per unit. Prefilled from the product's catalogue
// price, because most deliveries do come in at it — but a promotion, or a
// rate that moved, is exactly what this field is here to record.
const cost = ref(0)
const costCurrency = ref('USD')
// And what it goes out at. A promotional delivery is often passed on cheaper,
// so the selling price belongs to the delivery too — same fallback: leave it
// as the catalogue price and nothing changes.
const retail = ref(0)
const retailCurrency = ref('UAH')

const isEdit = computed(() => !!props.batch)

const chosenProduct = computed(() => inventory.products.find((p) => p.id === form.product_id) ?? null)

// The catalogue price of the product this delivery is of, in the currency the
// supplier prices it in — the starting point for the batch's own cost.
const catalogCost = computed(() => ({
  amount: chosenProduct.value?.cost_amount ?? 0,
  currency: chosenProduct.value?.cost_currency ?? 'USD',
}))

// Retail is a sale amount, so it defaults to the currency the books are kept
// in rather than the supplier's.
const catalogRetail = computed(() => ({
  amount: chosenProduct.value?.retail_amount ?? 0,
  currency: chosenProduct.value?.retail_currency ?? functionalCode.value,
}))

const currencyOptions = computed(() =>
  options.value.map((o) => ({ value: o.code, label: `${o.symbol}  ${o.code}` })),
)

// Whose rates apply: the supplier of the product this delivery is of.
const brandId = computed(() => chosenProduct.value?.brand_id ?? null)

// A cost entered in the supplier's currency is worth saying out loud in the
// books' currency: that is the number this delivery will report as margin.
// Null while the supplier's rate for that currency is missing.
const costInBase = computed(() => {
  const amount = toBase(cost.value, costCurrency.value, brandId.value)
  return amount == null ? null : formatIn(functionalCode.value, amount)
})

// What this delivery earns, if both prices are known — the number that makes
// a promotional buy worth recording in the first place.
const marginLabel = computed(() => {
  if (!retail.value) return null
  const costBase = toBase(cost.value, costCurrency.value, brandId.value)
  const retailBase = toBase(retail.value, retailCurrency.value, brandId.value)
  if (costBase == null || retailBase == null) return null
  const margin = computeMargin(costBase, retailBase)
  return margin == null ? null : formatPercent(margin)
})

// Name on top, SKU underneath: two products can open with the same long
// phrase, and the SKU is what actually tells them apart.
const productOptions = computed(() =>
  inventory.products.map((p) => ({
    value: p.id,
    label: p.volume ? `${p.name} · ${p.volume}` : p.name,
    hint: p.sku,
  })),
)
const canSave = computed(() => !!form.product_id)

// Batch numbers are generated from the product's SKU — the warehouse only
// needs them to tell two deliveries of the same product apart.
const batchNumber = computed(() => {
  if (props.batch) return props.batch.batch_number ?? ''
  const product = inventory.products.find((p) => p.id === form.product_id)
  if (!product) return ''
  return generateBatchNumber(
    product.sku,
    inventory.batches.filter((b) => b.product_id === product.id).map((b) => b.batch_number),
  )
})

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    const b = props.batch
    form.product_id = b?.product_id ?? ''
    form.delivery_date = b?.delivery_date ?? ''
    form.expiry_date = b?.expiry_date ?? ''
    received.value = b?.received_qty ?? 0
    remaining.value = b?.remaining_qty ?? 0
    // An older batch carries no cost of its own; show what it is being read
    // as today, so saving does not silently change what it reports.
    cost.value = b?.cost_amount ?? catalogCost.value.amount
    costCurrency.value = b?.cost_currency ?? catalogCost.value.currency
    retail.value = b?.retail_amount ?? catalogRetail.value.amount
    retailCurrency.value = b?.retail_currency ?? catalogRetail.value.currency
    touchedCost.value = false
    touchedRetail.value = false
  },
  { immediate: true },
)

// Picking the product is what tells us the catalogue price, so a new batch
// follows it until the user types a price of their own.
watch(catalogCost, (next) => {
  if (isEdit.value || touchedCost.value) return
  cost.value = next.amount
  costCurrency.value = next.currency
})

watch(catalogRetail, (next) => {
  if (isEdit.value || touchedRetail.value) return
  retail.value = next.amount
  retailCurrency.value = next.currency
})

const touchedCost = ref(false)
const touchedRetail = ref(false)

// New batches start out untouched, so the remainder tracks the delivery.
watch(received, (value) => {
  if (!isEdit.value) remaining.value = value
})

function submit() {
  if (!canSave.value) return
  emit('submit', {
    product_id: form.product_id,
    batch_number: batchNumber.value || null,
    delivery_date: form.delivery_date || null,
    expiry_date: form.expiry_date || null,
    received_qty: received.value || 0,
    remaining_qty: (isEdit.value ? remaining.value : received.value) || 0,
    cost_amount: cost.value || 0,
    cost_currency: costCurrency.value,
    // Nothing entered means "sell it at the catalogue price", which is what
    // an empty retail column has always meant on a product.
    retail_amount: retail.value ? retail.value : null,
    retail_currency: retailCurrency.value,
  })
}
</script>

<template>
  <Modal
    v-model:open="open"
    :title="isEdit ? t('warehouse.editBatch') : t('warehouse.newBatch')"
  >
    <form
      class="grid grid-cols-1 gap-4 sm:grid-cols-2"
      @submit.prevent="submit"
    >
      <Combobox
        v-model="form.product_id"
        class="col-span-1 sm:col-span-2"
        :label="t('warehouse.cols.product')"
        :placeholder="t('warehouse.chooseProduct')"
        :search-placeholder="t('catalog.searchPlaceholder')"
        :empty-text="t('common.noMatches')"
        :options="productOptions"
        :disabled="isEdit"
      />

      <div class="col-span-1 flex flex-col gap-1.5 sm:col-span-2">
        <span class="text-xs font-medium text-muted">{{ t('warehouse.cols.batch') }}</span>
        <div
          class="flex h-9 items-center gap-2 rounded-lg border border-dashed border-line bg-bg-2 px-3"
        >
          <span class="font-mono text-sm text-fg">{{ batchNumber || t('common.emptyValue') }}</span>
          <span class="ml-auto text-xs text-faint">{{ t('warehouse.batchAuto') }}</span>
        </div>
      </div>

      <TextInput
        v-model="form.delivery_date"
        type="date"
        :label="t('warehouse.cols.delivery')"
      />
      <TextInput
        v-model="form.expiry_date"
        type="date"
        :label="t('warehouse.cols.expiry')"
      />

      <div class="col-span-1 flex flex-col gap-1 sm:col-span-2">
        <div class="flex items-end gap-2">
          <NumberInput
            v-model="cost"
            class="flex-1"
            :label="t('warehouse.cols.cost')"
            :min="0"
            :step="0.01"
            @update:model-value="touchedCost = true"
          />
          <div class="w-28">
            <Combobox
              v-model="costCurrency"
              :label="t('catalog.form.currency')"
              :search-placeholder="t('common.search')"
              :empty-text="t('common.noMatches')"
              :options="currencyOptions"
            />
          </div>
        </div>
        <span class="text-xs text-faint">
          {{ t('warehouse.hint.cost') }}
          <template v-if="costCurrency !== functionalCode && costInBase">
            {{ ' · ' + t('common.approx', { amount: costInBase }) }}
          </template>
        </span>
      </div>

      <div class="col-span-1 flex flex-col gap-1 sm:col-span-2">
        <div class="flex items-end gap-2">
          <NumberInput
            v-model="retail"
            class="flex-1"
            :label="t('warehouse.cols.retail')"
            :min="0"
            :step="0.01"
            @update:model-value="touchedRetail = true"
          />
          <div class="w-28">
            <Combobox
              v-model="retailCurrency"
              :label="t('catalog.form.currency')"
              :search-placeholder="t('common.search')"
              :empty-text="t('common.noMatches')"
              :options="currencyOptions"
            />
          </div>
        </div>
        <span class="text-xs text-faint">
          {{ t('warehouse.hint.retail') }}
          <template v-if="marginLabel">
            {{ ' · ' + t('warehouse.hint.margin', { margin: marginLabel }) }}
          </template>
        </span>
      </div>

      <div class="flex flex-col gap-1">
        <NumberInput
          v-model="received"
          :label="t('warehouse.cols.received')"
          :min="0"
        />
        <span class="text-xs text-faint">{{ t('warehouse.hint.received') }}</span>
      </div>
      <div
        v-if="isEdit"
        class="flex flex-col gap-1"
      >
        <NumberInput
          v-model="remaining"
          :label="t('warehouse.cols.remaining')"
          :min="0"
          :max="received"
        />
        <span class="text-xs text-faint">{{ t('warehouse.hint.remaining') }}</span>
      </div>
    </form>

    <template #footer>
      <Button
        variant="ghost"
        @click="open = false"
      >
        {{ t('common.cancel') }}
      </Button>
      <Button
        variant="primary"
        :loading="saving"
        :disabled="!canSave"
        @click="submit"
      >
        {{ t('common.save') }}
      </Button>
    </template>
  </Modal>
</template>
