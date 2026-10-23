// Advance widths for Times / Times New Roman, in 1/1000 em (the standard Times-Roman
// metrics). Daniel Choy's posts are typeset in Times, one <div> per line, with chords
// aligned over lyrics by &nbsp; padding — so a chord's column only means something in
// rendered width, not in character count. These widths let the parser reconstruct
// each character's horizontal position without a browser.
const WIDTHS = {
  ' ': 250, '!': 333, '"': 408, '#': 500, '$': 500, '%': 833, '&': 778, "'": 180,
  '(': 333, ')': 333, '*': 500, '+': 564, ',': 250, '-': 333, '.': 250, '/': 278,
  '0': 500, '1': 500, '2': 500, '3': 500, '4': 500, '5': 500, '6': 500, '7': 500,
  '8': 500, '9': 500, ':': 278, ';': 278, '<': 564, '=': 564, '>': 564, '?': 444,
  '@': 921, 'A': 722, 'B': 667, 'C': 667, 'D': 722, 'E': 611, 'F': 556, 'G': 722,
  'H': 722, 'I': 333, 'J': 389, 'K': 722, 'L': 611, 'M': 889, 'N': 722, 'O': 722,
  'P': 556, 'Q': 722, 'R': 667, 'S': 556, 'T': 611, 'U': 722, 'V': 722, 'W': 944,
  'X': 722, 'Y': 722, 'Z': 611, '[': 333, '\\': 278, ']': 333, '^': 469, '_': 500,
  '`': 333, 'a': 444, 'b': 500, 'c': 444, 'd': 500, 'e': 444, 'f': 333, 'g': 500,
  'h': 500, 'i': 278, 'j': 278, 'k': 500, 'l': 278, 'm': 778, 'n': 500, 'o': 500,
  'p': 500, 'q': 500, 'r': 333, 's': 389, 't': 278, 'u': 500, 'v': 500, 'w': 722,
  'x': 500, 'y': 500, 'z': 444, '{': 480, '|': 200, '}': 480, '~': 541,
  '\u00a0': 250, '\u2018': 333, '\u2019': 333, '\u201c': 444, '\u201d': 444,
  '\u2013': 500, '\u2014': 1000, '\u2026': 1000,
}

// CJK ideographs and full-width forms render one em wide
const FULL_WIDTH_RE = /[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/

export function charWidth(ch) {
  if (ch === '\t') return WIDTHS[' '] * 4
  const w = WIDTHS[ch]
  if (w !== undefined) return w
  return FULL_WIDTH_RE.test(ch) ? 1000 : 500
}

/**
 * Left-edge x position of every character in `text` (same length as [...text]),
 * plus the total width as the final element.
 */
export function charPositions(text) {
  const xs = [0]
  for (const ch of text) xs.push(xs[xs.length - 1] + charWidth(ch))
  return xs
}
