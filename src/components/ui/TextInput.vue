<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'
import { tv } from 'tailwind-variants'
import { useId } from 'vue'

withDefaults(
  defineProps<{
    label?: string
    type?: 'text' | 'email' | 'password' | 'tel' | 'search' | 'date'
    placeholder?: string
    iconLeft?: string
    size?: 'md' | 'lg'
    disabled?: boolean
    invalid?: boolean
    autocomplete?: string
  }>(),
  {
    label: undefined,
    type: 'text',
    placeholder: '',
    iconLeft: undefined,
    size: 'md',
    disabled: false,
    invalid: false,
    autocomplete: undefined,
  },
)

const model = defineModel<string>()
const inputId = useId()

defineSlots<{ labelRight?(): unknown }>()

const wrapper = tv({
  base: 'flex items-center gap-2 rounded-lg border bg-bg-2 transition-colors duration-150 focus-within:border-accent-line focus-within:bg-surface',
  variants: {
    size: { md: 'h-9 px-3', lg: 'h-11 px-3.5' },
    disabled: { true: 'opacity-55', false: '' },
    invalid: { true: 'border-danger', false: 'border-line' },
  },
})
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div
      v-if="label || $slots.labelRight"
      class="flex items-center justify-between"
    >
      <label
        :for="inputId"
        class="text-xs font-medium text-muted"
      >{{ label }}</label>
      <slot name="labelRight" />
    </div>

    <div :class="wrapper({ size, disabled, invalid })">
      <Icon
        v-if="iconLeft"
        :icon="iconLeft"
        size="sm"
        class="text-faint"
      />
      <input
        :id="inputId"
        v-model="model"
        :type="type"
        :placeholder="placeholder"
        :disabled="disabled"
        :autocomplete="autocomplete"
        class="h-full w-full bg-transparent text-sm text-fg placeholder:text-faint focus:outline-none disabled:cursor-not-allowed"
      >
    </div>
  </div>
</template>
