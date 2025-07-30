/**
 * EXACT COPY from Editor Browser Implementation
 * PDF Image Extractor - Professional Implementation (Pure JavaScript for Node.js)
 * Uses proper PDF.js APIs for embedded image extraction following Mozilla PDF.js best practices
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PDF_FILE_PATH = path.join(__dirname, 'test-input', 'demo.pdf');
const OUTPUT_DIR = path.join(__dirname, '..', 'test-scripts', 'output', 'embedded-images');

/**
 * PDF.js Operator Codes for Image Operations
 * Reference: https://github.com/mozilla/pdf.js/blob/master/src/core/operator_list.js
 */
const PDF_OPS = {
  PAINT_IMAGE_XOBJECT: 85,     // paintImageXObject
  PAINT_JPEG_XOBJECT: 86,      // paintJpegXObject  
  PAINT_IMAGE_MASK_XOBJECT: 87 // paintImageMaskXObject
}

// Pure PNG Encoder - No native dependencies (EXACT from working version)
class PurePNGEncoder {
  static createPNG(imageData, width, height, hasAlpha = false) {
    const crc32 = (data) => {
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < data.length; i++) {
        crc = (crc ^ data[i]) >>> 0;
        for (let j = 0; j < 8; j++) {
          crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
        }
      }
      return (crc ^ 0xFFFFFFFF) >>> 0;
    };

    const writeUint32BE = (value) => {
      return Buffer.from([
        (value >>> 24) & 0xFF,
        (value >>> 16) & 0xFF,
        (value >>> 8) & 0xFF,
        value & 0xFF
      ]);
    };

    const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    // IHDR chunk - support both RGB and RGBA
    const colorType = hasAlpha ? 6 : 2; // 6 = RGBA, 2 = RGB
    const bytesPerPixel = hasAlpha ? 4 : 3;
    
    const ihdrData = Buffer.concat([
      writeUint32BE(width),
      writeUint32BE(height),
      Buffer.from([8, colorType, 0, 0, 0]) // 8-bit RGB or RGBA
    ]);
    const ihdr = Buffer.concat([
      writeUint32BE(13),
      Buffer.from('IHDR'),
      ihdrData,
      writeUint32BE(crc32(Buffer.concat([Buffer.from('IHDR'), ihdrData])))
    ]);

    // Prepare image data with row filters
    const rowLength = width * bytesPerPixel + 1; // RGB/RGBA + filter byte
    const filteredData = Buffer.alloc(height * rowLength);
    let srcIndex = 0;

    for (let y = 0; y < height; y++) {
      const rowStart = y * rowLength;
      filteredData[rowStart] = 0; // No filter

      for (let x = 0; x < width; x++) {
        const pixelStart = rowStart + 1 + x * bytesPerPixel;
        filteredData[pixelStart] = imageData[srcIndex++];     // R
        filteredData[pixelStart + 1] = imageData[srcIndex++]; // G
        filteredData[pixelStart + 2] = imageData[srcIndex++]; // B
        if (hasAlpha) {
          filteredData[pixelStart + 3] = imageData[srcIndex++]; // A
        }
      }
    }

    // Simple deflate compression
    const compressedData = zlib.deflateSync(filteredData);

    // IDAT chunk
    const idat = Buffer.concat([
      writeUint32BE(compressedData.length),
      Buffer.from('IDAT'),
      compressedData,
      writeUint32BE(crc32(Buffer.concat([Buffer.from('IDAT'), compressedData])))
    ]);

    // IEND chunk
    const iend = Buffer.concat([
      writeUint32BE(0),
      Buffer.from('IEND'),
      writeUint32BE(crc32(Buffer.from('IEND')))
    ]);

    return Buffer.concat([signature, ihdr, idat, iend]);
  }
}

// EXACT COPY from Editor Browser Implementation
class PDFImageExtractor {
  /**
   * Extract all embedded images from PDF using proper PDF.js APIs
   */
  static async extractImages(pdfBuffer, fileName = 'document') {
    try {
      console.log('🖼️ Starting professional PDF image extraction with PDF.js')
      
      // Import PDF.js dynamically
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      
      // Load PDF document with proper error handling
      const loadingTask = getDocument({ 
        data: new Uint8Array(pdfBuffer),
        verbosity: 0 // Suppress PDF.js console logs
      })
      
      const pdf = await loadingTask.promise
      const totalPages = pdf.numPages
      const allImages = []

      console.log(`📄 Analyzing ${totalPages} pages for embedded images`)

      // Process each page sequentially to avoid memory issues
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        try {
          const page = await pdf.getPage(pageNum)
          const pageImages = await this.extractImagesFromPage(page, pageNum, fileName)
          
          if (pageImages.length > 0) {
            console.log(`📸 Page ${pageNum}: Found ${pageImages.length} embedded images`)
            allImages.push(...pageImages)
          }
          
          // Clean up page resources
          page.cleanup()
        } catch (pageError) {
          console.error(`❌ Failed to process page ${pageNum}:`, pageError)
        }
      }

      // Clean up PDF resources
      pdf.destroy()
      
      console.log(`✅ Extraction complete: ${allImages.length} total embedded images found`)
      return allImages

    } catch (error) {
      console.error('❌ PDF image extraction failed:', error)
      return []
    }
  }

  /**
   * Extract embedded images from a specific PDF page using PDF.js operator analysis
   * EXACT COPY from Editor Browser Implementation
   */
  static async extractImagesFromPage(page, pageNum, fileName) {
    const extractedImages = []

    try {
      console.log(`🔍 Analyzing page ${pageNum} for image operations`)

      // Step 1: Get operator list to identify image operations
      const operatorList = await page.getOperatorList()
      const { fnArray, argsArray } = operatorList
      
      const imageOperations = []

      // Step 2: Scan for image painting operations
      for (let i = 0; i < fnArray.length; i++) {
        const opCode = fnArray[i]
        const args = argsArray[i]

        // Check if this is an image operation
        if (Object.values(PDF_OPS).includes(opCode)) {
          const imageId = args[0] // First argument is the image resource ID
          if (imageId && typeof imageId === 'string') {
            imageOperations.push({ opIndex: i, imageId, opCode })
            console.log(`🎯 Found image operation: ${this.getOpName(opCode)} with ID "${imageId}"`)
          }
        }
      }

      if (imageOperations.length === 0) {
        console.log(`📋 Page ${pageNum}: No image operations found`)
        return []
      }

      // Step 3: Extract each image resource
      let imageIndex = 0
      for (const operation of imageOperations) {
        try {
          const extractedImage = await this.extractImageResource(
            page, 
            operation.imageId, 
            operation.opCode,
            pageNum, 
            imageIndex, 
            fileName
          )

          if (extractedImage) {
            extractedImages.push(extractedImage)
            imageIndex++
            console.log(`✅ Successfully extracted image ${imageIndex}: ${operation.imageId}`)
          } else {
            console.log(`⚠️ Could not extract image data for: ${operation.imageId}`)
          }
        } catch (imageError) {
          console.error(`❌ Error extracting image ${operation.imageId}:`, imageError)
        }
      }

      console.log(`📸 Page ${pageNum} extraction complete: ${extractedImages.length}/${imageOperations.length} images extracted`)

    } catch (error) {
      console.error(`❌ Failed to analyze page ${pageNum}:`, error)
    }

    return extractedImages
  }

  /**
   * Get human-readable operation name for debugging
   */
  static getOpName(opCode) {
    switch (opCode) {
      case PDF_OPS.PAINT_IMAGE_XOBJECT: return 'paintImageXObject'
      case PDF_OPS.PAINT_JPEG_XOBJECT: return 'paintJpegXObject'  
      case PDF_OPS.PAINT_IMAGE_MASK_XOBJECT: return 'paintImageMaskXObject'
      default: return `unknown(${opCode})`
    }
  }

  /**
   * Extract image resource using proper PDF.js resource management
   * EXACT COPY from Editor Browser Implementation
   */
  static async extractImageResource(
    page,
    imageId,
    opCode,
    pageNum,
    imageIndex,
    fileName
  ) {
    try {
      console.log(`🔧 Extracting image resource: ${imageId} (${this.getOpName(opCode)})`)

      // Step 1: Wait for page resources to be fully loaded
      await this.waitForPageResources(page)

      // Step 2: Try to get image object from page resources
      let imageObj = null

      // Method A: Try page.objs (page-specific resources)
      if (page.objs && page.objs.has(imageId)) {
        imageObj = page.objs.get(imageId)
        console.log(`📦 Found image in page.objs: ${imageId}`)
      }
      // Method B: Try commonObjs (shared resources)
      else if (page.commonObjs && page.commonObjs.has(imageId)) {
        imageObj = page.commonObjs.get(imageId)
        console.log(`📦 Found image in commonObjs: ${imageId}`)
      }
      // Method C: Try to resolve the resource asynchronously
      else {
        console.log(`🔄 Attempting async resource resolution for: ${imageId}`)
        imageObj = await this.resolveImageResource(page, imageId)
      }

      if (!imageObj) {
        console.log(`❌ No image object found for: ${imageId}`)
        return null
      }

      // Step 3: Extract image data based on object type
      const imageData = await this.extractImageDataFromObject(imageObj, imageId, opCode)

      if (!imageData) {
        console.log(`❌ No extractable image data for: ${imageId}`)
        return null
      }

      // Step 4: Save image to file and create result
      const filename = `img_p${pageNum}_${imageIndex + 1}_${imageId.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
      const filepath = path.join(OUTPUT_DIR, filename);
      
      // Ensure output directory exists
      await fs.mkdir(OUTPUT_DIR, { recursive: true });

      // Create and save PNG with proper alpha channel support
      const pngBuffer = PurePNGEncoder.createPNG(imageData.rgbData, imageData.width, imageData.height, imageData.hasAlpha);
      await fs.writeFile(filepath, pngBuffer);

      // Create ExtractedImage result with scaling metadata
      const extractedImage = {
        id: `img_p${pageNum}_${imageIndex + 1}`,
        data: `data:image/png;base64,${pngBuffer.toString('base64')}`,
        format: 'png',
        width: imageData.width,
        height: imageData.height,
        actualWidth: imageData.actualWidth || imageData.width,
        actualHeight: imageData.actualHeight || imageData.height,
        scaled: imageData.scaled || false,
        scaleFactor: imageData.scaleFactor || 1.0,
        pageNumber: pageNum,
        alt: `${fileName} - Page ${pageNum} - Image ${imageIndex + 1}`,
        type: 'embedded',
        filepath: filepath,
        size: pngBuffer.length
      }

      const scalingInfo = imageData.scaled 
        ? ` [SCALED: ${(imageData.scaleFactor * 100).toFixed(1)}%]`
        : ' [FULL RES]';
      console.log(`✅ Image extraction successful: ${imageData.width}x${imageData.height} PNG${scalingInfo}`)
      return extractedImage

    } catch (error) {
      console.error(`❌ Failed to extract image resource ${imageId}:`, error)
      return null
    }
  }

  /**
   * Wait for page resources to be fully loaded
   * EXACT COPY from Editor Browser Implementation
   */
  static async waitForPageResources(page) {
    try {
      // Method 1: Load text content to ensure page is processed
      await page.getTextContent()
      
      // Method 2: Small delay to allow async resource loading
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Method 3: Check if resources are loaded
      let attempts = 0
      const maxAttempts = 10
      
      while (attempts < maxAttempts) {
        if (page.objs && typeof page.objs.get === 'function') {
          break
        }
        await new Promise(resolve => setTimeout(resolve, 50))
        attempts++
      }
      
      console.log(`📋 Page resources loaded after ${attempts} attempts`)
    } catch (error) {
      console.warn(`⚠️ Error waiting for page resources:`, error)
    }
  }

  /**
   * Resolve image resource asynchronously using PDF.js internal mechanisms
   * EXACT COPY from Editor Browser Implementation
   */
  static async resolveImageResource(page, imageId) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 5000) // 5 second timeout

      try {
        // Try to get resource with callback (PDF.js internal API)
        if (page.objs && typeof page.objs.get === 'function') {
          page.objs.get(imageId, (obj) => {
            clearTimeout(timeout)
            resolve(obj)
          })
        } else {
          clearTimeout(timeout)
          resolve(null)
        }
      } catch (error) {
        clearTimeout(timeout)
        console.warn(`⚠️ Error resolving resource ${imageId}:`, error)
        resolve(null)
      }
    })
  }

  /**
   * Extract actual image data from PDF.js image object with auto-scaling support
   * EXACT COPY from Editor Browser Implementation, adapted for Node.js
   */
  static async extractImageDataFromObject(imageObj, imageId, opCode) {
    try {
      console.log(`🖼️ Analyzing image object for ${imageId}:`, {
        type: typeof imageObj,
        constructor: imageObj?.constructor?.name,
        width: imageObj?.width,
        height: imageObj?.height,
        hasData: !!imageObj?.data,
        hasBitmap: !!imageObj?.bitmap,
        keys: Object.keys(imageObj),
        dataType: imageObj?.data?.constructor?.name,
        dataFirstBytes: imageObj?.data ? Array.from(imageObj.data.slice(0, 20)) : 'N/A'
      })

      const width = imageObj?.width || 0
      const height = imageObj?.height || 0

      if (!width || !height) {
        console.log(`❌ Invalid image dimensions: ${width}x${height}`)
        return null
      }

      // **EXACT LOGIC from Editor**: Handle objects with pixel data
      if (imageObj.data && imageObj.data.length > 0) {
        console.log(`📊 Processing pixel data: ${imageObj.data.length} bytes`)
        return await this.createImageDataFromPixelData(imageObj.data, width, height, imageId)
      }

      // **EXACT LOGIC from Editor**: Handle bitmap objects
      if (imageObj.bitmap) {
        console.log(`🔧 Processing bitmap object`)
        
        if (imageObj.bitmap.data && imageObj.bitmap.data.length > 0) {
          return await this.createImageDataFromPixelData(imageObj.bitmap.data, width, height, imageId)
        }
      }

      console.log(`❌ No supported extraction method found for image object type`)
      return null

    } catch (error) {
      console.error(`❌ Error extracting image data:`, error)
      return null
    }
  }

  /**
   * Create RGB data from raw pixel data with proper format detection and auto-scaling
   * EXACT LOGIC from Editor Browser Implementation
   */
  static async createImageDataFromPixelData(pixelData, width, height, imageId = 'unknown') {
    try {
      // Auto-scaling limits for memory safety (EXACT from Editor)
      const MAX_CANVAS_DIMENSION = 4000;
      const MAX_CANVAS_PIXELS = 8 * 1024 * 1024; // 8M pixels max
      
      // Calculate safe dimensions with auto-scaling
      const pixels = width * height;
      let safeWidth = width;
      let safeHeight = height;
      let scalingApplied = false;
      
      console.log(`🔧 Analysis: ${width}×${height} = ${pixels.toLocaleString()} pixels`);
      
      // Check if scaling is needed (EXACT from Editor)
      if (pixels > MAX_CANVAS_PIXELS) {
        const scale = Math.sqrt(MAX_CANVAS_PIXELS / pixels);
        safeWidth = Math.floor(width * scale);
        safeHeight = Math.floor(height * scale);
        scalingApplied = true;
        console.log(`🔄 PIXELS scaling: ${pixels.toLocaleString()} → ${(safeWidth * safeHeight).toLocaleString()} pixels (${(scale * 100).toFixed(1)}%)`);
      } else if (width > MAX_CANVAS_DIMENSION) {
        const scale = MAX_CANVAS_DIMENSION / width;
        safeWidth = Math.floor(width * scale);
        safeHeight = Math.floor(height * scale);
        scalingApplied = true;
        console.log(`🔄 WIDTH scaling: ${width} → ${safeWidth} pixels (${(scale * 100).toFixed(1)}%)`);
      } else if (height > MAX_CANVAS_DIMENSION) {
        const scale = MAX_CANVAS_DIMENSION / height;
        safeWidth = Math.floor(width * scale);
        safeHeight = Math.floor(height * scale);
        scalingApplied = true;
        console.log(`🔄 HEIGHT scaling: ${height} → ${safeHeight} pixels (${(scale * 100).toFixed(1)}%)`);
      } else {
        console.log(`✅ No scaling needed: Image fits within safe limits`);
      }

      // Convert to Uint8Array if needed
      let data
      if (pixelData instanceof Uint8Array) {
        data = pixelData
        console.log(`✅ Using Uint8Array data`)
      } else if (pixelData instanceof Uint8ClampedArray) {
        data = new Uint8Array(pixelData)
        console.log(`✅ Converting Uint8ClampedArray to Uint8Array`)
      } else if (pixelData instanceof ArrayBuffer) {
        data = new Uint8Array(pixelData)
        console.log(`✅ Converting ArrayBuffer to Uint8Array`)
      } else if (Array.isArray(pixelData)) {
        data = new Uint8Array(pixelData)
        console.log(`✅ Converting Array to Uint8Array`)
      } else {
        console.log(`❌ Unsupported pixel data type: ${typeof pixelData}, constructor: ${pixelData?.constructor?.name}`)
        return null
      }

      // **EXACT format detection from Editor**
      const expectedRGBA = width * height * 4
      const expectedRGB = width * height * 3
      
      console.log(`🔍 Format detection for ${imageId || 'unknown'}: data.length=${data.length}, expectedRGB=${expectedRGB}, expectedRGBA=${expectedRGBA}`)
      console.log(`🔍 Diff from RGB: ${Math.abs(data.length - expectedRGB)}, Diff from RGBA: ${Math.abs(data.length - expectedRGBA)}`)

      let processedData
      let isRGBA = false

      // Detect format and process (EXACT from Editor - NO CONVERSION!)
      if (Math.abs(data.length - expectedRGBA) < Math.abs(data.length - expectedRGB)) {
        // RGBA format processing with scaling
        console.log(`🎨 Processing RGBA format: ${width}×${height} (${imageId || 'unknown'})`);
        processedData = await this.processRGBADataNoConversion(data, width, height, safeWidth, safeHeight, scalingApplied);
        isRGBA = true;
      } else {
        // RGB format processing with scaling  
        console.log(`🎨 Processing RGB format: ${width}×${height} (${imageId || 'unknown'})`);
        processedData = await this.processRGBDataWithScaling(data, width, height, safeWidth, safeHeight, scalingApplied);
        isRGBA = false;
      }

      if (!processedData) {
        console.log(`❌ Data processing failed`)
        return null
      }

      return {
        rgbData: processedData,
        width: width,
        height: height,
        actualWidth: safeWidth,
        actualHeight: safeHeight,
        scaled: scalingApplied,
        scaleFactor: scalingApplied ? (safeWidth / width) : 1.0,
        hasAlpha: isRGBA
      }

    } catch (error) {
      console.error(`❌ Error creating image data from pixel data:`, error)
      return null
    }
  }

  /**
   * Process RGBA pixel data with NO CONVERSION - keep RGBA format
   * Based on working editor implementation
   */
  static async processRGBADataNoConversion(data, originalWidth, originalHeight, safeWidth, safeHeight, scalingApplied) {
    const expectedRGBA = originalWidth * originalHeight * 4;
    
    if (scalingApplied) {
      // Scale down RGBA with smart sampling - KEEP 4 CHANNELS
      console.log(`🔄 Scaling RGBA data with sampling (keeping RGBA)`);
      const rgbaData = new Uint8Array(safeWidth * safeHeight * 4);
      const scaleX = safeWidth / originalWidth;
      const scaleY = safeHeight / originalHeight;
      
      for (let y = 0; y < safeHeight; y++) {
        for (let x = 0; x < safeWidth; x++) {
          const srcX = Math.floor(x / scaleX);
          const srcY = Math.floor(y / scaleY);
          const srcIndex = (srcY * originalWidth + srcX) * 4;
          const destIndex = (y * safeWidth + x) * 4;
          
          rgbaData[destIndex] = data[srcIndex] || 0;         // R
          rgbaData[destIndex + 1] = data[srcIndex + 1] || 0; // G
          rgbaData[destIndex + 2] = data[srcIndex + 2] || 0; // B
          rgbaData[destIndex + 3] = data[srcIndex + 3] || 255; // A
        }
      }
      
      return rgbaData;
    } else {
      // No scaling needed - keep RGBA format directly
      console.log(`✅ Using RGBA data directly (no conversion)`);
      const actualPixels = Math.min(Math.floor(data.length / 4), originalWidth * originalHeight);
      const rgbaData = new Uint8Array(actualPixels * 4);
      
      for (let i = 0; i < actualPixels * 4; i++) {
        rgbaData[i] = data[i] || 0;
      }
      
      return rgbaData;
    }
  }

  /**
   * Process RGB pixel data with memory-safe scaling support
   * EXACT COPY from Editor Browser Implementation
   */
  static async processRGBDataWithScaling(data, originalWidth, originalHeight, safeWidth, safeHeight, scalingApplied) {
    if (scalingApplied) {
      // Scale down RGB with smart sampling (EXACT from Editor)
      console.log(`🔄 Scaling RGB data with sampling`);
      const rgbData = new Uint8Array(safeWidth * safeHeight * 3);
      const scaleX = safeWidth / originalWidth;
      const scaleY = safeHeight / originalHeight;
      
      for (let y = 0; y < safeHeight; y++) {
        for (let x = 0; x < safeWidth; x++) {
          const srcX = Math.floor(x / scaleX);
          const srcY = Math.floor(y / scaleY);
          const srcIndex = (srcY * originalWidth + srcX) * 3;
          const destIndex = (y * safeWidth + x) * 3;
          
          rgbData[destIndex] = data[srcIndex] || 0;         // R
          rgbData[destIndex + 1] = data[srcIndex + 1] || 0; // G
          rgbData[destIndex + 2] = data[srcIndex + 2] || 0; // B
        }
      }
      
      return rgbData;
    } else {
      // No scaling needed - direct RGB processing (EXACT from Editor)
      const actualPixels = Math.min(Math.floor(data.length / 3), originalWidth * originalHeight);
      const rgbData = new Uint8Array(actualPixels * 3);
      
      for (let i = 0; i < actualPixels * 3; i++) {
        rgbData[i] = data[i] || 0;
      }
      
      return rgbData;
    }
  }
}

// Main execution
async function main() {
  try {
    console.log('🚀 EXACT BROWSER IMPLEMENTATION - PDF Image Extractor');
    console.log(`📁 Input: ${PDF_FILE_PATH}`);
    console.log(`📁 Output: ${OUTPUT_DIR}`);
    
    const pdfBuffer = await fs.readFile(PDF_FILE_PATH);
    const extractedImages = await PDFImageExtractor.extractImages(pdfBuffer, 'demo.pdf');
    
    console.log(`\n🎉 EXTRACTION COMPLETE!`);
    console.log(`📊 Total images extracted: ${extractedImages.length}`);
    
    if (extractedImages.length > 0) {
      console.log(`\n📁 Saved images:`);
      for (const img of extractedImages) {
        console.log(`  ✅ ${path.basename(img.filepath)} - ${img.width}x${img.height} (${Math.round(img.size/1024)}KB)`);
      }
    }
    
  } catch (error) {
    console.error('❌ Main execution error:', error);
  }
}

// Run if called directly
main();

export { PDFImageExtractor, PurePNGEncoder };
