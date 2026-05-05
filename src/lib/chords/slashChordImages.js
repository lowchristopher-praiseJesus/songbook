const SLASH_CHORD_IMAGES = {
  'C/G':  '/slash-chords/C_G.png',
  'C/E':  '/slash-chords/C_E.png',
  'G/B':  '/slash-chords/G_B.png',
  'D/F#': '/slash-chords/D_Fs.png',
  'A/C#': '/slash-chords/A_Cs.png',
  'E/G#': '/slash-chords/E_Gs.png',
  'Gm/F': '/slash-chords/Gm_F.png',
  'C/B':  '/slash-chords/C_B.png',
  'F/G':  '/slash-chords/F_G.png',
  'E/F#': '/slash-chords/E_Fs.png',
  'B/D#': '/slash-chords/B_Ds.png',
}

export function slashChordImage(chord) {
  return SLASH_CHORD_IMAGES[chord] ?? null
}
