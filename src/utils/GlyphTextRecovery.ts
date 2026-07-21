/**
 * Recovery of text whose ToUnicode CMap is broken.
 *
 * Some export pipelines write font subsets whose ToUnicode maps glyphs to C0
 * control characters equal to the raw charcode (davisart TOC: the entry page
 * numbers use cap-height figure glyphs, "22" extracts as U+001F U+001F). Every
 * text consumer then sees empty-looking strings while PDF viewers copy the
 * digits fine, because the font's OWN encoding still names the glyphs: the
 * /Differences array maps charcode 31 -> "two.cap". pdf.js exports that array
 * (with `fontExtraProperties: true`), and the observed control character IS
 * the charcode, so the real character is recoverable deterministically:
 * control char -> charcode -> glyph name -> Unicode (Adobe glyph-list naming,
 * style suffixes like ".cap"/".lf"/".osf" stripped).
 *
 * Only strings containing C0 control characters (never produced by healthy
 * extraction) enter the recovery path, and an unresolvable glyph keeps its
 * original character, so healthy documents are byte-untouched.
 */

interface FontWithEncoding {
  differences?: Record<number, string> | (string | null)[]
}

/** C0 control characters except tab/newline/carriage-return. */
// eslint-disable-next-line no-control-regex
const OBFUSCATED_CHAR_RX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/

/**
 * Glyph name -> character for the names that matter in practice (Adobe glyph
 * list subset: digits, basic punctuation). Single-letter names (/a, /B) and
 * uniXXXX/uXXXX forms are handled programmatically in glyphNameToChar.
 */
const GLYPH_CHARS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  space: ' ', period: '.', comma: ',', hyphen: '-', slash: '/',
  colon: ':', semicolon: ';', ampersand: '&', numbersign: '#',
  parenleft: '(', parenright: ')', quotesingle: '\'', quotedbl: '"',
  exclam: '!', question: '?', percent: '%', dollar: '$', at: '@',
  plus: '+', equal: '=', asterisk: '*', underscore: '_'
}

function glyphNameToChar(name: string): string | null {
  // Style variants name the base glyph before the suffix: "two.cap" -> "two".
  const base = name.split('.')[0]
  if (base.length === 1 && /[A-Za-z]/.test(base)) { return base }
  if (GLYPH_CHARS[base] !== undefined) { return GLYPH_CHARS[base] }
  const uniMatch = /^uni([0-9A-Fa-f]{4})$/.exec(base) ?? /^u([0-9A-Fa-f]{4,6})$/.exec(base)
  if (uniMatch) { return String.fromCodePoint(parseInt(uniMatch[1], 16)) }
  return null
}

function glyphNameAt(font: FontWithEncoding, charcode: number): string | undefined {
  const differences = font.differences
  if (!differences) { return undefined }
  const name = Array.isArray(differences) ? differences[charcode] : differences[charcode]
  return typeof name === 'string' ? name : undefined
}

/** True when the string needs (and could benefit from) glyph recovery. */
export function hasObfuscatedText(text: string): boolean {
  return OBFUSCATED_CHAR_RX.test(text)
}

/**
 * Decode a control-character-obfuscated string through its font's
 * /Differences encoding. Characters that resolve to no glyph name (or to a
 * name outside the known list) stay as they are.
 */
export function recoverObfuscatedText(text: string, font: FontWithEncoding | null | undefined): string {
  if (!font || !hasObfuscatedText(text)) { return text }
  let recovered = ''
  for (const char of text) {
    const code = char.codePointAt(0) as number
    if (OBFUSCATED_CHAR_RX.test(char)) {
      const name = glyphNameAt(font, code)
      const mapped = name ? glyphNameToChar(name) : null
      recovered += mapped ?? char
    } else {
      recovered += char
    }
  }
  return recovered
}
