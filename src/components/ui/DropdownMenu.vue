<script setup lang="ts" generic="V extends string">
import Icon from '@/components/ui/Icon.vue'
import { onClickOutside, useElementBounding } from '@vueuse/core'
import { AnimatePresence, Motion } from 'motion-v'
import { computed, ref } from 'vue'

export interface MenuItem<V extends string = string> {
  value: V
  label: string
  icon?: string
  danger?: boolean
}

const props = defineProps<{
  items: MenuItem<V>[]
}>()

const emit = defineEmits<{ select: [value: V] }>()

const triggerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const open = ref(false)

const { top, right, bottom } = useElementBounding(triggerRef)
const position = computed(() => ({
  top: `${bottom.value + 4}px`,
  right: `${window.innerWidth - right.value}px`,
}))

onClickOutside(triggerRef, () => (open.value = false), { ignore: [menuRef] })

function pick(item: MenuItem<V>) {
  open.value = false
  emit('select', item.value)
}

// referenced to keep `top` reactive dependency explicit for the linter
void top
void props
</script>

<template>
  <span
    ref="triggerRef"
    class="inline-flex"
    @click="open = !open"
  >
    <slot>
      <button
        type="button"
        class="flex size-8 cursor-pointer items-center justify-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-fg"
      >
        <Icon icon="fa-solid fa-ellipsis" />
      </button>
    </slot>
  </span>

  <Teleport to="body">
    <AnimatePresence>
      <Motion
        v-if="open"
        ref="menuRef"
        class="fixed z-50 min-w-44 overflow-hidden rounded-lg border border-line bg-panel p-1 shadow-xl"
        :style="position"
        :initial="{ opacity: 0, scale: 0.96, y: -4 }"
        :animate="{ opacity: 1, scale: 1, y: 0 }"
        :exit="{ opacity: 0, scale: 0.96 }"
        :transition="{ duration: 0.12 }"
      >
        <button
          v-for="item in items"
          :key="item.value"
          type="button"
          class="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-hover"
          :class="item.danger ? 'text-danger' : 'text-fg'"
          @click="pick(item)"
        >
          <Icon
            v-if="item.icon"
            :icon="item.icon"
            size="sm"
            class="text-faint"
          />
          {{ item.label }}
        </button>
      </Motion>
    </AnimatePresence>
  </Teleport>
</template>
