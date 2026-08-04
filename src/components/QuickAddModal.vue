<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Modal from '@/components/ui/Modal.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { usePersonalization } from '@/composables/use-personalization'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

// Adds a missing Personalization item (brand / category / payment method)
// right where a dropdown needed it, so the user never has to break flow and
// go to Profile. On success it emits the value the calling dropdown expects
// to select — the new record's id for brands/categories, its name for
// payment methods (that is what the payment dropdowns are keyed by).
type Kind = 'brand' | 'category' | 'payment'

const props = defineProps<{ kind: Kind }>()
const emit = defineEmits<{ added: [value: string] }>()

const { t } = useI18n()
const { addBrand, addCategory, addPayment } = usePersonalization()
const open = defineModel<boolean>('open', { default: false })

const name = ref('')
const saving = ref(false)

watch(open, (isOpen) => {
  if (isOpen) name.value = ''
})

const copy = computed(() => {
  if (props.kind === 'brand')
    return { title: t('profile.addBrand'), label: t('catalog.form.brand'), placeholder: t('profile.brandPlaceholder') }
  if (props.kind === 'category')
    return {
      title: t('profile.addCategory'),
      label: t('catalog.form.category'),
      placeholder: t('profile.categoryPlaceholder'),
    }
  return { title: t('profile.addPayment'), label: t('cart.payment'), placeholder: t('profile.paymentPlaceholder') }
})

async function submit() {
  const value = name.value.trim()
  if (!value || saving.value) return
  saving.value = true
  try {
    if (props.kind === 'brand') {
      const created = await addBrand(value)
      if (created) emit('added', created.id)
    } else if (props.kind === 'category') {
      const created = await addCategory(value)
      if (created) emit('added', created.id)
    } else {
      const created = await addPayment(value)
      if (created) emit('added', created.name)
    }
    open.value = false
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Modal
    v-model:open="open"
    size="sm"
    :title="copy.title"
  >
    <form
      class="flex flex-col gap-2"
      @submit.prevent="submit"
    >
      <TextInput
        v-model="name"
        :label="copy.label"
        :placeholder="copy.placeholder"
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
        :disabled="!name.trim()"
        @click="submit"
      >
        {{ t('common.add') }}
      </Button>
    </template>
  </Modal>
</template>
