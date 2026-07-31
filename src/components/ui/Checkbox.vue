<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'
import { useId } from 'vue'

// `indeterminate` is the "some but not all" state used by table
// select-all headers. It only affects the glyph — the bound value stays
// a plain boolean.
withDefaults(
  defineProps<{
    label?: string
    disabled?: boolean
    indeterminate?: boolean
  }>(),
  {
    label: undefined,
    disabled: false,
    indeterminate: false,
  },
)

const model = defineModel<boolean>({ default: false })
const id = useId()
</script>

<template>
  <label
    :for="id"
    class="inline-flex cursor-pointer items-center gap-2 select-none"
    :class="disabled && 'cursor-not-allowed opacity-55'"
  >
    <span class="relative inline-flex size-4 items-center justify-center">
      <input
        :id="id"
        v-model="model"
        type="checkbox"
        :disabled="disabled"
        class="peer size-4 cursor-pointer appearance-none rounded border border-line-strong bg-bg-2 transition-colors checked:border-accent checked:bg-accent disabled:cursor-not-allowed"
        :class="indeterminate && 'border-accent bg-accent'"
      >
      <Icon
        v-if="indeterminate"
        icon="fa-solid fa-minus"
        class="pointer-events-none absolute text-on-accent"
        size="xs"
      />
      <Icon
        v-else
        icon="fa-solid fa-check"
        class="pointer-events-none absolute text-on-accent opacity-0 peer-checked:opacity-100"
        size="xs"
      />
    </span>
    <span
      v-if="label"
      class="text-sm text-muted"
    >{{ label }}</span>
  </label>
</template>
