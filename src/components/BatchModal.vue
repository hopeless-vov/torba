<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Combobox from '@/components/ui/Combobox.vue'
import Modal from '@/components/ui/Modal.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useCurrency } from '@/composables/use-currency'
import { useInventoryStore } from '@/stores/inventory'
import { useReferenceStore } from '@/stores/reference'
import type { Batch, NewBatch } from '@/types/database'
import { generateBatchNumber } from '@/utils/batch-number'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  batch?: Batch | null
  saving?: boolean
}>()

const emit = defineEmits<{ submit: [payload: Omit<NewBatch, 'company_id'>] }>()

const { t } = useI18n()
const { options, costToDisplay, functionalCode, formatIn } = useCurrency()
const inventory = useInventoryStore()
const reference = useReferenceStore()
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

const isEdit = computed(() => !!props.batch)

const chosenProduct = computed(() => inventory.products.find((p) => p.id === form.product_id) ?? null)

// The catalogue price of the product this delivery is of, in the currency the
// supplier prices it in — the starting point for the batch's own cost.
const catalogCost = computed(() => ({
  amount: chosenProduct.value?.cost_amount ?? 0,
  currency: chosenProduct.value?.cost_currency ?? 'USD',
}))

const currencyOptions = computed(() =>
  options.value.map((o) => ({ value: o.code, label: `${o.symbol}  ${o.code}` })),
)

// How the cost will be read back: a price in the brand's catalog currency
// goes through that brand's supplier rate, so the hint says what it becomes.
const brand = computed(() =>
  chosenProduct.value?.brand_id ? (reference.brandsById.get(chosenProduct.value.brand_id) ?? null) : null,
)

// A cost entered in the supplier's currency is worth saying out loud in the
// books' currency: that is the number this delivery will report as margin.
const costInBase = computed(() =>
  formatIn(functionalCode.value, costToDisplay(cost.value, costCurrency.value, brand.value, functionalCode.value)),
)

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

const touchedCost = ref(false)

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
          <template v-if="costCurrency !== functionalCode">
            {{ ' · ' + t('common.approx', { amount: costInBase }) }}
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
