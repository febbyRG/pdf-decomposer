import { detectReadingOrderColumns } from './columnDetection.js'
import type { Composite } from './types.js'

/**
 * Stage 2 — Reading Order: order composites the way a human reads the page.
 * Single column: top to bottom. Multi-column: column by column left to right,
 * top to bottom within each column.
 *
 * INVARIANT: the output is a permutation of the input. Column detection
 * accounts for every composite (see detectReadingOrderColumns), so ordering
 * can never lose text — only arrange it.
 */
export function orderComposites(composites: Composite[]): Composite[] {
  if (composites.length === 0) return composites

  const columns = detectReadingOrderColumns(composites)

  if (columns.length <= 1) {
    // Single column - simple top-to-bottom sorting
    return composites.sort((a, b) => a.boundingBox.top - b.boundingBox.top)
  }

  // Multi-column - sort by column first, then by position within column
  const sortedComposites: Composite[] = []

  columns.sort((a, b) => a.leftBoundary - b.leftBoundary)

  for (const column of columns) {
    const columnElements = column.elements.sort((a, b) => a.boundingBox.top - b.boundingBox.top)
    sortedComposites.push(...columnElements)
  }

  return sortedComposites
}
