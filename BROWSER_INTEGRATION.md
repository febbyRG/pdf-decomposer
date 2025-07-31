# PDF Decomposer - Angular Browser Integration Guide

## Overview
PDF Decomposer is now a zero-dependency, pure browser library perfect for Angular applications like pwa-admin.

## Key Features for Browser Usage
- ✅ **Zero Dependencies**: No Node.js compression libraries (zlib, pako removed)
- ✅ **Pure JavaScript**: Works in any browser environment
- ✅ **Base64 Output**: Returns image data as base64 strings ready for upload
- ✅ **Clean Logging**: No verbose console output in production
- ✅ **Memory Efficient**: Processes PDFs without file system access

## Installation in Angular Project

```bash
npm install @magloft/pdf-decomposer
```

## Usage in Angular Component

```typescript
import { Component } from '@angular/core';
import { decomposePdf } from '@magloft/pdf-decomposer';

@Component({
  selector: 'app-pdf-processor',
  template: `
    <input type="file" (change)="onFileSelected($event)" accept=".pdf">
    <button (click)="processPDF()" [disabled]="!selectedFile">Extract Images</button>
    <div *ngFor="let image of extractedImages">
      <img [src]="image.data" [alt]="image.id" style="max-width: 200px;">
    </div>
  `
})
export class PdfProcessorComponent {
  selectedFile: File | null = null;
  extractedImages: any[] = [];

  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
  }

  async processPDF() {
    if (!this.selectedFile) return;

    try {
      // Convert file to Uint8Array
      const arrayBuffer = await this.selectedFile.arrayBuffer();
      const pdfData = new Uint8Array(arrayBuffer);

      // Extract images using pdf-decomposer
      const result = await decomposePdf(pdfData, {
        outputDir: '.', // Not used in browser mode
        minify: true,
        includeImages: true
      });

      // Collect all images from all pages
      this.extractedImages = result.flatMap(page => page.images || []);

      console.log(`✅ Extracted ${this.extractedImages.length} images`);

      // Images are now ready for upload as base64 data
      // Each image.data contains: "data:image/png;base64,..."

    } catch (error) {
      console.error('PDF processing error:', error);
    }
  }

  // Upload image to server
  async uploadImage(image: any) {
    const formData = new FormData();

    // Convert base64 to blob
    const response = await fetch(image.data);
    const blob = await response.blob();

    formData.append('file', blob, `${image.id}.png`);
    formData.append('width', image.width.toString());
    formData.append('height', image.height.toString());

    // Upload to your API
    return this.http.post('/api/upload', formData).toPromise();
  }
}
```

## Integration with pwa-admin

### 1. Add to Angular Dependencies
```json
// package.json
{
  "dependencies": {
    "@magloft/pdf-decomposer": "^0.0.2"
  }
}
```

### 2. Type Definitions
The library includes TypeScript definitions for full Angular compatibility.

### 3. Build Configuration
No special build configuration needed - the library is already browser-ready.

### 4. Production Considerations
- Base64 images can be large - consider compression before upload
- Process PDFs in Web Workers for large files
- Implement progress indicators for user experience

## Clean Console Output
The library now provides clean, production-ready console output:
```
✅ img_p0_1: 2504×3216 (PNG) - saved as base64 data (23597KB)
💾 Base64 data available: 23597.4KB in memory
```

Instead of verbose base64 dumps that cluttered terminal output.

## Memory Management
- Automatic cleanup between pages
- Memory usage monitoring
- Safe processing of large PDFs

## Browser Compatibility
- ✅ Chrome 60+
- ✅ Firefox 55+
- ✅ Safari 12+
- ✅ Edge 79+

## Error Handling
The library provides comprehensive error handling for browser environments with fallback mechanisms for different browser capabilities.
