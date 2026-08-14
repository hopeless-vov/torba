import type { CompositionSlice } from '@/components/ui/CompositionBar.vue'
import CompositionBar from '@/components/ui/CompositionBar.vue'
import type { BarPoint, BarSeries } from '@/components/ui/TrendBars.vue'
import TrendBars from '@/components/ui/TrendBars.vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

const series: BarSeries[] = [
  { key: 'cost', label: 'Cost', tone: 'neutral' },
  { key: 'profit', label: 'Profit', tone: 'accent' },
]

function point(key: string, cost: number, profit: number): BarPoint {
  return { key, label: key, values: { cost, profit }, total: cost + profit }
}

const money = (n: number) => `${n} UAH`

describe('TrendBars', () => {
  it('scales every segment against the tallest column', () => {
    const wrapper = mount(TrendBars, {
      props: {
        points: [point('jan', 25, 25), point('feb', 50, 50)],
        series,
        formatValue: money,
        emptyText: 'empty',
      },
    })
    const heights = wrapper.findAll('[style*="height"]').map((n) => n.attributes('style'))
    // February totals 100 and sets the scale: its halves are 50% each, and
    // January's equal halves are half of that again.
    expect(heights).toEqual([
      'height: 25%;',
      'height: 25%;',
      'height: 50%;',
      'height: 50%;',
    ])
  })

  // Everything at zero would divide by zero; the chart says so instead.
  it('shows the empty text when there is nothing to plot', () => {
    const wrapper = mount(TrendBars, {
      props: {
        points: [point('jan', 0, 0)],
        series,
        formatValue: money,
        emptyText: 'nothing yet',
      },
    })
    expect(wrapper.text()).toContain('nothing yet')
    expect(wrapper.findAll('[style*="height"]')).toHaveLength(0)
  })

  // A wide date range means many columns; drawing every label would just
  // produce a smear, so only every nth is written out.
  it('thins the axis labels once there are too many columns', () => {
    const many = Array.from({ length: 30 }, (_, i) => point(`d${i}`, 1, 1))
    const wrapper = mount(TrendBars, {
      props: { points: many, series, formatValue: money, emptyText: 'empty' },
    })
    const labels = wrapper.findAll('[data-slot="axis-label"]').map((n) => n.text())
    // One slot per column either way — the axis keeps its shape.
    expect(labels).toHaveLength(30)
    // 30 columns → every 3rd is written, starting at the first.
    expect(labels.filter(Boolean)).toEqual(['d0', 'd3', 'd6', 'd9', 'd12', 'd15', 'd18', 'd21', 'd24', 'd27'])
  })

  it('labels every column while they still fit', () => {
    const few = Array.from({ length: 6 }, (_, i) => point(`m${i}`, 1, 1))
    const wrapper = mount(TrendBars, {
      props: { points: few, series, formatValue: money, emptyText: 'empty' },
    })
    const labels = wrapper.findAll('[data-slot="axis-label"]').map((n) => n.text())
    expect(labels).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5'])
  })

  it('labels both series in the legend, so colour is never the only cue', () => {
    const wrapper = mount(TrendBars, {
      props: { points: [point('jan', 1, 1)], series, formatValue: money, emptyText: 'empty' },
    })
    expect(wrapper.text()).toContain('Cost')
    expect(wrapper.text()).toContain('Profit')
  })
})

describe('CompositionBar', () => {
  const slices: CompositionSlice[] = [
    { key: 'a', label: 'Expired', value: 25, tone: 'neutral' },
    { key: 'b', label: 'Critical', value: 75, tone: 'danger' },
    { key: 'c', label: 'Fresh', value: 0, tone: 'accent' },
  ]

  it('sizes each part by its share and drops the empty ones', () => {
    const wrapper = mount(CompositionBar, {
      props: { slices, formatValue: (n: number) => `${n}`, emptyText: 'empty' },
    })
    const widths = wrapper.findAll('[style*="width"]').map((n) => n.attributes('style'))
    expect(widths).toEqual(['width: 25%;', 'width: 75%;'])
    // The zero slice is gone from the legend too, not just the bar.
    expect(wrapper.text()).not.toContain('Fresh')
  })

  it('reports the share of each part alongside the raw value', () => {
    const wrapper = mount(CompositionBar, {
      props: { slices, formatValue: (n: number) => `${n} pcs`, emptyText: 'empty' },
    })
    expect(wrapper.text()).toContain('25%')
    expect(wrapper.text()).toContain('75 pcs')
  })

  it('falls back to the empty text when every part is zero', () => {
    const wrapper = mount(CompositionBar, {
      props: {
        slices: [{ key: 'a', label: 'Expired', value: 0, tone: 'danger' }],
        formatValue: (n: number) => `${n}`,
        emptyText: 'nothing in stock',
      },
    })
    expect(wrapper.text()).toContain('nothing in stock')
  })
})
