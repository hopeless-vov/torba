<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import Modal from '@/components/ui/Modal.vue'

// Confirmation gate for destructive actions. Copy comes from the caller
// so this stays presentational.
withDefaults(
  defineProps<{
    title: string
    message?: string
    confirmLabel: string
    cancelLabel: string
    tone?: 'danger' | 'accent'
    loading?: boolean
  }>(),
  {
    message: undefined,
    tone: 'danger',
    loading: false,
  },
)

const emit = defineEmits<{ confirm: [] }>()

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <Modal
    v-model:open="open"
    size="sm"
  >
    <div class="flex flex-col items-center gap-3 text-center">
      <span
        class="flex size-11 items-center justify-center rounded-full"
        :class="tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent'"
      >
        <Icon icon="fa-solid fa-triangle-exclamation" />
      </span>
      <h2 class="text-base font-semibold text-fg">
        {{ title }}
      </h2>
      <p
        v-if="message"
        class="text-sm leading-relaxed text-muted"
      >
        {{ message }}
      </p>
    </div>

    <template #footer>
      <Button
        variant="ghost"
        @click="open = false"
      >
        {{ cancelLabel }}
      </Button>
      <Button
        :variant="tone === 'danger' ? 'danger' : 'primary'"
        :loading="loading"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </Button>
    </template>
  </Modal>
</template>
