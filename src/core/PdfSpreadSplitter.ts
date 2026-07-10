/**
 * PdfSpreadSplitter — turns two-page-spread PDFs into logical single pages.
 *
 * Runs directly after raw page extraction and BEFORE PdfElementComposer, so
 * every downstream stage (element composition, cleaning, page composition,
 * minify) sees normal single-page geometry and needs no spread awareness.
 *
 * The one contract downstream code must honor: after splitting, `pageIndex`
 * is a LOGICAL sequence, not a PDF page number. Anything that touches the
 * physical PDF (screenshot rasterization) must resolve the physical page via
 * `page.metadata.spread` (see SpreadSourceInfo).
 */

import type { PdfDecomposerDecomposedPage, PdfDecomposerExtractedElement } from '../types/decomposer.types.js'
import { logger } from '../utils/Logger.js'
import { detectSpreadDocument, isLandscapePage } from './spread/spreadDetection.js'
import { partitionElements, rebaseElementBox } from './spread/spreadPartition.js'
import type { SpreadHalf, SpreadHandling } from './spread/types.js'

export class PdfSpreadSplitter {
  /**
   * Split spread pages into logical half pages according to `mode`.
   *
   * - 'off':   returns the input untouched.
   * - 'auto':  splits only when document-level evidence says spread.
   * - 'split': skips detection and splits every landscape page.
   *
   * Pages are renumbered into a continuous logical sequence; each output page
   * carries `metadata.spread` with its physical source identity.
   */
  static splitPages(
    pages: PdfDecomposerDecomposedPage[],
    mode: SpreadHandling
  ): PdfDecomposerDecomposedPage[] {
    if (mode === 'off' || pages.length === 0) {
      return pages
    }

    // Mode often arrives from an environment variable: an unrecognized value
    // must fail SAFE (no splitting), never fall through to forced splitting.
    if (mode !== 'auto' && mode !== 'split') {
      logger.warn(`Spread handling: unknown mode '${String(mode)}', treating as 'off'`)
      return pages
    }

    if (mode === 'auto') {
      const detection = detectSpreadDocument(pages)
      if (!detection.isSpreadDocument) {
        logger.info(`Spread detection: not a spread document (${detection.reason})`)
        return pages
      }
      logger.info(`Spread detection: spread document confirmed (${detection.reason}), splitting pages`)
    } else {
      logger.info('Spread handling forced to split: splitting every landscape page')
    }

    const logicalPages: PdfDecomposerDecomposedPage[] = []

    for (const page of pages) {
      if (isLandscapePage(page)) {
        const { left, right } = partitionElements(page.elements, page.width)
        logicalPages.push(
          this.buildHalfPage(page, left, 'left'),
          this.buildHalfPage(page, right, 'right')
        )
      } else {
        // Portrait page inside a spread document (e.g. a single inserted
        // page): kept whole, but still tagged with its physical identity
        // because renumbering shifts its logical index.
        logicalPages.push(this.tagFullPage(page))
      }
    }

    const renumbered = this.renumberSequentially(logicalPages)
    logger.info(`Spread split: ${pages.length} physical pages → ${renumbered.length} logical pages`)
    return renumbered
  }

  /** One logical page holding the given half's elements, coordinates re-based. */
  private static buildHalfPage(
    source: PdfDecomposerDecomposedPage,
    elements: PdfDecomposerExtractedElement[],
    half: 'left' | 'right'
  ): PdfDecomposerDecomposedPage {
    return {
      ...source,
      width: source.width / 2,
      elements: elements.map(el => rebaseElementBox(el, source.width, half)),
      metadata: {
        ...source.metadata,
        spread: this.sourceInfo(source, half)
      }
    }
  }

  /** Tag a page kept whole so physical-page resolution survives renumbering. */
  private static tagFullPage(source: PdfDecomposerDecomposedPage): PdfDecomposerDecomposedPage {
    return {
      ...source,
      metadata: {
        ...source.metadata,
        spread: this.sourceInfo(source, 'full')
      }
    }
  }

  private static sourceInfo(source: PdfDecomposerDecomposedPage, half: SpreadHalf) {
    return {
      sourcePageIndex: source.pageIndex,
      sourcePageNumber: source.pageNumber,
      half
    }
  }

  /**
   * Rewrite page and element indices into one continuous logical sequence.
   * After this, pageIndex/pageNumber express reading order, not PDF pages.
   */
  private static renumberSequentially(
    pages: PdfDecomposerDecomposedPage[]
  ): PdfDecomposerDecomposedPage[] {
    return pages.map((page, index) => ({
      ...page,
      pageIndex: index,
      pageNumber: index + 1,
      title: `Page ${index + 1}`,
      elements: page.elements.map(el => ({ ...el, pageIndex: index }))
    }))
  }
}
