import * as fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { decomposePdf } from '../src/api/decomposePdf.js'

const demoDir = path.dirname(fileURLToPath(import.meta.url))

  ; (async () => {
    // Use the correct path for the demo PDF
    const pdfPath = path.join(demoDir, 'demo.pdf')
    const outputPath = path.join(demoDir, 'demo.output.json')
    try {
      const result = await decomposePdf(pdfPath, { assetPath: path.join(demoDir, 'assets') })
      // Write output JSON
      await fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8')
      // Write images (thumbnails)
      result.forEach((page, i) => {
        if (page.thumbnail) {
          fs.writeFileSync(path.join(outputPath, `page-${i + 1}-thumbnail.png`), Buffer.from(page.thumbnail, 'base64'))
        }
      })
      console.log(`PDF decomposition result written to ${outputPath}`)
    } catch (err) {
      console.error('Failed to parse PDF:')
      if (err instanceof Error) {
        console.error('Error message:', err.message)
        console.error('Error stack:', err.stack)
      }
      // Print the full error object, including non-Error types
      console.dir(err, { depth: 10 })
    }
  })()
