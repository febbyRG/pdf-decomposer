import { describe, expect, it } from 'vitest'
import { mergeOverlappingComposites } from './overlapMerge.js'
import type { Composite } from './types.js'

let id = 0

function composite(data: string, left: number, top: number, width: number, height = 16, fontSize = 16): Composite {
  id += 1
  return {
    id: `c${id}`,
    data,
    boundingBox: { top, left, right: left + width, bottom: top + height, width, height },
    attributes: { fontSize },
    originalElements: []
  }
}

describe('mergeOverlappingComposites — mid-line font-switch continuations', () => {
  it('merges a word-gap continuation deep into a wide column (the opus italic-run case)', () => {
    // One printed line split by a font switch: line start (x=99, ends 342),
    // italic run "Santa Maria" at x=346 (4pt word gap, 247pt left diff).
    const lineStart = composite('The most feared of all Muslim naval units, the ', 99, 720, 243)
    const italicRun = composite('Santa Maria', 346, 720, 72)
    const merged = mergeOverlappingComposites([lineStart, italicRun])
    expect(merged).toHaveLength(1)
    expect(merged[0].data).toContain('Santa Maria')
  })

  it('still rejects same-line runs across a real column gutter (20pt+ gap)', () => {
    // Two columns whose lines align vertically: col1 ends at 417, col2 starts
    // at 449 (32pt gutter). Far above word spacing, must stay separate.
    const col1Line = composite('end of a column one line', 99, 720, 318)
    const col2Line = composite('start of column two line', 449, 720, 200)
    const merged = mergeOverlappingComposites([col1Line, col2Line])
    expect(merged).toHaveLength(2)
  })

  it('still rejects a narrow-gutter pair when the gap exceeds word spacing', () => {
    // mivision-class narrow gutter: ~20pt gap at ~9.5pt body font. Word-gap
    // budget is 0.6x font (~6pt), so the guard still applies and rejects.
    const col1Line = composite('left column line of text here', 40, 300, 150, 12, 9.5)
    const col2Line = composite('right column line of text', 210, 300, 150, 12, 9.5)
    const merged = mergeOverlappingComposites([col1Line, col2Line])
    expect(merged).toHaveLength(2)
  })

  it('keeps the existing left-diff guard for gaps beyond word spacing', () => {
    // 25pt gap (over 0.6 x 16 = 9.6) with a large left diff: rejected by the
    // strict gap branch exactly as before the word-gap exception.
    const a = composite('some text run', 99, 500, 100)
    const b = composite('distant run', 224, 500, 80)
    const merged = mergeOverlappingComposites([a, b])
    expect(merged).toHaveLength(2)
  })
})
