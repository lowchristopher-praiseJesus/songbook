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
const COL_W = (MAX_W - COL_GAP) / 2           // 400 pt per column
const COL1_CX = MARGIN_X + COL_W / 2          // 260 pt (left column centre)
const COL2_CX = MARGIN_X + COL_W + COL_GAP + COL_W / 2  // 700 pt (right column centre)
const TWO_COL_THRESHOLD = PAGE_H * 0.75        // 405 pt — use two columns when lyric content exceeds this

// ---------------------------------------------------------------------------
// Measurement helpers
// ---------------------------------------------------------------------------

/** Height used by the title + artist header (including the 20 pt gap below). */
function measureHeader(doc, song, fontSize) {
  const titleSize = fontSize * 1.8
  const artistSize = fontSize * 0.9
  const titleLineH = titleSize * 1.3
  const artistLineH = artistSize * 1.3
  let h = 0
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(titleSize)
  h += doc.splitTextToSize(song.meta.title ?? 'Untitled', MAX_W).length * titleLineH
  if (song.meta.artist) h += artistLineH + 4
  h += 20
  return h
}

/**
 * Height of a list of sections (chord lines skipped).
 * maxW controls line-wrap width — use MAX_W for single-col, COL_W for two-col.
 */
function measureSections(doc, sections, fontSize, maxW = MAX_W) {
  const labelSize = fontSize * 0.65
  const lineH = fontSize * 1.4
  const labelLineH = labelSize * 1.4
  let h = 0
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(fontSize)
  for (const section of sections) {
    if (!(section.lines ?? []).some(l => l.type === 'lyric')) continue
    if (section.label) h += 6 + labelLineH + 4
    for (const line of section.lines ?? []) {
      if (line.type === 'chord') continue
      if (line.type === 'blank') { h += lineH * 0.5; continue }
      h += doc.splitTextToSize(line.content ?? '', maxW).length * lineH
    }
    h += lineH * 0.4
  }
  return h
}

/**
 * Split sections into left and right halves for two-column layout.
 * Finds the section boundary closest to the midpoint of total column content height.
 */
function splitSections(doc, sections, fontSize) {
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

  const totalH = measureSections(doc, filtered, fontSize, COL_W)
  const half = totalH / 2
  let accumulated = 0

  for (let i = 0; i < filtered.length - 1; i++) {
    accumulated += measureSections(doc, [filtered[i]], fontSize, COL_W)
    if (accumulated >= half) {
      return { left: filtered.slice(0, i + 1), right: filtered.slice(i + 1) }
    }
  }
  // fallback: put all but last section in left column
  return { left: filtered.slice(0, -1), right: filtered.slice(-1) }
}

/**
 * Find the largest font at which the song fits in single-column or two-column layout.
 * Returns { font: number }.
 */
function findBestFont(doc, song) {
  for (let fs = MAX_FONT; fs >= MIN_FONT; fs--) {
    const sections = song.sections ?? []
    if (measureSections(doc, sections, fs) <= TWO_COL_THRESHOLD) return { font: fs }
    const contentH = USABLE_H - measureHeader(doc, song, fs)
    const { left, right } = splitSections(doc, sections, fs)
    if (
      measureSections(doc, left, fs, COL_W) <= contentH &&
      measureSections(doc, right, fs, COL_W) <= contentH
    ) return { font: fs }
  }
  return { font: MIN_FONT }
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/**
 * Render the title + artist header, centred across the full page width.
 * Returns the y position after the header (where content starts).
 */
function renderHeader(doc, song, fontSize) {
  const titleSize = fontSize * 1.8
  const artistSize = fontSize * 0.9
  const titleLineH = titleSize * 1.3
  const artistLineH = artistSize * 1.3
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

  y += 20
  return y
}

/**
 * Render a list of sections in one column.
 * cx   — horizontal centre of the column
 * maxW — wrap width for splitTextToSize
 */
function renderSections(doc, sections, fontSize, cx, maxW, startY) {
  const labelSize = fontSize * 0.65
  const lineH = fontSize * 1.4
  const labelLineH = labelSize * 1.4
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
    }

    for (const line of section.lines ?? []) {
      if (line.type === 'chord') continue
      if (line.type === 'blank') { y += lineH * 0.5; continue }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(fontSize)
      const wrapped = doc.splitTextToSize(line.content ?? '', maxW)
      doc.text(wrapped, cx, y, { align: 'center' })
      y += wrapped.length * lineH
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
 *   - Sections in two columns (each centred in its column) when single-column overflows
 *
 * Font consistency:
 *   globalFont = min over all songs of findBestFont(song).
 *   Every song renders at globalFont → font variation across pages = 0.
 *
 * @param {Array<{ meta: { title: string, artist: string|null }, sections: Section[] }>} songs
 * @param {Object} bgImage - Background image object (e.g., from Canvas.toDataURL())
 */
export function exportPresentationPdf(songs, bgImage) {
  if (!songs.length) return

  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], orientation: 'landscape' })

  // Pass 1: find the largest font at which every song fits (1 or 2 cols)
  const globalFont = songs.reduce((min, song) => {
    const { font } = findBestFont(doc, song)
    return Math.min(min, font)
  }, MAX_FONT)

  // Pass 2: render each song at globalFont
  songs.forEach((song, i) => {
    if (i > 0) doc.addPage()

    doc.addImage(bgImage, 'PNG', 0, 0, PAGE_W, PAGE_H)

    const sections = song.sections ?? []
    const startY = renderHeader(doc, song, globalFont)

    if (measureSections(doc, sections, globalFont) > TWO_COL_THRESHOLD) {
      // Two-column layout
      const { left, right } = splitSections(doc, sections, globalFont)
      renderSections(doc, left, globalFont, COL1_CX, COL_W, startY)
      renderSections(doc, right, globalFont, COL2_CX, COL_W, startY)
    } else {
      // Single-column layout
      renderSections(doc, sections, globalFont, PAGE_W / 2, MAX_W, startY)
    }
  })

  const date = new Date().toISOString().slice(0, 10)
  doc.save(`Presentation ${date}.pdf`)
}
