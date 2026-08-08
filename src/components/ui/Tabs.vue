<script setup lang="ts">
export interface Tab {
  value: string
  label: string
  count?: number
}

withDefaults(
  defineProps<{
    tabs: Tab[]
    size?: 'sm' | 'md'
  }>(),
  {
    size: 'md',
  },
)

const model = defineModel<string>({ required: true })
</script>

<template>
  <!-- max-w-full + horizontal scroll: a long tab strip (order/batch statuses)
       would otherwise be clipped on a phone, leaving the last tab unreachable. -->
  <div
    class="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-line bg-bg-2 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  >
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      class="inline-flex shrink-0 items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer"
      :class="[
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
        model === tab.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
      ]"
      @click="model = tab.value"
    >
      {{ tab.label }}
      <span
        v-if="tab.count !== undefined"
        class="tabular-nums"
        :class="model === tab.value ? 'text-muted' : 'text-faint'"
      >{{ tab.count }}</span>
    </button>
  </div>
</template>
