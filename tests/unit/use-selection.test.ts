import { useSelection } from '@/composables/use-selection'
import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'

describe('useSelection', () => {
  it('reports the selection size', () => {
    const rows = ref([{ id: 'a' }, { id: 'b' }])
    const { selected, count, hasSelection } = useSelection(rows)

    expect(hasSelection.value).toBe(false)
    selected.value = ['a', 'b']
    expect(count.value).toBe(2)
    expect(hasSelection.value).toBe(true)
  })

  it('drops keys that leave the visible rows', async () => {
    const rows = ref([{ id: 'a' }, { id: 'b' }])
    const { selected } = useSelection(rows)
    selected.value = ['a', 'b']

    rows.value = [{ id: 'b' }]
    await nextTick()

    expect(selected.value).toEqual(['b'])
  })

  it('leaves an empty selection untouched', async () => {
    const rows = ref([{ id: 'a' }])
    const { selected } = useSelection(rows)

    rows.value = []
    await nextTick()

    expect(selected.value).toEqual([])
  })

  it('clears on demand', () => {
    const rows = ref([{ id: 'a' }])
    const { selected, clear } = useSelection(rows)
    selected.value = ['a']
    clear()
    expect(selected.value).toEqual([])
  })
})
