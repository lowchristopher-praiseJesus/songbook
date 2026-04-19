import jsPDF from 'jspdf'

export function exportLyricsPdf(meta, sections, annotationsVisible = true) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 50
  const maxW = pageW - margin * 2

  let y = 60

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  const titleLines = doc.splitTextToSize(meta.title ?? 'Untitled', maxW)
  doc.text(titleLines, margin, y)
  y += titleLines.length * 26

  // Artist
  if (meta.artist) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(13)
    doc.setTextColor(100, 100, 100)
    doc.text(meta.artist, margin, y)
    doc.setTextColor(0, 0, 0)
    y += 18
  }

  // Song-level annotation
  if (annotationsVisible && meta.annotation) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(11)
    doc.setTextColor(140, 140, 140)
    const annotLines = doc.splitTextToSize(meta.annotation, maxW)
    doc.text(annotLines, margin, y)
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'normal')
    y += annotLines.length * 14
  }

  y += 14

  for (const section of sections ?? []) {
    if (section.label) {
      if (y > 90) y += 6
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(80, 80, 180)
      doc.text(section.label.toUpperCase(), margin, y)
      doc.setTextColor(0, 0, 0)
      y += 14

      // Section-level annotation
      if (annotationsVisible && section.annotation) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(9)
        doc.setTextColor(140, 140, 140)
        doc.text('— ' + section.annotation, margin + 4, y)
        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'normal')
        y += 12
      }
    }

    for (const line of section.lines ?? []) {
      if (line.type === 'chord') continue

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

      // Line-level annotation
      if (annotationsVisible && line.annotation) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(9)
        doc.setTextColor(140, 140, 140)
        doc.text('— ' + line.annotation, margin + 4, y)
        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'normal')
        y += 12
      }
    }

    y += 6
  }

  const safeName = (meta.title ?? 'song').replace(/[^a-z0-9]/gi, '_')
  doc.save(`${safeName}.pdf`)
}
