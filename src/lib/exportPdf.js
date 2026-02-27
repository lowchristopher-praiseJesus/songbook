import jsPDF from 'jspdf'

/**
 * Export lyrics-only PDF for a song.
 * Skips chord-only lines; renders section labels, lyric lines, and blank gaps.
 *
 * @param {{ title: string, artist: string }} meta
 * @param {Array} sections  — parsed/transposed sections array
 */
export function exportLyricsPdf(meta, sections) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 50
  const maxW = pageW - margin * 2

  let y = 60

  // ── Title ──────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  const titleLines = doc.splitTextToSize(meta.title ?? 'Untitled', maxW)
  doc.text(titleLines, margin, y)
  y += titleLines.length * 26

  // ── Artist ─────────────────────────────────────────────
  if (meta.artist) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(13)
    doc.setTextColor(100, 100, 100)
    doc.text(meta.artist, margin, y)
    doc.setTextColor(0, 0, 0)
    y += 18
  }

  // ── Divider gap ────────────────────────────────────────
  y += 14

  // ── Sections ───────────────────────────────────────────
  for (const section of sections ?? []) {
    // Section label
    if (section.label) {
      // Add a little breathing room before each labeled section
      if (y > 90) y += 6
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(80, 80, 180)
      doc.text(section.label.toUpperCase(), margin, y)
      doc.setTextColor(0, 0, 0)
      y += 14
    }

    for (const line of section.lines ?? []) {
      // Skip pure-chord lines
      if (line.type === 'chord') continue

      // Blank lines → small vertical gap
      if (line.type === 'blank') {
        y += 8
        continue
      }

      // Lyric line
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(12)
      const wrapped = doc.splitTextToSize(line.content ?? '', maxW)
      wrapped.forEach(textLine => {
        if (y > pageH - margin) {
          doc.addPage()
          y = margin + 10
        }
        doc.text(textLine, margin, y)
        y += 16
      })
    }

    // Gap between sections
    y += 6
  }

  const safeName = (meta.title ?? 'song').replace(/[^a-z0-9]/gi, '_')
  doc.save(`${safeName}.pdf`)
}
