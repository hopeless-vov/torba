<script setup lang="ts">
import { tv } from 'tailwind-variants'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name?: string
    size?: 'sm' | 'md' | 'lg'
    tone?: 'accent' | 'muted'
  }>(),
  {
    name: '',
    size: 'md',
    tone: 'accent',
  },
)

const initials = computed(() => {
  const parts = (props.name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
})

const box = tv({
  base: 'inline-flex shrink-0 items-center justify-center rounded-lg font-semibold uppercase',
  variants: {
    size: {
      sm: 'size-8 text-xs',
      md: 'size-10 text-sm',
      lg: 'size-16 text-lg rounded-2xl',
    },
    tone: {
      accent: 'bg-accent-soft text-accent',
      muted: 'bg-chip text-muted',
    },
  },
})
</script>

<template>
  <span :class="box({ size, tone })">{{ initials }}</span>
</template>
