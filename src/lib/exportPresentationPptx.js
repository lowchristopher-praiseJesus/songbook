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

const MASTER_NAME = 'BG'

function setupMaster(pres, bgDataUrl) {
  pres.defineSlideMaster({
    title: MASTER_NAME,
    background: bgDataUrl ? { data: bgDataUrl } : { color: '000000' },
  })
}

function createSlide(pres) {
  return pres.addSlide({ masterName: MASTER_NAME })
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
    align: 'center', valign: 'top',
    fontSize, autoFit: true, wrap: true,
  })
}

function addTitleToSlide(slide, song, fontSize, titlePosition) {
  const title = song.meta.title ?? 'Untitled'
  if (titlePosition === 'top') {
    slide.addText(title, {
      x: 0.5, y: 0.25, w: 9, h: 0.7,
      fontSize: fontSize * 1.5, bold: true, align: 'center', color: '231206', wrap: true,
    })
    if (song.meta.artist) {
      slide.addText(song.meta.artist, {
        x: 0.5, y: 0.95, w: 9, h: 0.4,
        fontSize: fontSize * 0.85, align: 'center', color: '5A3E2A', wrap: true,
      })
    }
  } else {
    const isRight = titlePosition === 'bottom-right'
    slide.addText(title, {
      x: isRight ? 5.5 : 0.5, y: 5.3, w: 4, h: 0.3,
      fontSize: fontSize * 0.55,
      align: isRight ? 'right' : 'left',
      color: '231206',
    })
  }
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
  pres.layout      = 'LAYOUT_16x9'
  const bgDataUrl  = bgImage ? imageToDataUrl(bgImage) : null
  setupMaster(pres, bgDataUrl)
  const contentOpts = { fontSize, showChords, annotationsVisible }

  for (const song of songs) {
    if (slideMode === 'section') {
      const lyricSections = (song.sections ?? []).filter(
        s => (s.lines ?? []).some(l => l.type === 'lyric')
      )
      const toRender = lyricSections.length ? lyricSections : [{ label: null, lines: [] }]
      for (const section of toRender) {
        const slide = createSlide(pres)
        addTitleToSlide(slide, song, fontSize, titlePosition)
        const runs  = buildSectionText(section, contentOpts)
        addLyricsToSlide(slide, runs, fontSize, titlePosition)
      }
    } else {
      const slide = createSlide(pres)
      addTitleToSlide(slide, song, fontSize, titlePosition)
      const runs  = buildSongText(song, contentOpts)
      addLyricsToSlide(slide, runs, fontSize, titlePosition)
    }
  }

  const date = new Date().toISOString().slice(0, 10)
  await pres.writeFile({ fileName: `Presentation ${date}.pptx` })
}
