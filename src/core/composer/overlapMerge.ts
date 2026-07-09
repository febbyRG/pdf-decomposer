import { assignToColumn, detectMergeColumnBoundaries } from './columnDetection.js'
import { cleanupFormattedHtml, optimizeFormattedHtml } from './htmlFormatting.js'
import type { Composite, CompositeBox } from './types.js'
import { calculatePageStatistics, type CompositePageStats } from './types.js'
import type { PdfElement } from '../../models/PdfElement.js'

/**
 * Stage 1 — Overlapping Text Algorithm: spatial merging of raw text runs into
 * composites (lines into paragraphs). Merging never crosses a detected column
 * boundary. Preservation-safe by construction: every input composite ends up
 * in exactly one output cluster.
 */

// Fonts within this relative difference merge (10% tolerance).
const MAX_RELATIVE_FONT_DIFF = 0.1
// "Same line" = vertical overlap above this share of the average height.
const SAME_LINE_VERTICAL_OVERLAP_RATIO = 0.5
// Same-line gap budget: up to 2x font size, capped (column gaps are larger).
const SAME_LINE_MAX_GAP_FONT_FACTOR = 2
const SAME_LINE_MAX_GAP_PT = 30
// Same-line left-position discipline (see shouldMergeComposites).
const SAME_LINE_OVERLAP_MAX_LEFT_DIFF_FONT_FACTOR = 3
const SAME_LINE_OVERLAP_MAX_LEFT_DIFF_PT = 40
const SAME_LINE_GAP_MAX_LEFT_DIFF_FONT_FACTOR = 1.5
const SAME_LINE_GAP_MAX_LEFT_DIFF_PT = 15
// Vertically-stacked merge discipline.
const STACKED_MAX_LEFT_DIFF_PT = 30
const STACKED_MIN_OVERLAP_WIDTH_RATIO = 0.3
const STACKED_DEFINITE_COLUMN_LEFT_DIFF_PT = 100
// Vertical expansion window for stacked-line proximity.
const EXPANSION_FONT_DIVISOR = 3.5
const EXPANSION_MIN_FONT_FACTOR = 0.8
const EXPANSION_MIN_PT = 5
const EXPANSION_MAX_PT = 15
// Reading-order sort: same line when tops differ by no more than this.
const SORT_SAME_LINE_TOLERANCE_PT = 10
// Cluster average font size at or above this is treated as a header when
// optimizing merged formatted HTML (catches h2 headers around 21.12px).
const HEADER_FONT_SIZE_PT = 21

/**
 * Convert raw text elements to the composite working shape.
 */
export function convertToComposites(elements: PdfElement[]): Composite[] {
  return elements.map((el, index) => ({
    id: `element_${index}`,
    data: el.data || '',
    formattedData: el.formattedData,
    boundingBox: {
      top: el.boundingBox?.top || 0,
      left: el.boundingBox?.left || 0,
      right: (el.boundingBox?.left || 0) + (el.boundingBox?.width || 0),
      bottom: (el.boundingBox?.top || 0) + (el.boundingBox?.height || 0),
      width: el.boundingBox?.width || 0,
      height: el.boundingBox?.height || 0
    },
    attributes: {
      fontSize: el.attributes?.fontSize || 12,
      fontFamily: el.attributes?.fontFamily,
      composed: false
    },
    originalElements: [el]
  }))
}

/**
 * Merge overlapping/adjacent composites into clusters, constrained to detected
 * columns. Every composite lands in exactly one cluster.
 */
export function mergeOverlappingComposites(composites: Composite[]): Composite[] {
  if (composites.length === 0) return composites

  const pageStats = calculatePageStatistics(composites)

  // Only returns boundaries for true multi-column layouts; an empty result
  // means merging relies on the distance checks alone.
  const columnBoundaries = detectMergeColumnBoundaries(composites, pageStats)
  const hasMultiColumnLayout = columnBoundaries.length >= 2

  const compositeToColumn = new Map<string, number>()
  if (hasMultiColumnLayout) {
    for (const composite of composites) {
      compositeToColumn.set(composite.id, assignToColumn(composite, columnBoundaries))
    }
  }

  const processed = new Set<string>()
  const result: Composite[] = []

  for (const composite of composites) {
    if (processed.has(composite.id)) continue

    const cluster = [composite]
    processed.add(composite.id)

    const compositeColumn = compositeToColumn.get(composite.id) ?? -1

    // Find all overlapping/adjacent composites
    let foundMatch = true
    while (foundMatch) {
      foundMatch = false

      for (const candidate of composites) {
        if (processed.has(candidate.id)) continue

        // If multi-column layout detected, only merge within the same column
        if (hasMultiColumnLayout) {
          const candidateColumn = compositeToColumn.get(candidate.id) ?? -1
          if (candidateColumn !== compositeColumn && compositeColumn !== -1 && candidateColumn !== -1) {
            continue
          }
        }

        for (const clusterComposite of cluster) {
          if (shouldMergeComposites(clusterComposite, candidate, pageStats)) {
            cluster.push(candidate)
            processed.add(candidate.id)
            foundMatch = true
            break
          }
        }

        if (foundMatch) break
      }
    }

    result.push(createMergedComposite(cluster))
  }

  return result
}

/**
 * Merge criteria: font compatibility plus spatial discipline that prevents
 * bridging column gaps (strict horizontal checks on the same line, contained/
 * aligned checks for stacked lines).
 */
function shouldMergeComposites(compA: Composite, compB: Composite, pageStats: CompositePageStats): boolean {
  // Font compatibility check
  const fontSizeA = compA.attributes.fontSize
  const fontSizeB = compB.attributes.fontSize
  const relativeFontDiff = Math.abs(fontSizeA / fontSizeB - 1)

  if (relativeFontDiff > MAX_RELATIVE_FONT_DIFF) {
    return false
  }

  const widthA = compA.boundingBox.width
  const widthB = compB.boundingBox.width
  const minWidth = Math.min(widthA, widthB)

  // Same horizontal line?
  const verticalOverlap = getVerticalOverlap(compA.boundingBox, compB.boundingBox)
  const avgHeight = (compA.boundingBox.height + compB.boundingBox.height) / 2
  const areOnSameLine = verticalOverlap > avgHeight * SAME_LINE_VERTICAL_OVERLAP_RATIO

  const horizontalGap = getHorizontalGap(compA.boundingBox, compB.boundingBox)
  const leftPosDiff = Math.abs(compA.boundingBox.left - compB.boundingBox.left)

  if (areOnSameLine) {
    const avgFontSize = (fontSizeA + fontSizeB) / 2

    const maxHorizontalGap = Math.min(avgFontSize * SAME_LINE_MAX_GAP_FONT_FACTOR, SAME_LINE_MAX_GAP_PT)

    if (horizontalGap > maxHorizontalGap) {
      return false // Too far apart horizontally - likely different columns
    }

    // Left positions shouldn't be too far apart either. When there is a
    // horizontal gap (no x-overlap), be MUCH stricter: gap + large left diff
    // means different columns or garbage artifacts bridging content.
    const hasHorizontalOverlap = !(compA.boundingBox.right < compB.boundingBox.left ||
      compB.boundingBox.right < compA.boundingBox.left)
    const maxLeftDiff = hasHorizontalOverlap
      ? Math.max(avgFontSize * SAME_LINE_OVERLAP_MAX_LEFT_DIFF_FONT_FACTOR, SAME_LINE_OVERLAP_MAX_LEFT_DIFF_PT)
      : Math.max(avgFontSize * SAME_LINE_GAP_MAX_LEFT_DIFF_FONT_FACTOR, SAME_LINE_GAP_MAX_LEFT_DIFF_PT)

    if (leftPosDiff > maxLeftDiff) {
      return false
    }

    return true
  }

  // Vertically stacked: must belong to the same text column/flow.
  const leftA = compA.boundingBox.left
  const leftB = compB.boundingBox.left
  const rightA = compA.boundingBox.right
  const rightB = compB.boundingBox.right

  const aContainsB = leftA <= leftB && rightA >= rightB
  const bContainsA = leftB <= leftA && rightB >= rightA
  const horizontallyContained = aContainsB || bContainsA

  const leftDiff = Math.abs(leftA - leftB)
  const leftEdgesClose = leftDiff <= STACKED_MAX_LEFT_DIFF_PT

  const horizontalOverlap = getHorizontalOverlap(compA.boundingBox, compB.boundingBox)
  const hasSignificantOverlap = horizontalOverlap > minWidth * STACKED_MIN_OVERLAP_WIDTH_RATIO

  if (!horizontallyContained && !(leftEdgesClose && hasSignificantOverlap)) {
    if (leftDiff > STACKED_DEFINITE_COLUMN_LEFT_DIFF_PT) {
      return false // Definitely different columns
    }

    if (!hasSignificantOverlap && !leftEdgesClose) {
      return false
    }
  }

  const avgFontSize = (fontSizeA + fontSizeB) / 2
  const correctedFontSize = Math.max(Math.pow(avgFontSize, 2) / pageStats.averageFontSize, avgFontSize)

  const baseExpansion = correctedFontSize / EXPANSION_FONT_DIVISOR
  const minExpansion = Math.max(avgFontSize * EXPANSION_MIN_FONT_FACTOR, EXPANSION_MIN_PT)
  const expansionAmount = Math.min(Math.max(baseExpansion, minExpansion), EXPANSION_MAX_PT)

  return intersectsVerticallyWithExpansion(compA.boundingBox, compB.boundingBox, expansionAmount)
}

function getVerticalOverlap(boxA: CompositeBox, boxB: CompositeBox): number {
  const overlapTop = Math.max(boxA.top, boxB.top)
  const overlapBottom = Math.min(boxA.bottom, boxB.bottom)
  return Math.max(0, overlapBottom - overlapTop)
}

function getHorizontalOverlap(boxA: CompositeBox, boxB: CompositeBox): number {
  const overlapLeft = Math.max(boxA.left, boxB.left)
  const overlapRight = Math.min(boxA.right, boxB.right)
  return Math.max(0, overlapRight - overlapLeft)
}

function getHorizontalGap(boxA: CompositeBox, boxB: CompositeBox): number {
  if (boxA.right < boxB.left) {
    return boxB.left - boxA.right // A is to the left of B
  } else if (boxB.right < boxA.left) {
    return boxA.left - boxB.right // B is to the left of A
  }
  return 0 // Boxes overlap horizontally
}

function intersectsVerticallyWithExpansion(boxA: CompositeBox, boxB: CompositeBox, expansion: number): boolean {
  // Elements must be in the same column area
  const horizontalOverlap = !(boxA.right < boxB.left || boxB.right < boxA.left)

  if (!horizontalOverlap) {
    const horizontalGap = getHorizontalGap(boxA, boxB)
    if (horizontalGap > expansion) {
      return false // Too far apart horizontally
    }
  }

  const expandedTop = boxA.top - expansion
  const expandedBottom = boxA.bottom + expansion

  return !(expandedBottom < boxB.top || expandedTop > boxB.bottom)
}

/**
 * Collapse a cluster into one composite: reading-order sort, merged bounding
 * box, joined text, optimized formatted HTML. All original elements and their
 * full text are carried over (join, never drop).
 */
function createMergedComposite(cluster: Composite[]): Composite {
  if (cluster.length === 1) {
    cluster[0].attributes.composed = true
    return cluster[0]
  }

  // Sort cluster by reading order
  cluster.sort((a, b) => {
    const yDiff = a.boundingBox.top - b.boundingBox.top
    if (Math.abs(yDiff) > SORT_SAME_LINE_TOLERANCE_PT) return yDiff
    return a.boundingBox.left - b.boundingBox.left
  })

  const tops = cluster.map(c => c.boundingBox.top)
  const lefts = cluster.map(c => c.boundingBox.left)
  const rights = cluster.map(c => c.boundingBox.right)
  const bottoms = cluster.map(c => c.boundingBox.bottom)

  const mergedBox: CompositeBox = {
    top: Math.min(...tops),
    left: Math.min(...lefts),
    right: Math.max(...rights),
    bottom: Math.max(...bottoms),
    width: Math.max(...rights) - Math.min(...lefts),
    height: Math.max(...bottoms) - Math.min(...tops)
  }

  const mergedData = cluster.map(c => c.data).join(' ')
  const mergedFormatted = cluster.map(c => c.formattedData || c.data).join(' ')

  // Types are assigned later (stage 3); estimate header-ness from font size so
  // the HTML optimizer can apply header-specific span merging.
  const avgFontSize = cluster.reduce((sum, c) => sum + c.attributes.fontSize, 0) / cluster.length
  const isHeaderElement = avgFontSize >= HEADER_FONT_SIZE_PT

  const optimizedFormatted = optimizeFormattedHtml(mergedFormatted, isHeaderElement)
  const cleanedFormatted = cleanupFormattedHtml(optimizedFormatted)

  const allOriginalElements: PdfElement[] = []
  cluster.forEach(c => allOriginalElements.push(...c.originalElements))

  return {
    id: `merged_${cluster[0].id}`,
    data: mergedData,
    formattedData: cleanedFormatted,
    boundingBox: mergedBox,
    attributes: {
      fontSize: Math.round(avgFontSize * 10) / 10,
      fontFamily: cluster[0].attributes.fontFamily,
      composed: true
    },
    originalElements: allOriginalElements
  }
}
