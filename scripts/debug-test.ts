#!/usr/bin/env node

import { readFileSync } from 'fs'
import { join } from 'path'
import { decomposePdf } from '../dist/index'

async function debugTest() {
  console.log('🔍 Debug Test - Checking Result Structure')

  const pdfPath = join(__dirname, 'test-input', 'demo.pdf')
  const pdfBuffer = readFileSync(pdfPath)

  console.log('📄 Running decomposePdf...')
  const result = await decomposePdf(pdfBuffer, {
    generateImages: false,
    extractEmbeddedImages: true,
    elementComposer: false,  // Disable to see raw structure
    pageComposer: false,     // Disable to see raw structure
    minify: false           // Disable to see full structure
  })

  console.log('\n📊 Result structure:')
  console.log(`- Pages: ${result.length}`)

  for (let i = 0; i < Math.min(result.length, 2); i++) {
    const page = result[i] as any
    console.log(`\nPage ${i + 1}:`)
    console.log(`- Keys: [${Object.keys(page).join(', ')}]`)

    if (page.elements) {
      console.log(`- Elements: ${page.elements.length}`)
      const imageElements = page.elements.filter((e: any) => e.type === 'image')
      console.log(`- Image elements: ${imageElements.length}`)

      if (imageElements.length > 0) {
        const img = imageElements[0]
        console.log(`- First image keys: [${Object.keys(img).join(', ')}]`)
        console.log(`- First image: ${JSON.stringify(img, null, 2)}`)
      }
    }

    if (page.embeddedImages) {
      console.log(`- Embedded images: ${page.embeddedImages.length}`)
      if (page.embeddedImages.length > 0) {
        const img = page.embeddedImages[0]
        console.log(`- First embedded image keys: [${Object.keys(img).join(', ')}]`)
        console.log(`- First embedded image sample: ${JSON.stringify({
          ...img,
          data: img.data ? `${img.data.substring(0, 50)}...` : 'no data'
        }, null, 2)}`)
      }
    }

    // Check for other possible image properties
    Object.keys(page).forEach(key => {
      if (key.includes('image') || key.includes('Image')) {
        console.log(`- Found image-related property: ${key}`)
      }
    })
  }
} debugTest().catch(console.error)
