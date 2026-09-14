import { breakLongWords, pdfDefinition, pdfText, tableLayout, textEm } from '@/utils/pdf-export'
import type { ExportTable } from '@/utils/table-export'
import { describe, expect, it } from 'vitest'

// The branded PDF: logo and name on top, the company and date, the table.
const table: ExportTable = {
  title: 'Склад',
  company: 'Моя компанія',
  generatedAt: new Date(2026, 8, 14),
  landscape: true,
  columns: [{ label: 'Товар' }, { label: 'Ціна', align: 'right', format: (n) => `${n} ₴` }],
  rows: [
    ['Крем', 55],
    ['Сироватка', null],
  ],
}
const labels = {
  appName: 'torba',
  generated: 'Сформовано 14.09.2026',
  rowsCount: 'Рядків: 2',
  page: (p: number, n: number) => `${p}/${n}`,
}

type Node = { text: string; svg?: string; alignment?: string }
type Definition = {
  pageOrientation: string
  content: [
    { columns: [Node, Node, { stack: Node[] }] },
    { table: { headerRows: number; body: Node[][] } },
  ]
  footer: (page: number, pages: number) => { columns: Node[] }
}

describe('pdfText', () => {
  // Roboto has no hryvnia glyph; a box would print instead.
  it('writes out currency signs the font cannot draw', () => {
    expect(pdfText('2 047 ₴')).toBe('2 047 грн')
    expect(pdfText('55 $ · 10 €')).toBe('55 $ · 10 €')
  })
})

describe('pdfDefinition', () => {
  const def = pdfDefinition(table, labels, '<svg/>') as unknown as Definition

  it('puts the logo, our name, the title and the company on top', () => {
    const [head] = def.content
    expect(head.columns[0]).toMatchObject({ svg: '<svg/>' })
    expect(head.columns[1].text).toBe('torba')
    const texts = head.columns[2].stack.map((n) => n.text)
    expect(texts[0]).toBe('Склад')
    expect(texts[1]).toBe('Моя компанія')
    expect(texts[2]).toContain('Сформовано 14.09.2026')
  })

  it('lays the table out with a header row and formatted cells', () => {
    const { table: grid } = def.content[1]
    expect(grid.body[0]!.map((c) => c.text)).toEqual(['Товар', 'Ціна'])
    expect(grid.body[1]![1]).toMatchObject({ text: '55 грн', alignment: 'right' })
    expect(grid.body[2]![1]!.text).toBe('—')
    expect(grid.headerRows).toBe(1)
  })

  it('turns wide tables sideways and numbers the pages', () => {
    expect(def.pageOrientation).toBe('landscape')
    expect(def.footer(2, 5).columns[1]!.text).toBe('2/5')
  })
})

describe('fitting a wide table on the page', () => {
  const A4_LANDSCAPE_ROOM = 841.89 - 64

  it('estimates text no narrower than Roboto draws it', () => {
    // Measured against Roboto Medium, in ems.
    expect(textEm('Роздріб постачальника')).toBeGreaterThanOrEqual(11.09)
    expect(textEm('01.09.2026')).toBeGreaterThanOrEqual(5.1)
    expect(textEm('ЖУРНАЛ')).toBeGreaterThanOrEqual(4.32)
  })

  it('stays portrait for a narrow table and fills the width', () => {
    const layout = tableLayout(['Імʼя', 'Телефон'], [['Олена', '+380671112233']], [false, false])
    expect(layout.orientation).toBe('portrait')
    expect(layout.fontSize).toBe(8)
    expect(layout.widths.reduce((a, b) => a + b, 0) + 2 * 10).toBeCloseTo(595.28 - 64, 0)
  })

  it('turns sideways, then shrinks the type, and never runs past the margin', () => {
    const columns = Array.from({ length: 16 }, (_, i) => `Колонка номер ${i + 1}`)
    const row = columns.map((_, i) => (i % 2 ? '12 345 678,00 грн' : 'Дуже довга назва товару з описом і обʼємом'))
    const right = columns.map((_, i) => i % 2 === 1)
    const layout = tableLayout(columns, [row, row], right)

    expect(layout.orientation).toBe('landscape')
    expect(layout.fontSize).toBeLessThan(8)
    expect(layout.widths.reduce((a, b) => a + b, 0) + 10 * columns.length).toBeLessThanOrEqual(A4_LANDSCAPE_ROOM + 0.5)
    // A number column still holds its whole number.
    expect(layout.widths[1]).toBeGreaterThanOrEqual(textEm('12 345 678,00 грн') * layout.fontSize - 0.01)
  })

  it('gives a long word places to break instead of overflowing its cell', () => {
    const long = 'https://example.com/a-very-long-tracking-link-without-spaces-1234567890'
    const broken = breakLongWords(long)
    expect(broken).not.toBe(long)
    expect(broken.replace(/\u200b/g, '')).toBe(long)
    expect(breakLongWords('Коротко і ясно')).toBe('Коротко і ясно')
  })

  it('uses the computed widths in the document', () => {
    const def = pdfDefinition(table, labels, '<svg/>') as unknown as { content: [unknown, { table: { widths: unknown[] } }] }
    expect(def.content[1].table.widths.every((w) => typeof w === 'number')).toBe(true)
  })
})
