import { describe, expect, it } from 'vitest'
import { parseFontName } from './PdfUtil.js'

describe('parseFontName', () => {
  it('reads family, weight and style from a subset font name', () => {
    expect(parseFontName('ABCDEF+OpenSans-Bold')).toMatchObject({ fontFamily: 'Open Sans', fontWeight: 'bold', fontStyle: 'normal', identifier: 'open-sans' })
    expect(parseFontName('ABCDEF+Raleway-Italic')).toMatchObject({ fontFamily: 'Raleway', fontWeight: 'regular', fontStyle: 'italic' })
    expect(parseFontName('Montserrat-Regular')).toMatchObject({ fontFamily: 'Montserrat', fontWeight: 'regular', fontStyle: 'normal' })
  })

  // worlds-leader.pdf: its body is Times New Roman under Monotype's PostScript names.
  it('leaves the markers of a PostScript name out of the family', () => {
    expect(parseFontName('ABCDEF+TimesNewRomanPSMT')).toMatchObject({ fontFamily: 'Times New Roman', fontWeight: 'regular', fontStyle: 'normal', identifier: 'times-new-roman' })
    expect(parseFontName('TimesNewRomanPS-BoldMT')).toMatchObject({ fontFamily: 'Times New Roman', fontWeight: 'bold', fontStyle: 'normal' })
    expect(parseFontName('TimesNewRomanPS-ItalicMT')).toMatchObject({ fontFamily: 'Times New Roman', fontWeight: 'regular', fontStyle: 'italic' })
    expect(parseFontName('TimesNewRomanPS-BoldItalicMT')).toMatchObject({ fontFamily: 'Times New Roman', fontWeight: 'bold', fontStyle: 'italic' })
    expect(parseFontName('Arial-BoldMT')).toMatchObject({ fontFamily: 'Arial', fontWeight: 'bold' })
    expect(parseFontName('ArialMT')).toMatchObject({ fontFamily: 'Arial', fontWeight: 'regular' })
  })

  it('keeps a family whose name only contains those letters', () => {
    expect(parseFontName('HelveticaNowDisplay-XBlk').fontFamily).toBe('Helvetica Now Display X Blk')
    expect(parseFontName('DIN-Bold').fontFamily).toBe('Din')
    expect(parseFontName('UPS').fontFamily).toBe('Ups')
    expect(parseFontName('AMT').fontFamily).toBe('Amt')
  })
})
