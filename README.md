# pdf-decomposer

[![npm version](https://img.shields.io/npm/v/pdf-decomposer.svg)](https://www.npmjs.com/package/pdf-decomposer)
[![build status](https://github.com/yourusername/pdf-decomposer/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/pdf-decomposer/actions)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A TypeScript library to parse all PDF page content (text, images, annotations, etc.) into JSON format. **Now with browser compatibility for Angular, React, and Vue!**

## Features

✨ **Memory Efficient** - Default mode extracts text and embedded images without heavy page rendering
🖼️ **Advanced Image Extraction** - Enhanced PDF.js operator analysis with multiple format support (RGB, RGBA, Grayscale)
📄 **Page Range Support** - Process specific page ranges (startPage/endPage)
🎯 **Embedded Images** - Extract individual images embedded in PDF content with auto-scaling
🚀 **Serverless Ready** - Single-threaded processing with memory monitoring
🌐 **Browser Compatible** - Works in Angular, React, Vue, and all modern browsers
⚡ **TypeScript** - Full type safety and modern ES modules
🔧 **Dual Environment** - Automatic Node.js/Browser detection and optimization

## Quick Start

```bash
npm install pdf-decomposer pdfjs-dist
```

### Node.js Environment

```typescript
import { decomposePdf } from 'pdf-decomposer'

// Memory-efficient text extraction (default)
const result = await decomposePdf('document.pdf')

// Generate page screenshots separately
const screenshots = await screenshotPdf('document.pdf', {
  imageWidth: 1200,
  imageQuality: 90,
  outputDir: './screenshots'
})

// Process specific pages with advanced image extraction
const result = await decomposePdf('document.pdf', {
  startPage: 2,
  endPage: 5,
  extractImages: true // Enhanced extraction from BC Editor
})
```

### Browser Environment (Angular, React, Vue)

```typescript
import { decomposePdfBrowser, initializePDFJS } from 'pdf-decomposer/browser'
import * as pdfjsLib from 'pdfjs-dist'

// Initialize PDF.js (once in your app)
initializePDFJS(pdfjsLib, '/assets/pdfjs/pdf.worker.min.js')

// Process PDF in browser
const fileBuffer = await file.arrayBuffer()
const result = await decomposePdfBrowser(fileBuffer, {
  extractEmbeddedImages: true,
  elementComposer: true // Group text elements into paragraphs
})
```

### Angular Integration

```typescript
import { Component } from '@angular/core'
import { decomposePdfBrowser, convertToAngularFormat } from 'pdf-decomposer/browser'

@Component({...})
export class PdfComponent {
  async processPdf(file: File) {
    const arrayBuffer = await file.arrayBuffer()
    const browserPages = await decomposePdfBrowser(arrayBuffer)
    const angularPages = convertToAngularFormat(browserPages)
    return angularPages
  }
}
```

## Testing

Run the comprehensive test suite:
```bash
npm test              # Node.js tests
npm run test:browser  # Browser compatibility tests
```

Run demos:
```bash
npm run test:usage    # Usage test with images
```

## Browser Compatibility

- ✅ Chrome 60+
- ✅ Firefox 55+
- ✅ Safari 11+
- ✅ Edge 79+
- ✅ Mobile browsers

## Environment Support

| Feature | Node.js | Browser |
|---------|---------|---------|
| Text Extraction | ✅ | ✅ |
| Embedded Images | ✅ | ✅ |
| Page Images | ✅ | ❌ |
| Puppeteer Rendering | ✅ | ❌ |
| Memory Management | ✅ | Limited |
| Angular/React/Vue | ❌ | ✅ |

## Development

```bash
npm install           # Install dependencies
npm run build:all     # Build both Node.js and browser versions
npm test              # Run comprehensive tests
npm run test:browser  # Test browser compatibility
npm run lint          # Run ESLint
```

## Documentation

- [Angular Integration Guide](ANGULAR_INTEGRATION.md) - Complete guide for Angular projects
- [API Documentation](scripts/README.md) - Detailed usage examples and API documentation
- [Browser Compatibility](scripts/browser-test.ts) - Browser feature testing

## What's New in v0.0.1

🚀 **Major Browser Compatibility Update**

- ✅ **Angular/React/Vue Support** - Full browser compatibility layer
- ✅ **Advanced Image Extraction** - Enhanced from BC Editor with RGB/RGBA/Grayscale support
- ✅ **Auto-scaling Canvas** - Memory-safe image processing with auto-scaling
- ✅ **Dual Entry Points** - Separate Node.js and browser builds
- ✅ **Environment Detection** - Automatic optimization based on runtime environment
- ✅ **TypeScript Definitions** - Complete type safety for both environments

## Migration from Editor Implementation

If you're migrating from the BC Editor PDF implementation:

```typescript
// Old BC Editor approach
import { EnhancedPDFConverter } from '@/lib/cloud-storage/EnhancedPDFConverter'
const result = await EnhancedPDFConverter.convert(file)

// New pdf-decomposer approach (browser)
import { decomposePdfBrowser } from 'pdf-decomposer/browser'
const arrayBuffer = await file.arrayBuffer()
const result = await decomposePdfBrowser(arrayBuffer)
```

## License

MIT
