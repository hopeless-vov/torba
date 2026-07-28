<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Modal from '@/components/ui/Modal.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useClientsStore } from '@/stores/clients'
import { useReferenceStore } from '@/stores/reference'
import type { Order, OrderPatch, OrderStatus } from '@/types/database'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  order?: Order | null
  saving?: boolean
}>()

const emit = defineEmits<{ submit: [patch: OrderPatch] }>()

const { t } = useI18n()
const reference = useReferenceStore()
const clients = useClientsStore()
const open = defineModel<boolean>('open', { default: false })

const form = reactive({
  status: 'new' as OrderStatus,
  payment_method: '',
  client_id: '',
  tracking_number: '',
  note: '',
})
const delivery = ref(0)
const packaging = ref(0)

const statusOptions = computed(() =>
  (['new', 'paid', 'sent', 'done'] as OrderStatus[]).map((s) => ({
    value: s,
    label: t(`status.order.${s}`),
  })),
)
const paymentOptions = computed(() => [
  { value: '', label: t('orders.edit.noPayment') },
  ...reference.paymentMethods.map((p) => ({ value: p.name, label: p.name })),
])
const clientOptions = computed(() => [
  { value: '', label: t('cart.chooseClient') },
  ...clients.clients.map((c) => ({ value: c.id, label: c.name })),
])

watch(
  open,
  (isOpen) => {
    if (!isOpen || !props.order) return
    form.status = props.order.status
    form.payment_method = props.order.payment_method ?? ''
    form.client_id = props.order.client_id ?? ''
    form.tracking_number = props.order.tracking_number ?? ''
    form.note = props.order.note ?? ''
    delivery.value = props.order.delivery_cost
    packaging.value = props.order.packaging_cost
  },
  { immediate: true },
)

function submit() {
  emit('submit', {
    status: form.status,
    payment_method: form.payment_method || null,
    client_id: form.client_id || null,
    tracking_number: form.tracking_number.trim() || null,
    delivery_cost: delivery.value || 0,
    packaging_cost: packaging.value || 0,
    note: form.note.trim() || null,
  })
}
</script>

<template>
  <Modal
    v-model:open="open"
    :title="t('orders.edit.title', { number: order?.number ?? '' })"
  >
    <form
      class="grid grid-cols-2 gap-4"
      @submit.prevent="submit"
    >
      <Select
        v-model="form.status"
        :label="t('orders.edit.status')"
        :options="statusOptions"
      />
      <Select
        v-model="form.payment_method"
        :label="t('orders.edit.payment')"
        :options="paymentOptions"
      />
      <Select
        v-model="form.client_id"
        class="col-span-2"
        :label="t('orders.edit.client')"
        :options="clientOptions"
      />
      <TextInput
        v-model="form.tracking_number"
        class="col-span-2"
        :label="t('orders.edit.tracking')"
      />
      <NumberInput
        v-model="delivery"
        :label="t('orders.edit.delivery')"
        :min="0"
        :step="10"
      />
      <NumberInput
        v-model="packaging"
        :label="t('orders.edit.packaging')"
        :min="0"
        :step="10"
      />
      <TextInput
        v-model="form.note"
        class="col-span-2"
        :label="t('orders.edit.note')"
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
        @click="submit"
      >
        {{ t('common.save') }}
      </Button>
    </template>
  </Modal>
</template>
