<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Modal from '@/components/ui/Modal.vue'
import { useMediaQuery } from '@vueuse/core'
import { ref } from 'vue'

// A page's filter cluster. At md+ the filters sit inline in the toolbar as
// usual; below it they collapse behind a single button that opens them in a
// sheet — a phone has no room for four comboboxes and a date range.
//
// The slot is rendered exactly once (never inline *and* in the modal): the
// filters are real form controls with generated ids, and duplicating them
// would point every <label for> at whichever copy mounted last.
withDefaults(
  defineProps<{
    /** Sheet heading. */
    title: string
    /** Trigger label, e.g. "Фільтри". */
    label: string
    /** Sheet's dismiss button. */
    doneLabel: string
    /** How many filters are actually narrowing the list right now. */
    count?: number
  }>(),
  { count: 0 },
)

defineSlots<{ default?(): unknown }>()

const inline = useMediaQuery('(min-width: 768px)')
const open = ref(false)
</script>

<template>
  <div
    v-if="inline"
    class="flex flex-wrap items-end gap-3"
  >
    <slot />
  </div>

  <template v-else>
    <Button
      icon="fa-solid fa-filter"
      :active="count > 0"
      @click="open = true"
    >
      {{ label }}
      <span
        v-if="count > 0"
        class="flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-on-accent tabular-nums"
      >{{ count }}</span>
    </Button>

    <Modal
      v-model:open="open"
      size="sm"
      :title="title"
    >
      <div class="flex flex-col gap-4">
        <slot />
      </div>
      <template #footer>
        <Button
          variant="primary"
          block
          @click="open = false"
        >
          {{ doneLabel }}
        </Button>
      </template>
    </Modal>
  </template>
</template>
