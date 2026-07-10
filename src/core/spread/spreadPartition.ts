/**
 * Partition one physical spread page into two logical half pages.
 *
 * Pure geometry: every element is assigned to the half holding the larger
 * share of its horizontal extent, right-half coordinates are re-based so each
 * logical page starts at x=0, and boxes are clamped to the logical page
 * bounds. Elements that genuinely span the gutter (a panoramic photo) end up
 * on the half with the larger overlap with their box clamped, a documented
 * v1 trade-off: the element content itself stays intact.
 */

import type { SpreadCandidateElement } from './types.js'

export interface PartitionedElements<T extends SpreadCandidateElement> {
  left: T[]
  right: T[]
}

/** Horizontal overlap of an element with one half of the page. */
function overlapWithHalf(
  element: SpreadCandidateElement,
  pageWidth: number,
  half: 'left' | 'right'
): number {
  const midX = pageWidth / 2
  const { left, right } = element.boundingBox
  if (half === 'left') {
    return Math.max(0, Math.min(right, midX) - left)
  }
  return Math.max(0, right - Math.max(left, midX))
}

/**
 * Assign every element to the half holding the larger share of its width.
 * Exact ties go left (reading order: left page comes first).
 */
export function partitionElements<T extends SpreadCandidateElement>(
  elements: T[],
  pageWidth: number
): PartitionedElements<T> {
  const left: T[] = []
  const right: T[] = []

  for (const element of elements) {
    const leftOverlap = overlapWithHalf(element, pageWidth, 'left')
    const rightOverlap = overlapWithHalf(element, pageWidth, 'right')
    if (rightOverlap > leftOverlap) {
      right.push(element)
    } else {
      left.push(element)
    }
  }

  return { left, right }
}

/**
 * Re-base an element's box onto its logical page: right-half elements shift
 * left by half the physical width, then every box is clamped to the logical
 * page bounds [0, halfWidth]. Returns a NEW element (input is not mutated).
 */
export function rebaseElementBox<T extends SpreadCandidateElement>(
  element: T,
  pageWidth: number,
  half: 'left' | 'right'
): T {
  const halfWidth = pageWidth / 2
  const shift = half === 'right' ? halfWidth : 0

  const rawLeft = element.boundingBox.left - shift
  const rawRight = element.boundingBox.right - shift
  const clampedLeft = Math.max(0, rawLeft)
  const clampedRight = Math.min(halfWidth, rawRight)

  return {
    ...element,
    boundingBox: {
      ...element.boundingBox,
      left: clampedLeft,
      right: clampedRight,
      width: Math.max(0, clampedRight - clampedLeft)
    }
  }
}
