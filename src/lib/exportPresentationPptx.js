import PptxGenJS from 'pptxgenjs'

// ── Helpers ──────────────────────────────────────────────────────────────────

function imageToDataUrl(img) {
  const canvas = document.createElement('canvas')
  canvas.width  = img.naturalWidth  || img.width  || 960
  canvas.height = img.naturalHeight || img.height || 540
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL('image/png')
}

function createSlide(pres, bgDataUrl) {
  const slide = pres.addSlide()
  if (bgDataUrl) slide.background = { data: bgDataUrl, type: 'png' }
  return slide
}

function buildSectionText(section, { fontSize, showChords, annotationsVisible }) {
  const runs = []
  for (const line of section.lines ?? []) {
    if (line.type === 'chord') {
      if (!showChords) continue
      runs.push({ text: (line.content ?? '') + '\n', options: { fontSize: fontSize * 0.7, color: '888888' } })
    } else if (line.type === 'blank') {
      runs.push({ text: '\n', options: { fontSize: fontSize * 0.5 } })
    } else if (line.type === 'lyric') {
      runs.push({ text: (line.content ?? '') + '\n', options: { fontSize, color: '231206' } })
      if (annotationsVisible && line.annotation) {
        runs.push({
          text: '— ' + line.annotation + '\n',
          options: { fontSize: fontSize * 0.75, color: '8C6E5A', italic: true },
        })
      }
    }
  }
  return runs
}

function buildSongText(song, contentOpts) {
  const runs = []
  for (const section of song.sections ?? []) {
    if (!(section.lines ?? []).some(l => l.type === 'lyric')) continue
    if (section.label) {
      runs.push({
        text: section.label.toUpperCase() + '\n',
        options: { fontSize: contentOpts.fontSize * 0.65, bold: true, color: '731616' },
      })
    }
    runs.push(...buildSectionText(section, contentOpts))
    runs.push({ text: '\n', options: { fontSize: contentOpts.fontSize * 0.4 } })
  }
  return runs
}

function addLyricsToSlide(slide, textRuns, fontSize, titlePosition) {
  if (!textRuns.length) return
  const isTop = titlePosition === 'top'
  slide.addText(textRuns, {
    x: 0.5, y: isTop ? 1.45 : 0.25,
    w: 9,   h: isTop ? 3.8  : 4.8,
    align: 'center', valign: 'middle',
    fontSize, shrinkText: true, wrap: true,
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function exportPresentationPptx(
  songs,
  bgImage,
  {
    slideMode          = 'section',
    fontSize           = 24,
    titlePosition      = 'top',
    showChords         = false,
    annotationsVisible = true,
  } = {},
  PptxClass = PptxGenJS
) {
  if (!songs.length) return

  const pres       = new PptxClass()
  pres.layout      = 'LAYOUT_WIDE'
  const bgDataUrl  = bgImage ? imageToDataUrl(bgImage) : null
  const contentOpts = { fontSize, showChords, annotationsVisible }

  for (const song of songs) {
    if (slideMode === 'section') {
      const lyricSections = (song.sections ?? []).filter(
        s => (s.lines ?? []).some(l => l.type === 'lyric')
      )
      const toRender = lyricSections.length ? lyricSections : [{ label: null, lines: [] }]
      for (const section of toRender) {
        const slide = createSlide(pres, bgDataUrl)
        const runs  = buildSectionText(section, contentOpts)
        addLyricsToSlide(slide, runs, fontSize, titlePosition)
      }
    } else {
      const slide = createSlide(pres, bgDataUrl)
      const runs  = buildSongText(song, contentOpts)
      addLyricsToSlide(slide, runs, fontSize, titlePosition)
    }
  }

  const date = new Date().toISOString().slice(0, 10)
  await pres.writeFile({ fileName: `Presentation ${date}.pptx` })
}
