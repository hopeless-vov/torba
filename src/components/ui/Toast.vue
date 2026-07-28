<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'
import type { ToastType } from '@/stores/toast'
import { computed } from 'vue'

const props = defineProps<{
  type: ToastType
  message: string
}>()

const config = computed(() => {
  const map: Record<ToastType, { icon: string; class: string }> = {
    success: { icon: 'fa-solid fa-circle-check', class: 'text-accent' },
    error: { icon: 'fa-solid fa-circle-exclamation', class: 'text-danger' },
    info: { icon: 'fa-solid fa-circle-info', class: 'text-info' },
  }
  return map[props.type]
})
</script>

<template>
  <div
    class="flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-3 shadow-xl"
    role="status"
  >
    <Icon
      :icon="config.icon"
      size="sm"
      :class="config.class"
    />
    <span class="text-sm text-fg">{{ message }}</span>
  </div>
</template>
