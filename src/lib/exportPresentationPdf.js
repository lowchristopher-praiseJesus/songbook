import jsPDF from 'jspdf'

const PAGE_W = 960
const PAGE_H = 540
const MARGIN_X = 60
const MARGIN_TOP = 50
const MARGIN_BOTTOM = 40
const MAX_W = PAGE_W - MARGIN_X * 2            // 840 pt
const USABLE_H = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM  // 450 pt
const MAX_FONT = 32
const MIN_FONT = 8
const COL_GAP = 40
const COL_W = (MAX_W - COL_GAP) / 2                      // 400 pt per column
const COL1_CX = MARGIN_X + COL_W / 2                     // 260 pt (left column centre)
const COL2_CX = MARGIN_X + COL_W + COL_GAP + COL_W / 2  // 700 pt (right column centre)
const COL3_W  = (MAX_W - COL_GAP * 2) / 3                // ≈ 253.3 pt per column (3-col)
const COL1_3CX = MARGIN_X + COL3_W / 2                                       // ≈ 186.7 pt
const COL2_3CX = MARGIN_X + COL3_W + COL_GAP + COL3_W / 2                   // 480 pt (exact)
const COL3_3CX = MARGIN_X + 2 * (COL3_W + COL_GAP) + COL3_W / 2            // ≈ 773.3 pt
const TWO_COL_THRESHOLD = PAGE_H * 0.75        // 405 pt — use two columns when lyric content exceeds this

// ---------------------------------------------------------------------------
// Measurement helpers
// ---------------------------------------------------------------------------

/** Height used by the title + artist header (including the 20 pt gap below). */
function measureHeader(doc, song, fontSize, annotationsVisible = true) {
  const titleSize = fontSize * 1.8
  const artistSize = fontSize * 0.9
  const annotSize = fontSize * 0.75
  const titleLineH = titleSize * 1.3
  const artistLineH = artistSize * 1.3
  const annotLineH = annotSize * 1.3
  let h = 0
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(titleSize)
  h += doc.splitTextToSize(song.meta.title ?? 'Untitled', MAX_W).length * titleLineH
  if (song.meta.artist) h += artistLineH + 4
  if (annotationsVisible && song.meta.annotation) h += annotLineH + 2
  h += 20
  return h
}

/**
 * Height of a list of sections (chord lines skipped).
 * maxW controls line-wrap width — use MAX_W for single-col, COL_W for two-col.
 */
function measureSections(doc, sections, fontSize, maxW = MAX_W, annotationsVisible = true) {
  const labelSize = fontSize * 0.65
  const annotSize = fontSize * 0.6
  const lineH = fontSize * 1.4
  const labelLineH = labelSize * 1.4
  const annotLineH = annotSize * 1.3
  let h = 0
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(fontSize)
  for (const section of sections) {
    if (!(section.lines ?? []).some(l => l.type === 'lyric')) continue
    if (section.label) {
      h += 6 + labelLineH + 4
      if (annotationsVisible && section.annotation) h += annotLineH + 2
    }
    for (const line of section.lines ?? []) {
      if (line.type === 'chord') continue
      if (line.type === 'blank') { h += lineH * 0.5; continue }
      h += doc.splitTextToSize(line.content ?? '', maxW).length * lineH
      if (annotationsVisible && line.annotation) h += annotLineH + 2
    }
    h += lineH * 0.4
  }
  return h
}

/**
 * Split sections into left and right halves for two-column layout.
 *
 * For multi-section songs: among all section-boundary splits where both
 * columns fit within contentH, picks the most balanced one (min height
 * difference). Falls back to the midpoint split if no valid boundary exists
 * (handled upstream by font-size reduction in findBestFontConstrained).
 *
 * For single-section songs: splits lines at the height midpoint.
 *
 * @param {jsPDF} doc
 * @param {Section[]} sections
 * @param {number} fontSize
 * @param {number} contentH  Available column height (USABLE_H minus header height)
 */
function splitSections(doc, sections, fontSize, contentH) {
  const filtered = sections.filter(s => (s.lines ?? []).some(l => l.type === 'lyric'))
  if (filtered.length === 0) return { left: [], right: [] }

  // When there is only one section, split its lines into two halves
  if (filtered.length === 1) {
    const section = filtered[0]
    const lines = section.lines ?? []
    const lyricLines = lines.filter(l => l.type !== 'chord')
    if (lyricLines.length <= 1) return { left: filtered, right: [] }

    // Find the line index closest to the height midpoint
    const totalH = measureSections(doc, filtered, fontSize, COL_W)
    const half = totalH / 2
    let accumulated = 0
    let splitAt = Math.ceil(lines.length / 2)

    for (let i = 0; i < lines.length - 1; i++) {
      const pseudoSection = { ...section, lines: [lines[i]] }
      accumulated += measureSections(doc, [pseudoSection], fontSize, COL_W)
      if (accumulated >= half) {
        splitAt = i + 1
        break
      }
    }

    return {
      left: [{ ...section, lines: lines.slice(0, splitAt) }],
      right: [{ ...section, label: null, lines: lines.slice(splitAt) }],
    }
  }

  // Multi-section: among all valid split points where both halves fit within
  // contentH, pick the most balanced one (smallest height difference between
  // columns). This avoids the midpoint heuristic placing a large section in a
  // column that overflows.
  let bestSplit = null
  let bestBalance = Infinity

  for (let i = 0; i < filtered.length - 1; i++) {
    const leftH = measureSections(doc, filtered.slice(0, i + 1), fontSize, COL_W)
    const rightH = measureSections(doc, filtered.slice(i + 1), fontSize, COL_W)
    if (leftH <= contentH && rightH <= contentH) {
      const balance = Math.abs(leftH - rightH)
      if (balance < bestBalance) {
        bestBalance = balance
        bestSplit = i + 1
      }
    }
  }

  if (bestSplit !== null) {
    return { left: filtered.slice(0, bestSplit), right: filtered.slice(bestSplit) }
  }

  // Fallback: midpoint split — no section boundary keeps both columns within
  // contentH. findBestFontConstrained will have already tried smaller fonts, so
  // this path is a last resort at MIN_FONT.
  const totalH = measureSections(doc, filtered, fontSize, COL_W)
  const half = totalH / 2
  let accumulated = 0

  for (let i = 0; i < filtered.length - 1; i++) {
    accumulated += measureSections(doc, [filtered[i]], fontSize, COL_W)
    if (accumulated >= half) {
      return { left: filtered.slice(0, i + 1), right: filtered.slice(i + 1) }
    }
  }
  return { left: filtered.slice(0, -1), right: filtered.slice(-1) }
}

/**
 * Split sections into three roughly balanced columns for three-column layout.
 * Returns { left, middle, right } where each is an array of section objects.
 *
 * Strategy mirrors splitSections:
 *   - 1 section  → split lines at height thirds
 *   - 2 sections → first section in left; split second at height midpoint
 *   - 3+ sections → find the most balanced pair of section-boundary splits
 *                   where all three columns fit within contentH
 *
 * @param {jsPDF} doc
 * @param {Section[]} sections
 * @param {number} fontSize
 * @param {number} contentH  Available column height (USABLE_H minus header height)
 */
function splitSections3(doc, sections, fontSize, contentH) {
  const filtered = sections.filter(s => (s.lines ?? []).some(l => l.type === 'lyric'))
  if (filtered.length === 0) return { left: [], middle: [], right: [] }

  if (filtered.length === 1) {
    const section = filtered[0]
    const lines = section.lines ?? []
    if (lines.filter(l => l.type !== 'chord').length <= 2) return { left: filtered, middle: [], right: [] }

    const totalH = measureSections(doc, filtered, fontSize, COL3_W)
    const third = totalH / 3
    let accumulated = 0
    let split1 = Math.floor(lines.length / 3)
    let split2 = Math.floor(2 * lines.length / 3)
    let found1 = false
    for (let i = 0; i < lines.length - 1; i++) {
      accumulated += measureSections(doc, [{ ...section, lines: [lines[i]] }], fontSize, COL3_W)
      if (!found1 && accumulated >= third) { split1 = i + 1; found1 = true }
      else if (found1 && accumulated >= 2 * third) { split2 = i + 1; break }
    }
    return {
      left:   [{ ...section, lines: lines.slice(0, split1) }],
      middle: [{ ...section, label: null, lines: lines.slice(split1, split2) }],
      right:  [{ ...section, label: null, lines: lines.slice(split2) }],
    }
  }

  if (filtered.length === 2) {
    const sec = filtered[1]
    const lines = sec.lines ?? []
    const half = measureSections(doc, [sec], fontSize, COL3_W) / 2
    let accumulated = 0
    let splitAt = Math.ceil(lines.length / 2)
    for (let i = 0; i < lines.length - 1; i++) {
      accumulated += measureSections(doc, [{ ...sec, lines: [lines[i]] }], fontSize, COL3_W)
      if (accumulated >= half) { splitAt = i + 1; break }
    }
    return {
      left:   [filtered[0]],
      middle: [{ ...sec, lines: lines.slice(0, splitAt) }],
      right:  [{ ...sec, label: null, lines: lines.slice(splitAt) }],
    }
  }

  // 3+ sections: find the most balanced valid pair of section-boundary split points.
  let bestSplit = null
  let bestBalance = Infinity
  for (let i = 1; i < filtered.length - 1; i++) {
    const leftH = measureSections(doc, filtered.slice(0, i), fontSize, COL3_W)
    if (leftH > contentH) continue
    for (let j = i + 1; j <= filtered.length - 1; j++) {
      const midH  = measureSections(doc, filtered.slice(i, j), fontSize, COL3_W)
      const rightH = measureSections(doc, filtered.slice(j),    fontSize, COL3_W)
      if (midH <= contentH && rightH <= contentH) {
        const balance = Math.max(leftH, midH, rightH) - Math.min(leftH, midH, rightH)
        if (balance < bestBalance) { bestBalance = balance; bestSplit = { i, j } }
      }
    }
  }
  if (bestSplit !== null) {
    return {
      left:   filtered.slice(0, bestSplit.i),
      middle: filtered.slice(bestSplit.i, bestSplit.j),
      right:  filtered.slice(bestSplit.j),
    }
  }

  // Fallback: even thirds by count
  const n = filtered.length
  const i = Math.max(1, Math.floor(n / 3))
  const j = Math.min(n - 1, Math.floor(2 * n / 3))
  return { left: filtered.slice(0, i), middle: filtered.slice(i, j), right: filtered.slice(j) }
}

/**
 * Starting at desiredFont, step down until the song fits within the given
 * column constraint, returning the largest font that fits and the layout
 * column count decided at that font.
 *
 * @param {jsPDF} doc
 * @param {object} song
 * @param {number} desiredFont  Starting font size
 * @param {number} maxCols      1 = single-column only; 2 = up to two columns; 3 = up to three columns
 * @returns {{ font: number, cols: 1|2|3 }}
 */
function findBestFontConstrained(doc, song, desiredFont, maxCols, annotationsVisible) {
  const sections = song.sections ?? []

  for (let fs = desiredFont; fs >= MIN_FONT; fs--) {
    const contentH = USABLE_H - measureHeader(doc, song, fs, annotationsVisible)

    if (maxCols === 1) {
      if (measureSections(doc, sections, fs, MAX_W, annotationsVisible) <= contentH) return { font: fs, cols: 1 }
    } else {
      if (measureSections(doc, sections, fs, MAX_W, annotationsVisible) <= TWO_COL_THRESHOLD) return { font: fs, cols: 1 }
      const { left, right } = splitSections(doc, sections, fs, contentH)
      if (
        measureSections(doc, left, fs, COL_W, annotationsVisible) <= contentH &&
        measureSections(doc, right, fs, COL_W, annotationsVisible) <= contentH
      ) return { font: fs, cols: 2 }
      if (maxCols >= 3) {
        const { left: l3, middle, right: r3 } = splitSections3(doc, sections, fs, contentH)
        if (
          measureSections(doc, l3, fs, COL3_W, annotationsVisible) <= contentH &&
          measureSections(doc, middle, fs, COL3_W, annotationsVisible) <= contentH &&
          measureSections(doc, r3, fs, COL3_W, annotationsVisible) <= contentH
        ) return { font: fs, cols: 3 }
      }
    }
  }
  return { font: MIN_FONT, cols: maxCols === 1 ? 1 : 2 }
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/**
 * Render the title + artist header, centred across the full page width.
 * Returns the y position after the header (where content starts).
 */
function renderHeader(doc, song, fontSize, annotationsVisible = true) {
  const titleSize = fontSize * 1.8
  const artistSize = fontSize * 0.9
  const annotSize = fontSize * 0.75
  const titleLineH = titleSize * 1.3
  const artistLineH = artistSize * 1.3
  const annotLineH = annotSize * 1.3
  let y = MARGIN_TOP

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(titleSize)
  doc.setTextColor(35, 18, 6)
  const titleLines = doc.splitTextToSize(song.meta.title ?? 'Untitled', MAX_W)
  doc.text(titleLines, PAGE_W / 2, y, { align: 'center' })
  y += titleLines.length * titleLineH

  if (song.meta.artist) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(artistSize)
    doc.setTextColor(90, 62, 42)
    doc.text(song.meta.artist, PAGE_W / 2, y, { align: 'center' })
    doc.setTextColor(35, 18, 6)
    y += artistLineH + 4
  }

  if (annotationsVisible && song.meta.annotation) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(annotSize)
    doc.setTextColor(140, 110, 90)
    const annotLines = doc.splitTextToSize(song.meta.annotation, MAX_W)
    doc.text(annotLines, PAGE_W / 2, y, { align: 'center' })
    doc.setTextColor(35, 18, 6)
    doc.setFont('helvetica', 'normal')
    y += annotLines.length * annotLineH + 2
  }

  y += 20
  return y
}

/**
 * Render a list of sections in one column.
 * cx   — horizontal centre of the column
 * maxW — wrap width for splitTextToSize
 */
function renderSections(doc, sections, fontSize, cx, maxW, startY, annotationsVisible = true) {
  const labelSize = fontSize * 0.65
  const annotSize = fontSize * 0.6
  const lineH = fontSize * 1.4
  const labelLineH = labelSize * 1.4
  const annotLineH = annotSize * 1.3
  let y = startY

  for (const section of sections) {
    if (!(section.lines ?? []).some(l => l.type === 'lyric')) continue

    if (section.label) {
      y += 6
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(labelSize)
      doc.setTextColor(115, 22, 22)
      doc.text(section.label.toUpperCase(), cx, y, { align: 'center' })
      doc.setTextColor(35, 18, 6)
      y += labelLineH + 4

      if (annotationsVisible && section.annotation) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(annotSize)
        doc.setTextColor(140, 110, 90)
        doc.text('— ' + section.annotation, cx, y, { align: 'center' })
        doc.setTextColor(35, 18, 6)
        doc.setFont('helvetica', 'normal')
        y += annotLineH + 2
      }
    }

    for (const line of section.lines ?? []) {
      if (line.type === 'chord') continue
      if (line.type === 'blank') { y += lineH * 0.5; continue }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(fontSize)
      const wrapped = doc.splitTextToSize(line.content ?? '', maxW)
      doc.text(wrapped, cx, y, { align: 'center' })
      y += wrapped.length * lineH

      if (annotationsVisible && line.annotation) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(annotSize)
        doc.setTextColor(140, 110, 90)
        doc.text('— ' + line.annotation, cx, y, { align: 'center' })
        doc.setTextColor(35, 18, 6)
        doc.setFont('helvetica', 'normal')
        y += annotLineH + 2
      }
    }

    y += lineH * 0.4
  }

  return y
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export an array of songs as a 16:9 landscape presentation PDF.
 *
 * Layout per page:
 *   - Title + artist centred at full-page width
 *   - Sections in single column (centred) when they fit
 *   - Sections in two columns when single-column overflows
 *   - Sections in three columns when two-column overflows (requires maxCols=3)
 *
 * Font modes:
 *   Default — globalFont = min over all songs of findBestFont(song, desiredFont).
 *             Every song renders at the same font → zero variation across pages.
 *   optimizedFont — each song independently maximises its font size starting from
 *             MAX_FONT=32, so longer songs shrink while shorter songs stay large.
 *             desiredFont and maxCols are ignored; columns are chosen automatically.
 *
 * @param {Array<{ meta: { title: string, artist: string|null }, sections: Section[] }>} songs
 * @param {HTMLImageElement} bgImage  Pre-loaded image element drawn full-bleed behind each page
 * @param {{ desiredFont?: number, maxCols?: number, annotationsVisible?: boolean, optimizedFont?: boolean }} [options]
 *   desiredFont    — target font size (8–32); ignored when optimizedFont is true. Default 20.
 *   maxCols        — maximum columns per page (1, 2, or 3); ignored when optimizedFont is true. Default 2.
 *   optimizedFont  — when true, each song uses the largest font that fits on one page. Default false.
 */
export function exportPresentationPdf(songs, bgImage, { desiredFont = 20, maxCols = 2, annotationsVisible = true, optimizedFont = false } = {}) {
  if (!songs.length) return

  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], orientation: 'landscape' })

  // Determine per-song fonts.
  // Optimized mode: each song maximises independently from MAX_FONT, columns auto.
  //   Prefer single-column when the font reduction required to stay in one column is
  //   small (≤ PREFER_SINGLE_COL_DELTA pt). Only use two columns for genuinely long
  //   songs where two-col gives a meaningfully larger font.
  // Default mode: single global font = min over all songs, honouring desiredFont + maxCols.
  const PREFER_SINGLE_COL_DELTA = 4

  const songFonts = optimizedFont
    ? songs.map(song => {
        // Find the largest font allowing up to 3 columns, then prefer fewer columns
        // when the font sacrifice is small (≤ PREFER_SINGLE_COL_DELTA pt).
        const { font: maxFont, cols: maxCols3 } = findBestFontConstrained(doc, song, MAX_FONT, 3, annotationsVisible)

        if (maxCols3 === 1) return maxFont  // already single-col — no trade-off

        if (maxCols3 === 3) {
          // Try 2-col: prefer over 3-col when font loss is small
          const { font: twoFont, cols: twoCols } = findBestFontConstrained(doc, song, MAX_FONT, 2, annotationsVisible)
          if (twoFont >= maxFont - PREFER_SINGLE_COL_DELTA) {
            if (twoCols === 1) return twoFont  // 2-col search returned single-col
            const { font: oneFont } = findBestFontConstrained(doc, song, MAX_FONT, 1, annotationsVisible)
            return oneFont >= twoFont - PREFER_SINGLE_COL_DELTA ? oneFont : twoFont
          }
          return maxFont  // 3-col wins
        }

        // maxCols3 === 2: check if 1-col is close enough
        const { font: oneFont } = findBestFontConstrained(doc, song, MAX_FONT, 1, annotationsVisible)
        return oneFont >= maxFont - PREFER_SINGLE_COL_DELTA ? oneFont : maxFont
      })
    : (() => {
        const globalFont = songs.reduce((min, song) => {
          const { font } = findBestFontConstrained(doc, song, desiredFont, maxCols, annotationsVisible)
          return Math.min(min, font)
        }, desiredFont)
        return songs.map(() => globalFont)
      })()

  const effectiveMaxCols = optimizedFont ? 3 : maxCols

  // In optimized mode use the smallest body font as the common title base so that
  // all slides share the same title size regardless of lyric length.
  const titleBase = optimizedFont ? Math.min(...songFonts) : null

  songs.forEach((song, i) => {
    if (i > 0) doc.addPage()

    doc.addImage(bgImage, 'PNG', 0, 0, PAGE_W, PAGE_H)

    const sections = song.sections ?? []
    const songFont = songFonts[i]
    const headerFont = titleBase ?? songFont
    const startY = renderHeader(doc, song, headerFont, annotationsVisible)

    const totalH = measureSections(doc, sections, songFont, MAX_W, annotationsVisible)
    if (effectiveMaxCols >= 2 && totalH > TWO_COL_THRESHOLD) {
      const contentH = USABLE_H - (startY - MARGIN_TOP)
      const { left, right } = splitSections(doc, sections, songFont, contentH)
      const twoColFits = (
        measureSections(doc, left,  songFont, COL_W, annotationsVisible) <= contentH &&
        measureSections(doc, right, songFont, COL_W, annotationsVisible) <= contentH
      )
      if (twoColFits) {
        renderSections(doc, left,  songFont, COL1_CX, COL_W, startY, annotationsVisible)
        renderSections(doc, right, songFont, COL2_CX, COL_W, startY, annotationsVisible)
      } else if (effectiveMaxCols >= 3) {
        // Three-column layout
        const { left: l3, middle, right: r3 } = splitSections3(doc, sections, songFont, contentH)
        renderSections(doc, l3,     songFont, COL1_3CX, COL3_W, startY, annotationsVisible)
        renderSections(doc, middle, songFont, COL2_3CX, COL3_W, startY, annotationsVisible)
        renderSections(doc, r3,     songFont, COL3_3CX, COL3_W, startY, annotationsVisible)
      } else {
        // maxCols=2 fallback — font may overflow at MIN_FONT; best effort
        renderSections(doc, left,  songFont, COL1_CX, COL_W, startY, annotationsVisible)
        renderSections(doc, right, songFont, COL2_CX, COL_W, startY, annotationsVisible)
      }
    } else {
      // Single-column layout
      renderSections(doc, sections, songFont, PAGE_W / 2, MAX_W, startY, annotationsVisible)
    }
  })

  const date = new Date().toISOString().slice(0, 10)
  doc.save(`Presentation ${date}.pdf`)
}
