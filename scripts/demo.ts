import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { decomposePdf } from '../src/core/decomposePdf.js'

const demoDir = path.dirname(fileURLToPath(import.meta.url))

  ; (async () => {
    // Use the correct path for the demo PDF
    const pdfPath = path.join(demoDir, 'demo.pdf')
    const outputPath = path.join(demoDir, 'demo.output.json')
    try {
      // Debug: print first 32 bytes and file size
      const raw = await fs.readFile(pdfPath)
      console.log('PDF file size:', raw.length, 'bytes')
      console.log('PDF first 32 bytes:', raw.slice(0, 32).toString('hex'))
      console.log('PDF first 32 chars:', raw.slice(0, 32).toString('utf8'))

      const result = await decomposePdf(pdfPath, { assetPath: path.join(demoDir, 'assets') })
      await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8')
      console.log(`PDF decomposition result written to ${outputPath}`)
    } catch (err) {
      console.error('Failed to parse PDF:', err)
    }
  })()
