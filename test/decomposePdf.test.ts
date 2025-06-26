import fs from 'fs'
import path from 'path'
import { decomposePdf } from '../src'

describe('decomposePdf', () => {
  it('should parse a sample PDF and return an array of page contents', async () => {
    const samplePath = path.join(__dirname, 'sample.pdf')
    if (!fs.existsSync(samplePath)) {
      console.warn('No sample.pdf found in test directory. Skipping test.')
      return
    }
    const result = await decomposePdf(samplePath)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toHaveProperty('pageNumber')
    expect(result[0]).toHaveProperty('elements')
    expect(result[0]).toHaveProperty('annotations')
  })
})
