import type { Column } from '@/components/ui/DataTable.vue'
import DataTable from '@/components/ui/DataTable.vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

// Paging lives inside the table, so these mount it on its own: the rows go in
// whole and the component decides how much of them is on screen.

const columns: Column[] = [{ key: 'name', label: 'Name' }]

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, name: `Row ${i + 1}` }))
}

function table(props: Record<string, unknown>) {
  return mount(DataTable, {
    props: { columns, rows: rows(12), rowKey: 'id', ...props },
  })
}

describe('DataTable paging', () => {
  it('shows one page at a time and walks to the next', async () => {
    const wrapper = table({ pageSize: 5, prevLabel: 'prev', nextLabel: 'next' })

    expect(wrapper.findAll('tbody tr')).toHaveLength(5)
    expect(wrapper.text()).toContain('Row 1')
    expect(wrapper.text()).not.toContain('Row 6')
    // 12 rows over pages of 5: positions, then the page itself.
    expect(wrapper.text()).toContain('1–5 / 12')
    expect(wrapper.text()).toContain('1 / 3')

    await wrapper.find(`[title="next"]`).trigger('click')

    expect(wrapper.text()).toContain('Row 6')
    expect(wrapper.text()).not.toContain('Row 5')
    expect(wrapper.text()).toContain('6–10 / 12')
  })

  // The last page is short; the range has to say so rather than run past the
  // end of the list.
  it('stops the range at the last row', async () => {
    const wrapper = table({ pageSize: 5, prevLabel: 'prev', nextLabel: 'next' })
    const next = wrapper.find(`[title="next"]`)
    await next.trigger('click')
    await next.trigger('click')

    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(wrapper.text()).toContain('11–12 / 12')
    expect((next.element as HTMLButtonElement).disabled).toBe(true)
  })

  // Nothing to say while it all fits — the pager would be a control that
  // cannot do anything.
  it('leaves the pager out when everything fits on one page', () => {
    const wrapper = table({ pageSize: 50, prevLabel: 'prev', nextLabel: 'next' })
    expect(wrapper.find('[data-slot="pagination"]').exists()).toBe(false)
    expect(wrapper.findAll('tbody tr')).toHaveLength(12)
  })

  it('puts every row on one page when no page size is given', () => {
    const wrapper = table({})
    expect(wrapper.findAll('tbody tr')).toHaveLength(12)
    expect(wrapper.find('[data-slot="pagination"]').exists()).toBe(false)
  })

  // Select-all is about what the user is looking at. Ticking rows they have
  // not seen would let the bulk bar act on more than it says.
  it('selects only the current page', async () => {
    const wrapper = table({ pageSize: 5, selectable: true, prevLabel: 'prev', nextLabel: 'next' })

    await wrapper.find('thead input[type="checkbox"]').setValue(true)
    expect(wrapper.emitted('update:selected')?.at(-1)?.[0]).toEqual(['r1', 'r2', 'r3', 'r4', 'r5'])
  })

  // A filter that leaves fewer rows than the page the user was on must not
  // strand them on an empty page.
  it('falls back to the last page when the rows shrink', async () => {
    const wrapper = table({ pageSize: 5, prevLabel: 'prev', nextLabel: 'next' })
    await wrapper.find(`[title="next"]`).trigger('click')
    await wrapper.find(`[title="next"]`).trigger('click')
    expect(wrapper.text()).toContain('3 / 3')

    await wrapper.setProps({ rows: rows(4) })

    expect(wrapper.findAll('tbody tr')).toHaveLength(4)
    expect(wrapper.find('[data-slot="pagination"]').exists()).toBe(false)
  })
})

describe('DataTable height cap', () => {
  it('scrolls inside itself and sticks the header once capped', () => {
    const wrapper = table({ maxHeight: '20rem' })
    const scroller = wrapper.find('table').element.parentElement as HTMLElement

    expect(scroller.style.maxHeight).toBe('20rem')
    expect(scroller.className).toContain('overflow-y-auto')
    expect(wrapper.find('thead').classes()).toContain('sticky')
  })

  it('grows with its rows when uncapped', () => {
    const wrapper = table({})
    const scroller = wrapper.find('table').element.parentElement as HTMLElement

    expect(scroller.style.maxHeight).toBe('')
    expect(wrapper.find('thead').classes()).not.toContain('sticky')
  })
})
