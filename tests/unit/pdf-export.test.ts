import { pdfDefinition, pdfText } from '@/utils/pdf-export'
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
