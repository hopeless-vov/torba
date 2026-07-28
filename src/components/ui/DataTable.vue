<script setup lang="ts" generic="T extends Record<string, any>">
import { tv } from 'tailwind-variants'

export interface Column {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  width?: string
  mono?: boolean
}

withDefaults(
  defineProps<{
    columns: Column[]
    rows: T[]
    rowKey?: string
    clickable?: boolean
  }>(),
  {
    rowKey: 'id',
    clickable: false,
  },
)

const emit = defineEmits<{ rowClick: [row: T] }>()

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
            v-for="col in columns"
            :key="col.key"
            :style="col.width ? { width: col.width } : undefined"
            class="px-4 py-2.5 text-xs font-medium tracking-wide text-faint uppercase"
            :class="[
              col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
            ]"
          >
            <slot
              :name="`head-${col.key}`"
              :column="col"
            >
              {{ col.label }}
            </slot>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="String(row[rowKey])"
          class="border-b border-line-soft last:border-0 transition-colors duration-100"
          :class="clickable && 'cursor-pointer hover:bg-row-hover'"
          @click="clickable && emit('rowClick', row)"
        >
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
      </tbody>
    </table>
    <slot
      v-if="rows.length === 0"
      name="empty"
    />
  </div>
</template>
