import { displayCell, type ExportTable } from '@/utils/table-export'

// The PDF version of an exported table: our logo and name at the top, the
// company and the date it was made, the table, and page numbers. pdfmake
// (with the Roboto font it ships, Cyrillic included) is loaded only when a
// PDF is actually asked for, so it costs the app nothing until then.

export interface PdfLabels {
  appName: string
  /** "Сформовано 14.09.2026 13:40" */
  generated: string
  /** "Сторінка {page} з {pages}" */
  page: (page: number, pages: number) => string
  /** "{count} рядків" */
  rowsCount: string
}

// Roboto has no glyph for a few currency signs — the hryvnia among them — and
// would print an empty box. Those are written out instead.
const MISSING_GLYPHS: Record<string, string> = {
  '₴': 'грн',
  '₸': 'KZT',
  '₾': 'GEL',
  '฿': 'THB',
  '₵': 'GHS',
  '₲': 'PYG',
  '₭': 'LAK',
  '₮': 'MNT',
  '₡': 'CRC',
  '₿': 'BTC',
}
const MISSING_RE = new RegExp(`[${Object.keys(MISSING_GLYPHS).join('')}]`, 'g')

export function pdfText(text: string): string {
  return text.replace(MISSING_RE, (ch) => MISSING_GLYPHS[ch] ?? ch)
}

// Brand colours of the printed page. A PDF is a document, not the app's
// themed UI, so these are fixed rather than theme tokens.
const INK = '#0B1F16'
const MUTED = '#6B7280'
const LINE = '#E5E7EB'
const HEAD_FILL = '#F3F4F6'
const ZEBRA_FILL = '#FAFAFA'

type PdfNode = Record<string, unknown>

export function pdfDefinition(table: ExportTable, labels: PdfLabels, logoSvg: string): PdfNode {
  const header = table.columns.map((c) => ({
    text: pdfText(c.label),
    style: 'th',
    alignment: c.align === 'right' ? 'right' : 'left',
  }))
  const body = table.rows.map((row) =>
    table.columns.map((column, i) => ({
      text: pdfText(displayCell(row[i] ?? null, column)),
      alignment: column.align === 'right' ? 'right' : 'left',
      noWrap: column.align === 'right',
    })),
  )

  return {
    pageSize: 'A4',
    pageOrientation: table.landscape ? 'landscape' : 'portrait',
    pageMargins: [32, 40, 32, 40],
    info: { title: `${table.title} — ${table.company}`, creator: labels.appName, producer: labels.appName },
    defaultStyle: { font: 'Roboto', fontSize: 8, color: INK },
    styles: {
      brand: { fontSize: 14, bold: true },
      title: { fontSize: 16, bold: true },
      meta: { fontSize: 9, color: MUTED },
      th: { bold: true, fontSize: 8, color: INK },
    },
    content: [
      {
        columns: [
          { svg: logoSvg, width: 28, height: 28 },
          { text: labels.appName, style: 'brand', margin: [8, 6, 0, 0], width: 'auto' },
          {
            stack: [
              { text: pdfText(table.title), style: 'title', alignment: 'right' },
              { text: pdfText(table.company), style: 'meta', alignment: 'right' },
              { text: `${labels.generated} · ${labels.rowsCount}`, style: 'meta', alignment: 'right' },
            ],
          },
        ],
        margin: [0, 0, 0, 16],
      },
      {
        table: {
          headerRows: 1,
          widths: table.columns.map((c) => (c.align === 'right' ? 'auto' : '*')),
          body: [header, ...body],
        },
        layout: {
          hLineWidth: (i: number) => (i === 1 ? 0.8 : 0.4),
          vLineWidth: () => 0,
          hLineColor: () => LINE,
          fillColor: (row: number) => (row === 0 ? HEAD_FILL : row % 2 === 0 ? ZEBRA_FILL : null),
          paddingTop: () => 4,
          paddingBottom: () => 4,
          paddingLeft: () => 5,
          paddingRight: () => 5,
        },
      },
    ],
    footer: (page: number, pages: number) => ({
      columns: [
        { text: labels.appName, style: 'meta' },
        { text: labels.page(page, pages), style: 'meta', alignment: 'right' },
      ],
      margin: [32, 12, 32, 0],
    }),
  }
}

export async function createPdfBlob(table: ExportTable, labels: PdfLabels, logoSvg: string): Promise<Blob> {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ])
  pdfMake.addVirtualFileSystem(fonts)
  return pdfMake.createPdf(pdfDefinition(table, labels, logoSvg)).getBlob()
}
