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

// ── fitting the table on the page ────────────────────────────
// pdfmake does not shrink a table that is too wide: it runs off the page.
// So the widths are worked out here, from what the cells hold. Each column
// gets at least its longest word (a number, its whole self — it must not
// break), then the room left goes to the columns with the most text, which
// wrap onto more lines instead. When even the minimums do not fit, the page
// turns sideways and then the type gets smaller. A word too long for any
// sensible column is given places to break.

const PAGE_WIDTH = { portrait: 595.28, landscape: 841.89 }
const SIDE_MARGIN = 32
const CELL_PADDING = 10 // 5 pt either side, see the table layout
const FONT_SIZES = [8, 7, 6] as const
/** Past this many ems, a word is broken rather than widen its column further. */
const MAX_WORD_EM = 12
/** Past this many ems, a column's text wraps rather than widen it further. */
const MAX_LINE_EM = 26
/** Measurements are estimates; leave a little room so a cell never overflows. */
const SAFETY = 1.1
const ZWSP = String.fromCharCode(0x200b)

/**
 * About how wide a text is in Roboto, in ems. Measured against the font:
 * capitals and wide Cyrillic letters ~0.9, digits ~0.56, most lowercase ~0.5,
 * a space ~0.25. Bold header text runs ~3% wider, which SAFETY covers.
 */
export function textEm(text: string): number {
  let em = 0
  for (const ch of text) {
    if (ch === ZWSP) continue
    if (/\s/.test(ch)) em += 0.25
    else if (/[ЖШЩЮФЫMW@%]/.test(ch)) em += 0.92
    else if (/[A-ZА-ЯЇІЄҐ]/.test(ch)) em += 0.68
    else if (/[0-9]/.test(ch)) em += 0.57
    else if (/[жшщюфыmw]/.test(ch)) em += 0.75
    else if (/[.,:;'!|ilj·]/.test(ch)) em += 0.25
    else em += 0.52
  }
  return em * SAFETY
}

// A number keeps its non-breaking spaces, so for word width only the
// ordinary space separates words.
const words = (text: string) => text.split(/ +/).filter(Boolean)

/** Break points inside words wider than `maxEm`, so pdfmake can wrap them within the column. */
export function breakLongWords(text: string, maxEm = MAX_WORD_EM): string {
  return text
    .split(' ')
    .map((word) => {
      if (textEm(word) <= maxEm) return word
      let out = ''
      let run = ''
      for (const ch of word) {
        if (run && textEm(run + ch) > maxEm) {
          out += run + ZWSP
          run = ''
        }
        run += ch
      }
      return out + run
    })
    .join(' ')
}

export interface TableLayout {
  orientation: 'portrait' | 'landscape'
  fontSize: number
  widths: number[]
}

export function tableLayout(
  columns: string[],
  rows: string[][],
  rightAligned: boolean[],
  landscape = false,
): TableLayout {
  const longestWordEm = (text: string) => Math.max(0, ...words(text).map((w) => textEm(w)))
  // Ems each column cannot go below, and would take to hold its text on one line.
  const minEm = columns.map((label, i) => {
    const cells = rows.map((r) => r[i] ?? '')
    const word = Math.max(longestWordEm(label), ...cells.map((c) => (rightAligned[i] ? textEm(c) : longestWordEm(c))))
    return Math.max(2, rightAligned[i] ? word : Math.min(word, MAX_WORD_EM))
  })
  const wantEm = columns.map((label, i) =>
    Math.max(minEm[i]!, Math.min(MAX_LINE_EM, Math.max(textEm(label), ...rows.map((r) => textEm(r[i] ?? ''))))),
  )

  const orientations: TableLayout['orientation'][] = landscape ? ['landscape'] : ['portrait', 'landscape']
  const attempts = orientations.flatMap((orientation) => FONT_SIZES.map((fontSize) => ({ orientation, fontSize })))
  const room = (orientation: TableLayout['orientation']) =>
    PAGE_WIDTH[orientation] - 2 * SIDE_MARGIN - CELL_PADDING * columns.length
  const minSumEm = minEm.reduce((a, b) => a + b, 0)
  const { orientation, fontSize } =
    attempts.find((a) => minSumEm * a.fontSize <= room(a.orientation)) ?? attempts[attempts.length - 1]!

  const available = room(orientation)
  const min = minEm.map((em) => em * fontSize)
  const want = wantEm.map((em) => em * fontSize)
  const minSum = min.reduce((a, b) => a + b, 0)
  const wantSum = want.reduce((a, b) => a + b, 0)

  let widths: number[]
  if (minSum > available) {
    // Nothing fits even so. Numbers keep their width — a number cut in two
    // reads as two numbers — and the text columns share what is left,
    // breaking their words to fit.
    const numbers = min.reduce((sum, w, i) => sum + (rightAligned[i] ? w : 0), 0)
    const textMin = minSum - numbers
    const textRoom = available - numbers
    widths =
      textRoom > 2 * fontSize * (columns.length - rightAligned.filter(Boolean).length)
        ? min.map((w, i) => (rightAligned[i] ? w : (w / textMin) * textRoom))
        : min.map((w) => (w / minSum) * available)
  } else if (wantSum <= available) {
    // Everything fits on one line: spread the spare room over the text columns.
    const spare = available - wantSum
    const textSum = want.reduce((sum, w, i) => sum + (rightAligned[i] ? 0 : w), 0)
    widths = want.map((w, i) =>
      textSum > 0 ? w + (rightAligned[i] ? 0 : (w / textSum) * spare) : w + spare / want.length,
    )
  } else {
    // Some text has to wrap: each column its minimum, the rest by how much more it wants.
    const spare = available - minSum
    const extra = want.map((w, i) => w - min[i]!)
    const extraSum = extra.reduce((a, b) => a + b, 0)
    widths = min.map((w, i) => w + (extraSum > 0 ? (extra[i]! / extraSum) * spare : 0))
  }
  return { orientation, fontSize, widths: widths.map((w) => Math.floor(w * 100) / 100) }
}

export function pdfDefinition(table: ExportTable, labels: PdfLabels, logoSvg: string): PdfNode {
  const labelsText = table.columns.map((c) => pdfText(c.label))
  const cellsText = table.rows.map((row) => table.columns.map((column, i) => pdfText(displayCell(row[i] ?? null, column))))
  const rightAligned = table.columns.map((c) => c.align === 'right')
  const layout = tableLayout(labelsText, cellsText, rightAligned, table.landscape)
  // A word wider than its column gets break points at that column's width.
  const fit = (text: string, i: number) => breakLongWords(text, (layout.widths[i] ?? 0) / layout.fontSize)

  const header = labelsText.map((text, i) => ({
    text: fit(text, i),
    style: 'th',
    alignment: rightAligned[i] ? 'right' : 'left',
  }))
  const body = cellsText.map((row) =>
    row.map((text, i) => ({
      text: rightAligned[i] ? text : fit(text, i),
      alignment: rightAligned[i] ? 'right' : 'left',
    })),
  )

  return {
    pageSize: 'A4',
    pageOrientation: layout.orientation,
    pageMargins: [32, 40, 32, 40],
    info: { title: `${table.title} — ${table.company}`, creator: labels.appName, producer: labels.appName },
    defaultStyle: { font: 'Roboto', fontSize: layout.fontSize, color: INK },
    styles: {
      brand: { fontSize: 14, bold: true },
      title: { fontSize: 16, bold: true },
      meta: { fontSize: 9, color: MUTED },
      th: { bold: true, fontSize: layout.fontSize, color: INK },
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
          widths: layout.widths,
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
