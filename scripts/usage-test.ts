import * as fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { decomposePdf } from '../src/api/decomposePdf.js'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))

  ; (async () => {
    // Use the correct path for the demo PDF
    const pdfPath = path.join(scriptDir, 'pdf-test-input', 'demo.pdf')
    const usageTestDir = path.join(scriptDir, 'usage-test-output')
    const outputPath = path.join(usageTestDir, 'test.output.json')

    try {
      // Create usage-test directory if it doesn't exist
      if (!fs.existsSync(usageTestDir)) {
        fs.mkdirSync(usageTestDir, { recursive: true })
      }

      const result = await decomposePdf(pdfPath, {
        assetPath: usageTestDir,
        generateImages: true  // Generate page images for demo
      })
      // Write output JSON
      await fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8')
      console.log(`PDF decomposition result written to ${outputPath}`)

      process.exit(0)

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
