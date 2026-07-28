<script setup lang="ts">
import { tv } from 'tailwind-variants'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'info' | 'violet'
    dot?: boolean
    strong?: boolean
  }>(),
  {
    tone: 'neutral',
    dot: false,
    strong: false,
  },
)

const badge = tv({
  base: 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
  variants: {
    tone: {
      neutral: 'bg-chip text-muted',
      accent: 'bg-accent-soft text-accent',
      warn: 'bg-warn-soft text-warn',
      danger: 'bg-danger-soft text-danger',
      info: 'bg-info-soft text-info',
      violet: 'bg-chip text-violet',
    },
  },
})

const dotClass = computed(() => {
  const map: Record<string, string> = {
    neutral: 'bg-faint',
    accent: 'bg-accent',
    warn: 'bg-warn',
    danger: 'bg-danger',
    info: 'bg-info',
    violet: 'bg-violet',
  }
  return map[props.tone]
})
</script>

<template>
  <span :class="badge({ tone })">
    <span
      v-if="dot"
      class="size-1.5 rounded-full"
      :class="dotClass"
    />
    <slot />
  </span>
</template>
