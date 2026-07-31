<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import { AnimatePresence, Motion } from 'motion-v'

// Appears once rows are ticked in a DataTable. Labels come from the
// caller so this stays reusable across catalog, warehouse and orders.
defineProps<{
  count: number
  visible: boolean
  deleteLabel: string
  clearLabel: string
}>()

const emit = defineEmits<{ delete: []; clear: [] }>()
</script>

<template>
  <AnimatePresence>
    <Motion
      v-if="visible"
      class="flex items-center gap-3 rounded-xl border border-accent-line bg-accent-soft px-4 py-2.5"
      :initial="{ opacity: 0, y: -6 }"
      :animate="{ opacity: 1, y: 0 }"
      :exit="{ opacity: 0, y: -6 }"
      :transition="{ duration: 0.15 }"
    >
      <Icon
        icon="fa-solid fa-check"
        size="sm"
        class="text-accent"
      />
      <span class="text-sm font-medium text-fg tabular-nums">{{ count }}</span>
      <div class="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          @click="emit('clear')"
        >
          {{ clearLabel }}
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon="fa-solid fa-trash"
          @click="emit('delete')"
        >
          {{ deleteLabel }}
        </Button>
      </div>
    </Motion>
  </AnimatePresence>
</template>
