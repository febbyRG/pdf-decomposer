import { describe, expect, it } from 'vitest'
import { hasObfuscatedText, recoverObfuscatedText } from './GlyphTextRecovery.js'

// The real davisart TOC subset: /Differences maps charcodes 24-31 to
// cap-height figure glyphs, ToUnicode maps them to the charcode itself
// ("22" therefore extracts as "\u001F\u001F").
const DAVISART_DIFFERENCES: (string | null)[] = []
DAVISART_DIFFERENCES[24] = 'zero.cap'
DAVISART_DIFFERENCES[25] = 'six.cap'
DAVISART_DIFFERENCES[26] = 'eight.cap'
DAVISART_DIFFERENCES[27] = 'seven.cap'
DAVISART_DIFFERENCES[28] = 'one.cap'
DAVISART_DIFFERENCES[29] = 'four.cap'
DAVISART_DIFFERENCES[30] = 'three.cap'
DAVISART_DIFFERENCES[31] = 'two.cap'
const FONT = { differences: DAVISART_DIFFERENCES }

describe('hasObfuscatedText', () => {
  it('detects C0 control characters and ignores healthy text incl. tab/newline', () => {
    expect(hasObfuscatedText('\u001F\u001F')).toBe(true)
    expect(hasObfuscatedText('22 TAB from the Heart')).toBe(false)
    expect(hasObfuscatedText('line\tone\ntwo\r')).toBe(false)
  })
})

describe('recoverObfuscatedText', () => {
  it('decodes the davisart entry numbers (control char = charcode -> glyph name -> digit)', () => {
    expect(recoverObfuscatedText('\u001F\u001F', FONT)).toBe('22')
    expect(recoverObfuscatedText('\u001E\u001D', FONT)).toBe('34')
    expect(recoverObfuscatedText('\u001D\u0018', FONT)).toBe('40')
  })

  it('decodes mixed strings and leaves healthy characters alone', () => {
    expect(recoverObfuscatedText('\u001F\u001F TAB', FONT)).toBe('22 TAB')
  })

  it('keeps characters whose glyph name is missing or unknown', () => {
    const sparse = { differences: { 24: 'florin.weird' } as Record<number, string> }
    expect(recoverObfuscatedText('\u0018\u0019', sparse)).toBe('\u0018\u0019')
  })

  it('supports single-letter and uniXXXX glyph names', () => {
    const font = { differences: { 24: 'A', 25: 'uni0042' } as Record<number, string> }
    expect(recoverObfuscatedText('\u0018\u0019', font)).toBe('AB')
  })

  it('returns the input untouched without a font or without control characters', () => {
    expect(recoverObfuscatedText('\u001F', null)).toBe('\u001F')
    expect(recoverObfuscatedText('plain', FONT)).toBe('plain')
  })
})
