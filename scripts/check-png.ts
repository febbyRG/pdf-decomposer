#!/usr/bin/env node

import { readFileSync } from 'fs'

// Simple PNG pixel check - read first few pixels to see if not all zeros
function checkPNGContent(filename: string) {
  try {
    const buffer = readFileSync(filename)
    console.log(`📄 ${filename}:`)
    console.log(`  Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`)

    // Look for IDAT chunk
    const idatIndex = buffer.indexOf('IDAT')
    if (idatIndex > 0) {
      console.log(`  ✅ IDAT chunk found at position ${idatIndex}`)

      // Get first 20 bytes of image data after IDAT header
      const dataStart = idatIndex + 8 // Skip "IDAT" + 4 bytes length
      const sample = Array.from(buffer.slice(dataStart, dataStart + 20))
      console.log(`  📊 First 20 data bytes: [${sample.join(', ')}]`)

      // Check if data is not all zeros or all 255s (blank images)
      const allZeros = sample.every(b => b === 0)
      const allMax = sample.every(b => b === 255)

      if (allZeros) {
        console.log('  ❌ Image appears to be blank (all zeros)')
      } else if (allMax) {
        console.log('  ❌ Image appears to be blank (all white)')
      } else {
        console.log('  ✅ Image has varied pixel data - likely contains image')
      }
    } else {
      console.log('  ❌ No IDAT chunk found - invalid PNG')
    }
  } catch (error) {
    console.log(`  ❌ Error reading file: ${error}`)
  }
}

// Check a few PNG files
console.log('🔍 Checking PNG file content...\n')
const files = ['img_p0_1.png', 'img_p1_1.png', 'img_p2_2.png']
files.forEach(file => {
  checkPNGContent(file)
  console.log('')
})
