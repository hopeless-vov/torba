<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Modal from '@/components/ui/Modal.vue'
import TextInput from '@/components/ui/TextInput.vue'
import type { Client, NewClient } from '@/types/database'
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  client?: Client | null
  saving?: boolean
}>()

const emit = defineEmits<{ submit: [payload: Omit<NewClient, 'company_id'>] }>()

const { t } = useI18n()
const open = defineModel<boolean>('open', { default: false })

const form = reactive({ name: '', phone: '', city: '', delivery: '', note: '' })
const canSave = computed(() => !!form.name.trim())

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    const c = props.client
    form.name = c?.name ?? ''
    form.phone = c?.phone ?? ''
    form.city = c?.city ?? ''
    form.delivery = c?.delivery ?? ''
    form.note = c?.note ?? ''
  },
  { immediate: true },
)

function submit() {
  if (!canSave.value) return
  emit('submit', {
    name: form.name.trim(),
    phone: form.phone.trim() || null,
    city: form.city.trim() || null,
    delivery: form.delivery.trim() || null,
    note: form.note.trim() || null,
  })
}
</script>

<template>
  <Modal
    v-model:open="open"
    :title="client ? t('clients.form.titleEdit') : t('clients.form.titleNew')"
  >
    <form
      class="grid grid-cols-2 gap-4"
      @submit.prevent="submit"
    >
      <TextInput
        v-model="form.name"
        class="col-span-1"
        :label="t('clients.form.name')"
      />
      <TextInput
        v-model="form.phone"
        type="tel"
        class="col-span-1"
        :label="t('clients.form.phone')"
      />
      <TextInput
        v-model="form.city"
        class="col-span-1"
        :label="t('clients.form.city')"
      />
      <TextInput
        v-model="form.delivery"
        class="col-span-1"
        :label="t('clients.form.delivery')"
      />
      <TextInput
        v-model="form.note"
        class="col-span-2"
        :label="t('clients.form.note')"
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
