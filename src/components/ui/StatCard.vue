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
  // Smaller on phones: at 30px a figure like "2 258 ₴" wrapped onto a second
  // line inside the 2-up KPI grid.
  base: 'font-mono text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl',
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
