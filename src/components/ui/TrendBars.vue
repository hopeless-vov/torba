<script setup lang="ts">
import { computed } from 'vue'

// Stacked bars over a time axis: each column is one period, split into the
// series that make up its total. One scale, one axis — the segments share a
// unit, so their heights are directly comparable.
export type BarTone = 'accent' | 'warn' | 'danger' | 'info' | 'violet' | 'neutral'

export interface BarSeries {
  key: string
  label: string
  tone: BarTone
}

export interface BarPoint {
  key: string
  label: string
  /** Keyed by series key; missing entries count as zero. */
  values: Record<string, number>
  total: number
}

const props = defineProps<{
  points: BarPoint[]
  series: BarSeries[]
  formatValue: (value: number) => string
  emptyText: string
}>()

// Colours come from the theme tokens so the chart flips with the rest of the
// interface; the series carry identity, the text stays in ink colours.
const FILL: Record<BarTone, string> = {
  accent: 'bg-accent',
  warn: 'bg-warn',
  danger: 'bg-danger',
  info: 'bg-info',
  violet: 'bg-violet',
  neutral: 'bg-faint',
}

const max = computed(() => Math.max(...props.points.map((p) => p.total), 0))
const isEmpty = computed(() => max.value <= 0)

/** Height of one segment as a percentage of the tallest column. */
function heightOf(value: number) {
  if (max.value <= 0 || value <= 0) return '0%'
  return `${(value / max.value) * 100}%`
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Two series or more always carry a legend: identity is never colour
         alone. -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <span
        v-for="s in series"
        :key="s.key"
        class="flex items-center gap-1.5 text-xs text-muted"
      >
        <span
          class="size-2 shrink-0 rounded-full"
          :class="FILL[s.tone]"
        />
        {{ s.label }}
      </span>
    </div>

    <p
      v-if="isEmpty"
      class="py-10 text-center text-sm text-faint"
    >
      {{ emptyText }}
    </p>

    <div
      v-else
      class="flex h-44 items-end gap-2 sm:gap-3"
    >
      <div
        v-for="point in points"
        :key="point.key"
        class="group relative flex h-full min-w-0 flex-1 flex-col justify-end gap-2"
      >
        <!-- Reversed column so the stack grows from the baseline up. -->
        <div class="flex min-h-0 flex-1 flex-col-reverse justify-start gap-0.5">
          <div
            v-for="(s, i) in series"
            :key="s.key"
            class="w-full shrink-0 transition-[height] duration-200"
            :class="[FILL[s.tone], i === series.length - 1 ? 'rounded-t' : '']"
            :style="{ height: heightOf(point.values[s.key] ?? 0) }"
          />
        </div>

        <span class="shrink-0 truncate text-center text-xs text-faint">{{ point.label }}</span>

        <!-- Hover detail. Pointer-events off so it never eats the hover that
             produced it. -->
        <div
          class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 flex-col gap-1 rounded-lg border border-line bg-panel px-3 py-2 shadow-xl group-hover:flex"
        >
          <span class="text-xs font-medium whitespace-nowrap text-fg">{{ point.label }}</span>
          <span
            v-for="s in series"
            :key="s.key"
            class="flex items-center gap-2 text-xs whitespace-nowrap text-muted"
          >
            <span
              class="size-2 shrink-0 rounded-full"
              :class="FILL[s.tone]"
            />
            {{ s.label }}
            <span class="ml-auto font-mono text-fg tabular-nums">
              {{ formatValue(point.values[s.key] ?? 0) }}
            </span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
