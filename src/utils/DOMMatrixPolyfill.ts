/**
 * DOMMatrix, Promise.withResolvers, Promise.allSettled, structuredClone, and ReadableStream polyfills for Node.js environment
 * Provides minimal implementations to make PDF.js work without Canvas
 */

// Promise.allSettled polyfill for Node.js < 12.9
if (typeof Promise.allSettled === 'undefined') {
  Promise.allSettled = function (promises: Promise<any>[]) {
    return Promise.all(
      promises.map(promise =>
        Promise.resolve(promise)
          .then(value => ({ status: 'fulfilled' as const, value }))
          .catch(reason => ({ status: 'rejected' as const, reason }))
      )
    )
  }
  console.log('✅ Promise.allSettled polyfill installed for Node.js environment')
}

// ReadableStream polyfill for Node.js < 18
if (typeof globalThis.ReadableStream === 'undefined') {
  class ReadableStreamPolyfill {
    private _locked = false
    private _reader: any = null

    constructor(private _source?: any) {
      // Initialize with source if provided
    }

    getReader() {
      if (this._locked) {
        throw new TypeError('ReadableStream is locked')
      }
      this._locked = true

      const reader = {
        read: async () => {
          // For PDF.js compatibility, we need to return proper stream chunks
          return { done: true, value: undefined }
        },
        releaseLock: () => {
          this._locked = false
          this._reader = null
        },
        cancel: () => Promise.resolve(),
        closed: Promise.resolve()
      }

      this._reader = reader
      return reader
    }

    cancel() {
      return Promise.resolve()
    }

    pipeTo() {
      return Promise.resolve()
    }

    pipeThrough() {
      return this
    }

    tee() {
      return [this, this]
    }

    get locked() {
      return this._locked
    }
  }

  (globalThis as any).ReadableStream = ReadableStreamPolyfill
  console.log('✅ ReadableStream polyfill installed for Node.js environment')
}

// structuredClone polyfill for Node.js < 17
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = function (obj: any) {
    return JSON.parse(JSON.stringify(obj))
  }
}

// Promise.withResolvers polyfill for Node.js 20
if (typeof (Promise as any).withResolvers === 'undefined') {
  (Promise as any).withResolvers = function <T>() {
    let resolve: (value: T | PromiseLike<T>) => void
    let reject: (reason?: any) => void

    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })

    return { promise, resolve: resolve!, reject: reject! }
  }
}

// DOMMatrix polyfill for Node.js environment
if (typeof globalThis.DOMMatrix === 'undefined') {
  class DOMMatrix {
    a = 1
    b = 0
    c = 0
    d = 1
    e = 0
    f = 0
    m11 = 1
    m12 = 0
    m13 = 0
    m14 = 0
    m21 = 0
    m22 = 1
    m23 = 0
    m24 = 0
    m31 = 0
    m32 = 0
    m33 = 1
    m34 = 0
    m41 = 0
    m42 = 0
    m43 = 0
    m44 = 1
    is2D = true
    isIdentity = true

    constructor(init?: string | number[]) {
      if (init) {
        if (typeof init === 'string') {
          this.setMatrixValue(init)
        } else if (Array.isArray(init)) {
          this.setFromArray(init)
        }
      }
    }

    private setMatrixValue(_transformList: string): void {
      // Simple implementation - just set to identity for now
      this.setIdentity()
    }

    private setFromArray(array: number[]): void {
      if (array.length >= 6) {
        this.a = this.m11 = array[0]
        this.b = this.m12 = array[1]
        this.c = this.m21 = array[2]
        this.d = this.m22 = array[3]
        this.e = this.m41 = array[4]
        this.f = this.m42 = array[5]
      }
      this.updateIs2D()
    }

    private setIdentity(): void {
      this.a = this.m11 = 1
      this.b = this.m12 = 0
      this.c = this.m21 = 0
      this.d = this.m22 = 1
      this.e = this.m41 = 0
      this.f = this.m42 = 0
      this.m13 = this.m14 = this.m23 = this.m24 = 0
      this.m31 = this.m32 = this.m34 = this.m43 = 0
      this.m33 = this.m44 = 1
      this.is2D = true
      this.isIdentity = true
    }

    private updateIs2D(): void {
      this.is2D = this.m13 === 0 && this.m14 === 0 && this.m23 === 0 && this.m24 === 0 &&
        this.m31 === 0 && this.m32 === 0 && this.m33 === 1 && this.m34 === 0 &&
        this.m43 === 0 && this.m44 === 1
    }

    scale(scaleX: number, scaleY?: number): DOMMatrix {
      const sy = scaleY !== undefined ? scaleY : scaleX
      const matrix = new DOMMatrix()
      matrix.a = this.a * scaleX
      matrix.b = this.b * scaleX
      matrix.c = this.c * sy
      matrix.d = this.d * sy
      matrix.e = this.e
      matrix.f = this.f
      return matrix
    }

    translate(tx: number, ty?: number): DOMMatrix {
      const ty2 = ty || 0
      const matrix = new DOMMatrix()
      matrix.a = this.a
      matrix.b = this.b
      matrix.c = this.c
      matrix.d = this.d
      matrix.e = this.a * tx + this.c * ty2 + this.e
      matrix.f = this.b * tx + this.d * ty2 + this.f
      return matrix
    }

    multiply(other: DOMMatrix): DOMMatrix {
      const matrix = new DOMMatrix()
      matrix.a = this.a * other.a + this.b * other.c
      matrix.b = this.a * other.b + this.b * other.d
      matrix.c = this.c * other.a + this.d * other.c
      matrix.d = this.c * other.b + this.d * other.d
      matrix.e = this.e * other.a + this.f * other.c + other.e
      matrix.f = this.e * other.b + this.f * other.d + other.f
      return matrix
    }

    inverse(): DOMMatrix {
      const det = this.a * this.d - this.b * this.c
      if (det === 0) {
        throw new Error('Matrix is not invertible')
      }

      const matrix = new DOMMatrix()
      matrix.a = this.d / det
      matrix.b = -this.b / det
      matrix.c = -this.c / det
      matrix.d = this.a / det
      matrix.e = (this.c * this.f - this.d * this.e) / det
      matrix.f = (this.b * this.e - this.a * this.f) / det
      return matrix
    }

    toString(): string {
      if (this.is2D) {
        return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`
      } else {
        return `matrix3d(${this.m11}, ${this.m12}, ${this.m13}, ${this.m14}, ${this.m21}, ${this.m22}, ${this.m23}, ${this.m24}, ${this.m31}, ${this.m32}, ${this.m33}, ${this.m34}, ${this.m41}, ${this.m42}, ${this.m43}, ${this.m44})`
      }
    }
  }

  (globalThis as any).DOMMatrix = DOMMatrix
  console.log('✅ DOMMatrix polyfill installed for Node.js environment')
}

export { }

