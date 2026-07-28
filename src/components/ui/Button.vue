<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'
import { tv } from 'tailwind-variants'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    icon?: string
    iconRight?: string
    block?: boolean
    pill?: boolean
    active?: boolean
    loading?: boolean
    disabled?: boolean
    type?: 'button' | 'submit'
  }>(),
  {
    variant: 'secondary',
    size: 'md',
    icon: undefined,
    iconRight: undefined,
    block: false,
    pill: false,
    active: false,
    loading: false,
    disabled: false,
    type: 'button',
  },
)

const slots = defineSlots<{ default?(): unknown }>()

const iconOnly = computed(() => !slots.default && (!!props.icon || !!props.iconRight))

const button = tv({
  base: 'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-accent-line disabled:cursor-not-allowed disabled:opacity-55',
  variants: {
    variant: {
      primary: 'bg-accent text-on-accent hover:bg-accent-hover active:brightness-95',
      secondary: 'border border-line bg-surface text-fg hover:border-line-hover hover:bg-row-hover',
      ghost: 'bg-transparent text-muted hover:bg-hover hover:text-fg',
      danger: 'bg-danger-soft text-danger hover:brightness-110 border border-transparent',
    },
    size: {
      sm: 'h-8 text-xs rounded-md',
      md: 'h-9 text-sm rounded-lg',
      lg: 'h-11 text-sm rounded-lg',
    },
    block: { true: 'w-full', false: '' },
    pill: { true: 'rounded-full', false: '' },
    active: { true: '', false: '' },
    iconOnly: { true: 'aspect-square p-0', false: '' },
  },
  compoundVariants: [
    { iconOnly: false, size: 'sm', class: 'px-3' },
    { iconOnly: false, size: 'md', class: 'px-4' },
    { iconOnly: false, size: 'lg', class: 'px-5' },
    { active: true, variant: 'secondary', class: 'border-accent-line bg-accent-soft text-fg' },
    { active: true, variant: 'ghost', class: 'bg-accent-soft text-accent' },
  ],
})

const classes = computed(() =>
  button({
    variant: props.variant,
    size: props.size,
    block: props.block,
    pill: props.pill,
    active: props.active,
    iconOnly: iconOnly.value,
  }),
)
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="classes"
  >
    <Icon
      v-if="loading"
      icon="fa-solid fa-circle-notch"
      class="animate-spin"
      size="sm"
    />
    <Icon
      v-else-if="icon"
      :icon="icon"
      size="sm"
    />
    <slot />
    <Icon
      v-if="iconRight && !loading"
      :icon="iconRight"
      size="sm"
    />
  </button>
</template>
