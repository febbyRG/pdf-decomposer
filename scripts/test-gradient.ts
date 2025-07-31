#!/usr/bin/env node

// Test creating a simple gradient image to verify our PNG generation works
import { writeFileSync } from 'fs'

function createTestGradient() {
  const width = 100
  const height = 100
  const pixelData = new Uint8Array(width * height * 3) // RGB

  console.log('🎨 Creating test gradient image...')

  // Create a simple gradient
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 3
      pixelData[index] = Math.floor((x / width) * 255)     // R - horizontal gradient
      pixelData[index + 1] = Math.floor((y / height) * 255) // G - vertical gradient
      pixelData[index + 2] = 128                            // B - constant blue
    }
  }

  console.log('✨ Sample pixel data (first 15 bytes):', Array.from(pixelData.slice(0, 15)))
  console.log('✨ Sample pixel data (middle):', Array.from(pixelData.slice(15000, 15015)))
  console.log('✨ Sample pixel data (end):', Array.from(pixelData.slice(-15)))

  // Create PNG using our manual method
  const pngBuffer = createManualPNG(pixelData, width, height)
  writeFileSync('test-gradient.png', pngBuffer)
  console.log(`💾 Saved test-gradient.png (${pngBuffer.length} bytes)`)

  return pixelData
}

function createManualPNG(pixelData: Uint8Array, width: number, height: number): Buffer {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

  // IHDR chunk
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8   // bit depth
  ihdrData[9] = 2   // color type (RGB)
  ihdrData[10] = 0  // compression
  ihdrData[11] = 0  // filter
  ihdrData[12] = 0  // interlace

  const ihdr = createPNGChunk('IHDR', ihdrData)

  // Prepare raw image data with filter bytes
  const rawDataSize = height * (1 + width * 3) // +1 for filter byte per row
  const rawData = Buffer.alloc(rawDataSize)

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 3)
    rawData[rowOffset] = 0 // Filter type 0 (None)

    // Copy pixel data for this row
    for (let x = 0; x < width; x++) {
      const srcOffset = (y * width + x) * 3
      const dstOffset = rowOffset + 1 + (x * 3)

      rawData[dstOffset] = pixelData[srcOffset]     // R
      rawData[dstOffset + 1] = pixelData[srcOffset + 1] // G
      rawData[dstOffset + 2] = pixelData[srcOffset + 2] // B
    }
  }

  console.log(`📊 Raw data size: ${rawData.length} bytes`)
  console.log('📊 Raw data sample (row 0):', Array.from(rawData.slice(0, 20)))
  console.log('📊 Raw data sample (row 50):', Array.from(rawData.slice(50 * (1 + width * 3), 50 * (1 + width * 3) + 20)))

  // IDAT chunk with raw data (uncompressed)
  const idat = createPNGChunk('IDAT', rawData)

  // IEND chunk
  const iend = createPNGChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdr, idat, iend])
}

function createPNGChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  // Calculate CRC32 for type + data
  const crcInput = Buffer.concat([typeBuffer, data])
  const crcValue = calculateCRC32(new Uint8Array(crcInput))

  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crcValue >>> 0, 0)

  return Buffer.concat([length, typeBuffer, data, crc])
}

function calculateCRC32(data: Uint8Array): number {
  const crcTable = new Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    crcTable[i] = c
  }

  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)
  }
  return crc ^ 0xFFFFFFFF
}

// Run test
createTestGradient()
