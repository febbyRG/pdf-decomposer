import md5 from 'md5'
import * as pdfjs from 'pdfjs-dist'
import { PdfOperator, PdfOperatorFilter } from './PdfOperator.js'
import { PdfOperatorSelection, PdfOperatorSelectionFn } from './PdfOperatorSelection.js'

// Handle different PDF.js versions (3.x vs 5.x)
const OPS = (pdfjs as any)?.OPS || {}
type PDFOperatorList = any

export interface OPSLookup {
  [key: number]: string
}

const OPS_LOOKUP = OPS && typeof OPS === 'object' 
  ? Object.entries(OPS).reduce<OPSLookup>((obj: any, [key, value]: any) => { obj[value] = key; return obj }, {})
  : {}

function makeFilterFn(filter?: string | string[] | PdfOperatorFilter): PdfOperatorFilter {
  if (!filter) {
    return () => true
  } else if (typeof filter === 'string') {
    return ((operator: PdfOperator) => operator.fn === filter)
  } else if (filter instanceof Array) {
    return ((operator: PdfOperator) => filter.includes(operator.fn))
  } else {
    return filter
  }
}

export class PdfOperatorList {
  public operators: PdfOperator[]

  constructor({ fnArray, argsArray }: PDFOperatorList) {
    this.operators = fnArray.map((value: any, index: number) => {
      const fn = OPS_LOOKUP[value]
      const args = argsArray[index]
      return new PdfOperator(this, fn, args)
    })
  }

  public find(filter: string | string[] | PdfOperatorFilter) {
    return this.operators.find(makeFilterFn(filter))
  }

  public findAll(filter?: string | string[] | PdfOperatorFilter) {
    return this.operators.filter(makeFilterFn(filter))
  }

  public get length() {
    return this.operators.length
  }

  public indexOf(operator: PdfOperator) {
    return this.operators.indexOf(operator)
  }

  public at(index: number) {
    return this.operators[index]
  }

  public before(index: number, filter: string | string[] | PdfOperatorFilter) {
    for (let i = index - 1; i >= 0; i -= 1) {
      if (makeFilterFn(filter)(this.at(i))) { return this.at(i) }
    }
    return null
  }

  public after(index: number, filter: string | string[] | PdfOperatorFilter) {
    for (let i = index + 1; i < this.length; i += 1) {
      if (makeFilterFn(filter)(this.at(i))) { return this.at(i) }
    }
    return null
  }

  public slice(start: number, end?: number) {
    return this.operators.slice(start, end)
  }

  public select(...operators: PdfOperator[]) {
    const selection = new PdfOperatorSelection(this)
    for (const operator of operators) {
      if (operator != null) {
        selection.add(operator)
      }
    }
    return selection
  }

  public selectAll(filter?: string | string[] | PdfOperatorFilter, fn?: PdfOperatorSelectionFn) {
    return this.findAll(filter).map((operator) => {
      const selection = this.select(operator)
      if (fn) { fn(selection) }
      return selection
    })
  }

  public debug() {
    console.table(this.operators.map((operator) => {
      const args = operator.args || []
      return [operator.fn, ...args]
    }))
  }

  get fingerprint(): string {
    return md5(this.serialize())
  }

  public serialize() {
    return this.operators.map((operator) => operator.serialize()).join('')
  }
}
