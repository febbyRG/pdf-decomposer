import { PdfOperator, PdfOperatorFilter } from './PdfOperator.js'
import { PdfOperatorList } from './PdfOperatorList.js'
import * as PdfOperatorTransforms from './PdfOperatorTransforms.js'

export type PdfOperatorSelectionFn = (selection: PdfOperatorSelection) => void

export class PdfOperatorSelection {
  public operators: PdfOperator[] = []

  constructor(private list: PdfOperatorList) {}

  add(operator: PdfOperator) {
    this.operators.push(operator)
    this.operators.sort((a, b) => a.index - b.index)
    return this
  }

  remove(operator: PdfOperator) {
    const index = this.operators.indexOf(operator)
    if (index) { this.operators.splice(index, 1) }
    return this
  }

  before(filter: PdfOperatorFilter | string) {
    const operator = this.first.before(filter)
    if (operator) { this.add(operator) }
    return this
  }

  after(filter: PdfOperatorFilter | string) {
    const operator = this.last.after(filter)
    if (operator) { this.add(operator) }
    return this
  }

  includes(operator: PdfOperator) {
    return this.operators.includes(operator)
  }

  slice() {
    return this.list.slice(this.first.index, this.last.index)
  }

  fill() {
    for (const operator of this.slice()) {
      if (!this.includes(operator)) {
        this.add(operator)
      }
    }
  }

  extract<T extends object>() {
    return this.operators.reduce<T>((obj, { fn, args }) => {
      (obj as any)[fn] = (PdfOperatorTransforms as any)[fn] ? (PdfOperatorTransforms as any)[fn](args) : args
      return obj
    }, {} as T)
  }

  transform(): Partial<PdfOperatorTransforms.Operators>[] {
    return this.operators.map(({ fn, args }) => {
      return { [fn]: (PdfOperatorTransforms as any)[fn] ? (PdfOperatorTransforms as any)[fn](args) : args }
    })
  }

  get first() {
    return this.operators[0]
  }

  get last() {
    return this.operators[this.operators.length - 1]
  }

  public debug() {
    console.table(this.operators.map(({ fn, args }) => {
      return { fn, args }
    }))
  }
}