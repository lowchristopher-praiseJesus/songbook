import jsPDF from 'jspdf'

const PAGE_W = 960
const PAGE_H = 540
const MARGIN_X = 60
const MARGIN_TOP = 50
const MARGIN_BOTTOM = 40
const MAX_W = PAGE_W - MARGIN_X * 2          // 840 pt
const USABLE_H = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM  // 450 pt
const MAX_FONT = 32
const MIN_FONT = 8

function measureSong(doc, song, fontSize) {
  const titleSize = fontSize * 1.8
  const artistSize = fontSize * 0.9
  const labelSize = fontSize * 0.65
  const lineH = fontSize * 1.4
  const titleLineH = titleSize * 1.3
  const artistLineH = artistSize * 1.3
  const labelLineH = labelSize * 1.4

  let h = 0

  // Title
  doc.setFontSize(titleSize)
  h += doc.splitTextToSize(song.meta.title ?? 'Untitled', MAX_W).length * titleLineH

  // Artist
  if (song.meta.artist) {
    h += artistLineH + 4
  }

  // Header gap
  h += 20

  for (const section of song.sections ?? []) {
    const hasLyrics = (section.lines ?? []).some(l => l.type === 'lyric')
    if (!hasLyrics) continue

    if (section.label) {
      h += 6 + labelLineH + 4
    }

    for (const line of section.lines ?? []) {
      if (line.type === 'chord') continue
      if (line.type === 'blank') { h += lineH * 0.5; continue }
      doc.setFontSize(fontSize)
      h += doc.splitTextToSize(line.content ?? '', MAX_W).length * lineH
    }

    h += lineH * 0.4
  }

  return h
}

function renderSong(doc, song, fontSize) {
  const titleSize = fontSize * 1.8
  const artistSize = fontSize * 0.9
  const labelSize = fontSize * 0.65
  const lineH = fontSize * 1.4
  const titleLineH = titleSize * 1.3
  const artistLineH = artistSize * 1.3
  const labelLineH = labelSize * 1.4

  let y = MARGIN_TOP

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(titleSize)
  doc.setTextColor(0, 0, 0)
  const titleLines = doc.splitTextToSize(song.meta.title ?? 'Untitled', MAX_W)
  doc.text(titleLines, MARGIN_X, y)
  y += titleLines.length * titleLineH

  // Artist
  if (song.meta.artist) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(artistSize)
    doc.setTextColor(100, 100, 100)
    doc.text(song.meta.artist, MARGIN_X, y)
    doc.setTextColor(0, 0, 0)
    y += artistLineH + 4
  }

  y += 20

  // Sections
  for (const section of song.sections ?? []) {
    const hasLyrics = (section.lines ?? []).some(l => l.type === 'lyric')
    if (!hasLyrics) continue

    if (section.label) {
      y += 6
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(labelSize)
      doc.setTextColor(80, 80, 180)
      doc.text(section.label.toUpperCase(), MARGIN_X, y)
      doc.setTextColor(0, 0, 0)
      y += labelLineH + 4
    }

    for (const line of section.lines ?? []) {
      if (line.type === 'chord') continue
      if (line.type === 'blank') { y += lineH * 0.5; continue }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(fontSize)
      const wrapped = doc.splitTextToSize(line.content ?? '', MAX_W)
      doc.text(wrapped, MARGIN_X, y)
      y += wrapped.length * lineH
    }

    y += lineH * 0.4
  }
}

export function exportPresentationPdf(songs) {
  if (!songs.length) return

  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], orientation: 'landscape' })

  songs.forEach((song, i) => {
    if (i > 0) doc.addPage()

    let fontSize = MAX_FONT
    while (fontSize > MIN_FONT) {
      if (measureSong(doc, song, fontSize) <= USABLE_H) break
      fontSize -= 1
    }

    renderSong(doc, song, fontSize)
  })

  const date = new Date().toISOString().slice(0, 10)
  doc.save(`Presentation ${date}.pdf`)
}
