import { describe, expect, it } from 'vitest'
import { dropDuplicateRuns } from './duplicateRuns.js'
import type { PdfElement } from '../../models/PdfElement.js'

function run(data: string, top: number, left: number, width = 102, height = 10): PdfElement {
  return { type: 'text', data, boundingBox: { top, left, width, height } } as PdfElement
}

describe('dropDuplicateRuns', () => {
  it('drops an overprint duplicate (same text, same box) so merge cannot stutter it', () => {
    // The real davisart p7 case: "C O N T E M P O R A R Y" drawn twice at
    // [t575 l139 w102 h10], which merged into "CONTEMPORARY CONTEMPORARY ...".
    const elements = [run('C O N T E M P O R A R Y', 575, 139), run('C O N T E M P O R A R Y', 575, 139)]
    expect(dropDuplicateRuns(elements)).toHaveLength(1)
  })

  it('keeps the same text at a different position (genuine repetition)', () => {
    const elements = [run('17', 72, 473, 8, 8), run('17', 240, 95, 8, 8)]
    expect(dropDuplicateRuns(elements)).toHaveLength(2)
  })

  it('keeps different text at the same position', () => {
    const elements = [run('ART', 575, 139), run('IN', 575, 139)]
    expect(dropDuplicateRuns(elements)).toHaveLength(2)
  })

  it('tolerates sub-point jitter between the duplicate draws', () => {
    const elements = [run('HEADLINE', 575, 139), run('HEADLINE', 575.3, 139.2)]
    expect(dropDuplicateRuns(elements)).toHaveLength(1)
  })
})
