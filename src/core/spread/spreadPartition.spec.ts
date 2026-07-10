import { describe, expect, it } from 'vitest'
import opusRawPages from '../__fixtures__/opus-spread-raw-pages.json'
import { partitionElements, rebaseElementBox } from './spreadPartition.js'
import type { SpreadCandidateElement, SpreadCandidatePage } from './types.js'

const opusPages = opusRawPages as unknown as SpreadCandidatePage[]

function element(left: number, width: number, data = 'text'): SpreadCandidateElement {
  return {
    type: 'text',
    data,
    boundingBox: { top: 100, left, bottom: 120, right: left + width, width, height: 20 }
  }
}

describe('partitionElements', () => {
  it('loses no element — every input lands on exactly one half', () => {
    for (const page of opusPages) {
      const { left, right } = partitionElements(page.elements, page.width)
      expect(left.length + right.length).toBe(page.elements.length)
    }
  })

  it('splits a real opus spread into two content-bearing halves', () => {
    // Page 2: left half is a 3-column article, right half a framed painting.
    const page = opusPages[1]
    const { left, right } = partitionElements(page.elements, page.width)
    expect(left.length).toBeGreaterThan(10)
    expect(right.length).toBeGreaterThan(0)
  })

  it('assigns a cross-gutter element to the half holding more of it', () => {
    const pageWidth = 2000
    const mostlyRight = element(900, 800) // 100pt left of midline, 700pt right
    const { left, right } = partitionElements([mostlyRight], pageWidth)
    expect(left).toHaveLength(0)
    expect(right).toHaveLength(1)
  })

  it('sends an exactly-centered element left (reading order: left page first)', () => {
    const pageWidth = 2000
    const centered = element(800, 400) // symmetric around midline x=1000
    const { left, right } = partitionElements([centered], pageWidth)
    expect(left).toHaveLength(1)
    expect(right).toHaveLength(0)
  })
})

describe('rebaseElementBox', () => {
  const pageWidth = 2000 // halfWidth = 1000

  it('keeps left-half coordinates unchanged', () => {
    const el = element(150, 300)
    const rebased = rebaseElementBox(el, pageWidth, 'left')
    expect(rebased.boundingBox.left).toBe(150)
    expect(rebased.boundingBox.right).toBe(450)
    expect(rebased.boundingBox.width).toBe(300)
  })

  it('shifts right-half coordinates onto the logical page origin', () => {
    const el = element(1200, 300)
    const rebased = rebaseElementBox(el, pageWidth, 'right')
    expect(rebased.boundingBox.left).toBe(200)
    expect(rebased.boundingBox.right).toBe(500)
    expect(rebased.boundingBox.width).toBe(300)
  })

  it('clamps a cross-gutter element to the logical page bounds', () => {
    // Starts 100pt before the midline, assigned right: left clamps to 0.
    const el = element(900, 800)
    const rebased = rebaseElementBox(el, pageWidth, 'right')
    expect(rebased.boundingBox.left).toBe(0)
    expect(rebased.boundingBox.right).toBe(700)
    expect(rebased.boundingBox.width).toBe(700)
  })

  it('does not mutate the input element', () => {
    const el = element(1200, 300)
    rebaseElementBox(el, pageWidth, 'right')
    expect(el.boundingBox.left).toBe(1200)
  })

  it('preserves vertical geometry untouched', () => {
    const el = element(1200, 300)
    const rebased = rebaseElementBox(el, pageWidth, 'right')
    expect(rebased.boundingBox.top).toBe(100)
    expect(rebased.boundingBox.bottom).toBe(120)
    expect(rebased.boundingBox.height).toBe(20)
  })
})
