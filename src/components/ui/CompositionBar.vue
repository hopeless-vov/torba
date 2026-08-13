<script setup lang="ts">
import type { BarTone } from '@/components/ui/TrendBars.vue'
import { computed } from 'vue'

// One whole, split into its parts: a single horizontal bar plus a legend that
// carries the numbers. The legend is what makes it readable — the colours only
// group the rows, they never have to be told apart on their own.
export interface CompositionSlice {
  key: string
  label: string
  value: number
  tone: BarTone
}

const props = defineProps<{
  slices: CompositionSlice[]
  formatValue: (value: number) => string
  emptyText: string
}>()

const FILL: Record<BarTone, string> = {
  accent: 'bg-accent',
  warn: 'bg-warn',
  danger: 'bg-danger',
  info: 'bg-info',
  violet: 'bg-violet',
  neutral: 'bg-faint',
}

const total = computed(() => props.slices.reduce((sum, s) => sum + s.value, 0))
// An empty slice would render as a zero-width sliver and an orphan legend row.
const visible = computed(() => props.slices.filter((s) => s.value > 0))

function share(value: number) {
  return total.value > 0 ? value / total.value : 0
}

function percentLabel(value: number) {
  const pct = share(value) * 100
  return `${pct < 1 ? pct.toFixed(1) : Math.round(pct)}%`
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p
      v-if="visible.length === 0"
      class="py-10 text-center text-sm text-faint"
    >
      {{ emptyText }}
    </p>

    <template v-else>
      <div class="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        <span
          v-for="slice in visible"
          :key="slice.key"
          class="h-full first:rounded-l-full last:rounded-r-full"
          :class="FILL[slice.tone]"
          :style="{ width: `${share(slice.value) * 100}%` }"
          :title="`${slice.label} · ${formatValue(slice.value)}`"
        />
      </div>

      <ul class="flex flex-col gap-2">
        <li
          v-for="slice in visible"
          :key="slice.key"
          class="flex items-center gap-2 text-sm"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            :class="FILL[slice.tone]"
          />
          <span class="min-w-0 flex-1 truncate text-muted">{{ slice.label }}</span>
          <span class="shrink-0 font-mono text-xs text-faint tabular-nums">{{ percentLabel(slice.value) }}</span>
          <span class="w-20 shrink-0 text-right font-mono text-fg tabular-nums">
            {{ formatValue(slice.value) }}
          </span>
        </li>
      </ul>
    </template>
  </div>
</template>
