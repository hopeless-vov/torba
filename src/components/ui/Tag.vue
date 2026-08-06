<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'

withDefaults(
  defineProps<{
    tone?: 'neutral' | 'accent'
    removable?: boolean
  }>(),
  {
    tone: 'neutral',
    removable: false,
  },
)

defineEmits<{ remove: [] }>()
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap"
    :class="tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-chip text-muted'"
  >
    <slot />
    <button
      v-if="removable"
      type="button"
      class="-mr-0.5 flex size-4 cursor-pointer items-center justify-center rounded-sm text-faint transition-colors hover:text-danger"
      @click="$emit('remove')"
    >
      <Icon
        icon="fa-solid fa-xmark"
        size="xs"
      />
    </button>
  </span>
</template>
