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

  const pres = new PptxClass()
  pres.layout = 'LAYOUT_WIDE'

  const bgDataUrl   = bgImage ? imageToDataUrl(bgImage) : null

  for (const song of songs) {
    createSlide(pres, bgDataUrl)
  }

  const date = new Date().toISOString().slice(0, 10)
  await pres.writeFile({ fileName: `Presentation ${date}.pptx` })
}
