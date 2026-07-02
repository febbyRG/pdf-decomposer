import type { PdfElement } from '../../models/PdfElement.js'
import type { PdfPageContent } from '../../models/PdfPageContent.js'

/**
 * Text helpers shared by the page continuity heuristics. Pure, no I/O.
 */

// Element types treated as body text for continuity analysis. Deliberately
// narrower than the screenshot isTextElement (which also counts h1..h6 tags):
// here we compare prose flow between pages.
const CONTINUITY_TEXT_TYPES = ['text', 'paragraph', 'header']

export function stripHtml(text: string): string {
  return (text || '').replace(/<[^>]*>/g, '').trim()
}

export function getCleanText(element: PdfElement): string {
  return stripHtml(element?.data || '')
}

export function getTextElements(page: PdfPageContent): PdfElement[] {
  return (page.elements || []).filter(el => CONTINUITY_TEXT_TYPES.includes(el.type))
}

export function getCleanPageText(page: PdfPageContent): string {
  return getTextElements(page).map(getCleanText).join(' ').trim()
}
