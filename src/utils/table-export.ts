// A table as it leaves the app: a title, the columns, and rows of plain
// values. The same table becomes a CSV (for Excel, or to import somewhere
// else) or a branded PDF (see pdf-export) — the screens build it once from
// what they are showing, filters included.

export type ExportCell = string | number | null

export interface ExportColumn {
  label: string
  align?: 'left' | 'right'
  /** How a number is written in the PDF; the CSV keeps the bare number. */
  format?: (value: number) => string
  /** Round the CSV's number to this many decimals (money: 2). */
  decimals?: number
  /** Write the formatted text into the CSV too — a percent Excel still reads as one. */
  csvFormatted?: boolean
}

export interface ExportTable {
  /** "Каталог", "Склад"… — also names the file. */
  title: string
  company: string
  generatedAt: Date
  columns: ExportColumn[]
  rows: ExportCell[][]
  /** Force landscape. Otherwise the PDF turns sideways only when the table needs it. */
  landscape?: boolean
}

// Excel set to Ukrainian reads ";" as the column separator and "," as the
// decimal one; the BOM tells it the file is UTF-8, so Cyrillic survives.
const SEPARATOR = ';'
const BOM = String.fromCharCode(0xfeff)

function csvValue(cell: ExportCell, column?: ExportColumn): string {
  if (cell == null) return ''
  let text: string
  if (typeof cell !== 'number') text = cell
  else if (column?.csvFormatted && column.format) text = column.format(cell)
  else {
    const n = column?.decimals == null ? cell : Number(cell.toFixed(column.decimals))
    text = String(n).replace('.', ',')
  }
  return /[";\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(table: ExportTable): string {
  const lines = [
    table.columns.map((c) => csvValue(c.label)),
    ...table.rows.map((row) => table.columns.map((column, i) => csvValue(row[i] ?? null, column))),
  ]
  return BOM + lines.map((cells) => cells.join(SEPARATOR)).join('\r\n') + '\r\n'
}

/** A cell as the PDF prints it: numbers through their column's format. */
export function displayCell(cell: ExportCell, column: ExportColumn | undefined): string {
  if (cell == null || cell === '') return '—'
  if (typeof cell === 'number') return column?.format ? column.format(cell) : String(cell)
  return cell
}

function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** "torba-каталог-2026-09-14.pdf": what it is and when, safe on every OS. */
export function exportFileName(appName: string, title: string, date: Date, extension: 'csv' | 'pdf'): string {
  const slug = (text: string) =>
    text
      .toLowerCase()
      .replace(/[\\/:*?"<>|]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
  return `${[slug(appName), slug(title), isoDate(date)].filter(Boolean).join('-')}.${extension}`
}

/** Hand a file to the browser to save. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
