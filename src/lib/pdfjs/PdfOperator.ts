import { PdfOperatorList } from './PdfOperatorList.js'
import { PdfOperatorSelection, PdfOperatorSelectionFn } from './PdfOperatorSelection.js'

export type PdfOperatorFilter = (operator: PdfOperator) => boolean

export class PdfOperator {
  constructor(private list: PdfOperatorList, public fn: string, public args: any[] = []) {}

  get index() {
    return this.list.indexOf(this)
  }

  get prev() {
    return this.list.at(this.index - 1)
  }

  get next() {
    return this.list.at(this.index + 1)
  }

  before(filter: PdfOperatorFilter | string) {
    return this.list.before(this.index, filter)
  }

  after(filter: PdfOperatorFilter | string) {
    return this.list.after(this.index, filter)
  }

  select(fn: PdfOperatorSelectionFn) {
    const selection = new PdfOperatorSelection(this.list)
    selection.add(this)
    fn(selection)
    return selection.extract()
  }

  serialize() {
    return `[${this.fn}]`
  }
}
