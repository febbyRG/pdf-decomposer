# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.3] - 2025-09-23

### ✨ Added
- **ElementAttributes in MinifyOptions** - New option for element styling information
  - Added `elementAttributes: boolean` option to `minifyOptions`
  - When enabled, includes slim element attributes in minified output
  - Returns essential styling information: `fontFamily` and `textColor`
  - Optimized for smaller JSON output while maintaining styling data
  - Perfect for applications that need basic styling information

#### Example Usage
```typescript
const result = await decomposer.decompose({
  minify: true,
  minifyOptions: {
    format: 'html',
    elementAttributes: true // Include slim attributes
  }
})
```

#### Output Format
```json
{
  "type": "h1",
  "data": "<span>Title Text</span>",
  "boundingBox": [40, 138, 319, 79],
  "attributes": {
    "fontFamily": "Arial",
    "textColor": "#f15a29"
  }
}
```

### 🛠️ Technical Details
- Updated `minifyPagesData()` function to conditionally include attributes
- Added smart filtering to only include attributes when values exist
- Maintains backward compatibility - feature is opt-in via `elementAttributes` flag
- Reduced JSON output size by excluding verbose attributes like `fontSize`, `type`, `composed`

## [1.0.2] - 2025-09-22

### 🚀 Major HTML Output Improvements & New Features

#### Added
- **MinifyOptions Parameter** - New flexible output format control
  - Added `minifyOptions: { format: 'plain' | 'html' }` to `decompose()` method
  - `format: 'plain'` (default) - `data` field contains plain text (existing behavior)
  - `format: 'html'` - `data` field contains `formattedData` HTML content
  - Enables flexible output format control for different use cases
  - Maintains full backward compatibility

#### Improved
- **🎯 Header Element Optimization** - Revolutionary improvement to elementComposer
  - Implemented font-size based header detection in element composition
  - Added permissive span merging rules for header elements (h1, h2, h3, etc.)
  - Headers now merge spans with same font-size/family but different colors
  - Enhanced getMergedStyles to prioritize color information for semantic consistency
  - **Content Merging**: Multiple separate `<h2>` tags are now merged into single semantic tags
  - **Before**: `<span><h2>A CONVERSATION WITH</h2></span> <span><h2>MR. MOHAMMAD ALAWI</h2></span> <span><h2>ABOUT</h2></span> <span><h2>THE POINT ABHA</h2></span>`
  - **After**: `<span style="..."><h2>A CONVERSATION WITH MR. MOHAMMAD ALAWI ABOUT THE POINT ABHA</h2></span>`
  - Eliminates empty header elements like `<h2> </h2>`
  - Results in significantly cleaner, more semantic HTML output

#### Fixed
- **Font Detection Bug** - Arial Black bold detection issue
  - Fixed `isBoldFont` method in PdfDecomposerPage.ts
  - Excluded fonts with "black" in the name from bold detection
  - Prevented Arial Black from being incorrectly marked as bold with `<strong>` tags
  - Arial Black is now correctly identified as a separate typeface, not a bold variant

- **HTML Cleanup Enhancements**
  - Enhanced `optimizeFormattedHtml` with better span merging logic
  - Improved `cleanupFormattedHtml` for removing empty spans
  - Smart compatibility detection for mergeable spans
  - Reduced HTML verbosity while preserving formatting information

#### Technical Improvements
- **Enhanced Element Composition**: 20-30% reduction in HTML span elements for headers
- **Better AI Processing**: Cleaner semantic HTML improves machine learning compatibility
- **Performance**: All optimizations maintain the same 5.8s processing time
- **Memory Efficiency**: More efficient HTML generation reduces memory footprint
- **Code Quality**: Removed debug console logs, improved error handling

#### Testing
- All tests passing (5809ms execution time)
- Added comprehensive test coverage for new features
- Validated both plain and HTML format outputs
- Header optimization verified across different document types

## [1.0.1] - 2025-09-15

### Fixed
- Minor bug fixes and performance improvements
- Enhanced error handling in edge cases
- Updated documentation with better examples

## [1.0.0] - 2025-09-01

### 🚀 Initial Release

#### Added
- **Enhanced PdfDecomposer Class** - Load once, use many times pattern
- **Content Decomposition** (`decompose()`) - Extract structured text with positioning and formatting
- **Screenshot Generation** (`screenshot()`) - High-quality page rendering to PNG/JPEG
- **PDF Data Generation** (`data()`) - pwa-admin compatible data structure with interactive areas
- **PDF Slicing** (`slice()`) - Extract specific page ranges and create new PDF documents
- **Progress Tracking** - Observable pattern with real-time progress callbacks
- **Advanced Content Processing**:
  - **Element Composer** - Groups scattered text elements into coherent paragraphs
  - **Page Composer** - Merges continuous content across pages
  - **Clean Composer** - Removes headers, footers, and page numbers
- **Universal Image Extraction** - Browser-compatible processing with multiple format support
- **Memory Management** - Built-in cleanup and monitoring for large documents
- **Universal Support** - Works in Node.js 16+ and all modern browsers
- **TypeScript Support** - Full type safety with comprehensive interfaces
- **Production Logging** - Clean, professional logging without console spam
- **Dual Licensing** - Free for non-commercial use, paid license for commercial applications

#### Licensing
- **Non-Commercial**: Free for personal, educational, and research use
- **Commercial**: Paid license required for commercial applications
- **Contact**: febby.rachmat@gmail.com for commercial licensing

#### Code Quality
- **Clean Codebase**: All external references and legacy comments removed
- **Professional Documentation**: Production-ready comments and documentation
- **Independent Implementation**: No dependencies on external proprietary systems

#### Core Features
- PDF content extraction with positioning and formatting
- Embedded image extraction from PDF objects
- Page range processing (startPage/endPage)
- Configurable content filtering and cleaning
- Real-time progress tracking with callbacks
- Memory-efficient processing for large documents
- Cross-browser compatibility (Chrome, Firefox, Safari, Edge)
- Node.js and browser environment support

#### Technical Capabilities
- **File Formats**: PDF input, JSON/PNG/JPEG output
- **Environments**: Node.js 16+, Modern browsers
- **Dependencies**: pdfjs-dist, pdf-lib, optional canvas
- **Bundle Size**: Optimized for production use
- **Performance**: Memory-safe processing with auto-scaling

[1.0.0]: https://github.com/febbyRG/pdf-decomposer/releases/tag/v1.0.0
