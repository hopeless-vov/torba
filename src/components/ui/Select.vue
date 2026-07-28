<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'
import { tv } from 'tailwind-variants'
import { useId } from 'vue'

export interface SelectOption {
  value: string
  label: string
}

withDefaults(
  defineProps<{
    label?: string
    options: SelectOption[]
    placeholder?: string
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
  }>(),
  {
    label: undefined,
    placeholder: undefined,
    size: 'md',
    disabled: false,
  },
)

const model = defineModel<string>()
const selectId = useId()

const wrapper = tv({
  base: 'relative flex items-center rounded-lg border border-line bg-bg-2 transition-colors duration-150 focus-within:border-accent-line',
  variants: {
    size: { sm: 'h-8', md: 'h-9', lg: 'h-11' },
    disabled: { true: 'opacity-55', false: '' },
  },
})
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label
      v-if="label"
      :for="selectId"
      class="text-xs font-medium text-muted"
    >{{ label }}</label>
    <div :class="wrapper({ size, disabled })">
      <select
        :id="selectId"
        v-model="model"
        :disabled="disabled"
        class="h-full w-full cursor-pointer appearance-none truncate bg-transparent pr-9 pl-3 text-sm text-fg focus:outline-none disabled:cursor-not-allowed"
      >
        <option
          v-if="placeholder"
          value=""
          disabled
        >
          {{ placeholder }}
        </option>
        <option
          v-for="opt in options"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </option>
      </select>
      <Icon
        icon="fa-solid fa-chevron-down"
        size="xs"
        class="pointer-events-none absolute right-3 text-faint"
      />
    </div>
  </div>
</template>
