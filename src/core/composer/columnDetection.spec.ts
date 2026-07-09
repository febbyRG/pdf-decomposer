import { describe, expect, it } from 'vitest'
import { assignToColumn, detectMergeColumnBoundaries, detectReadingOrderColumns } from './columnDetection.js'
import { calculatePageStatistics, type Composite } from './types.js'

let id = 0

function composite(data: string, left: number, top: number, width: number, height: number, fontSize = 10): Composite {
  id += 1
  return {
    id: `c${id}`,
    data,
    boundingBox: { top, left, right: left + width, bottom: top + height, width, height },
    attributes: { fontSize },
    originalElements: []
  }
}

function twoColumnPage(): Composite[] {
  const composites: Composite[] = []
  for (let i = 0; i < 5; i++) {
    composites.push(composite(`left column paragraph ${i} body text here`, 40, 100 + i * 90, 220, 60))
    composites.push(composite(`right column paragraph ${i} body text here`, 320, 100 + i * 90, 220, 60))
  }
  return composites
}

describe('detectReadingOrderColumns (stage 2)', () => {
  it('accounts for every composite — the preservation invariant', () => {
    // The mivision p28 shape: narrow rail + two body columns + spanning headline.
    const composites: Composite[] = []
    for (let i = 0; i < 6; i++) {
      composites.push(composite(`rail fragment ${i}`, 40, 100 + i * 100, 120, 60, 8))
      composites.push(composite(`middle body paragraph ${i}`, 197, 110 + i * 100, 165, 70, 9))
      composites.push(composite(`right body paragraph ${i}`, 382, 110 + i * 100, 165, 70, 9))
    }
    composites.push(composite('Spanning Two Column Headline', 195, 60, 273, 24, 20))

    const columns = detectReadingOrderColumns(composites)
    const assigned = columns.reduce((sum, col) => sum + col.elements.length, 0)
    const uniqueIds = new Set(columns.flatMap(col => col.elements.map(el => el.id)))
    expect(assigned).toBe(composites.length)
    expect(uniqueIds.size).toBe(composites.length)
  })

  it('treats narrow content as a single column', () => {
    const composites = [
      composite('one', 10, 10, 100, 20),
      composite('two', 12, 40, 100, 20)
    ]
    const columns = detectReadingOrderColumns(composites)
    expect(columns).toHaveLength(1)
    expect(columns[0].elements).toHaveLength(2)
  })

  it('excludes spanning elements from column shaping but still places them', () => {
    const composites = twoColumnPage()
    composites.push(composite('A Very Wide Full Page Headline Element', 40, 40, 500, 30, 24))

    const columns = detectReadingOrderColumns(composites)
    const assigned = columns.reduce((sum, col) => sum + col.elements.length, 0)
    expect(assigned).toBe(composites.length)
    expect(columns.length).toBeGreaterThanOrEqual(2)
  })
})

describe('detectMergeColumnBoundaries (stage 1)', () => {
  it('returns boundaries for a clean two-column layout', () => {
    const composites = twoColumnPage()
    const boundaries = detectMergeColumnBoundaries(composites, calculatePageStatistics(composites))
    expect(boundaries.length).toBe(2)
  })

  it('returns no boundaries when clusters do not overlap vertically (stacked sections)', () => {
    const composites: Composite[] = []
    for (let i = 0; i < 4; i++) {
      composites.push(composite(`top section paragraph ${i} text`, 40, 100 + i * 40, 220, 30))
      composites.push(composite(`bottom section paragraph ${i} text`, 320, 500 + i * 40, 220, 30))
    }
    const boundaries = detectMergeColumnBoundaries(composites, calculatePageStatistics(composites))
    expect(boundaries).toHaveLength(0)
  })

  it('returns no boundaries with too few standard-width elements', () => {
    const composites = [
      composite('just one paragraph of body text', 40, 100, 220, 60),
      composite('and another one on the right side', 320, 100, 220, 60)
    ]
    const boundaries = detectMergeColumnBoundaries(composites, calculatePageStatistics(composites))
    expect(boundaries).toHaveLength(0)
  })
})

describe('assignToColumn', () => {
  const columns = [{ left: 0, right: 250 }, { left: 250, right: 600 }]

  it('assigns by left edge when inside a column', () => {
    expect(assignToColumn(composite('x', 40, 0, 100, 10), columns)).toBe(0)
    expect(assignToColumn(composite('y', 320, 0, 100, 10), columns)).toBe(1)
  })

  it('never returns no column: out-of-range elements go to the closest one', () => {
    expect(assignToColumn(composite('z', 700, 0, 50, 10), columns)).toBe(1)
  })
})
