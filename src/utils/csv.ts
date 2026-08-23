import Papa from 'papaparse'

// Reads a supplier price list. The file itself may be almost anything a
// spreadsheet exports — comma, semicolon or tab separated, UTF-8 or the
// windows-1251 that Excel still writes on a Ukrainian machine — so nothing
// here assumes a delimiter or an encoding.
//
// What genuinely cannot be known is which column means what. That is guessed
// from the header words, but only ever *offered*: the import step shows the
// guess as a mapping the user can correct before a single row is written.

export interface ParsedProduct {
  sku: string
  name: string
  volume: string | null
  category: string | null
  priceUsd: number
  retailUsd: number | null
}

export interface ParsedPriceList {
  rate: number | null
  products: ParsedProduct[]
  skipped: number
}

/** The fields of ours a column of the file can fill. */
export const CSV_FIELDS = ['sku', 'name', 'volume', 'cost', 'retail', 'category'] as const
export type CsvField = (typeof CSV_FIELDS)[number]

/** Which column feeds which field; `null` — the file does not carry it. */
export type CsvMapping = Record<CsvField, number | null>

export interface CsvTable {
  rows: string[][]
  /** Index of the header row, or -1 when the file starts straight with data. */
  headerRow: number
  /** The header row's cells, empty when there is no header. */
  headers: string[]
  /** Widest row in the file — how many columns the mapping may choose from. */
  columns: number
  /** The supplier rate, when the file states one ("Курс: 44,50 ₴"). */
  rate: number | null
}

const EMPTY_VOLUMES = new Set(['-', '—', ''])

// Header words we recognise. Order matters twice over: a column is claimed by
// the first field that matches it, and a field takes the leftmost column left
// unclaimed. Retail therefore comes before cost — "Рек. ціна" has to be read
// as the recommended price before plain "ціна" claims it as the purchase one.
const FIELD_ORDER: CsvField[] = ['retail', 'cost', 'sku', 'name', 'volume', 'category']

const SYNONYMS: Record<CsvField, string[]> = {
  retail: ['рек', 'роздр', 'розниц', 'rrp', 'msrp', 'retail'],
  cost: ['ціна', 'цена', 'закуп', 'опт', 'cost', 'price', 'wholesale'],
  sku: ['артикул', 'sku', 'код', 'article', 'code'],
  name: ['наймен', 'назва', 'назв', 'товар', 'name', 'product', 'опис'],
  volume: ['обєм', 'объем', 'обсяг', 'volume', 'size', 'фасув', 'вага'],
  category: ['категор', 'розділ', 'раздел', 'група', 'группа', 'category', 'group'],
}

// How far down to look for the header. Deep enough for the title and warning
// rows suppliers put on top, shallow enough that a product row cannot win.
const HEADER_SCAN_ROWS = 20

/** Parse a Ukrainian-formatted number: "2 269,50" → 2269.5, "—" → null. */
export function parseNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null
  let s = String(raw).trim()
  if (!s) return null
  // Drop currency symbols and every kind of space (incl. NBSP / narrow NBSP).
  s = s.replace(/[₴$€]/g, '').replace(/\s/g, '')
  if (!s || s === '—' || s === '-') return null
  // Comma is the decimal separator; thousands separators were spaces (gone).
  s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function cleanName(raw: string): string {
  return raw.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

function normalize(header: string): string {
  return header.toLowerCase().replace(/[\s".']/g, '')
}

function matches(header: string, field: CsvField): boolean {
  const h = normalize(header)
  return h.length > 0 && SYNONYMS[field].some((word) => h.includes(word))
}

/**
 * Bytes → text. A CSV declares its encoding nowhere, so it is read off the
 * file: a byte-order mark settles the question outright, and otherwise UTF-8
 * is tried strictly — Cyrillic in windows-1251 is not valid UTF-8, so the
 * failure *is* the answer rather than another guess.
 */
export function decodeCsv(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  if (view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(view.subarray(3))
  }
  if (view[0] === 0xff && view[1] === 0xfe) return new TextDecoder('utf-16le').decode(view.subarray(2))
  if (view[0] === 0xfe && view[1] === 0xff) return new TextDecoder('utf-16be').decode(view.subarray(2))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(view)
  } catch {
    try {
      return new TextDecoder('windows-1251').decode(view)
    } catch {
      return new TextDecoder('utf-8').decode(view)
    }
  }
}

/** How many of our fields a row names — a header row names several. */
function headerScore(row: string[]): number {
  const found = new Set<CsvField>()
  for (const cell of row) {
    for (const field of FIELD_ORDER) {
      if (matches(cell, field)) {
        found.add(field)
        break
      }
    }
  }
  return found.size
}

function findRate(rows: string[][]): number | null {
  for (const row of rows) {
    // The colon is what tells the rate apart from prose like
    // "Курс USD задається на аркуші «Курс USD»".
    const match = row.join(' ').match(/(?:курс|rate)\s*:\s*([\d\s.,]+)/i)
    if (match) {
      const rate = parseNumber(match[1])
      if (rate != null) return rate
    }
  }
  return null
}

/** Split the file into cells and work out where its header is. */
export function readCsvTable(text: string): CsvTable {
  // No delimiter given: Papa sniffs it, so a semicolon or tab export reads
  // the same as a comma one.
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' })
  const rows = parsed.data

  let headerRow = -1
  let best = 1 // two recognised columns is the least that can be called a header
  for (let i = 0; i < Math.min(rows.length, HEADER_SCAN_ROWS); i++) {
    const score = headerScore(rows[i])
    if (score > best) {
      best = score
      headerRow = i
    }
  }

  return {
    rows,
    headerRow,
    headers: headerRow >= 0 ? rows[headerRow].map((c) => c.trim()) : [],
    columns: rows.reduce((max, row) => Math.max(max, row.length), 0),
    rate: findRate(rows),
  }
}

/** What the header words suggest each column holds — a guess, never a verdict. */
export function guessMapping(table: CsvTable): CsvMapping {
  const mapping: CsvMapping = {
    sku: null,
    name: null,
    volume: null,
    cost: null,
    retail: null,
    category: null,
  }

  // Nothing to read the columns off: fall back to the order every supplier
  // file has used so far, and let the import step correct it.
  if (table.headerRow < 0) {
    return { sku: 0, name: 1, volume: 2, cost: 3, retail: 4, category: null }
  }

  const taken = new Set<number>()
  for (const field of FIELD_ORDER) {
    for (let i = 0; i < table.headers.length; i++) {
      if (taken.has(i) || !matches(table.headers[i], field)) continue
      mapping[field] = i
      taken.add(i)
      break
    }
  }
  return mapping
}

/**
 * Rows → products, through one mapping. A row without a purchase price is no
 * product: carrying nothing but a first cell, it is the section header
 * suppliers use in place of a category column; otherwise it is counted as
 * skipped, so the import step can say how much was left behind.
 */
export function extractProducts(table: CsvTable, mapping: CsvMapping): ParsedPriceList {
  const products: ParsedProduct[] = []
  let skipped = 0
  let section: string | null = null

  for (let i = table.headerRow + 1; i < table.rows.length; i++) {
    const row = table.rows[i]
    const cell = (column: number | null) => (column == null ? '' : (row[column] ?? '').trim())

    const rawSku = cell(mapping.sku)
    const rawName = cell(mapping.name)
    const cost = parseNumber(cell(mapping.cost))

    if (!rawSku && !rawName) continue

    if (mapping.category == null && rawSku && !rawName && cost == null) {
      section = rawSku
      continue
    }

    if (cost == null) {
      skipped++
      continue
    }

    const name = cleanName(rawName || rawSku)
    const volume = cell(mapping.volume)

    products.push({
      sku: rawSku || name,
      name,
      volume: EMPTY_VOLUMES.has(volume) ? null : volume,
      category: mapping.category == null ? section : cell(mapping.category) || null,
      priceUsd: cost,
      retailUsd: parseNumber(cell(mapping.retail)),
    })
  }

  return { rate: table.rate, products, skipped }
}

/** Read a price list start to finish on the guessed mapping alone. */
export function parsePriceListCsv(text: string): ParsedPriceList {
  const table = readCsvTable(text)
  return extractProducts(table, guessMapping(table))
}
