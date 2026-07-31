<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Combobox from '@/components/ui/Combobox.vue'
import Modal from '@/components/ui/Modal.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useInventoryStore } from '@/stores/inventory'
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

const isEdit = computed(() => !!props.batch)

const productOptions = computed(() =>
  inventory.products.map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}` })),
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
  },
  { immediate: true },
)

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
  })
}
</script>

<template>
  <Modal
    v-model:open="open"
    :title="isEdit ? t('warehouse.editBatch') : t('warehouse.newBatch')"
  >
    <form
      class="grid grid-cols-2 gap-4"
      @submit.prevent="submit"
    >
      <Combobox
        v-model="form.product_id"
        class="col-span-2"
        :label="t('warehouse.cols.product')"
        :placeholder="t('warehouse.chooseProduct')"
        :search-placeholder="t('catalog.searchPlaceholder')"
        :empty-text="t('common.noMatches')"
        :options="productOptions"
        :disabled="isEdit"
      />

      <div class="col-span-2 flex flex-col gap-1.5">
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
