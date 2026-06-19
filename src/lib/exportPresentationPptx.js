import PptxGenJS from 'pptxgenjs'

export async function exportPresentationPptx(
  songs,
  bgImage,
  {
    slideMode        = 'section',
    fontSize         = 24,
    titlePosition    = 'top',
    showChords       = false,
    annotationsVisible = true,
  } = {},
  PptxClass = PptxGenJS
) {
  if (!songs.length) return

  const pres = new PptxClass()
  pres.layout = 'LAYOUT_WIDE'

  const date = new Date().toISOString().slice(0, 10)
  await pres.writeFile({ fileName: `Presentation ${date}.pptx` })
}
