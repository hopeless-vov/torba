<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Modal from '@/components/ui/Modal.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useInventoryStore } from '@/stores/inventory'
import type { Batch, NewBatch } from '@/types/database'
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
  batch_number: '',
  delivery_date: '',
  expiry_date: '',
})
const received = ref(0)
const remaining = ref(0)

const productOptions = computed(() =>
  inventory.products.map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}` })),
)
const canSave = computed(() => !!form.product_id)

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    const b = props.batch
    form.product_id = b?.product_id ?? ''
    form.batch_number = b?.batch_number ?? ''
    form.delivery_date = b?.delivery_date ?? ''
    form.expiry_date = b?.expiry_date ?? ''
    received.value = b?.received_qty ?? 0
    remaining.value = b?.remaining_qty ?? 0
  },
  { immediate: true },
)

function submit() {
  if (!canSave.value) return
  emit('submit', {
    product_id: form.product_id,
    batch_number: form.batch_number.trim() || null,
    delivery_date: form.delivery_date || null,
    expiry_date: form.expiry_date || null,
    received_qty: received.value || 0,
    remaining_qty: remaining.value || 0,
  })
}
</script>

<template>
  <Modal
    v-model:open="open"
    :title="batch ? t('warehouse.newBatch') : t('warehouse.newBatch')"
  >
    <form
      class="grid grid-cols-2 gap-4"
      @submit.prevent="submit"
    >
      <Select
        v-model="form.product_id"
        class="col-span-2"
        :label="t('warehouse.cols.product')"
        :placeholder="t('catalog.cols.name')"
        :options="productOptions"
      />
      <TextInput
        v-model="form.batch_number"
        class="col-span-2"
        :label="t('warehouse.cols.batch')"
      />
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
      <NumberInput
        v-model="received"
        :label="t('warehouse.cols.remaining')"
        :min="0"
      />
      <NumberInput
        v-model="remaining"
        :label="t('common.pcs')"
        :min="0"
      />
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
