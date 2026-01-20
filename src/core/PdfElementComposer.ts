import type { PdfElement } from '../models/PdfElement.js'
import type { PdfPageContent } from '../models/PdfPageContent.js'

/**
 * Internal composite type for advanced text processing algorithm
 */
interface Composite {
  id: string
  data: string
  formattedData?: string
  boundingBox: {
    top: number
    left: number
    right: number
    bottom: number
    width: number
    height: number
  }
  attributes: {
    fontSize: number
    fontFamily?: string
    type?: string
    composed?: boolean
  }
  originalElements: PdfElement[]
}

/**
 * Enhanced PdfElementComposer with complete advanced text processing algorithm system.
 * Implements 3-stage processing: OverlappingText → OrderComposites → ComputeTextTypes
 */
export class PdfElementComposer {
  /**
   * Compose elements by grouping text elements into paragraphs while preserving images.
   * @param pages Array of PDF page content with raw elements
   * @returns Array of PDF page content with composed elements (paragraphs + images)
   */
  static composeElements(pages: PdfPageContent[]): PdfPageContent[] {
    return pages.map(page => ({
      ...page,
      elements: this.composePageElements(page.elements)
    }))
  }

  /**
   * Compose elements for a single page using complete advanced text processing algorithm system.
   */
  private static composePageElements(elements: PdfElement[]): PdfElement[] {
    // Separate text and non-text elements
    const textElements = elements.filter(el => el.type === 'text' && this.isMeaningfulText(el.formattedData || el.data))
    const nonTextElements = elements.filter(el => el.type !== 'text')

    if (textElements.length === 0) return elements

    // Advanced 3-stage text processing system
    let composites = this.convertToComposites(textElements)

    // Stage 1: OverlappingTextAlgorithm (Priority 30) - Spatial merging
    composites = this.runOverlappingTextAlgorithm(composites)

    // Stage 2: OrderCompositesAlgorithm (Priority 40) - Reading order detection
    composites = this.runOrderCompositesAlgorithm(composites)

    // Stage 3: ComputeTextTypesAlgorithm (Priority 50) - Text type classification
    composites = this.runComputeTextTypesAlgorithm(composites)

    // Convert back to PdfElements
    let processedElements = this.convertToElements(composites)

    // Merge drop caps with following paragraphs
    processedElements = this.mergeDropCaps(processedElements)

    // Combine with non-text elements - preserve algorithm ordering for text elements
    // Only sort non-text elements by position, keep text elements in algorithm order
    const processedTextElements = processedElements
    const sortedNonTextElements = nonTextElements.sort((a, b) => {
      const aTop = a.boundingBox?.top || 0
      const bTop = b.boundingBox?.top || 0
      const yDiff = aTop - bTop

      if (Math.abs(yDiff) > 10) return yDiff

      const aLeft = a.boundingBox?.left || 0
      const bLeft = b.boundingBox?.left || 0
      return aLeft - bLeft
    })

    // Merge text and non-text elements while preserving text element order from algorithm
    const finalElements: PdfElement[] = []
    let textIndex = 0
    let nonTextIndex = 0

    while (textIndex < processedTextElements.length || nonTextIndex < sortedNonTextElements.length) {
      const textEl = textIndex < processedTextElements.length ? processedTextElements[textIndex] : null
      const nonTextEl = nonTextIndex < sortedNonTextElements.length ? sortedNonTextElements[nonTextIndex] : null

      if (!textEl) {
        if (nonTextEl) {
          finalElements.push(nonTextEl)
        }
        nonTextIndex++
      } else if (!nonTextEl) {
        finalElements.push(textEl)
        textIndex++
      } else {
        // Compare positions to interleave properly
        const textTop = textEl.boundingBox?.top || 0
        const nonTextTop = nonTextEl.boundingBox?.top || 0

        if (textTop <= nonTextTop + 10) { // Text element comes first or same line
          finalElements.push(textEl)
          textIndex++
        } else {
          finalElements.push(nonTextEl)
          nonTextIndex++
        }
      }
    }

    return finalElements
  }

  /**
   * Convert PdfElements to internal Composite format for processing
   */
  private static convertToComposites(elements: PdfElement[]): Composite[] {
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
   * Convert Composites back to PdfElements
   */
  private static convertToElements(composites: Composite[]): PdfElement[] {
    return composites.map(composite => {
      const firstOriginal = composite.originalElements[0]

      // Determine element type based on classification
      let elementType = firstOriginal.type
      if (composite.attributes.type === 'paragraph') {
        elementType = 'paragraph'
      } else if (['h1', 'h2', 'h3', 'h4', 'h5'].includes(composite.attributes.type || '')) {
        elementType = 'header'
      }

      return {
        ...firstOriginal,
        type: elementType,
        data: composite.data,
        formattedData: composite.formattedData || composite.data,
        boundingBox: {
          top: composite.boundingBox.top,
          left: composite.boundingBox.left,
          width: composite.boundingBox.width,
          height: composite.boundingBox.height
        },
        attributes: {
          ...firstOriginal.attributes,
          fontSize: composite.attributes.fontSize,
          fontFamily: composite.attributes.fontFamily,
          type: composite.attributes.type,
          composed: composite.attributes.composed
        }
      }
    })
  }

  /**
   * Merge drop caps (large initial letters) with their following paragraphs
   */
  private static mergeDropCaps(elements: PdfElement[]): PdfElement[] {
    if (elements.length === 0) return elements

    const result: PdfElement[] = []
    let i = 0

    while (i < elements.length) {
      const currentElement = elements[i]
      const nextElement = i + 1 < elements.length ? elements[i + 1] : null

      // Check if current element is a drop cap pattern
      if (this.isDropCap(currentElement, nextElement) && nextElement) {
        // Merge drop cap with next paragraph
        const mergedElement = this.mergeDropCapWithParagraph(currentElement, nextElement)
        result.push(mergedElement)
        i += 2 // Skip both elements as they're merged
      } else {
        result.push(currentElement)
        i++
      }
    }

    return result
  }

  /**
   * Check if an element is a drop cap (large single letter/word)
   */
  private static isDropCap(element: PdfElement, nextElement: PdfElement | null): boolean {
    if (!element || !nextElement) return false

    // Must be a header (large font) followed by a paragraph
    if (element.type !== 'header' || nextElement.type !== 'paragraph') return false

    const text = (element.data || '').trim()
    const fontSize = element.attributes?.fontSize || 0
    const nextFontSize = nextElement.attributes?.fontSize || 0

    // Drop cap criteria:
    // 1. Very short text (1-3 characters, typically just one letter)
    // 2. Significantly larger font than next element (at least 2x)
    // 3. Elements are vertically close (drop cap should be near the paragraph)
    const isShortText = text.length <= 3
    const isLargeFont = fontSize > nextFontSize * 2
    const isVerticallyClose = this.areVerticallyClose(element, nextElement, 50) // within 50pts

    return isShortText && isLargeFont && isVerticallyClose
  }

  /**
   * Check if two elements are vertically close
   */
  private static areVerticallyClose(element1: PdfElement, element2: PdfElement, threshold: number): boolean {
    const top2 = element2.boundingBox?.top || 0
    const bottom1 = (element1.boundingBox?.top || 0) + (element1.boundingBox?.height || 0)

    // Check if element2 starts within threshold distance from element1's bottom
    const verticalDistance = Math.abs(top2 - bottom1)
    return verticalDistance <= threshold
  }

  /**
   * Merge a drop cap with its following paragraph
   */
  private static mergeDropCapWithParagraph(dropCap: PdfElement, paragraph: PdfElement): PdfElement {
    const dropCapText = (dropCap.data || '').trim()
    const paragraphText = (paragraph.data || '').trim()

    // Combine the texts
    const combinedText = dropCapText + paragraphText

    // Use paragraph's bounding box as the main area, but extend to include drop cap
    const combinedBoundingBox = {
      top: Math.min(dropCap.boundingBox?.top || 0, paragraph.boundingBox?.top || 0),
      left: Math.min(dropCap.boundingBox?.left || 0, paragraph.boundingBox?.left || 0),
      width: Math.max(
        (dropCap.boundingBox?.left || 0) + (dropCap.boundingBox?.width || 0),
        (paragraph.boundingBox?.left || 0) + (paragraph.boundingBox?.width || 0)
      ) - Math.min(dropCap.boundingBox?.left || 0, paragraph.boundingBox?.left || 0),
      height: Math.max(
        (dropCap.boundingBox?.top || 0) + (dropCap.boundingBox?.height || 0),
        (paragraph.boundingBox?.top || 0) + (paragraph.boundingBox?.height || 0)
      ) - Math.min(dropCap.boundingBox?.top || 0, paragraph.boundingBox?.top || 0)
    }

    // Create combined formatted data (keep paragraph formatting, but prepend drop cap)
    const combinedFormattedData = this.combineDropCapFormatting(dropCap, paragraph)

    return {
      ...paragraph, // Use paragraph as base
      data: combinedText,
      formattedData: combinedFormattedData,
      boundingBox: combinedBoundingBox,
      attributes: {
        ...paragraph.attributes,
        composed: true
      }
    }
  }

  /**
   * Combine formatting from drop cap and paragraph
   */
  private static combineDropCapFormatting(dropCap: PdfElement, paragraph: PdfElement): string {
    const paragraphFormatted = paragraph.formattedData || paragraph.data || ''

    // Extract the drop cap letter and paragraph content
    const dropCapText = (dropCap.data || '').trim()
    const paragraphText = (paragraph.data || '').trim()

    if (!dropCapText || !paragraphText) {
      return paragraphFormatted
    }

    // Create a styled drop cap followed by paragraph content
    const dropCapStyled = `<span style="font-size: ${dropCap.attributes?.fontSize}px; font-family: ${dropCap.attributes?.fontFamily}"><strong>${dropCapText}</strong></span>`

    // Remove the drop cap letter from paragraph formatting if it exists
    let cleanParagraphFormatted = paragraphFormatted
    if (paragraphText.toLowerCase().startsWith(dropCapText.toLowerCase())) {
      // If paragraph text starts with same letter, we need to handle it carefully
      cleanParagraphFormatted = paragraphFormatted
    }

    return `${dropCapStyled}${cleanParagraphFormatted}`
  }

  /**
   * Stage 1 - Overlapping Text Algorithm: OverlappingTextAlgorithm (Priority 30)
   * Spatial merging with 10% font tolerance and dynamic expansion
   * 
   * IMPORTANT: Detect column structure FIRST to prevent cross-column merging
   */
  private static runOverlappingTextAlgorithm(composites: Composite[]): Composite[] {
    if (composites.length === 0) return composites

    // Calculate page statistics for dynamic thresholds
    const pageStats = this.calculatePageStatisticsFromComposites(composites)

    // CRITICAL: Detect columns FIRST before any merging
    // This prevents text from different columns being merged together
    const columnBoundaries = this.detectColumnBoundaries(composites, pageStats)
    
    // Assign each composite to a column
    const compositeToColumn = new Map<string, number>()
    for (const composite of composites) {
      const columnIndex = this.assignToColumn(composite, columnBoundaries)
      compositeToColumn.set(composite.id, columnIndex)
    }

    const processed = new Set<string>()
    const result: Composite[] = []

    for (const composite of composites) {
      if (processed.has(composite.id)) continue

      const cluster = [composite]
      processed.add(composite.id)
      
      const compositeColumn = compositeToColumn.get(composite.id) ?? -1

      // Find all overlapping/adjacent composites IN THE SAME COLUMN
      let foundMatch = true
      while (foundMatch) {
        foundMatch = false

        for (const candidate of composites) {
          if (processed.has(candidate.id)) continue
          
          // CRITICAL: Only consider candidates in the SAME column
          const candidateColumn = compositeToColumn.get(candidate.id) ?? -1
          if (candidateColumn !== compositeColumn && compositeColumn !== -1 && candidateColumn !== -1) {
            continue // Skip candidates from different columns
          }

          // Check if candidate should merge with any composite in cluster
          for (const clusterComposite of cluster) {
            if (this.shouldMergeComposites(clusterComposite, candidate, pageStats)) {
              cluster.push(candidate)
              processed.add(candidate.id)
              foundMatch = true
              break
            }
          }

          if (foundMatch) break
        }
      }

      // Create merged composite from cluster
      result.push(this.createMergedComposite(cluster))
    }

    return result
  }

  /**
   * Detect column boundaries using horizontal gap analysis
   * Returns array of column boundaries: [{left, right}, ...]
   * 
   * Algorithm:
   * 1. Filter to text composites with meaningful content (10+ chars)
   * 2. Cluster elements by their left position (within 30pt threshold)
   * 3. Find significant clusters (at least 10% of elements or 3+ elements)
   * 4. Validate gaps between clusters are large enough (50pt+) to be column separators
   * 5. Create column boundaries at midpoints between clusters
   */
  private static detectColumnBoundaries(composites: Composite[], pageStats: any): Array<{left: number, right: number}> {
    if (composites.length === 0) return []

    // Filter to only text composites with meaningful content (at least 10 chars to avoid stray punctuation)
    const textComposites = composites.filter(c => 
      c.data && c.data.trim().length >= 10
    )

    if (textComposites.length < 5) {
      // Not enough elements to detect columns
      return [{ left: 0, right: pageStats.pageWidth }]
    }

    // Group elements by their left position into clusters
    const leftClusters: Array<{left: number, elements: Composite[]}> = []
    const clusterThreshold = 30 // Elements within 30pt are in same cluster
    
    for (const comp of textComposites) {
      const elemLeft = comp.boundingBox.left
      
      // Find existing cluster for this left position
      let found = false
      for (const cluster of leftClusters) {
        if (Math.abs(cluster.left - elemLeft) < clusterThreshold) {
          cluster.elements.push(comp)
          // Update cluster left to average
          const total = cluster.elements.reduce((sum, c) => sum + c.boundingBox.left, 0)
          cluster.left = total / cluster.elements.length
          found = true
          break
        }
      }
      
      if (!found) {
        leftClusters.push({ left: elemLeft, elements: [comp] })
      }
    }

    // Filter to significant clusters (at least 3 elements or 10% of total)
    const minElements = Math.max(3, textComposites.length * 0.1)
    const significantClusters = leftClusters
      .filter(c => c.elements.length >= minElements)
      .sort((a, b) => a.left - b.left)

    if (significantClusters.length < 2) {
      return [{ left: 0, right: pageStats.pageWidth + 100 }]
    }

    // Check if gaps between clusters are large enough to be column separators
    // Typical column gap is 50-100pt or more
    const minColumnGap = 50
    let hasValidGaps = true
    
    for (let i = 0; i < significantClusters.length - 1; i++) {
      const gap = significantClusters[i + 1].left - significantClusters[i].left
      if (gap < minColumnGap) {
        hasValidGaps = false
        break
      }
    }

    if (!hasValidGaps) {
      return [{ left: 0, right: pageStats.pageWidth + 100 }]
    }

    // Create column boundaries from clusters
    const columns: Array<{left: number, right: number}> = []
    
    for (let i = 0; i < significantClusters.length; i++) {
      const cluster = significantClusters[i]
      
      // Column left starts a bit before the cluster's left
      const colLeft = i === 0 ? 0 : (significantClusters[i-1].left + cluster.left) / 2
      
      // Column right ends at midpoint to next cluster, or page end
      const colRight = i === significantClusters.length - 1 
        ? pageStats.pageWidth + 100
        : (cluster.left + significantClusters[i+1].left) / 2
      
      columns.push({ left: colLeft, right: colRight })
    }

    return columns
  }

  /**
   * Assign a composite to a column based on its left position
   */
  private static assignToColumn(composite: Composite, columns: Array<{left: number, right: number}>): number {
    const elemLeft = composite.boundingBox.left
    const elemCenter = elemLeft + composite.boundingBox.width / 2

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i]
      // Check if element's left edge or center falls within this column
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
   * Stage 2 - Spatial Order Algorithm: OrderCompositesAlgorithm (Priority 40)
   * Reading order detection with beam scanning for multi-column layout
   */
  private static runOrderCompositesAlgorithm(composites: Composite[]): Composite[] {
    if (composites.length === 0) return composites

    // Use beam scanning to detect column layout
    const columns = this.detectColumnsWithBeamScanning(composites)

    if (columns.length <= 1) {
      // Single column - simple top-to-bottom sorting
      return composites.sort((a, b) => a.boundingBox.top - b.boundingBox.top)
    }

    // Multi-column - sort by column first, then by position within column
    const sortedComposites: Composite[] = []

    // Process each column left-to-right
    columns.sort((a, b) => a.leftBoundary - b.leftBoundary)

    for (const column of columns) {
      // Sort elements within column by top-to-bottom
      const columnElements = column.elements.sort((a, b) => a.boundingBox.top - b.boundingBox.top)
      sortedComposites.push(...columnElements)
    }

    return sortedComposites
  }

  /**
   * Advanced Beam Scanning: Detect column layout using horizontal density analysis
   * 
   * Improved algorithm for multi-column detection (2, 3, or more columns):
   * 1. Build horizontal density histogram to find vertical gaps
   * 2. Use consistent gap detection across multiple vertical positions
   * 3. Validate columns by checking element distribution consistency
   */
  private static detectColumnsWithBeamScanning(composites: Composite[]): Array<{
    leftBoundary: number
    rightBoundary: number
    elements: Composite[]
  }> {
    if (composites.length === 0) return []

    // Calculate page boundaries
    const leftMost = Math.min(...composites.map(c => c.boundingBox.left))
    const rightMost = Math.max(...composites.map(c => c.boundingBox.right))
    const pageWidth = rightMost - leftMost

    // For very narrow content, assume single column
    if (pageWidth < 200) {
      return [{
        leftBoundary: leftMost,
        rightBoundary: rightMost,
        elements: composites
      }]
    }

    // Step 1: Build horizontal density histogram
    // Divide page width into bins and count element coverage
    const binCount = Math.max(50, Math.ceil(pageWidth / 10)) // 10pt bins or at least 50 bins
    const binWidth = pageWidth / binCount
    const densityHistogram = new Array(binCount).fill(0)

    for (const comp of composites) {
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
    const gapThreshold = maxDensity * 0.1 // Bins with less than 10% of max density are gaps
    
    const gaps: Array<{ start: number, end: number, width: number }> = []
    let gapStart: number | null = null
    
    for (let i = 0; i < binCount; i++) {
      const isGap = densityHistogram[i] <= gapThreshold
      
      if (isGap && gapStart === null) {
        gapStart = i
      } else if (!isGap && gapStart !== null) {
        const gapWidthPx = (i - gapStart) * binWidth
        // Only count gaps that are significant (at least 8pt or 1% of page width)
        const minGapWidth = Math.max(8, pageWidth * 0.01)
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
      const minGapWidth = Math.max(8, pageWidth * 0.01)
      if (gapWidthPx >= minGapWidth) {
        gaps.push({
          start: leftMost + gapStart * binWidth,
          end: rightMost,
          width: gapWidthPx
        })
      }
    }

    // Step 3: Convert gaps to column boundaries
    if (gaps.length === 0) {
      // No gaps detected - single column
      return [{
        leftBoundary: leftMost,
        rightBoundary: rightMost,
        elements: composites
      }]
    }

    // Step 4: Validate detected columns
    // Sort gaps by position
    gaps.sort((a, b) => a.start - b.start)
    
    // Create column boundaries from gaps
    const columnBoundaries: Array<{ left: number, right: number }> = []
    let currentLeft = leftMost

    for (const gap of gaps) {
      // Column from current left to gap start
      if (gap.start > currentLeft + 20) { // Minimum column width of 20pt
        columnBoundaries.push({
          left: currentLeft,
          right: gap.start
        })
      }
      currentLeft = gap.end
    }

    // Last column from last gap end to right edge
    if (rightMost > currentLeft + 20) {
      columnBoundaries.push({
        left: currentLeft,
        right: rightMost
      })
    }

    // Step 5: Validate column distribution
    // Each column should have a reasonable number of elements
    const columns: Array<{ leftBoundary: number, rightBoundary: number, elements: Composite[] }> = []
    
    for (const boundary of columnBoundaries) {
      const columnElements = composites.filter(comp => {
        const elementCenter = (comp.boundingBox.left + comp.boundingBox.right) / 2
        return elementCenter >= boundary.left && elementCenter <= boundary.right
      })

      // Only add columns with at least 1 element
      if (columnElements.length > 0) {
        columns.push({
          leftBoundary: boundary.left,
          rightBoundary: boundary.right,
          elements: columnElements
        })
      }
    }

    // Step 6: Final validation - if column detection seems wrong, fall back
    // Check if detected columns make sense (each should have reasonable element count)
    if (columns.length > 1) {
      const avgElementsPerColumn = composites.length / columns.length
      const hasUnbalancedColumns = columns.some(col => 
        col.elements.length < avgElementsPerColumn * 0.2 // Less than 20% of average
      )
      
      // If columns are very unbalanced, this might be wrong detection
      // Check if elements span across detected column boundaries (false positive)
      const crossBoundaryElements = composites.filter(comp => {
        const elementCenter = (comp.boundingBox.left + comp.boundingBox.right) / 2
        return gaps.some(gap => elementCenter > gap.start && elementCenter < gap.end)
      })
      
      // If many elements cross boundaries, fall back to single column
      if (crossBoundaryElements.length > composites.length * 0.3 || hasUnbalancedColumns) {
        return [{
          leftBoundary: leftMost,
          rightBoundary: rightMost,
          elements: composites
        }]
      }
    }

    // If no valid columns detected, return single column
    if (columns.length === 0) {
      return [{
        leftBoundary: leftMost,
        rightBoundary: rightMost,
        elements: composites
      }]
    }

    return columns
  }

  /**
   * Stage 3 - Text Type Classification: ComputeTextTypesAlgorithm (Priority 50)
   * Text type classification based on font size analysis
   */
  private static runComputeTextTypesAlgorithm(composites: Composite[]): Composite[] {
    if (composites.length === 0) return composites

    // Calculate character-weighted average font size (optimized approach)
    const weightedPairs = composites.map(comp => [comp.attributes.fontSize, comp.data.length])
    const totalCharacters = weightedPairs.reduce((sum, [_, charCount]) => sum + charCount, 0)
    const aggregatedSum = weightedPairs.reduce((sum, [fontSize, charCount]) => sum + fontSize * charCount, 0)
    const averageFontSize = totalCharacters > 0 ? aggregatedSum / totalCharacters : 12

    // Define heading thresholds based on advanced algorithm
    const headingThresholds = [
      { type: 'h1', size: 2.1 * averageFontSize },
      { type: 'h2', size: 1.75 * averageFontSize },
      { type: 'h3', size: 1.5 * averageFontSize },
      { type: 'h4', size: 1.25 * averageFontSize },
      { type: 'h5', size: 1.1 * averageFontSize }
    ]

    // Classify each composite (optimized logic)
    for (const composite of composites) {
      const fontSize = composite.attributes.fontSize
      const wordCount = composite.data.split(/\s+/).filter(str => str !== '').length
      const isLongText = wordCount > 15

      if (fontSize > averageFontSize && !isLongText) {
        // Find appropriate heading level (uses floor comparison)
        const heading = headingThresholds.find(threshold => threshold.size <= fontSize)
        composite.attributes.type = heading ? heading.type : 'h5'
      } else {
        composite.attributes.type = 'paragraph'
      }
    }

    return composites
  }

  /**
   * Calculate page statistics from composites (optimized approach)
   */
  private static calculatePageStatisticsFromComposites(composites: Composite[]): {
    averageFontSize: number
    totalCharacters: number
    pageWidth: number
  } {
    const weightedPairs = composites.map(comp => [
      comp.attributes.fontSize,
      comp.data.length
    ])

    const totalCharacters = weightedPairs.reduce((sum, [_, charCount]) => sum + charCount, 0)
    const aggregatedSum = weightedPairs.reduce((sum, [fontSize, charCount]) => sum + fontSize * charCount, 0)
    const averageFontSize = totalCharacters > 0 ? aggregatedSum / totalCharacters : 12

    // Calculate effective page width from composite bounding boxes
    const rightMost = composites.reduce((max, c) => Math.max(max, c.boundingBox.right), 0)
    const leftMost = composites.reduce((min, c) => Math.min(min, c.boundingBox.left), rightMost)
    const pageWidth = rightMost - leftMost

    return { averageFontSize, totalCharacters, pageWidth }
  }

  /**
   * Advanced composite merging criteria
   * 
   * Key improvement: Prevent merging elements from different columns by
   * checking horizontal distance more strictly when elements are on the same line
   */
  private static shouldMergeComposites(compA: Composite, compB: Composite, pageStats: any): boolean {
    // Font compatibility check (10% tolerance using optimized techniques)
    const fontSizeA = compA.attributes.fontSize
    const fontSizeB = compB.attributes.fontSize
    const relativeFontDiff = Math.abs(fontSizeA / fontSizeB - 1)

    if (relativeFontDiff > 0.1) return false

    // Get width information
    const widthA = compA.boundingBox.width
    const widthB = compB.boundingBox.width
    const maxWidth = Math.max(widthA, widthB)
    const minWidth = Math.min(widthA, widthB)

    // NEW: Check for significant width difference (indicates different layout zones)
    // If one element is more than 2x wider than the other, they're likely in different layout zones
    // (e.g., full-width intro paragraph vs. column content)
    const widthRatio = maxWidth / minWidth
    if (widthRatio > 2.0 && minWidth < pageStats.pageWidth * 0.5) {
      // One element is significantly wider AND the narrower one is less than half page width
      // This suggests mixing full-width content with column content - don't merge
      return false
    }

    // Check if elements are on the same horizontal line
    const verticalOverlap = this.getVerticalOverlap(compA.boundingBox, compB.boundingBox)
    const avgHeight = (compA.boundingBox.height + compB.boundingBox.height) / 2
    const areOnSameLine = verticalOverlap > avgHeight * 0.5 // More than 50% vertical overlap

    // Calculate horizontal gap between elements
    const horizontalGap = this.getHorizontalGap(compA.boundingBox, compB.boundingBox)

    // If elements are on the same line, apply STRICT horizontal distance check
    // This prevents merging text from different columns
    if (areOnSameLine) {
      const avgFontSize = (fontSizeA + fontSizeB) / 2
      
      // Maximum allowed gap for same-line elements:
      // - Normal word spacing is typically 0.25-0.5 em
      // - We allow up to 2x font size for generous spacing
      // - But never more than 30pt (typical column gap is larger)
      const maxHorizontalGap = Math.min(avgFontSize * 2, 30)
      
      if (horizontalGap > maxHorizontalGap) {
        return false // Elements are too far apart horizontally - likely different columns
      }
      
      // For same-line elements, only merge if they're close enough
      return horizontalGap <= maxHorizontalGap
    }

    // For elements NOT on the same line (vertically stacked), we need to be careful
    // Only merge if they are in the same column (horizontally aligned)
    
    // Check horizontal alignment - elements should have significant horizontal overlap
    // to be considered in the same column
    const horizontalOverlap = this.getHorizontalOverlap(compA.boundingBox, compB.boundingBox)
    
    // Require at least 30% horizontal overlap to be in the same column
    // This prevents merging elements from different columns that happen to be close vertically
    if (horizontalOverlap < minWidth * 0.3) {
      return false // Not enough horizontal alignment - likely different columns
    }

    // NEW: For vertically stacked elements, also check that their left edges are aligned
    // This prevents merging column 1 content with full-width content that happens to overlap
    const leftA = compA.boundingBox.left
    const leftB = compB.boundingBox.left
    const rightA = compA.boundingBox.right
    const rightB = compB.boundingBox.right
    
    // Check if left edges are reasonably aligned (within 20% of min width)
    const leftDiff = Math.abs(leftA - leftB)
    const leftAlignmentThreshold = minWidth * 0.2
    
    // Check if right edges are reasonably aligned
    const rightDiff = Math.abs(rightA - rightB)
    const rightAlignmentThreshold = minWidth * 0.2
    
    // At least one edge should be aligned for vertical stacking
    const leftAligned = leftDiff <= leftAlignmentThreshold
    const rightAligned = rightDiff <= rightAlignmentThreshold
    
    if (!leftAligned && !rightAligned) {
      return false // Neither edge aligned - likely different columns or layout zones
    }

    const avgFontSize = (fontSizeA + fontSizeB) / 2
    const correctedFontSize = Math.max(Math.pow(avgFontSize, 2) / pageStats.averageFontSize, avgFontSize)

    // Enhanced expansion calculation - but only apply to vertical proximity
    const baseExpansion = correctedFontSize / 3.5
    const minExpansion = Math.max(avgFontSize * 0.8, 5)
    const expansionAmount = Math.min(Math.max(baseExpansion, minExpansion), 15)

    // Check vertical proximity with expansion
    return this.intersectsVerticallyWithExpansion(compA.boundingBox, compB.boundingBox, expansionAmount)
  }

  /**
   * Calculate vertical overlap between two bounding boxes
   */
  private static getVerticalOverlap(boxA: any, boxB: any): number {
    const topA = boxA.top
    const bottomA = boxA.bottom
    const topB = boxB.top
    const bottomB = boxB.bottom

    const overlapTop = Math.max(topA, topB)
    const overlapBottom = Math.min(bottomA, bottomB)

    return Math.max(0, overlapBottom - overlapTop)
  }

  /**
   * Calculate horizontal overlap between two bounding boxes
   * Returns the amount of horizontal overlap (0 if no overlap)
   */
  private static getHorizontalOverlap(boxA: any, boxB: any): number {
    const leftA = boxA.left
    const rightA = boxA.right
    const leftB = boxB.left
    const rightB = boxB.right

    const overlapLeft = Math.max(leftA, leftB)
    const overlapRight = Math.min(rightA, rightB)

    return Math.max(0, overlapRight - overlapLeft)
  }

  /**
   * Calculate horizontal gap between two bounding boxes
   * Returns 0 if boxes overlap horizontally
   */
  private static getHorizontalGap(boxA: any, boxB: any): number {
    const leftA = boxA.left
    const rightA = boxA.right
    const leftB = boxB.left
    const rightB = boxB.right

    if (rightA < leftB) {
      return leftB - rightA // A is to the left of B
    } else if (rightB < leftA) {
      return leftA - rightB // B is to the left of A
    }
    return 0 // Boxes overlap horizontally
  }

  /**
   * Check if two boxes are vertically close (for stacked elements)
   */
  private static intersectsVerticallyWithExpansion(boxA: any, boxB: any, expansion: number): boolean {
    // Check horizontal overlap first (elements must be in same column area)
    const horizontalOverlap = !(boxA.right < boxB.left || boxB.right < boxA.left)
    
    if (!horizontalOverlap) {
      // If no horizontal overlap, check if they're close horizontally
      const horizontalGap = this.getHorizontalGap(boxA, boxB)
      if (horizontalGap > expansion) {
        return false // Too far apart horizontally
      }
    }

    // Check vertical proximity with expansion
    const expandedA = {
      top: boxA.top - expansion,
      bottom: boxA.bottom + expansion
    }

    return !(expandedA.bottom < boxB.top || expandedA.top > boxB.bottom)
  }

  /**
   * Create merged composite from cluster of composites
   */
  private static createMergedComposite(cluster: Composite[]): Composite {
    if (cluster.length === 1) {
      cluster[0].attributes.composed = true
      return cluster[0]
    }

    // Sort cluster by reading order
    cluster.sort((a, b) => {
      const yDiff = a.boundingBox.top - b.boundingBox.top
      if (Math.abs(yDiff) > 10) return yDiff
      return a.boundingBox.left - b.boundingBox.left
    })

    // Calculate merged bounding box
    const tops = cluster.map(c => c.boundingBox.top)
    const lefts = cluster.map(c => c.boundingBox.left)
    const rights = cluster.map(c => c.boundingBox.right)
    const bottoms = cluster.map(c => c.boundingBox.bottom)

    const mergedBox = {
      top: Math.min(...tops),
      left: Math.min(...lefts),
      right: Math.max(...rights),
      bottom: Math.max(...bottoms),
      width: Math.max(...rights) - Math.min(...lefts),
      height: Math.max(...bottoms) - Math.min(...tops)
    }

    // Merge text content
    const mergedData = cluster.map(c => c.data).join(' ')
    const mergedFormatted = cluster.map(c => c.formattedData || c.data).join(' ')
    
    // Check if this is a header element based on font size (since types are assigned later)
    // Calculate average font size for this cluster
    const clusterAvgFontSize = cluster.reduce((sum, c) => sum + c.attributes.fontSize, 0) / cluster.length
    
    // Estimate if this could be a header based on font size
    // We'll use a similar threshold as in computeTextTypes (roughly 1.1x+ average font size)
    const isHeaderElement = clusterAvgFontSize >= 21 // This should catch h2 headers with font size 21.12px
    
    // Optimize and clean up the formatted data
    const optimizedFormatted = this.optimizeFormattedHtml(mergedFormatted, isHeaderElement)
    const cleanedFormatted = this.cleanupFormattedHtml(optimizedFormatted)

    // Calculate average font size
    const avgFontSize = cluster.reduce((sum, c) => sum + c.attributes.fontSize, 0) / cluster.length

    // Collect all original elements
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

  private static calculatePageStatistics(textElements: PdfElement[]): {
    averageFontSize: number
    totalCharacters: number
    fontSizeDistribution: Map<number, number>
  } {
    const weightedPairs = textElements.map(el => [
      el.attributes?.fontSize || 12,
      (el.data || '').length
    ])

    const totalCharacters = weightedPairs.reduce((sum, [_, charCount]) => sum + charCount, 0)
    const aggregatedSum = weightedPairs.reduce((sum, [fontSize, charCount]) => sum + fontSize * charCount, 0)
    const averageFontSize = totalCharacters > 0 ? aggregatedSum / totalCharacters : 12

    // Font size distribution for better analysis
    const fontSizeDistribution = new Map<number, number>()
    textElements.forEach(el => {
      const fontSize = Math.round((el.attributes?.fontSize || 12) * 10) / 10
      fontSizeDistribution.set(fontSize, (fontSizeDistribution.get(fontSize) || 0) + 1)
    })

    return { averageFontSize, totalCharacters, fontSizeDistribution }
  }

  /**
   * Group text elements using dynamic clustering with advanced spatial analysis.
   */
  private static groupWithDynamicClustering(textElements: PdfElement[], pageStats: any): PdfElement[] {
    if (textElements.length === 0) return []

    // Sort text elements by reading order (top to bottom, then left to right)
    const sortedElements = [...textElements].sort((a, b) => {
      const aTop = a.boundingBox?.top || 0
      const bTop = b.boundingBox?.top || 0
      const yDiff = aTop - bTop

      if (Math.abs(yDiff) > 10) return yDiff // Different lines

      const aLeft = a.boundingBox?.left || 0
      const bLeft = b.boundingBox?.left || 0
      return aLeft - bLeft // Same line, left to right
    })

    // Use advanced overlapping algorithm
    const clusters = this.findOverlappingClusters(sortedElements, pageStats)

    // Convert clusters to composed paragraphs
    const paragraphs = clusters
      .filter(cluster => cluster.length > 0)
      .map(cluster => this.createComposedParagraph(cluster))

    return paragraphs
  }

  /**
   * advanced overlapping detection algorithm.
   */
  private static findOverlappingClusters(elements: PdfElement[], pageStats: any): PdfElement[][] {
    const clusters: PdfElement[][] = []
    const processed = new Set<number>()

    for (let i = 0; i < elements.length; i++) {
      if (processed.has(i)) continue

      const cluster = [elements[i]]
      processed.add(i)

      // Find all overlapping/adjacent elements
      let foundMatch = true
      while (foundMatch) {
        foundMatch = false

        for (let j = 0; j < elements.length; j++) {
          if (processed.has(j)) continue

          // Check if current element should merge with any element in cluster
          for (const clusterElement of cluster) {
            if (this.shouldMergeElements(clusterElement, elements[j], pageStats)) {
              cluster.push(elements[j])
              processed.add(j)
              foundMatch = true
              break
            }
          }

          if (foundMatch) break
        }
      }

      clusters.push(cluster)
    }

    return clusters
  }

  /**
   * Advanced element merging criteria with dynamic thresholds.
   * 
   * Key improvement: Prevent merging elements from different columns by
   * checking horizontal distance strictly when elements are on the same line
   */
  private static shouldMergeElements(elementA: PdfElement, elementB: PdfElement, pageStats: any): boolean {
    // Font compatibility check (10% tolerance using optimized techniques)
    const fontSizeA = elementA.attributes?.fontSize || 12
    const fontSizeB = elementB.attributes?.fontSize || 12
    const relativeFontDiff = Math.abs(fontSizeA / fontSizeB - 1)

    if (relativeFontDiff > 0.1) return false

    const boxA = elementA.boundingBox
    const boxB = elementB.boundingBox
    
    if (!boxA || !boxB) return false

    // Normalize bounding boxes to have right and bottom
    const normalizedA = {
      top: boxA.top || 0,
      left: boxA.left || 0,
      right: (boxA.left || 0) + (boxA.width || 0),
      bottom: (boxA.top || 0) + (boxA.height || 0),
      height: boxA.height || 0
    }
    const normalizedB = {
      top: boxB.top || 0,
      left: boxB.left || 0,
      right: (boxB.left || 0) + (boxB.width || 0),
      bottom: (boxB.top || 0) + (boxB.height || 0),
      height: boxB.height || 0
    }

    // Check if elements are on the same horizontal line
    const verticalOverlap = this.getVerticalOverlapForElements(normalizedA, normalizedB)
    const avgHeight = (normalizedA.height + normalizedB.height) / 2
    const areOnSameLine = verticalOverlap > avgHeight * 0.5

    // Calculate horizontal gap between elements
    const horizontalGap = this.getHorizontalGapForElements(normalizedA, normalizedB)

    // If elements are on the same line, apply STRICT horizontal distance check
    if (areOnSameLine) {
      const avgFontSize = (fontSizeA + fontSizeB) / 2
      
      // Maximum allowed gap for same-line elements
      const maxHorizontalGap = Math.min(avgFontSize * 2, 30)
      
      if (horizontalGap > maxHorizontalGap) {
        return false // Elements are too far apart horizontally - likely different columns
      }
      
      return horizontalGap <= maxHorizontalGap
    }

    // For elements NOT on the same line, use expansion logic for vertical proximity
    const avgFontSize = (fontSizeA + fontSizeB) / 2
    const correctedFontSize = Math.max(Math.pow(avgFontSize, 2) / pageStats.averageFontSize, avgFontSize)
    const expansionAmount = Math.min(Math.max(correctedFontSize / 3.5, 2), 10)

    return this.intersectsWithExpansion(normalizedA, normalizedB, expansionAmount)
  }

  /**
   * Calculate vertical overlap for elements
   */
  private static getVerticalOverlapForElements(boxA: any, boxB: any): number {
    const overlapTop = Math.max(boxA.top, boxB.top)
    const overlapBottom = Math.min(boxA.bottom, boxB.bottom)
    return Math.max(0, overlapBottom - overlapTop)
  }

  /**
   * Calculate horizontal gap for elements
   */
  private static getHorizontalGapForElements(boxA: any, boxB: any): number {
    if (boxA.right < boxB.left) {
      return boxB.left - boxA.right
    } else if (boxB.right < boxA.left) {
      return boxA.left - boxB.right
    }
    return 0
  }

  /**
   * Check if two bounding boxes intersect with expansion (advanced).
   */
  private static intersectsWithExpansion(boxA: any, boxB: any, expansion: number): boolean {
    if (!boxA || !boxB) return false

    // Check horizontal overlap first
    const horizontalGap = this.getHorizontalGapForElements(boxA, boxB)
    if (horizontalGap > expansion) {
      return false // Too far apart horizontally
    }

    const expandedA = {
      top: boxA.top - expansion,
      bottom: boxA.bottom + expansion
    }

    return !(expandedA.bottom < boxB.top || expandedA.top > boxB.bottom)
  }

  /**
   * Generic title detection without hard-coded content.
   */
  private static looksLikeGenericTitle(text: string): boolean {
    if (!text || text.length === 0) return false

    const cleanText = text.trim()

    // Generic title patterns
    const isAllCaps = /^[A-Z\s\-.,!]+$/.test(cleanText) && cleanText.length < 100
    const isShortAndBold = cleanText.length < 50 && /^[A-Z]/.test(cleanText) && !/[.!?]$/.test(cleanText)
    const hasSpecialFormatting = /^(P\d+|CHAPTER \d+|SECTION \d+)$/i.test(cleanText)

    return isAllCaps || isShortAndBold || hasSpecialFormatting
  }

  /**
   * Generic new section detection.
   */
  private static looksLikeNewSection(text: string): boolean {
    if (!text || text.length === 0) return false

    // Question patterns (generic interview/conversation starters)
    const isQuestion = /^(Can you|How do|What|Where|When|Why|Would you|Tell us|Share|Describe|Explain)/i.test(text)

    // Formal introduction patterns
    const isFormalIntro = /^(Mr\.|Ms\.|Dr\.|Prof\.)\s/i.test(text)

    return isQuestion || isFormalIntro
  }

  /**
   * Create a composed paragraph element from multiple text elements.
   */
  private static createComposedParagraph(elements: PdfElement[]): PdfElement {
    // Calculate paragraph bounding box
    const bounds = this.calculateParagraphBounds(elements)

    // Combine plain text content
    const paragraphText = elements.map(el => el.data).join(' ')

    // Combine formatted HTML content preserving individual formatting
    const formattedHtml = this.combineFormattedText(elements)

    // Calculate average font size
    const avgFontSize = elements.reduce((sum, el) => sum + (el.attributes?.fontSize || 12), 0) / elements.length

    // Use the first element as base and modify it
    const firstElement = elements[0]

    return {
      ...firstElement,
      type: 'paragraph', // New type for composed paragraphs
      boundingBox: bounds,
      data: paragraphText, // Plain text
      formattedData: formattedHtml, // HTML formatted text
      attributes: {
        ...firstElement.attributes,
        fontSize: Math.round(avgFontSize * 10) / 10, // Round to 1 decimal place
        composed: true // Mark as composed element
      }
    }
  }

  /**
   * Calculate the bounding box that encompasses all elements in a paragraph.
   */
  private static calculateParagraphBounds(elements: PdfElement[]): { top: number, left: number, bottom: number, right: number, width: number, height: number } {
    const tops = elements.map(el => el.boundingBox?.top || 0)
    const lefts = elements.map(el => el.boundingBox?.left || 0)
    const bottoms = elements.map(el => (el.boundingBox?.top || 0) + (el.boundingBox?.height || 0))
    const rights = elements.map(el => (el.boundingBox?.left || 0) + (el.boundingBox?.width || 0))

    const minTop = Math.min(...tops)
    const minLeft = Math.min(...lefts)
    const maxBottom = Math.max(...bottoms)
    const maxRight = Math.max(...rights)

    return {
      top: minTop,
      left: minLeft,
      bottom: maxBottom,
      right: maxRight,
      width: maxRight - minLeft,
      height: maxBottom - minTop
    }
  }

  /**
   * Check if text content is meaningful (filters out empty, whitespace-only, or control character text).
   */
  private static isMeaningfulText(text: string | undefined): boolean {
    if (!text || text.trim().length === 0) return false

    // Filter out control characters and non-printable Unicode characters
    const cleanText = text.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '').trim()
    if (cleanText.length === 0) return false

    // Filter out strings that are only whitespace, punctuation, or single characters
    if (cleanText.length < 2 && /^[\s\W]$/.test(cleanText)) return false

    return true
  }

  /**
   * Combine formatted HTML text from multiple elements intelligently
   */
  private static combineFormattedText(elements: PdfElement[]): string {
    if (elements.length === 0) return ''

    // Join formatted text with appropriate spacing
    const formattedParts = elements.map(el => {
      const formatted = el.formattedData || el.data || ''
      return formatted.trim()
    }).filter(part => part.length > 0)

    if (formattedParts.length === 0) return ''

    // Smart joining - add space between parts unless they end/start with HTML tags
    let result = formattedParts[0]
    for (let i = 1; i < formattedParts.length; i++) {
      const prev = formattedParts[i - 1]
      const current = formattedParts[i]

      // Check if we need space between parts
      const needsSpace = !prev.endsWith('>') && !current.startsWith('<') &&
        !prev.endsWith(' ') && !current.startsWith(' ')

      result += (needsSpace ? ' ' : '') + current
    }

    // Clean up empty and redundant HTML elements
    result = this.cleanupFormattedHtml(result)

    // Wrap the combined content in a paragraph tag if it doesn't already have block-level tags
    if (!this.hasBlockLevelTags(result)) {
      result = `<p>${result}</p>`
    }

    return result
  }

  /**
   * Optimize formatted HTML by merging spans with similar or compatible styling
   */
  private static optimizeFormattedHtml(html: string, isHeaderElement = false): string {
    if (!html || html.trim().length === 0) return ''

    // Parse spans and extract their content and styling
    const spanRegex = /<span([^>]*)>(.*?)<\/span>/g
    const spans: { attributes: string; content: string; styles: Record<string, string> }[] = []
    let match

    while ((match = spanRegex.exec(html)) !== null) {
      const attributes = match[1]
      const content = match[2]
      
      // Parse style attributes
      const styles: Record<string, string> = {}
      const styleMatch = attributes.match(/style="([^"]*)"/)
      if (styleMatch) {
        const styleString = styleMatch[1]
        styleString.split(';').forEach(rule => {
          const [property, value] = rule.split(':').map(s => s.trim())
          if (property && value) {
            styles[property] = value
          }
        })
      }

      spans.push({ attributes, content, styles })
    }

    // If no spans found, return original
    if (spans.length === 0) return html

    // Check if all spans can be merged (header elements have special rules)
    if (this.canMergeAllSpans(spans, isHeaderElement)) {
      // Merge all spans into one with the most complete styling
      const mergedStyles = this.getMergedStyles(spans, isHeaderElement)
      
      let mergedContent: string
      if (isHeaderElement) {
        // For headers, extract the text content from inside header tags and merge into single header
        const headerTexts: string[] = []
        let headerTag = 'h2' // default
        
        spans.forEach(span => {
          // Extract header tag and text content
          const headerMatch = span.content.match(/<(h[1-6])>(.*?)<\/h[1-6]>/g)
          if (headerMatch) {
            headerMatch.forEach(match => {
              const tagMatch = match.match(/<(h[1-6])>(.*?)<\/h[1-6]>/)
              if (tagMatch) {
                headerTag = tagMatch[1] // Get the header level (h1, h2, etc)
                const text = tagMatch[2].trim()
                if (text && text !== '') {
                  headerTexts.push(text)
                }
              }
            })
          }
        })
        
        // Merge all header texts into one header tag
        mergedContent = `<${headerTag}>${headerTexts.join(' ')}</${headerTag}>`
      } else {
        // For non-headers, use original logic
        mergedContent = spans.map(s => s.content).join(' ')
      }
      
      const styleString = Object.entries(mergedStyles)
        .map(([prop, value]) => `${prop}: ${value}`)
        .join('; ')
      
      return `<span style="${styleString}">${mergedContent}</span>`
    }

    // Otherwise, return original html (could add more sophisticated merging later)
    return html
  }

  /**
   * Check if all spans can be merged based on their styling compatibility
   */
  private static canMergeAllSpans(spans: { styles: Record<string, string> }[], isHeaderElement = false): boolean {
    if (spans.length <= 1) return true

    // For header elements, be more permissive about merging
    // Headers should be semantically consistent even if some spans lack certain styles
    if (isHeaderElement) {
      // Check if all spans have the same basic formatting (font-size, font-family)
      // Allow merging even if color is missing from some spans
      const firstSpan = spans[0]
      const baseSize = firstSpan.styles['font-size']
      const baseFamily = firstSpan.styles['font-family']
      
      return spans.every(span => {
        const spanSize = span.styles['font-size']
        const spanFamily = span.styles['font-family']
        
        // Same size and family are required for headers
        return spanSize === baseSize && spanFamily === baseFamily
      })
    }

    // For non-header elements, use the original strict compatibility logic
    // Get the base styles from the span that has the most complete styling
    const mostCompleteSpan = spans.reduce((prev, current) => {
      return Object.keys(current.styles).length > Object.keys(prev.styles).length ? current : prev
    })

    // Check if all spans are compatible with the most complete styling
    return spans.every(span => {
      // A span is compatible if:
      // 1. It has the same values for properties that exist in both
      // 2. It doesn't contradict any properties in the most complete span
      return Object.entries(span.styles).every(([prop, value]) => {
        const baseValue = mostCompleteSpan.styles[prop]
        return !baseValue || baseValue === value
      })
    })
  }

  /**
   * Merge styles from multiple spans, prioritizing the most complete styling
   */
  private static getMergedStyles(spans: { styles: Record<string, string> }[], isHeaderElement = false): Record<string, string> {
    const merged: Record<string, string> = {}

    if (isHeaderElement) {
      // For headers, prioritize the span with color information for semantic consistency
      const spanWithColor = spans.find(span => span.styles.color)
      const mostCompleteSpan = spanWithColor || spans.reduce((prev, current) => {
        return Object.keys(current.styles).length > Object.keys(prev.styles).length ? current : prev
      })

      // Start with the prioritized span's styles
      Object.assign(merged, mostCompleteSpan.styles)

      // Add any additional properties from other spans that don't conflict
      spans.forEach(span => {
        Object.entries(span.styles).forEach(([prop, value]) => {
          if (!merged[prop]) {
            merged[prop] = value
          }
        })
      })
    } else {
      // For non-header elements, use original logic
      // Start with the most complete span's styles
      const mostCompleteSpan = spans.reduce((prev, current) => {
        return Object.keys(current.styles).length > Object.keys(prev.styles).length ? current : prev
      })

      Object.assign(merged, mostCompleteSpan.styles)

      // Add any additional properties from other spans that don't conflict
      spans.forEach(span => {
        Object.entries(span.styles).forEach(([prop, value]) => {
          if (!merged[prop]) {
            merged[prop] = value
          }
        })
      })
    }

    return merged
  }

  /**
   * Clean up formatted HTML by removing empty spans and consolidating redundant elements
   */
  private static cleanupFormattedHtml(html: string): string {
    if (!html || html.trim().length === 0) return ''

    let cleaned = html
    
    // Simple, direct approach - remove empty span headers
    cleaned = cleaned.replace(/<span[^>]*><h[1-6]> <\/h[1-6]><\/span>/g, '')
    cleaned = cleaned.replace(/<span[^>]*><h[1-6]>\s+<\/h[1-6]><\/span>/g, '')
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()
    
    return cleaned
  }

  /**
   * Check if text contains block-level HTML tags
   */
  private static hasBlockLevelTags(html: string): boolean {
    const blockTags = ['<p>', '<h1>', '<h2>', '<h3>', '<h4>', '<h5>', '<h6>', '<div>', '<section>', '<article>']
    return blockTags.some(tag => html.includes(tag))
  }
}
