<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'neutral' | 'accent'
  }>(),
  {
    tone: 'neutral',
  },
)
</script>

<template>
  <span
    class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap"
    :class="tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-chip text-muted'"
  >
    <slot />
  </span>
</template>
