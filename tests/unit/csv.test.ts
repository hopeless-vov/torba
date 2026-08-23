import {
  decodeCsv,
  extractProducts,
  guessMapping,
  parseNumber,
  parsePriceListCsv,
  readCsvTable,
} from '@/utils/csv'
import { describe, expect, it } from 'vitest'

// Mirrors the real supplier files: title + warning rows, a "Курс:" cell,
// a header row, category section headers, a quoted multiline set name,
// and professional rows with an empty / "—" retail price.
const SAMPLE = `COLORESCIENCE — ПРАЙС 2026,,,,,,
⚠ Ціни розраховуються автоматично. Курс USD задається на аркуші «Курс USD»,,,,,"Курс: 44,50 ₴",
Артикул,Найменування,Об'єм,"Ціна, USD","Рек. ціна, USD","Ціна, ГРН (закупка)","Рек. ціна, ГРН"
  ТОНАЛЬНІ ОСНОВИ,,,,,,
402102101,Foundation SPF 20,12 г,"51,00","77,00","2 269,50","3 426,50"

  НАБОРИ,,,,,,
1320.SET,"LIP DUO | КОМПЛЕКС
Youth Lip Elixir 3,5 г",1 набір,"76,00","114,00","3 382,00","5 073,00"
  ПРОФЕСІЙНІ,,,,,,
1101.060,Active Serum,60 мл,"154,00",,"6 853,00",—
403108561_Foil,Serum семпл,1 мл,"2,00",,"89,00",—
`

describe('parseNumber', () => {
  it('parses Ukrainian-formatted numbers', () => {
    expect(parseNumber('51,00')).toBe(51)
    expect(parseNumber('2 269,50')).toBe(2269.5)
    expect(parseNumber('"Курс: 44,50 ₴"'.replace(/[^\d\s.,]/g, ''))).toBe(44.5)
  })

  it('returns null for blanks and dashes', () => {
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('—')).toBeNull()
    expect(parseNumber(null)).toBeNull()
  })
})

describe('parsePriceListCsv', () => {
  const result = parsePriceListCsv(SAMPLE)

  it('detects the brand rate from the "Курс:" cell', () => {
    expect(result.rate).toBe(44.5)
  })

  it('parses every product row and skips nothing valid', () => {
    expect(result.products).toHaveLength(4)
    expect(result.skipped).toBe(0)
  })

  it('assigns the current category section to products', () => {
    expect(result.products[0]).toMatchObject({
      sku: '402102101',
      category: 'ТОНАЛЬНІ ОСНОВИ',
      volume: '12 г',
      priceUsd: 51,
      retailUsd: 77,
    })
  })

  it('collapses multiline quoted names to a single line', () => {
    const set = result.products.find((p) => p.sku === '1320.SET')
    expect(set?.name).toBe('LIP DUO | КОМПЛЕКС Youth Lip Elixir 3,5 г')
    expect(set?.category).toBe('НАБОРИ')
    expect(set?.priceUsd).toBe(76)
    expect(set?.retailUsd).toBe(114)
  })

  it('treats an empty retail column as null', () => {
    const pro = result.products.find((p) => p.sku === '1101.060')
    expect(pro?.retailUsd).toBeNull()
    expect(pro?.priceUsd).toBe(154)
  })

  it('keeps foil/sample SKUs intact', () => {
    expect(result.products.some((p) => p.sku === '403108561_Foil')).toBe(true)
  })
})

describe('readCsvTable', () => {
  it('finds the header wherever the supplier put it', () => {
    const table = readCsvTable(SAMPLE)
    expect(table.headerRow).toBe(2)
    expect(table.headers[0]).toBe('Артикул')
    expect(table.columns).toBe(7)
  })

  // Excel on a Ukrainian machine exports semicolons; it is otherwise the same
  // file, so nothing may hinge on the delimiter.
  it('reads a semicolon export the same as a comma one', () => {
    const table = readCsvTable('Артикул;Назва;Ціна\nA-1;Крем;10,50\n')
    const { products } = extractProducts(table, guessMapping(table))
    expect(products).toEqual([
      { sku: 'A-1', name: 'Крем', volume: null, category: null, priceUsd: 10.5, retailUsd: null },
    ])
  })

  it('reads a tab export too', () => {
    const table = readCsvTable('Артикул\tНазва\tЦіна\nA-1\tКрем\t10\n')
    expect(extractProducts(table, guessMapping(table)).products).toHaveLength(1)
  })
})

describe('guessMapping', () => {
  it('reads the recommended price apart from the purchase one', () => {
    const table = readCsvTable(
      'Артикул,Найменування,Об\'єм,"Ціна, USD","Рек. ціна, USD"\nA-1,Крем,50 мл,10,18\n',
    )
    expect(guessMapping(table)).toEqual({ sku: 0, name: 1, volume: 2, cost: 3, retail: 4, category: null })
  })

  it('understands an English header', () => {
    const table = readCsvTable(
      'SKU,Product,Volume,Price,Retail price,Category\nA-1,Cream,50 ml,10,18,Face\n',
    )
    const mapping = guessMapping(table)
    expect(mapping).toEqual({ sku: 0, name: 1, volume: 2, cost: 3, retail: 4, category: 5 })
    expect(extractProducts(table, mapping).products[0].category).toBe('Face')
  })

  // Nothing to read the columns off — the fallback is the order every supplier
  // file has used so far, and the import step is where it gets corrected.
  it('falls back to the usual order when there is no header', () => {
    const table = readCsvTable('A-1,Крем,50 мл,10,18\nA-2,Гель,30 мл,7,12\n')
    expect(table.headerRow).toBe(-1)
    expect(guessMapping(table)).toEqual({ sku: 0, name: 1, volume: 2, cost: 3, retail: 4, category: null })
  })
})

describe('extractProducts', () => {
  // The columns are the caller's to decide: reading the UAH price instead of
  // the USD one is a mapping away, not a code change.
  it('follows the mapping it is given', () => {
    const table = readCsvTable(SAMPLE)
    const { products } = extractProducts(table, {
      sku: 0,
      name: 1,
      volume: 2,
      cost: 5,
      retail: 6,
      category: null,
    })
    expect(products[0].priceUsd).toBe(2269.5)
    expect(products[0].retailUsd).toBe(3426.5)
  })

  // A file that names its categories in a column has no section rows.
  it('takes the category from a column when the file has one', () => {
    const table = readCsvTable('Артикул,Назва,Ціна,Категорія\nA-1,Крем,10,Обличчя\n')
    const { products } = extractProducts(table, guessMapping(table))
    expect(products[0].category).toBe('Обличчя')
  })

  it('names a product by its article when the file carries no name', () => {
    const table = readCsvTable('Артикул,Ціна\nA-1,10\n')
    const { products } = extractProducts(table, guessMapping(table))
    expect(products[0]).toMatchObject({ sku: 'A-1', name: 'A-1', priceUsd: 10 })
  })

  it('counts a row without a price as skipped', () => {
    const table = readCsvTable('Артикул,Назва,Ціна\nA-1,Крем,10\nA-2,Гель,—\n')
    const result = extractProducts(table, guessMapping(table))
    expect(result.products).toHaveLength(1)
    expect(result.skipped).toBe(1)
  })
})

describe('decodeCsv', () => {
  const utf8 = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer

  it('reads plain UTF-8', () => {
    expect(decodeCsv(utf8('Назва;Ціна'))).toBe('Назва;Ціна')
  })

  it('drops a byte-order mark instead of leaking it into the first header', () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Артикул,Назва')])
    expect(decodeCsv(bom.buffer as ArrayBuffer)).toBe('Артикул,Назва')
  })

  // What Excel writes on a Ukrainian machine. Read as UTF-8 those bytes are
  // not mojibake but an error, which is what makes the fallback safe.
  it('falls back to windows-1251, which is what Excel writes here', () => {
    const cp1251 = Uint8Array.from([
      0xcd, 0xe0, 0xe7, 0xe2, 0xe0, 0x3b, 0xd6, 0xb3, 0xed, 0xe0, 0x0a, // Назва;Ціна
      0xca, 0xf0, 0xe5, 0xec, 0x3b, 0x31, 0x30, 0x0a, // Крем;10
    ])
    expect(decodeCsv(cp1251.buffer as ArrayBuffer)).toBe('Назва;Ціна\nКрем;10\n')
  })
})
