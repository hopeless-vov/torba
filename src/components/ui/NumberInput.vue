<script setup lang="ts">
import { tv } from 'tailwind-variants'
import { computed, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    label?: string
    min?: number
    max?: number
    step?: number
    suffix?: string
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    align?: 'left' | 'right'
  }>(),
  {
    label: undefined,
    min: undefined,
    max: undefined,
    step: 1,
    suffix: undefined,
    size: 'md',
    disabled: false,
    align: 'left',
  },
)

const model = defineModel<number>()
const inputId = useId()

const wrapper = tv({
  base: 'flex items-center gap-1.5 rounded-lg border border-line bg-bg-2 transition-colors duration-150 focus-within:border-accent-line focus-within:bg-surface',
  variants: {
    size: { sm: 'h-8 px-2.5', md: 'h-9 px-3', lg: 'h-11 px-3.5' },
    disabled: { true: 'opacity-55', false: '' },
  },
})

const inputClass = computed(
  () =>
    `h-full w-full bg-transparent text-sm text-fg tabular-nums placeholder:text-faint focus:outline-none ${
      props.align === 'right' ? 'text-right' : ''
    }`,
)
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label
      v-if="label"
      :for="inputId"
      class="text-xs font-medium text-muted"
    >{{ label }}</label>
    <div :class="wrapper({ size, disabled })">
      <input
        :id="inputId"
        v-model.number="model"
        type="number"
        inputmode="decimal"
        :min="min"
        :max="max"
        :step="step"
        :disabled="disabled"
        :class="inputClass"
      >
      <span
        v-if="suffix"
        class="shrink-0 text-sm text-faint"
      >{{ suffix }}</span>
    </div>
  </div>
</template>
