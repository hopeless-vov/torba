import { parseNumber, parsePriceListCsv } from '@/utils/csv'
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
