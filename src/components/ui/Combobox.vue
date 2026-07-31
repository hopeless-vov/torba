<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'
import type { SelectOption } from '@/components/ui/Select.vue'
import { onClickOutside, useElementBounding } from '@vueuse/core'
import { AnimatePresence, Motion } from 'motion-v'
import { tv } from 'tailwind-variants'
import { computed, nextTick, ref, useId, watch } from 'vue'

// A Select with a filter box — the same value contract as Select.vue, so
// the two are interchangeable. Reach for this whenever the list is
// user-defined and can grow (clients, brands, categories, products).
const props = withDefaults(
  defineProps<{
    label?: string
    options: SelectOption[]
    placeholder?: string
    searchPlaceholder?: string
    emptyText?: string
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    clearable?: boolean
  }>(),
  {
    label: undefined,
    placeholder: undefined,
    searchPlaceholder: undefined,
    emptyText: undefined,
    size: 'md',
    disabled: false,
    clearable: false,
  },
)

const model = defineModel<string>({ default: '' })
const fieldId = useId()

const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const triggerRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)

const { bottom, left, width } = useElementBounding(triggerRef)
const position = computed(() => ({
  top: `${bottom.value + 4}px`,
  left: `${left.value}px`,
  width: `${width.value}px`,
}))

const selectedLabel = computed(() => props.options.find((o) => o.value === model.value)?.label ?? '')

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.options
  return props.options.filter((o) => o.label.toLowerCase().includes(q))
})

onClickOutside(triggerRef, () => close(), { ignore: [listRef] })

function toggle() {
  if (props.disabled) return
  if (open.value) close()
  else void show()
}

async function show() {
  open.value = true
  query.value = ''
  activeIndex.value = Math.max(
    0,
    props.options.findIndex((o) => o.value === model.value),
  )
  await nextTick()
  searchRef.value?.focus()
}

function close() {
  open.value = false
  query.value = ''
}

function pick(option: SelectOption) {
  model.value = option.value
  close()
}

function clear() {
  model.value = ''
  close()
}

function move(delta: number) {
  const total = results.value.length
  if (total === 0) return
  activeIndex.value = (activeIndex.value + delta + total) % total
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    close()
    return
  }
  if (!open.value && (event.key === 'ArrowDown' || event.key === 'Enter')) {
    event.preventDefault()
    void show()
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const option = results.value[activeIndex.value]
    if (option) pick(option)
  }
}

// Typing narrows the list, so keep the highlight on a row that exists.
watch(results, () => (activeIndex.value = 0))

const trigger = tv({
  base: 'flex w-full items-center gap-2 rounded-lg border bg-bg-2 text-left transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed',
  variants: {
    size: { sm: 'h-8 px-2.5', md: 'h-9 px-3', lg: 'h-11 px-3.5' },
    disabled: { true: 'opacity-55', false: '' },
    open: { true: 'border-accent-line', false: 'border-line hover:border-line-hover' },
  },
})
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1.5">
    <label
      v-if="label"
      :for="fieldId"
      class="text-xs font-medium text-muted"
    >{{ label }}</label>

    <button
      :id="fieldId"
      ref="triggerRef"
      type="button"
      :disabled="disabled"
      :class="trigger({ size, disabled, open })"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span
        class="min-w-0 flex-1 truncate text-sm"
        :class="selectedLabel ? 'text-fg' : 'text-faint'"
      >
        {{ selectedLabel || placeholder || '' }}
      </span>
      <Icon
        v-if="clearable && model"
        icon="fa-solid fa-xmark"
        size="xs"
        class="shrink-0 text-faint transition-colors hover:text-danger"
        @click.stop="clear"
      />
      <Icon
        icon="fa-solid fa-chevron-down"
        size="xs"
        class="shrink-0 text-faint"
      />
    </button>

    <Teleport to="body">
      <AnimatePresence>
        <Motion
          v-if="open"
          ref="listRef"
          class="fixed z-50 overflow-hidden rounded-lg border border-line bg-panel shadow-xl"
          :style="position"
          :initial="{ opacity: 0, y: -4 }"
          :animate="{ opacity: 1, y: 0 }"
          :exit="{ opacity: 0 }"
          :transition="{ duration: 0.12 }"
        >
          <div class="flex items-center gap-2 border-b border-line-soft px-3 py-2">
            <Icon
              icon="fa-solid fa-magnifying-glass"
              size="xs"
              class="text-faint"
            />
            <input
              ref="searchRef"
              v-model="query"
              type="search"
              :placeholder="searchPlaceholder || ''"
              class="h-6 w-full bg-transparent text-sm text-fg placeholder:text-faint focus:outline-none"
              @keydown="onKeydown"
            >
          </div>

          <ul class="max-h-64 overflow-y-auto p-1">
            <li
              v-for="(option, index) in results"
              :key="option.value"
              class="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors"
              :class="[
                index === activeIndex ? 'bg-hover text-fg' : 'text-muted',
                option.value === model && 'text-accent',
              ]"
              @click="pick(option)"
              @mouseenter="activeIndex = index"
            >
              <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
              <Icon
                v-if="option.value === model"
                icon="fa-solid fa-check"
                size="xs"
              />
            </li>
            <li
              v-if="results.length === 0"
              class="px-2.5 py-3 text-center text-sm text-faint"
            >
              {{ emptyText || '' }}
            </li>
          </ul>
        </Motion>
      </AnimatePresence>
    </Teleport>
  </div>
</template>
