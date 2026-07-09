import type { ColumnBoundary, Composite, CompositePageStats, DetectedColumn } from './types.js'

/**
 * Column detection for the composition pipeline — the single home for BOTH
 * detectors so their contracts and differences live side by side:
 *
 * 1. `detectMergeColumnBoundaries` (stage 1, overlap merge): conservative
 *    left-position clustering. Its only job is to STOP merging across columns,
 *    so a false negative (no columns detected) is safe — merging then relies on
 *    the distance checks alone.
 * 2. `detectReadingOrderColumns` (stage 2, reading order): density-histogram
 *    beam scanning that must place EVERY composite into a column. It enforces
 *    a preservation invariant: reading order is a permutation of the input,
 *    never a filter (stranded composites attach to the nearest column).
 *
 * The two remain separate algorithms on purpose: unifying them changes merge
 * and ordering behaviour corpus-wide and needs its own validated release.
 */

// ── Stage-1 (merge constraint) thresholds ──
// Standard-width band around the 75th-percentile element width used to pick
// "real column content" elements for clustering.
const MERGE_FILTER_MIN_WIDTH_RATIO = 0.8
const MERGE_FILTER_MAX_WIDTH_RATIO = 1.5
const MERGE_FILTER_MIN_WIDTH_PT = 120
const MERGE_MIN_TEXT_LENGTH = 15
const MERGE_MIN_STANDARD_ELEMENTS = 4
// Left positions within this range (font-scaled) belong to the same cluster.
const MERGE_CLUSTER_FONT_FACTOR = 3
const MERGE_CLUSTER_MIN_THRESHOLD_PT = 30
const MERGE_MIN_ELEMENTS_PER_CLUSTER = 2
const MERGE_MIN_CLUSTERS = 2
const MERGE_MAX_CLUSTERS = 5
// Adjacent clusters must be separated by at least this gap to count as columns.
const MERGE_MIN_COLUMN_GAP_WIDTH_RATIO = 0.3
const MERGE_MIN_COLUMN_GAP_PT = 50
// Side-by-side clusters must overlap vertically by at least this much.
const MERGE_MIN_VERTICAL_OVERLAP_PT = 10
// Reject layouts whose column widths differ more than this ratio.
const MERGE_MAX_WIDTH_RATIO_BETWEEN_COLUMNS = 5

// ── Stage-2 (reading order) thresholds ──
// Content narrower than this is always a single column.
const ORDER_MIN_MULTI_COLUMN_PAGE_WIDTH_PT = 200
// An element wider than this fraction of the content width cannot be one
// column of a side-by-side layout, so it must not fill histogram bins across
// a column gap. Geometric on purpose: a relative (average-width) threshold
// broke on pages mixing a narrow sidebar rail with normal body columns.
const ORDER_SPANNING_PAGE_WIDTH_RATIO = 0.5
// If most elements are spanning, the page is not a column layout.
const ORDER_MIN_COLUMN_ELEMENT_SHARE = 0.5
// Histogram resolution: ~10pt bins, at least 50 across the page.
const ORDER_MIN_BIN_COUNT = 50
const ORDER_BIN_WIDTH_PT = 10
// Bins at or below this share of the peak density read as a gap.
const ORDER_GAP_DENSITY_RATIO = 0.15
// A gap must be at least this wide (font-scaled) to separate columns.
const ORDER_MIN_GAP_FONT_FACTOR = 1.2
const ORDER_MIN_GAP_PT = 10
// A column region narrower than this gets no boundary of its own.
const ORDER_MIN_COLUMN_WIDTH_PT = 40
// Distribution sanity: with few elements, wildly unbalanced columns fall back
// to a single column.
const ORDER_MIN_ELEMENTS_SHARE_PER_COLUMN = 0.15
const ORDER_DISTRIBUTION_CHECK_MAX_ELEMENTS = 15

/**
 * Stage-1 detector: cluster standard-width text composites by left position
 * and return column boundaries ONLY for a confident multi-column layout.
 * Returns an empty array otherwise (callers then merge without a column
 * constraint). See the module doc for the contract difference vs stage 2.
 */
export function detectMergeColumnBoundaries(composites: Composite[], pageStats: CompositePageStats): ColumnBoundary[] {
  if (composites.length === 0) return []

  // Default: no column separation (treat whole page as one column)
  const noColumns: ColumnBoundary[] = []

  // Calculate the 75th percentile width to identify standard column-width
  // elements. This filters out headers, fragments, and spanning elements more
  // effectively than the median.
  const allWidths = composites.map(c => c.boundingBox.width).sort((a, b) => a - b)
  const p75Index = Math.floor(allWidths.length * 0.75)
  const p75Width = allWidths[p75Index] || allWidths[allWidths.length - 1]

  const filterMinWidth = Math.max(p75Width * MERGE_FILTER_MIN_WIDTH_RATIO, MERGE_FILTER_MIN_WIDTH_PT)
  const filterMaxWidth = p75Width * MERGE_FILTER_MAX_WIDTH_RATIO

  const textComposites = composites.filter(c =>
    c.data &&
    c.data.trim().length >= MERGE_MIN_TEXT_LENGTH &&
    c.boundingBox.width >= filterMinWidth &&
    c.boundingBox.width <= filterMaxWidth
  )

  if (textComposites.length < MERGE_MIN_STANDARD_ELEMENTS) {
    return noColumns
  }

  // Dynamic cluster threshold - elements within this range are considered the
  // same column. Larger threshold absorbs minor position variations.
  const avgFontSize = pageStats.averageFontSize || 12
  const clusterThreshold = Math.max(avgFontSize * MERGE_CLUSTER_FONT_FACTOR, MERGE_CLUSTER_MIN_THRESHOLD_PT)

  interface LeftCluster {
    left: number
    elements: Composite[]
    minTop: number
    maxBottom: number
    avgWidth: number
  }
  const leftClusters: LeftCluster[] = []

  for (const comp of textComposites) {
    const elemLeft = comp.boundingBox.left

    let found = false
    for (const cluster of leftClusters) {
      if (Math.abs(cluster.left - elemLeft) < clusterThreshold) {
        cluster.elements.push(comp)
        // Update cluster stats
        const total = cluster.elements.reduce((sum, c) => sum + c.boundingBox.left, 0)
        cluster.left = total / cluster.elements.length
        cluster.minTop = Math.min(cluster.minTop, comp.boundingBox.top)
        cluster.maxBottom = Math.max(cluster.maxBottom, comp.boundingBox.bottom)
        const widthTotal = cluster.elements.reduce((sum, c) => sum + c.boundingBox.width, 0)
        cluster.avgWidth = widthTotal / cluster.elements.length
        found = true
        break
      }
    }

    if (!found) {
      leftClusters.push({
        left: elemLeft,
        elements: [comp],
        minTop: comp.boundingBox.top,
        maxBottom: comp.boundingBox.bottom,
        avgWidth: comp.boundingBox.width
      })
    }
  }

  const significantClusters = leftClusters
    .filter(c => c.elements.length >= MERGE_MIN_ELEMENTS_PER_CLUSTER)
    .sort((a, b) => a.left - b.left)

  if (significantClusters.length < MERGE_MIN_CLUSTERS || significantClusters.length > MERGE_MAX_CLUSTERS) {
    return noColumns
  }

  // Adjacent clusters must be separated by a real column gap.
  const minColumnGap = Math.max(p75Width * MERGE_MIN_COLUMN_GAP_WIDTH_RATIO, MERGE_MIN_COLUMN_GAP_PT)

  for (let i = 0; i < significantClusters.length - 1; i++) {
    const gap = significantClusters[i + 1].left - significantClusters[i].left
    if (gap < minColumnGap) {
      return noColumns
    }
  }

  // Clusters must overlap vertically (side-by-side, not stacked).
  for (let i = 0; i < significantClusters.length - 1; i++) {
    const c1 = significantClusters[i]
    const c2 = significantClusters[i + 1]

    const overlapTop = Math.max(c1.minTop, c2.minTop)
    const overlapBottom = Math.min(c1.maxBottom, c2.maxBottom)
    const overlap = overlapBottom - overlapTop

    if (overlap < MERGE_MIN_VERTICAL_OVERLAP_PT) {
      return noColumns
    }
  }

  // Column widths can vary (TOC vs paragraph columns); reject only extremes.
  const widths = significantClusters.map(c => c.avgWidth)
  const clusterMaxWidth = Math.max(...widths)
  const clusterMinWidth = Math.min(...widths)
  if (clusterMaxWidth > clusterMinWidth * MERGE_MAX_WIDTH_RATIO_BETWEEN_COLUMNS) {
    return noColumns
  }

  // All checks passed: build boundaries at cluster midpoints.
  const columns: ColumnBoundary[] = []

  for (let i = 0; i < significantClusters.length; i++) {
    const cluster = significantClusters[i]

    const colLeft = i === 0 ? 0 : (significantClusters[i - 1].left + cluster.left) / 2
    const colRight = i === significantClusters.length - 1
      ? pageStats.pageWidth + 100
      : (cluster.left + significantClusters[i + 1].left) / 2

    columns.push({ left: colLeft, right: colRight })
  }

  return columns
}

/**
 * Assign a composite to a stage-1 column by left edge, then center, then the
 * closest column. Never returns "no column".
 */
export function assignToColumn(composite: Composite, columns: ColumnBoundary[]): number {
  const elemLeft = composite.boundingBox.left
  const elemCenter = elemLeft + composite.boundingBox.width / 2

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]
    if (elemLeft >= col.left && elemLeft < col.right) {
      return i
    }
    if (elemCenter >= col.left && elemCenter < col.right) {
      return i
    }
  }

  // If not matched, find closest column
  let closestCol = 0
  let minDist = Infinity
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]
    const dist = Math.min(
      Math.abs(elemLeft - col.left),
      Math.abs(elemLeft - col.right)
    )
    if (dist < minDist) {
      minDist = dist
      closestCol = i
    }
  }

  return closestCol
}

/**
 * Stage-2 detector: beam scanning over a horizontal density histogram.
 * ALWAYS accounts for every composite (preservation invariant): the returned
 * columns partition the input, falling back to a single column when the
 * layout is not confidently multi-column.
 */
export function detectReadingOrderColumns(composites: Composite[]): DetectedColumn[] {
  if (composites.length === 0) return []

  // Content bounds
  const leftMost = Math.min(...composites.map(c => c.boundingBox.left))
  const rightMost = Math.max(...composites.map(c => c.boundingBox.right))
  const pageWidth = rightMost - leftMost

  const singleColumn = (): DetectedColumn[] => [{
    leftBoundary: leftMost,
    rightBoundary: rightMost,
    elements: composites
  }]

  // For very narrow content, assume single column
  if (pageWidth < ORDER_MIN_MULTI_COLUMN_PAGE_WIDTH_PT) {
    return singleColumn()
  }

  // Separate normal column elements from spanning elements. Spanning = wider
  // than half the content width: such an element cannot be one column of a
  // side-by-side layout, so it must not fill histogram bins across a column
  // gap. A relative (1.3x average width) threshold broke on pages mixing a
  // narrow sidebar rail with normal body columns: the rail fragments dragged
  // the average down until body paragraphs read as "spanning", vacating the
  // histogram exactly where a real column stood, and that column's text was
  // dropped wholesale (mivision p28 lost its middle column, -37% page text).
  const spanningThreshold = pageWidth * ORDER_SPANNING_PAGE_WIDTH_RATIO
  const columnElements = composites.filter(c => c.boundingBox.width <= spanningThreshold)
  const spanningElements = composites.filter(c => c.boundingBox.width > spanningThreshold)

  // If mostly spanning elements, this isn't a column layout
  if (columnElements.length < composites.length * ORDER_MIN_COLUMN_ELEMENT_SHARE) {
    return singleColumn()
  }

  // Step 1: Build horizontal density histogram using only column elements
  const binCount = Math.max(ORDER_MIN_BIN_COUNT, Math.ceil(pageWidth / ORDER_BIN_WIDTH_PT))
  const binWidth = pageWidth / binCount
  const densityHistogram = new Array<number>(binCount).fill(0)

  for (const comp of columnElements) {
    const startBin = Math.floor((comp.boundingBox.left - leftMost) / binWidth)
    const endBin = Math.min(binCount - 1, Math.floor((comp.boundingBox.right - leftMost) / binWidth))

    for (let bin = startBin; bin <= endBin; bin++) {
      if (bin >= 0 && bin < binCount) {
        densityHistogram[bin]++
      }
    }
  }

  // Step 2: Find significant gaps (runs of zero or very low density)
  const maxDensity = Math.max(...densityHistogram)
  const gapThreshold = maxDensity * ORDER_GAP_DENSITY_RATIO

  const avgFontSize = columnElements.length > 0
    ? columnElements.reduce((sum, c) => sum + c.attributes.fontSize, 0) / columnElements.length
    : 12
  const minGapWidth = Math.max(avgFontSize * ORDER_MIN_GAP_FONT_FACTOR, ORDER_MIN_GAP_PT)

  const gaps: Array<{ start: number, end: number, width: number }> = []
  let gapStart: number | null = null

  for (let i = 0; i < binCount; i++) {
    const isGap = densityHistogram[i] <= gapThreshold

    if (isGap && gapStart === null) {
      gapStart = i
    } else if (!isGap && gapStart !== null) {
      const gapWidthPx = (i - gapStart) * binWidth
      if (gapWidthPx >= minGapWidth) {
        gaps.push({
          start: leftMost + gapStart * binWidth,
          end: leftMost + i * binWidth,
          width: gapWidthPx
        })
      }
      gapStart = null
    }
  }

  // Handle gap at the end
  if (gapStart !== null) {
    const gapWidthPx = (binCount - gapStart) * binWidth
    if (gapWidthPx >= minGapWidth) {
      gaps.push({
        start: leftMost + gapStart * binWidth,
        end: rightMost,
        width: gapWidthPx
      })
    }
  }

  // Step 3: No gaps means a single column
  if (gaps.length === 0) {
    return singleColumn()
  }

  // Step 4: Convert gaps to column boundaries
  gaps.sort((a, b) => a.start - b.start)

  const columnBoundaries: ColumnBoundary[] = []
  let currentLeft = leftMost

  for (const gap of gaps) {
    if (gap.start > currentLeft + ORDER_MIN_COLUMN_WIDTH_PT) {
      columnBoundaries.push({
        left: currentLeft,
        right: gap.start
      })
    }
    currentLeft = gap.end
  }

  if (rightMost > currentLeft + ORDER_MIN_COLUMN_WIDTH_PT) {
    columnBoundaries.push({
      left: currentLeft,
      right: rightMost
    })
  }

  // Step 5: Assign elements to columns. Normal elements go by center,
  // spanning elements by where they start (left edge).
  const columns: DetectedColumn[] = []

  for (const boundary of columnBoundaries) {
    const elementsInColumn = columnElements.filter(comp => {
      const elementCenter = (comp.boundingBox.left + comp.boundingBox.right) / 2
      return elementCenter >= boundary.left && elementCenter <= boundary.right
    })

    const spanningInColumn = spanningElements.filter(comp => {
      return comp.boundingBox.left >= boundary.left && comp.boundingBox.left <= boundary.right
    })

    const allElements = [...elementsInColumn, ...spanningInColumn]

    if (allElements.length > 0) {
      columns.push({
        leftBoundary: boundary.left,
        rightBoundary: boundary.right,
        elements: allElements
      })
    }
  }

  // Step 5b: PRESERVATION INVARIANT - reading order must be a permutation of
  // the input, never a filter. The assignment above can strand composites: a
  // center falling inside a detected gap, a spanning element whose left edge
  // starts in a gap, or a boundary sliver narrower than ORDER_MIN_COLUMN_WIDTH_PT
  // that got skipped. Anything unassigned here used to be dropped silently
  // (entire columns of text on real magazine pages). Attach every stranded
  // composite to the horizontally nearest column instead; within-column
  // top-sorting then slots it into reading order.
  if (columns.length > 0) {
    const assignedIds = new Set<string>()
    for (const column of columns) {
      for (const element of column.elements) {
        assignedIds.add(element.id)
      }
    }
    for (const composite of composites) {
      if (assignedIds.has(composite.id)) continue
      const center = (composite.boundingBox.left + composite.boundingBox.right) / 2
      let nearest = columns[0]
      let nearestDistance = Infinity
      for (const column of columns) {
        const distance = center < column.leftBoundary
          ? column.leftBoundary - center
          : center > column.rightBoundary
            ? center - column.rightBoundary
            : 0
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearest = column
        }
      }
      nearest.elements.push(composite)
    }
  }

  // Step 6: Final validation - check if the column distribution makes sense
  if (columns.length > 1) {
    const avgElementsPerColumn = composites.length / columns.length
    const hasTooFewElements = columns.some(col =>
      col.elements.length < avgElementsPerColumn * ORDER_MIN_ELEMENTS_SHARE_PER_COLUMN
    )

    // If distribution is very unbalanced, fall back to single column - but
    // only with few total elements (more tolerance for large documents).
    if (hasTooFewElements && composites.length < ORDER_DISTRIBUTION_CHECK_MAX_ELEMENTS) {
      return singleColumn()
    }
  }

  if (columns.length === 0) {
    return singleColumn()
  }

  return columns
}
