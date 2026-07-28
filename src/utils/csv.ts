import Papa from 'papaparse'

// Parses the supplier price-list CSVs (Colorescience / iS Clinical /
// Histolab). Their shape:
//   • a title row and a warning row that carries "Курс: 44,50 ₴"
//   • a header row starting with "Артикул"
//   • category section headers  → only the first cell is filled
//   • product rows              → article, name, volume, USD prices, UAH prices
// UAH columns are ignored on import — we recompute them from the brand rate.

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

const EMPTY_VOLUMES = new Set(['-', '—', ''])

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

export function parsePriceListCsv(text: string): ParsedPriceList {
  const parsed = Papa.parse<string[]>(text, {
    delimiter: ',',
    skipEmptyLines: 'greedy',
  })
  const rows = parsed.data

  // Rate lives in a "Курс: 44,50 ₴" cell; the colon distinguishes it from
  // the descriptive "Курс USD задається…" text.
  let rate: number | null = null
  let headerIndex = -1

  for (let i = 0; i < rows.length; i++) {
    const joined = rows[i].join(' ')
    if (rate == null) {
      const match = joined.match(/Курс:\s*([\d\s.,]+)/)
      if (match) rate = parseNumber(match[1])
    }
    if (headerIndex < 0 && (rows[i][0] ?? '').trim().toLowerCase() === 'артикул') {
      headerIndex = i
    }
  }

  const products: ParsedProduct[] = []
  let skipped = 0
  let currentCategory: string | null = null

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    const sku = (row[0] ?? '').trim()
    const name = (row[1] ?? '').trim()
    const volumeRaw = (row[2] ?? '').trim()
    const priceUsd = parseNumber(row[3])

    if (!sku && !name) continue

    // Category section header: first cell only.
    if (sku && !name && priceUsd == null) {
      currentCategory = sku
      continue
    }

    // A real product needs a name and a purchase price.
    if (!name || priceUsd == null) {
      skipped++
      continue
    }

    products.push({
      sku: sku || cleanName(name),
      name: cleanName(name),
      volume: EMPTY_VOLUMES.has(volumeRaw) ? null : volumeRaw,
      category: currentCategory,
      priceUsd,
      retailUsd: parseNumber(row[4]),
    })
  }

  return { rate, products, skipped }
}
