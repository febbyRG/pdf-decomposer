# PDF-Decomposer

[![NPM Version](https://img.shields.io/npm/v/@febbyrg/pdf-decomposer.svg)](https://www.npmjs.com/package/@febbyrg/pdf-decomposer)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![Dual License](https://img.shields.io/badge/license-Dual%20License-orange.svg)](LICENSE)
[![Browser Support](https://img.shields.io/badge/browser-Chrome%20%7C%20Firefox%20%7C%20Safari%20%7C%20Edge-brightgreen.svg)](#browser-support)

A powerful TypeScript library for comprehensive PDF processing and content extraction. **Optimized for production use with universal browser and Node.js support.**

## 🚀 Core Features

### 📄 **Enhanced PDF Decomposer Class**
- **Load Once, Use Many Times** - Initialize PDF once, perform multiple operations
- **Progress Tracking** - Observable pattern with real-time progress callbacks  
- **Error Handling** - Comprehensive error reporting with page-level context
- **Memory Efficient** - Built-in memory management and cleanup
- **Universal Support** - Works in Node.js 16+ and all modern browsers

### 🔧 **Main Operations**

#### 1. **Content Decomposition** (`decompose()`)
- Extract structured text with positioning and formatting
- Smart element composition with `elementComposer`
- Content area cleaning with `cleanComposer`
- Page-level composition with `pageComposer` 
- Image extraction from embedded PDF objects

#### 2. **Screenshot Generation** (`screenshot()`)
- High-quality page rendering to PNG/JPEG
- Configurable resolution and quality
- Batch processing with progress tracking
- File output or base64 data URLs

#### 3. **PDF Data Generation** (`data()`)
- pwa-admin compatible data structure
- Interactive area mapping with normalized coordinates
- Widget ID generation following epub conventions
- Article relationship management

#### 4. **PDF Slicing** (`slice()`)
- Extract specific page ranges
- Generate new PDF documents  
- Replace internal document structure
- Preserve all metadata and formatting

### 🎯 **Advanced Content Processing**

#### **Element Composer**
- Groups scattered text elements into coherent paragraphs
- Preserves reading order and text flow
- Smart font and spacing analysis

#### **Page Composer** 
- Merges continuous content across pages
- Detects article boundaries and section breaks
- Interview and feature content recognition
- Typography consistency analysis

#### **Clean Composer**
- Filters out headers, footers, and page numbers
- Content area detection with configurable margins
- Image size validation and filtering
- Control character removal

#### **Image Extraction**
- Universal browser-compatible processing
- Multiple format support (RGB, RGBA, Grayscale)
- Auto-scaling for memory safety
- Duplicate detection and removal

### ⚡ **Performance & Memory**
- **Memory Manager** - Adaptive cleanup and monitoring
- **Progress Callbacks** - Real-time operation tracking  
- **Background Processing** - Non-blocking operations
- **Batch Processing** - Efficient multi-page handling

## 📦 Installation

```bash
npm install @febbyrg/pdf-decomposer

# For Node.js with canvas support (optional)
npm install canvas

# For browser usage
npm install pdfjs-dist
```

## 🚀 Quick Start

### **Enhanced Class-Based API (Recommended)**

```typescript
import { PdfDecomposer } from '@febbyrg/pdf-decomposer'

// Load PDF once, use many times
const pdf = new PdfDecomposer(buffer) // Buffer, ArrayBuffer, or Uint8Array
await pdf.initialize()

// Multiple operations on same PDF
const pages = await pdf.decompose({ 
  elementComposer: true,    // Group text into paragraphs
  pageComposer: true,       // Merge continuous content across pages
  cleanComposer: true,      // Clean headers/footers
  extractImages: true       // Extract embedded images
})

const screenshots = await pdf.screenshot({ 
  imageWidth: 1024,
  imageQuality: 90 
})

const pdfData = await pdf.data({      // pwa-admin compatible format
  imageWidth: 1024,
  elementComposer: true
})

const sliced = await pdf.slice({      // Extract first 5 pages
  numberPages: 5
})

// Access PDF properties
console.log(`Pages: ${pdf.numPages}`)
console.log(`Fingerprint: ${pdf.fingerprint}`)
```

### **Factory Method (One-liner)**

```typescript
import { PdfDecomposer } from '@febbyrg/pdf-decomposer'

// Create and initialize in one step
const pdf = await PdfDecomposer.create(buffer)
const pages = await pdf.decompose({ elementComposer: true })
```

### **Progress Tracking**

```typescript
const pdf = new PdfDecomposer(buffer)

// Subscribe to progress updates
pdf.subscribe((state) => {
  console.log(`${state.progress}% - ${state.message}`)
})

await pdf.initialize()
const result = await pdf.decompose({
  startPage: 1,
  endPage: 10,
  elementComposer: true
})
```

### **Browser Environment (Angular, React, Vue)**

```typescript
import { PdfDecomposer } from '@febbyrg/pdf-decomposer'

// In browser - use File API
async function processPdfFile(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = new PdfDecomposer(arrayBuffer)
  await pdf.initialize()
  
  return await pdf.decompose({
    elementComposer: true,
    extractImages: true
  })
}

// Configure PDF.js worker (once per app)
import { PdfWorkerConfig } from '@febbyrg/pdf-decomposer'
PdfWorkerConfig.configure() // Auto-configures worker URL
```

### **Advanced Usage Examples**

#### **Content Processing Pipeline**
```typescript
const pdf = new PdfDecomposer(buffer)
await pdf.initialize()

// Step 1: Extract raw content with advanced processing
const pages = await pdf.decompose({
  startPage: 1,
  endPage: 10,
  elementComposer: true,    // Group scattered text into paragraphs
  pageComposer: true,       // Merge continuous content across pages
  cleanComposer: true,      // Remove headers/footers/page numbers
  extractImages: true,      // Extract embedded images
  minify: true,            // Compact output format
  cleanComposerOptions: {
    topMarginPercent: 0.15,      // Exclude top 15% (headers)
    bottomMarginPercent: 0.10,   // Exclude bottom 10% (footers)
    minTextHeight: 8,            // Filter small text
    removeControlCharacters: true
  }
})

// Step 2: Generate interactive data for web apps
const interactiveData = await pdf.data({
  startPage: 1,
  endPage: 10,
  imageWidth: 1024,
  elementComposer: true
})

// Step 3: Create high-quality screenshots
const screenshots = await pdf.screenshot({
  startPage: 1,
  endPage: 10,
  imageWidth: 1200,
  imageQuality: 95
})
```

#### **PDF Slicing and Processing**
```typescript
const pdf = new PdfDecomposer(buffer)
await pdf.initialize()

console.log(`Original PDF: ${pdf.numPages} pages`)

// Slice to first 5 pages (modifies internal PDF)
const sliceResult = await pdf.slice({ 
  numberPages: 5 
})

console.log(`Sliced PDF: ${pdf.numPages} pages`) // Now shows 5
console.log(`Saved ${sliceResult.fileSize} bytes`)

// Process the sliced PDF
const pages = await pdf.decompose({
  elementComposer: true
})
```

#### **Page Range Processing**
```typescript
const pdf = new PdfDecomposer(buffer)
await pdf.initialize()

// Process specific page range
const chapterPages = await pdf.decompose({
  startPage: 5,     // Start from page 5
  endPage: 15,      // End at page 15  
  pageComposer: true // Merge continuous content
})

// Generate screenshots for the same range
const chapterScreenshots = await pdf.screenshot({
  startPage: 5,
  endPage: 15,
  imageWidth: 800
})
```

## 🔧 API Reference

### **PdfDecomposer Class**

#### **Constructor**
```typescript
new PdfDecomposer(input: Buffer | ArrayBuffer | Uint8Array)
```

#### **Static Methods**
```typescript
// Factory method - create and initialize in one step
static async create(input: Buffer | ArrayBuffer | Uint8Array): Promise<PdfDecomposer>
```

#### **Instance Methods**

```typescript
// Initialize PDF (required before other operations)
async initialize(): Promise<void>

// Extract content and structure
async decompose(options?: PdfDecomposerOptions): Promise<DecomposeResult>

// Generate page screenshots  
async screenshot(options?: ScreenshotOptions): Promise<ScreenshotResult>

// Generate pwa-admin compatible data structure
async data(options?: DataOptions): Promise<DataResult>

// Slice PDF to specific page range
async slice(options?: SliceOptions): Promise<SliceResult>

// Subscribe to progress updates
subscribe(callback: (state: PdfDecomposerState) => void): void

// Get PDF and page fingerprints for caching
async getFingerprints(): Promise<{ pdfHash: string; pageHashes: string[]; total: number }>
```

#### **Properties**
```typescript
readonly numPages: number           // Total number of pages
readonly fingerprint: string        // PDF fingerprint for caching  
readonly initialized: boolean       // Initialization status
```

### **Options Interfaces**

#### **PdfDecomposerOptions**
```typescript
interface PdfDecomposerOptions {
  startPage?: number                // First page (1-indexed, default: 1)
  endPage?: number                  // Last page (1-indexed, default: all)
  outputDir?: string                // Output directory for files
  elementComposer?: boolean         // Group text into paragraphs
  pageComposer?: boolean           // Merge continuous content across pages
  extractImages?: boolean          // Extract embedded images
  minify?: boolean                 // Compact output format
  cleanComposer?: boolean          // Remove headers/footers
  cleanComposerOptions?: PdfCleanComposerOptions
}
```

#### **ScreenshotOptions**
```typescript
interface ScreenshotOptions {
  startPage?: number               // First page (1-indexed)
  endPage?: number                 // Last page (1-indexed)  
  outputDir?: string               // Output directory for image files
  imageWidth?: number              // Image width (default: 1200)
  imageQuality?: number            // JPEG quality 1-100 (default: 90)
}
```

#### **DataOptions**
```typescript
interface DataOptions {
  startPage?: number               // First page (1-indexed)
  endPage?: number                 // Last page (1-indexed)
  outputDir?: string               // Output directory
  extractImages?: boolean          // Extract embedded images
  elementComposer?: boolean        // Group elements into paragraphs
  cleanComposer?: boolean          // Clean content area
  imageWidth?: number              // Screenshot width (default: 1024)
  imageQuality?: number            // Screenshot quality (default: 90)
}
```

#### **SliceOptions**
```typescript
interface SliceOptions {
  numberPages?: number             // Number of pages from start
  startPage?: number               // Starting page (1-indexed, default: 1)
  endPage?: number                 // Ending page (1-indexed)
}
```

#### **PdfCleanComposerOptions**
```typescript
interface PdfCleanComposerOptions {
  topMarginPercent?: number        // Exclude top % for headers (default: 0.1)
  bottomMarginPercent?: number     // Exclude bottom % for footers (default: 0.1)
  sideMarginPercent?: number       // Exclude side % (default: 0.05)
  minTextHeight?: number           // Minimum text height (default: 8)
  minTextWidth?: number            // Minimum text width (default: 10)
  minTextLength?: number           // Minimum text length (default: 3)
  removeControlCharacters?: boolean // Remove non-printable chars (default: true)
  removeIsolatedCharacters?: boolean // Remove isolated chars (default: true)
  minImageWidth?: number           // Minimum image width (default: 50)
  minImageHeight?: number          // Minimum image height (default: 50)
  minImageArea?: number            // Minimum image area (default: 2500)
  coverPageDetection?: boolean     // Detect cover pages (default: true)
  coverPageThreshold?: number      // Cover detection threshold (default: 0.8)
}
```

### **Result Interfaces**

#### **DecomposeResult**
```typescript
interface DecomposeResult {
  pages: PdfPageContent[]          // Array of page content
}

interface PdfPageContent {
  pageIndex: number                // 0-based page index
  pageNumber: number               // 1-based page number
  width: number                    // Page width in points
  height: number                   // Page height in points
  title: string                    // Page title
  elements: PdfElement[]           // Extracted elements
  metadata?: {                     // Optional metadata
    composedFromPages?: number[]   // Original page indices (for pageComposer)
    [key: string]: any
  }
}
```

#### **ScreenshotResult**
```typescript
interface ScreenshotResult {
  totalPages: number
  screenshots: ScreenshotPageResult[]
}

interface ScreenshotPageResult {
  pageNumber: number               // 1-based page number
  width: number                    // Image width in pixels
  height: number                   // Image height in pixels
  screenshot: string               // Base64 data URL
  filePath?: string                // File path if outputDir provided
  error?: string                   // Error message if failed
}
```

#### **DataResult**
```typescript
interface DataResult {
  data: PdfData[]                  // pwa-admin compatible format
}

interface PdfData {
  id: string                       // Unique page identifier
  index: number                    // 0-based page index
  image: string                    // Page screenshot URL
  thumbnail: string                // Thumbnail URL
  areas: PdfArea[]                 // Interactive areas
}

interface PdfArea {
  id: string                       // Unique area identifier
  coords: number[]                 // [x1, y1, x2, y2] normalized 0-1
  articleId: number                // Associated article ID
  widgetId: string                 // Widget identifier (P: or T:)
}
```

#### **SliceResult**  
```typescript
interface SliceResult {
  pdfBytes: Uint8Array            // Sliced PDF data
  originalPageCount: number        // Original page count
  slicedPageCount: number         // Sliced page count
  pageRange: {                    // Page range that was sliced
    startPage: number
    endPage: number
  }
  fileSize: number                // Size in bytes
}
```

## 🧪 Testing & Development

### **Run Tests**
```bash
npm test                    # Comprehensive test suite
npm run test:screenshot     # Screenshot generation tests
npm run test:data          # PDF data generation tests
```

### **Build & Development**
```bash
npm run build              # Build TypeScript to dist/
npm run build:watch        # Watch mode for development
npm run lint               # ESLint validation
```

### **Test Output**
The test suite generates output in `scripts/test-output/`:
- Decomposed JSON files
- Generated screenshots  
- PDF data structures
- Performance metrics

## 📱 Environment Support

| Feature | Node.js | Browser | Notes |
|---------|---------|---------|-------|
| **Text Extraction** | ✅ | ✅ | Full support both environments |
| **Image Extraction** | ✅ | ✅ | Universal canvas-based processing |
| **Screenshots** | ✅ | ✅ | Node.js uses canvas, browser uses Canvas API |
| **PDF Slicing** | ✅ | ✅ | Uses pdf-lib in both environments |
| **Progress Tracking** | ✅ | ✅ | Observable pattern with callbacks |
| **Memory Management** | ✅ | Limited | Advanced in Node.js, basic in browser |
| **File Output** | ✅ | ❌ | Browser returns data URLs/blobs |
| **Element Composer** | ✅ | ✅ | Smart text grouping |
| **Page Composer** | ✅ | ✅ | Cross-page content merging |
| **Clean Composer** | ✅ | ✅ | Header/footer removal |

### **Browser Compatibility**
- ✅ **Chrome 60+** - Full support
- ✅ **Firefox 55+** - Full support  
- ✅ **Safari 11+** - Full support
- ✅ **Edge 79+** - Full support
- ✅ **Mobile Browsers** - iOS Safari, Chrome Mobile

### **Node.js Requirements**
- **Node.js 16+** required
- **Canvas** optional for enhanced screenshot quality
- **TypeScript 4.9+** for development



## 🔍 Production Usage Examples

### **Memory Optimization**
```typescript
const pdf = new PdfDecomposer(buffer)
await pdf.initialize()

// Process in smaller batches for large PDFs
const totalPages = pdf.numPages
const batchSize = 10

for (let start = 1; start <= totalPages; start += batchSize) {
  const end = Math.min(start + batchSize - 1, totalPages)
  
  const batch = await pdf.decompose({
    startPage: start,
    endPage: end,
    elementComposer: true
  })
  
  // Process batch results...
}
```

### **Error Handling**
```typescript
const pdf = new PdfDecomposer(buffer)

pdf.subscribe((state) => {
  console.log(`Progress: ${state.progress}%`)
})

try {
  await pdf.initialize()
  const result = await pdf.decompose()
} catch (error) {
  if (error.name === 'InvalidPdfError') {
    console.error('Invalid PDF format:', error.message)
  } else if (error.name === 'MemoryError') {
    console.error('Memory limit exceeded:', error.message)
  } else {
    console.error('Processing failed:', error.message)
  }
}
```

### **Caching Strategy**
```typescript
const pdf = new PdfDecomposer(buffer)
await pdf.initialize()

// Use fingerprint for caching
const fingerprints = await pdf.getFingerprints()
const cacheKey = `pdf_${fingerprints.pdfHash}`

// Check cache before processing
const cached = cache.get(cacheKey)
if (!cached) {
  const result = await pdf.decompose()
  cache.set(cacheKey, result, { ttl: 3600 }) // 1 hour
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### **Development Guidelines**
- Use TypeScript for all new code
- Add tests for new features
- Update README for API changes
- Follow existing code style
- Test in both Node.js and browser environments

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### **Development Guidelines**
- Use TypeScript for all new code
- Add tests for new features
- Update README for API changes
- Follow existing code style
- Test in both Node.js and browser environments

## 📄 License

**PDF-Decomposer** is dual-licensed:

### 🆓 Non-Commercial Use (Free)
- ✅ Personal projects
- ✅ Educational use
- ✅ Research purposes
- ✅ Open source projects

### 💼 Commercial Use (Paid License Required)
- 🏢 Commercial applications
- 💰 Revenue-generating products
- 🚀 Enterprise software
- 📦 Distribution in commercial products

**For commercial licensing**: Contact [febby.rachmat@gmail.com](mailto:febby.rachmat@gmail.com)

See [LICENSE](LICENSE) file for complete terms.

## 🔗 Links

- **NPM Package**: [@febbyrg/pdf-decomposer](https://www.npmjs.com/package/@febbyrg/pdf-decomposer)
- **GitHub Repository**: [febbyRG/pdf-decomposer](https://github.com/febbyRG/pdf-decomposer)
- **Issues**: [GitHub Issues](https://github.com/febbyRG/pdf-decomposer/issues)
- **Documentation**: [API Reference](https://github.com/febbyRG/pdf-decomposer#-api-reference)
- **Releases**: [GitHub Releases](https://github.com/febbyRG/pdf-decomposer/releases)

---