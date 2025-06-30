# pdf-decomposer

[![npm version](https://img.shields.io/npm/v/pdf-decomposer.svg)](https://www.npmjs.com/package/pdf-decomposer)
[![build status](https://github.com/yourusername/pdf-decomposer/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/pdf-decomposer/actions)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A TypeScript Node.js library to parse all PDF page content (text, images, annotations, etc.) into JSON format. Optimized for serverless environments with memory-efficient processing and high-quality Puppeteer-based rendering.

## Features

✨ **Memory Efficient** - Default mode extracts text and embedded images without heavy page rendering
🖼️ **High-Quality Images** - Optional Puppeteer-based page image generation
📄 **Page Range Support** - Process specific page ranges (startPage/endPage)
🎯 **Embedded Images** - Extract individual images embedded in PDF content
🚀 **Serverless Ready** - Single-threaded processing with memory monitoring
⚡ **TypeScript** - Full type safety and modern ES modules

## Quick Start

```bash
npm install pdf-decomposer
```

```typescript
import { decomposePdf } from 'pdf-decomposer'

// Memory-efficient text extraction (default)
const result = await decomposePdf('document.pdf')

// With page images
const result = await decomposePdf('document.pdf', {
  generateImages: true,
  imageWidth: 1200,
  imageQuality: 90
})

// Process specific pages
const result = await decomposePdf('document.pdf', {
  startPage: 2,
  endPage: 5,
  extractEmbeddedImages: true
})

// Group text elements into paragraphs (ideal for PDF-to-HTML conversion)
const result = await decomposePdf('document.pdf', {
  elementComposer: true, // Groups individual text elements into structured paragraphs
  extractEmbeddedImages: true
})

// Combine pages with continuous content flow (ideal for articles/stories)
const result = await decomposePdf('document.pdf', {
  elementComposer: true, // Group text elements first
  pageComposer: true, // Then combine pages with continuous content
  extractEmbeddedImages: true
})
```

## Testing

Run the comprehensive test suite:
```bash
npm test
```

Run demos:
```bash
npm run test:usage     # Usage test with images
```

## Development

```bash
npm install           # Install dependencies
npm run build         # Build TypeScript
npm test              # Run comprehensive tests
npm run lint          # Run ESLint
```

## API Documentation

See [scripts/README.md](scripts/README.md) for detailed usage examples and API documentation.

## License

MIT
