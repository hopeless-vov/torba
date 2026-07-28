<script setup lang="ts">
import { tv } from 'tailwind-variants'

withDefaults(
  defineProps<{
    label: string
    value: string
    hint?: string
    tone?: 'default' | 'accent' | 'danger' | 'warn'
  }>(),
  {
    hint: undefined,
    tone: 'default',
  },
)

const valueClass = tv({
  base: 'font-mono text-3xl font-semibold tracking-tight tabular-nums',
  variants: {
    tone: {
      default: 'text-fg',
      accent: 'text-accent',
      danger: 'text-danger',
      warn: 'text-warn',
    },
  },
})
</script>

<template>
  <div class="flex flex-col gap-2 rounded-xl border border-line bg-panel p-5">
    <span class="text-sm text-muted">{{ label }}</span>
    <span :class="valueClass({ tone })">{{ value }}</span>
    <span
      v-if="hint"
      class="text-xs text-faint"
    >{{ hint }}</span>
  </div>
</template>
