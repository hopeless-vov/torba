import { generateBatchNumber } from '@/utils/batch-number'
import { describe, expect, it } from 'vitest'

describe('generateBatchNumber', () => {
  it('starts a product at sequence 01', () => {
    expect(generateBatchNumber('FRY-500')).toBe('FRY-500-01')
  })

  it('continues after the highest existing sequence', () => {
    expect(generateBatchNumber('FRY-500', ['FRY-500-01', 'FRY-500-03'])).toBe('FRY-500-04')
  })

  it('ignores batches belonging to another product', () => {
    expect(generateBatchNumber('FRY-500', ['ZEW-8-07', null])).toBe('FRY-500-01')
  })

  it('normalises messy SKUs into a readable prefix', () => {
    expect(generateBatchNumber(' is clinical/active 30 ')).toBe('IS-CLINICAL-ACTIVE-30-01')
  })

  it('falls back to a generic prefix when the SKU has nothing usable', () => {
    expect(generateBatchNumber('///')).toBe('BATCH-01')
  })

  it('keeps counting past sequence 99', () => {
    expect(generateBatchNumber('A', ['A-99'])).toBe('A-100')
  })
})
