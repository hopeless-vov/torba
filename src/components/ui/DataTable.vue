<script setup lang="ts" generic="T extends Record<string, any>">
import Checkbox from '@/components/ui/Checkbox.vue'
import Icon from '@/components/ui/Icon.vue'
import { tv } from 'tailwind-variants'
import { computed } from 'vue'

export interface Column {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  width?: string
  mono?: boolean
  /** Shown as a native tooltip on the header — use it to explain a column. */
  hint?: string
}

const props = withDefaults(
  defineProps<{
    columns: Column[]
    rows: T[]
    rowKey?: string
    clickable?: boolean
    loading?: boolean
    /** Adds a leading checkbox column plus a select-all header checkbox. */
    selectable?: boolean
    /** Adds a leading chevron column that reveals the `expanded` slot. */
    expandable?: boolean
  }>(),
  {
    rowKey: 'id',
    clickable: false,
    loading: false,
    selectable: false,
    expandable: false,
  },
)

const emit = defineEmits<{ rowClick: [row: T] }>()

const selected = defineModel<string[]>('selected', { default: () => [] })
const expanded = defineModel<string[]>('expanded', { default: () => [] })

defineSlots<{
  empty?(): unknown
  expanded?(props: { row: T }): unknown
  [key: `cell-${string}`]: (props: { row: T; value: unknown }) => unknown
  [key: `head-${string}`]: (props: { column: Column }) => unknown
}>()

function keyOf(row: T) {
  return String(row[props.rowKey])
}

const visibleKeys = computed(() => props.rows.map(keyOf))
const allSelected = computed(
  () => props.rows.length > 0 && visibleKeys.value.every((k) => selected.value.includes(k)),
)
const someSelected = computed(() => selected.value.length > 0 && !allSelected.value)

const totalColumns = computed(
  () => props.columns.length + (props.selectable ? 1 : 0) + (props.expandable ? 1 : 0),
)

function toggleAll() {
  if (allSelected.value) {
    selected.value = selected.value.filter((k) => !visibleKeys.value.includes(k))
  } else {
    selected.value = [...new Set([...selected.value, ...visibleKeys.value])]
  }
}

function toggleRow(row: T) {
  const key = keyOf(row)
  selected.value = selected.value.includes(key)
    ? selected.value.filter((k) => k !== key)
    : [...selected.value, key]
}

function toggleExpanded(row: T) {
  const key = keyOf(row)
  expanded.value = expanded.value.includes(key)
    ? expanded.value.filter((k) => k !== key)
    : [...expanded.value, key]
}

const cell = tv({
  base: 'px-4 py-3 text-sm align-middle',
  variants: {
    align: { left: 'text-left', right: 'text-right', center: 'text-center' },
  },
})
</script>

<template>
  <div class="w-full overflow-x-auto">
    <table class="w-full border-collapse">
      <thead>
        <tr class="border-b border-line-soft">
          <th
            v-if="selectable"
            class="w-10 px-4 py-2.5"
          >
            <Checkbox
              :model-value="allSelected"
              :indeterminate="someSelected"
              @update:model-value="toggleAll"
            />
          </th>
          <th
            v-if="expandable"
            class="w-8 px-2 py-2.5"
          />
          <th
            v-for="col in columns"
            :key="col.key"
            :style="col.width ? { width: col.width } : undefined"
            :title="col.hint"
            class="px-4 py-2.5 text-xs font-medium tracking-wide text-faint uppercase"
            :class="[
              col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
            ]"
          >
            <slot
              :name="`head-${col.key}`"
              :column="col"
            >
              <span class="inline-flex items-center gap-1.5">
                {{ col.label }}
                <Icon
                  v-if="col.hint"
                  icon="fa-solid fa-circle-info"
                  size="xs"
                  class="text-faint/70"
                />
              </span>
            </slot>
          </th>
        </tr>
      </thead>

      <tbody v-if="loading && rows.length === 0">
        <tr
          v-for="n in 6"
          :key="`skeleton-${n}`"
          class="border-b border-line-soft last:border-0"
        >
          <td
            v-for="i in totalColumns"
            :key="i"
            class="px-4 py-3"
          >
            <span class="block h-3.5 w-2/3 animate-pulse rounded bg-hover" />
          </td>
        </tr>
      </tbody>

      <tbody v-else>
        <template
          v-for="row in rows"
          :key="String(row[rowKey])"
        >
          <tr
            class="border-b border-line-soft transition-colors duration-100"
            :class="[
              clickable && 'cursor-pointer hover:bg-row-hover',
              selected.includes(String(row[rowKey])) && 'bg-accent-soft/40',
              expanded.includes(String(row[rowKey])) ? 'border-transparent' : 'last:border-0',
            ]"
            @click="clickable && emit('rowClick', row)"
          >
            <td
              v-if="selectable"
              class="px-4 py-3"
              @click.stop
            >
              <Checkbox
                :model-value="selected.includes(String(row[rowKey]))"
                @update:model-value="toggleRow(row)"
              />
            </td>
            <td
              v-if="expandable"
              class="px-2 py-3"
              @click.stop
            >
              <button
                type="button"
                class="flex size-6 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-fg"
                @click="toggleExpanded(row)"
              >
                <Icon
                  :icon="
                    expanded.includes(String(row[rowKey]))
                      ? 'fa-solid fa-chevron-down'
                      : 'fa-solid fa-chevron-right'
                  "
                  size="xs"
                />
              </button>
            </td>
            <td
              v-for="col in columns"
              :key="col.key"
              :class="[cell({ align: col.align ?? 'left' }), col.mono && 'font-mono tabular-nums']"
            >
              <slot
                :name="`cell-${col.key}`"
                :row="row"
                :value="row[col.key]"
              >
                {{ row[col.key] }}
              </slot>
            </td>
          </tr>
          <tr
            v-if="expandable && expanded.includes(String(row[rowKey]))"
            class="border-b border-line-soft last:border-0"
          >
            <td
              :colspan="totalColumns"
              class="bg-bg-2/60 px-4 pt-0 pb-3"
            >
              <slot
                name="expanded"
                :row="row"
              />
            </td>
          </tr>
        </template>
      </tbody>
    </table>

    <slot
      v-if="rows.length === 0 && !loading"
      name="empty"
    />
  </div>
</template>
