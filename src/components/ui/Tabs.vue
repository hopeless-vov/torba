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
  <div class="inline-flex items-center gap-1 rounded-lg border border-line bg-bg-2 p-1">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      class="inline-flex items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer"
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
