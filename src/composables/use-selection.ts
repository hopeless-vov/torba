import { computed, type Ref, ref, watch } from 'vue'

/**
 * Bulk-selection state for a DataTable. Keys that leave the visible rows
 * (a filter change, a delete) are dropped, so the bulk bar can never act
 * on something the user can no longer see.
 */
export function useSelection(rows: Ref<{ id: string }[]>) {
  const selected = ref<string[]>([])

  const count = computed(() => selected.value.length)
  const hasSelection = computed(() => count.value > 0)

  watch(rows, (next) => {
    if (selected.value.length === 0) return
    const visible = new Set(next.map((r) => r.id))
    const kept = selected.value.filter((id) => visible.has(id))
    if (kept.length !== selected.value.length) selected.value = kept
  })

  function clear() {
    selected.value = []
  }

  return { selected, count, hasSelection, clear }
}
