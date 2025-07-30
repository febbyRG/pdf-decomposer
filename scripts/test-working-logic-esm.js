/**
 * WORKING PDF Image Extractor for PDF-Decomposer (ES Module)
 * Replicated from editor project's working logic
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
const OUTPUT_DIR = path.join(__dirname, 'test-output', 'embedded-images');

// Pure PNG Encoder - No native dependencies
class PurePNGEncoder {
  static createPNG(imageData, width, height) {
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

    // IHDR chunk
    const ihdrData = Buffer.concat([
      writeUint32BE(width),
      writeUint32BE(height),
      Buffer.from([8, 2, 0, 0, 0]) // 8-bit RGB
    ]);
    const ihdr = Buffer.concat([
      writeUint32BE(13),
      Buffer.from('IHDR'),
      ihdrData,
      writeUint32BE(crc32(Buffer.concat([Buffer.from('IHDR'), ihdrData])))
    ]);

    // Prepare image data with row filters
    const rowLength = width * 3 + 1; // RGB + filter byte
    const filteredData = Buffer.alloc(height * rowLength);
    let srcIndex = 0;

    for (let y = 0; y < height; y++) {
      const rowStart = y * rowLength;
      filteredData[rowStart] = 0; // No filter

      for (let x = 0; x < width; x++) {
        const pixelStart = rowStart + 1 + x * 3;
        filteredData[pixelStart] = imageData[srcIndex++];     // R
        filteredData[pixelStart + 1] = imageData[srcIndex++]; // G
        filteredData[pixelStart + 2] = imageData[srcIndex++]; // B
        // No skip - data is already RGB format
      }
    }

    // Simple deflate compression (store method)
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

// Working Image Extractor
class WorkingImageExtractor {
  static async extractImages(pdfPath) {
    console.log('🖼️ Starting WORKING image extraction...');
    
    // Import PDF.js dynamically
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    
    const pdfBuffer = await fs.readFile(pdfPath);
    const loadingTask = getDocument({
      data: new Uint8Array(pdfBuffer),
      verbosity: 0
    });
    
    const pdf = await loadingTask.promise;
    const allImages = [];
    
    console.log(`📚 Processing ${pdf.numPages} pages...`);
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      console.log(`\n🔍 Processing page ${pageNum}...`);
      
      try {
        const page = await pdf.getPage(pageNum);
        const pageImages = await this.extractImagesFromPage(page, pageNum);
        
        if (pageImages.length > 0) {
          console.log(`✅ Page ${pageNum}: Extracted ${pageImages.length} images`);
          allImages.push(...pageImages);
        }
        
        page.cleanup();
        
      } catch (error) {
        console.error(`❌ Page ${pageNum} error:`, error.message);
      }
    }
    
    pdf.destroy();
    console.log(`\n📊 Total extracted: ${allImages.length} embedded images`);
    return allImages;
  }
  
  static async extractImagesFromPage(page, pageNum) {
    const extractedImages = [];
    
    try {
      // Get operator list to find image operations
      const operatorList = await page.getOperatorList();
      const { fnArray, argsArray } = operatorList;
      
      const imageOperations = [];
      const PDF_OPS = { PAINT_IMAGE_XOBJECT: 85, PAINT_JPEG_XOBJECT: 86, PAINT_IMAGE_MASK_XOBJECT: 87 };
      
      for (let i = 0; i < fnArray.length; i++) {
        const opCode = fnArray[i];
        const args = argsArray[i];
        
        if (Object.values(PDF_OPS).includes(opCode)) {
          const imageId = args[0];
          if (imageId && typeof imageId === 'string') {
            imageOperations.push({ imageId, opCode });
            console.log(`  🎯 Found: ${imageId}`);
          }
        }
      }
      
      if (imageOperations.length === 0) {
        console.log(`  📋 No images found on page ${pageNum}`);
        return [];
      }
      
      // Load page resources properly
      await page.getTextContent();
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Extract each image
      let imageIndex = 0;
      for (const operation of imageOperations) {
        try {
          console.log(`    🔧 Extracting ${operation.imageId}...`);
          
          const extractedImage = await this.extractImageResource(
            page, 
            operation.imageId, 
            pageNum, 
            imageIndex
          );
          
          if (extractedImage) {
            extractedImages.push(extractedImage);
            imageIndex++;
            const scaleInfo = extractedImage.scaled ? ` [SCALED to ${extractedImage.actualWidth}x${extractedImage.actualHeight}]` : '';
            console.log(`    ✅ Success: ${extractedImage.width}x${extractedImage.height} (${Math.round(extractedImage.size/1024)}KB)${scaleInfo}`);
          } else {
            console.log(`    ❌ Failed: ${operation.imageId}`);
          }
        } catch (error) {
          console.log(`    ❌ Error: ${error.message}`);
        }
      }
      
    } catch (error) {
      console.error(`❌ Page analysis error:`, error.message);
    }
    
    return extractedImages;
  }
  
  static async extractImageResource(page, imageId, pageNum, imageIndex) {
    try {
      // Get image object from PDF.js
      let imageObj = null;
      
      if (page.objs && page.objs.has(imageId)) {
        imageObj = page.objs.get(imageId);
        console.log(`      📦 Found in page.objs`);
      } else if (page.commonObjs && page.commonObjs.has(imageId)) {
        imageObj = page.commonObjs.get(imageId);
        console.log(`      📦 Found in commonObjs`);
      } else {
        console.log(`      ❌ Object not found: ${imageId}`);
        return null;
      }
      
      if (!imageObj) {
        console.log(`      ❌ No image object`);
        return null;
      }
      
      const width = imageObj?.width || 0;
      const height = imageObj?.height || 0;
      
      if (!width || !height) {
        console.log(`      ❌ Invalid dimensions: ${width}x${height}`);
        return null;
      }
      
      console.log(`      🔍 Object analysis:`, {
        width, height, 
        pixels: width * height,
        hasData: !!imageObj?.data,
        dataType: imageObj?.data?.constructor?.name,
        dataLength: imageObj?.data?.length
      });
      
      // **KEY LOGIC FROM WORKING EDITOR** - Format detection
      if (imageObj.data) {
        console.log(`      📊 Processing pixel data (${imageObj.data.length} bytes)`);
        
        const pixelCount = width * height;
        const bytesPerPixel = Math.round(imageObj.data.length / pixelCount);
        
        console.log(`      🧮 Format analysis: ${pixelCount} pixels, ${bytesPerPixel} bytes per pixel`);
        
        // Auto-scaling for large images to prevent huge files
        const MAX_DIMENSION = 2000;
        let finalWidth = width;
        let finalHeight = height;
        let needsScaling = false;
        
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
          finalWidth = Math.floor(width * scale);
          finalHeight = Math.floor(height * scale);
          needsScaling = true;
          console.log(`      🔄 Scaling: ${width}x${height} → ${finalWidth}x${finalHeight} (${(scale * 100).toFixed(1)}%)`);
        }
        
        let rgbData = null;
        
        // **EXACT REPLICATION FROM WORKING EDITOR**
        if (bytesPerPixel === 4) {
          // RGBA format
          console.log(`        ✅ Processing as RGBA format`);
          rgbData = await this.processRGBAData(imageObj.data, width, height, finalWidth, finalHeight, needsScaling);
        } else if (bytesPerPixel === 3) {
          // RGB format  
          console.log(`        ✅ Processing as RGB format`);
          rgbData = await this.processRGBData(imageObj.data, width, height, finalWidth, finalHeight, needsScaling);
        } else if (bytesPerPixel === 1) {
          // Grayscale format
          console.log(`        ✅ Processing as Grayscale format`);
          rgbData = await this.processGrayscaleData(imageObj.data, width, height, finalWidth, finalHeight, needsScaling);
        } else {
          // Unknown format - try adaptive processing
          console.log(`        🔧 Adaptive processing for unknown format`);
          rgbData = await this.processAdaptiveData(imageObj.data, width, height, bytesPerPixel, finalWidth, finalHeight, needsScaling);
        }
        
        if (!rgbData) {
          console.log(`      ❌ Data processing failed`);
          return null;
        }
        
        // Create PNG using pure encoder
        const pngBuffer = PurePNGEncoder.createPNG(rgbData, finalWidth, finalHeight);
        
        // Save the extracted image
        const filename = `img_p${pageNum}_${imageIndex + 1}_${imageId.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        const filepath = path.join(OUTPUT_DIR, filename);
        
        // Ensure output directory exists
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        await fs.writeFile(filepath, pngBuffer);
        
        return {
          id: `img_p${pageNum}_${imageIndex + 1}`,
          width: width,
          height: height,
          actualWidth: finalWidth,
          actualHeight: finalHeight,
          scaled: needsScaling,
          pageNumber: pageNum,
          filepath: filepath,
          originalId: imageId,
          size: pngBuffer.length
        };
      }
      
      console.log(`      ❌ No processable data found`);
      return null;
      
    } catch (error) {
      console.log(`      ❌ Extraction error: ${error.message}`);
      return null;
    }
  }
  
  // **EXACT REPLICATION FROM WORKING EDITOR**
  static async processRGBAData(data, width, height, finalWidth, finalHeight, needsScaling) {
    try {
      const rgbData = new Uint8Array(finalWidth * finalHeight * 3);
      
      if (needsScaling) {
        // Scale with sampling
        const scaleX = finalWidth / width;
        const scaleY = finalHeight / height;
        
        for (let y = 0; y < finalHeight; y++) {
          for (let x = 0; x < finalWidth; x++) {
            const srcX = Math.floor(x / scaleX);
            const srcY = Math.floor(y / scaleY);
            const srcIndex = (srcY * width + srcX) * 4;
            const destIndex = (y * finalWidth + x) * 3;
            
            rgbData[destIndex] = data[srcIndex];         // R
            rgbData[destIndex + 1] = data[srcIndex + 1]; // G
            rgbData[destIndex + 2] = data[srcIndex + 2]; // B
            // Skip A
          }
        }
      } else {
        // Direct processing
        for (let i = 0; i < width * height; i++) {
          rgbData[i * 3] = data[i * 4];         // R
          rgbData[i * 3 + 1] = data[i * 4 + 1]; // G
          rgbData[i * 3 + 2] = data[i * 4 + 2]; // B
          // Skip A
        }
      }
      
      return rgbData;
    } catch (error) {
      console.warn(`        ⚠️ RGBA processing error: ${error.message}`);
      return null;
    }
  }
  
  static async processRGBData(data, width, height, finalWidth, finalHeight, needsScaling) {
    try {
      if (needsScaling) {
        // Scale RGB data with sampling
        const rgbData = new Uint8Array(finalWidth * finalHeight * 3);
        const scaleX = finalWidth / width;
        const scaleY = finalHeight / height;
        
        for (let y = 0; y < finalHeight; y++) {
          for (let x = 0; x < finalWidth; x++) {
            const srcX = Math.floor(x / scaleX);
            const srcY = Math.floor(y / scaleY);
            const srcIndex = (srcY * width + srcX) * 3;
            const destIndex = (y * finalWidth + x) * 3;
            
            rgbData[destIndex] = data[srcIndex];         // R
            rgbData[destIndex + 1] = data[srcIndex + 1]; // G
            rgbData[destIndex + 2] = data[srcIndex + 2]; // B
          }
        }
        
        return rgbData;
      } else {
        // RGB data is already in correct format
        return new Uint8Array(data);
      }
    } catch (error) {
      console.warn(`        ⚠️ RGB processing error: ${error.message}`);
      return null;
    }
  }
  
  static async processGrayscaleData(data, width, height, finalWidth, finalHeight, needsScaling) {
    try {
      const rgbData = new Uint8Array(finalWidth * finalHeight * 3);
      
      if (needsScaling) {
        // Scale grayscale with sampling
        const scaleX = finalWidth / width;
        const scaleY = finalHeight / height;
        
        for (let y = 0; y < finalHeight; y++) {
          for (let x = 0; x < finalWidth; x++) {
            const srcX = Math.floor(x / scaleX);
            const srcY = Math.floor(y / scaleY);
            const srcIndex = srcY * width + srcX;
            const destIndex = (y * finalWidth + x) * 3;
            
            const gray = data[srcIndex];
            rgbData[destIndex] = gray;     // R
            rgbData[destIndex + 1] = gray; // G
            rgbData[destIndex + 2] = gray; // B
          }
        }
      } else {
        // Direct grayscale to RGB
        for (let i = 0; i < width * height; i++) {
          const gray = data[i];
          rgbData[i * 3] = gray;     // R
          rgbData[i * 3 + 1] = gray; // G
          rgbData[i * 3 + 2] = gray; // B
        }
      }
      
      return rgbData;
    } catch (error) {
      console.warn(`        ⚠️ Grayscale processing error: ${error.message}`);
      return null;
    }
  }
  
  static async processAdaptiveData(data, width, height, bytesPerPixel, finalWidth, finalHeight, needsScaling) {
    try {
      const rgbData = new Uint8Array(finalWidth * finalHeight * 3);
      
      if (needsScaling) {
        // Scale adaptive with sampling
        const scaleX = finalWidth / width;
        const scaleY = finalHeight / height;
        
        for (let y = 0; y < finalHeight; y++) {
          for (let x = 0; x < finalWidth; x++) {
            const srcX = Math.floor(x / scaleX);
            const srcY = Math.floor(y / scaleY);
            const srcIndex = (srcY * width + srcX) * bytesPerPixel;
            const destIndex = (y * finalWidth + x) * 3;
            
            if (bytesPerPixel >= 3) {
              // Treat as RGB-like
              rgbData[destIndex] = data[srcIndex] || 0;         // R
              rgbData[destIndex + 1] = data[srcIndex + 1] || 0; // G
              rgbData[destIndex + 2] = data[srcIndex + 2] || 0; // B
            } else {
              // Single channel
              const value = data[srcIndex] || 0;
              rgbData[destIndex] = value;     // R
              rgbData[destIndex + 1] = value; // G
              rgbData[destIndex + 2] = value; // B
            }
          }
        }
      } else {
        // Direct adaptive processing
        for (let i = 0; i < width * height; i++) {
          const srcIndex = i * bytesPerPixel;
          const destIndex = i * 3;
          
          if (bytesPerPixel >= 3) {
            // Treat as RGB-like
            rgbData[destIndex] = data[srcIndex] || 0;         // R
            rgbData[destIndex + 1] = data[srcIndex + 1] || 0; // G
            rgbData[destIndex + 2] = data[srcIndex + 2] || 0; // B
          } else {
            // Single channel
            const value = data[srcIndex] || 0;
            rgbData[destIndex] = value;     // R
            rgbData[destIndex + 1] = value; // G
            rgbData[destIndex + 2] = value; // B
          }
        }
      }
      
      return rgbData;
    } catch (error) {
      console.warn(`        ⚠️ Adaptive processing error: ${error.message}`);
      return null;
    }
  }
}

// Main execution
async function main() {
  try {
    console.log('🚀 WORKING PDF Image Extractor - Replicated from Editor');
    console.log(`📁 Input: ${PDF_FILE_PATH}`);
    console.log(`📁 Output: ${OUTPUT_DIR}`);
    
    const extractedImages = await WorkingImageExtractor.extractImages(PDF_FILE_PATH);
    
    console.log(`\n🎉 EXTRACTION COMPLETE!`);
    console.log(`📊 Total images extracted: ${extractedImages.length}`);
    
    if (extractedImages.length > 0) {
      console.log(`\n📁 Saved images:`);
      for (const img of extractedImages) {
        const scaleInfo = img.scaled ? ` [SCALED from ${img.width}x${img.height}]` : '';
        console.log(`  ✅ ${path.basename(img.filepath)} - ${img.actualWidth}x${img.actualHeight} (${Math.round(img.size/1024)}KB)${scaleInfo}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Main execution error:', error);
  }
}

// Run if called directly
main();

export { WorkingImageExtractor, PurePNGEncoder };
