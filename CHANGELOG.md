# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
