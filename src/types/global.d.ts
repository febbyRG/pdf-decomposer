/**
 * Global type definitions for PDF Decomposer browser compatibility
 */

// Browser globals
declare const window: any
declare const document: any
declare const HTMLCanvasElement: any
declare const ImageData: any
declare const process: any

// Browser Canvas API types
interface CanvasGradient {
  addColorStop(offset: number, color: string): void
}

interface ImageData {
  data: Uint8ClampedArray
  width: number
  height: number
}

type CanvasTextAlign = 'start' | 'end' | 'left' | 'right' | 'center'
type CanvasTextBaseline = 'top' | 'hanging' | 'middle' | 'alphabetic' | 'ideographic' | 'bottom'

// Node.js modules (optional)
declare module 'canvas' {
  export function createCanvas(width: number, height: number): any
  export interface Canvas {
    width: number
    height: number
    getContext(type: '2d'): any
    toDataURL(type?: string, quality?: number): string
  }
  export interface CanvasRenderingContext2D {
    createImageData(width: number, height: number): ImageData
    putImageData(imageData: ImageData, dx: number, dy: number): void
    createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient
    fillRect(x: number, y: number, width: number, height: number): void
    strokeRect(x: number, y: number, width: number, height: number): void
    fillText(text: string, x: number, y: number): void
    drawImage(image: any, dx: number, dy: number, dw?: number, dh?: number): void
    fillStyle: string | CanvasGradient
    strokeStyle: string
    lineWidth: number
    font: string
    textAlign: CanvasTextAlign
    textBaseline: CanvasTextBaseline
  }
}

// Make global types available
export { }
