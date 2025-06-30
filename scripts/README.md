# PDF-Decomposer Scripts

This directory contains demonstration and testing scripts for the pdf-decomposer library.

## Available Scripts

### 🧪 Comprehensive Test Suite
```bash
npm test
# or
npx tsx scripts/comprehensive-test.ts
```
Runs a complete test suite covering all functionality:
- ✅ Basic processing with images
- ✅ Memory-efficient mode (no images)
- ✅ Embedded images extraction
- ✅ Page range processing
- ✅ Single page processing
- ✅ High-quality images
- ✅ Error handling

Results are saved to `comprehensive-test-output/test-results.json` with detailed metrics.

### 🎨 Demo Scripts

#### Usage Test
```bash
npm run test:usage
# or
npx tsx scripts/usage-test.ts
```
Processes the demo PDF with image generation enabled, outputs to `usage-test/test.output.json`.

## Test Files

- `pdf-test-input/demo.pdf` - Sample PDF for testing (6 pages)
- `pdf-test-input/test.pdf` - Additional test PDF

## Output Directories

- `comprehensive-test-output/` - Test results and generated assets
- `usage-test/` - Usage test output and assets

## Usage Examples

### Basic Text Extraction (Memory Efficient)
```typescript
import { decomposePdf } from '../src/api/decomposePdf.js'

const result = await decomposePdf('document.pdf', {
  // generateImages defaults to false - no memory overhead
  extractEmbeddedImages: true // Optional: extract embedded images
})
```

### Generate Page Images
```typescript
const result = await decomposePdf('document.pdf', {
  assetPath: './output',
  generateImages: true,      // Generate page images and thumbnails
  imageWidth: 1200,          // High resolution
  imageQuality: 90          // High quality JPEG
})
```

### Process Specific Pages
```typescript
const result = await decomposePdf('document.pdf', {
  startPage: 2,              // Start from page 2
  endPage: 5,                // End at page 5
  generateImages: true
})
```

### Serverless-Friendly Configuration
```typescript
const result = await decomposePdf('document.pdf', {
  // Default settings are optimized for serverless:
  // - generateImages: false (no heavy image processing)
  // - Single-threaded processing
  // - Memory monitoring and cleanup
  extractEmbeddedImages: true // Light extraction of embedded content
})
```

### PDF-to-HTML Conversion with Paragraph Grouping
```typescript
const result = await decomposePdf('document.pdf', {
  elementComposer: true,      // Groups individual text elements into paragraphs
  extractEmbeddedImages: true, // Extract images for the HTML
  assetPath: './output'       // Save images to this directory
})

// The result will contain structured paragraphs perfect for HTML conversion:
// - element.type === 'paragraph' (instead of many individual 'text' elements)
// - element.data contains the full paragraph text
// - element.attributes.composed === true (indicates composed element)
```
