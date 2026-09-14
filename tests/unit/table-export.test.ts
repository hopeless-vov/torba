import { displayCell, exportFileName, toCsv, type ExportTable } from '@/utils/table-export'
import { describe, expect, it } from 'vitest'

// A table leaves the app as a CSV Excel opens as-is, or feeds the PDF.
const table: ExportTable = {
  title: 'Каталог',
  company: 'Моя компанія',
  generatedAt: new Date(2026, 8, 14),
  columns: [
    { label: 'Назва' },
    { label: 'Закупка', align: 'right', decimals: 2, format: (n) => `${n.toFixed(0)} ₴` },
    { label: 'Маржа', align: 'right', csvFormatted: true, format: (n) => `${Math.round(n * 100)}%` },
  ],
  rows: [
    ['Крем; "нічний"', 2047.126, 0.48],
    ['Сироватка', null, null],
  ],
}

describe('toCsv', () => {
  const csv = toCsv(table)

  it('starts with a BOM so Excel reads Cyrillic as UTF-8', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })

  it('separates with ";" and writes decimals with a comma, rounded', () => {
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe('Назва;Закупка;Маржа')
    expect(lines[1]).toBe('"Крем; ""нічний""";2047,13;48%')
    expect(lines[2]).toBe('Сироватка;;')
  })
})

describe('displayCell', () => {
  it('formats numbers through the column, and shows a dash for nothing', () => {
    expect(displayCell(2047, table.columns[1])).toBe('2047 ₴')
    expect(displayCell(null, table.columns[1])).toBe('—')
    expect(displayCell('', undefined)).toBe('—')
    expect(displayCell(5, undefined)).toBe('5')
  })
})

describe('exportFileName', () => {
  it('names what the file is and when', () => {
    expect(exportFileName('torba', 'Каталог', new Date(2026, 8, 4), 'pdf')).toBe('torba-каталог-2026-09-04.pdf')
    expect(exportFileName('torba', 'Звіт: a/b', new Date(2026, 0, 1), 'csv')).toBe('torba-звіт-ab-2026-01-01.csv')
  })
})
