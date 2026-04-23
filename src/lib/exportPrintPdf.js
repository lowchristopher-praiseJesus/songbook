import jsPDF from 'jspdf'

// ---------------------------------------------------------------------------
// Page geometry
// ---------------------------------------------------------------------------

const PAGE_SIZES = {
  a4:     { w: 841.89, h: 595.28 },
  letter: { w: 792,    h: 612    },
}

const MARGIN  = 28   // pt (~10mm)
const COL_GAP = 14   // pt (~5mm)
const TITLE_TOP_PAD = 4  // pt of breathing room above a song title (no rule)

// ---------------------------------------------------------------------------
// Default per-component settings
// ---------------------------------------------------------------------------

export const DEFAULT_COMPONENTS = {
  title:        { fontFamily: 'helvetica', fontSize: 12, color: '#000000' },
  lyrics:       { fontFamily: 'helvetica', fontSize: 10, color: '#1a1a1a' },
  chords:       { fontFamily: 'courier',   fontSize: 9,  color: '#1a5fa8' },
  sectionLabel: { fontFamily: 'helvetica', fontSize: 8,  color: '#555555' },
  annotation:   { fontFamily: 'helvetica', fontSize: 8,  color: '#888888' },
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function setColor(doc, hex) {
  const [r, g, b] = hexToRgb(hex)
  doc.setTextColor(r, g, b)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export an array of songs as a multi-column landscape Print PDF.
 *
 * Songs flow newspaper-style: column 1 fills top-to-bottom, then column 2,
 * etc. A new song begins inline wherever the previous song ended.
 *
 * @param {Array<{ meta: object, sections: Section[] }>} songs
 * @param {{
 *   numCols?:    number,
 *   pageSize?:   'a4' | 'letter',
 *   components?: {
 *     title?:        { fontFamily?: string, fontSize?: number, color?: string },
 *     lyrics?:       { fontFamily?: string, fontSize?: number, color?: string },
 *     chords?:       { fontFamily?: string, fontSize?: number, color?: string },
 *     sectionLabel?: { fontFamily?: string, fontSize?: number, color?: string },
 *     annotation?:   { fontFamily?: string, fontSize?: number, color?: string },
 *   }
 * }} [options]
 */
export function exportPrintPdf(songs, {
  numCols    = 2,
  pageSize   = 'a4',
  components = {},
  pdfTitle   = '',
} = {}) {
  if (!songs.length) return

  // Merge caller-supplied values over defaults (per component, per key)
  const comp = {}
  for (const key of Object.keys(DEFAULT_COMPONENTS)) {
    comp[key] = { ...DEFAULT_COMPONENTS[key], ...(components[key] ?? {}) }
  }

  const { w: pageW, h: pageH } = PAGE_SIZES[pageSize] ?? PAGE_SIZES.a4
  const colWidth   = (pageW - 2 * MARGIN - (numCols - 1) * COL_GAP) / numCols
  const pageBottom = pageH - MARGIN

  const doc = new jsPDF({ unit: 'pt', format: [pageW, pageH], orientation: 'landscape' })

  // Mutable layout state
  let col = 0
  let y   = MARGIN

  function colX() {
    return MARGIN + col * (colWidth + COL_GAP)
  }

  // Advance y by `needed` pt. If it doesn't fit in the current column, move to
  // the next column (or a new page if already on the last column).
  function advance(needed) {
    if (y + needed > pageBottom) {
      if (col < numCols - 1) {
        col++
        y = MARGIN
      } else {
        doc.addPage()
        col = 0
        y = MARGIN
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Derived metrics (per component)
  // ---------------------------------------------------------------------------

  const titleAscent  = comp.title.fontSize  * 0.72  // cap-height for rule placement
  const titleLineH   = comp.title.fontSize  * 1.5
  const lyricLineH   = comp.lyrics.fontSize * 1.45
  const labelLineH   = comp.sectionLabel.fontSize * 1.5
  const annotLineH   = comp.annotation.fontSize   * 1.4

  // chordLineH = distance from chord baseline to lyric baseline.
  // Must clear chord descenders (28%) + 3pt gap + lyric ascent (72%).
  const chordLineH = comp.chords.fontSize * 0.28 + 3 + comp.lyrics.fontSize * 0.72

  // ---------------------------------------------------------------------------
  // Render helpers — all write into the mutable `col`, `y`, `doc` context
  // ---------------------------------------------------------------------------

  function renderTitle(title) {
    doc.setFont(comp.title.fontFamily, 'bold')
    doc.setFontSize(comp.title.fontSize)
    const wrapped = doc.splitTextToSize(title, colWidth)

    // Reserve space: optional top padding + ascent + one titleLineH per wrapped line.
    const topPad = y > MARGIN + 2 ? TITLE_TOP_PAD : 0
    advance(topPad + titleAscent + titleLineH * wrapped.length)

    y += topPad + titleAscent  // descend to text baseline

    setColor(doc, comp.title.color)
    for (const line of wrapped) {
      doc.text(line, colX(), y)
      y += titleLineH
    }
  }

  function renderAnnotation(text) {
    doc.setFont(comp.annotation.fontFamily, 'italic')
    doc.setFontSize(comp.annotation.fontSize)
    setColor(doc, comp.annotation.color)
    const wrapped = doc.splitTextToSize(text, colWidth)
    for (const line of wrapped) {
      advance(annotLineH)
      doc.text(line, colX(), y)
      y += annotLineH
    }
  }

  function renderSectionLabel(label, annotation) {
    y += comp.lyrics.fontSize * 0.4
    const upperLabel = label.toUpperCase()
    doc.setFont(comp.sectionLabel.fontFamily, 'bold')
    doc.setFontSize(comp.sectionLabel.fontSize)
    setColor(doc, comp.sectionLabel.color)
    advance(labelLineH)
    doc.text(upperLabel, colX(), y)

    if (annotation) {
      const labelW = doc.getStringUnitWidth(upperLabel) * comp.sectionLabel.fontSize / doc.internal.scaleFactor
      const annotX = colX() + labelW + 6
      const annotW = colWidth - labelW - 6
      if (annotW > 15) {
        doc.setFont(comp.annotation.fontFamily, 'italic')
        doc.setFontSize(comp.annotation.fontSize)
        setColor(doc, comp.annotation.color)
        doc.text(annotation, annotX, y)
      }
    }

    y += labelLineH
  }

  // Render chords positioned above a lyric line using the chords[] position array.
  // `lyric` is the clean lyric string (chord markers already stripped).
  function renderChordRow(chords, lyric) {
    setColor(doc, comp.chords.color)
    const x0 = colX()
    for (const { chord, position, strum } of chords) {
      // Measure the lyric prefix in the LYRIC font so the chord x-offset
      // matches where that character actually falls in the rendered lyric.
      doc.setFont(comp.lyrics.fontFamily, 'normal')
      doc.setFontSize(comp.lyrics.fontSize)
      const prefix = lyric.slice(0, position)
      const xOff = doc.getStringUnitWidth(prefix) * comp.lyrics.fontSize / doc.internal.scaleFactor

      // Render the chord name (with strum if present) in the chord font.
      doc.setFont(comp.chords.fontFamily, 'normal')
      doc.setFontSize(comp.chords.fontSize)
      doc.text(chord + (strum || ''), x0 + xOff, y)
    }
    y += chordLineH
  }

  // Render a pure chord line (type === 'chord'): no paired lyric, so space
  // chords using their character-position values and the chord font's char width.
  function renderPureChordRow(chords, annotation) {
    doc.setFont(comp.chords.fontFamily, 'normal')
    doc.setFontSize(comp.chords.fontSize)
    setColor(doc, comp.chords.color)
    const x0 = colX()
    const charW = comp.chords.fontSize * 0.6
    let maxRight = x0
    for (const { chord, position, strum } of chords) {
      const cx = x0 + position * charW
      const label = chord + (strum || '')
      doc.text(label, cx, y)
      const cw = doc.getStringUnitWidth(label) * comp.chords.fontSize / doc.internal.scaleFactor
      maxRight = Math.max(maxRight, cx + cw)
    }

    if (annotation) {
      const annotX = maxRight + 6
      const annotW = x0 + colWidth - maxRight - 6
      if (annotW > 15) {
        doc.setFont(comp.annotation.fontFamily, 'italic')
        doc.setFontSize(comp.annotation.fontSize)
        setColor(doc, comp.annotation.color)
        doc.text(annotation, annotX, y)
      }
    }

    y += chordLineH
  }

  function renderLyricLine(text, annotation) {
    doc.setFont(comp.lyrics.fontFamily, 'normal')
    doc.setFontSize(comp.lyrics.fontSize)
    setColor(doc, comp.lyrics.color)
    const wrapped = doc.splitTextToSize(text, colWidth)
    for (let i = 0; i < wrapped.length; i++) {
      advance(lyricLineH)
      doc.text(wrapped[i], colX(), y)
      if (annotation && i === wrapped.length - 1) {
        const lyricW = doc.getStringUnitWidth(wrapped[i]) * comp.lyrics.fontSize / doc.internal.scaleFactor
        const annotX = colX() + lyricW + 6
        const annotW = colWidth - lyricW - 6
        if (annotW > 15) {
          doc.setFont(comp.annotation.fontFamily, 'italic')
          doc.setFontSize(comp.annotation.fontSize)
          setColor(doc, comp.annotation.color)
          doc.text(annotation, annotX, y)
        }
      }
      y += lyricLineH
    }
  }

  // ---------------------------------------------------------------------------
  // Optional document title (rendered once at the very start of column 1)
  // ---------------------------------------------------------------------------

  function renderPdfTitle(title) {
    doc.setFont(comp.title.fontFamily, 'bold')
    doc.setFontSize(comp.title.fontSize)
    const wrapped = doc.splitTextToSize(title, colWidth)

    advance(titleAscent + titleLineH * wrapped.length)
    y += titleAscent

    setColor(doc, comp.title.color)
    for (const line of wrapped) {
      doc.text(line, colX(), y)
      y += titleLineH
    }

    y += comp.title.fontSize * 1.0  // gap between document title and first song
  }

  // ---------------------------------------------------------------------------
  // Song renderer
  // ---------------------------------------------------------------------------

  function renderSong(song) {
    renderTitle(song.meta?.title ?? 'Untitled')

    if (song.meta?.annotation) {
      renderAnnotation(song.meta.annotation)
    }

    for (const section of song.sections ?? []) {
      const hasLyric = (section.lines ?? []).some(l => l.type === 'lyric')
      if (!hasLyric) continue

      if (section.label) {
        renderSectionLabel(section.label, section.annotation)
      }

      for (const line of section.lines ?? []) {
        if (line.type === 'blank') {
          y += comp.lyrics.fontSize * 0.4
          continue
        }

        if (line.type === 'chord') {
          advance(chordLineH)
          renderPureChordRow(line.chords ?? [], line.annotation)
          continue
        }

        // Lyric line — may have inline chords to render above
        if ((line.chords ?? []).length > 0) {
          advance(chordLineH + lyricLineH)
          renderChordRow(line.chords, line.content ?? '')
        }

        renderLyricLine(line.content ?? '', line.annotation)
      }

      y += comp.lyrics.fontSize * 0.3
    }

    y += comp.lyrics.fontSize * 0.6
  }

  // ---------------------------------------------------------------------------
  // Render all songs
  // ---------------------------------------------------------------------------

  if (pdfTitle) renderPdfTitle(pdfTitle)

  for (const song of songs) {
    renderSong(song)
  }

  const date = new Date().toISOString().slice(0, 10)
  doc.save(`Print ${date}.pdf`)
}
