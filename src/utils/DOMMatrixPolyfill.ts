/**
 * DOMMatrix and Promise.withResolvers polyfills for Node.js environment
 * Provides minimal implementations to make PDF.js work without Canvas
 */

// Promise.withResolvers polyfill for Node.js 20
if (typeof (Promise as any).withResolvers === 'undefined') {
  (Promise as any).withResolvers = function<T>() {
    let resolve: (value: T | PromiseLike<T>) => void
    let reject: (reason?: any) => void
    
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    
    return { promise, resolve: resolve!, reject: reject! }
  }
}

// Simple DOMMatrix polyfill for Node.js
if (typeof globalThis !== 'undefined' && typeof globalThis.DOMMatrix === 'undefined') {
  const DOMMatrixPolyfill = class {
    a: number = 1
    b: number = 0
    c: number = 0
    d: number = 1
    e: number = 0
    f: number = 0

    constructor(init?: any) {
      if (init) {
        if (Array.isArray(init)) {
          this.a = init[0] || 1
          this.b = init[1] || 0
          this.c = init[2] || 0
          this.d = init[3] || 1
          this.e = init[4] || 0
          this.f = init[5] || 0
        }
      }
    }

    static fromMatrix(other: any) {
      return new DOMMatrixPolyfill([other.a, other.b, other.c, other.d, other.e, other.f])
    }

    static fromFloat32Array() {
      return new DOMMatrixPolyfill()
    }

    static fromFloat64Array() {
      return new DOMMatrixPolyfill()
    }

    multiply(other: any) {
      return new DOMMatrixPolyfill([
        this.a * other.a + this.c * other.b,
        this.b * other.a + this.d * other.b,
        this.a * other.c + this.c * other.d,
        this.b * other.c + this.d * other.d,
        this.a * other.e + this.c * other.f + this.e,
        this.b * other.e + this.d * other.f + this.f
      ])
    }

    inverse() {
      const det = this.a * this.d - this.b * this.c
      if (det === 0) throw new Error('Matrix is not invertible')
      
      return new DOMMatrixPolyfill([
        this.d / det,
        -this.b / det,
        -this.c / det,
        this.a / det,
        (this.c * this.f - this.d * this.e) / det,
        (this.b * this.e - this.a * this.f) / det
      ])
    }

    transformPoint(point: any) {
      return {
        x: this.a * point.x + this.c * point.y + this.e,
        y: this.b * point.x + this.d * point.y + this.f
      }
    }
  }

  ;(globalThis as any).DOMMatrix = DOMMatrixPolyfill
  console.log('✅ DOMMatrix polyfill installed for Node.js environment')
}
