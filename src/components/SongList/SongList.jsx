import { useTranspose } from '../../hooks/useTranspose'
import { SongHeader } from './SongHeader'
import { SongBody } from './SongBody'
import { ChordStrip } from '../Chords/ChordStrip'

const MIN_FONT = 12
const MAX_FONT = 28

export function SongList({ song, onPerformanceMode, lyricsOnly = false, fontSize = 16, onFontSizeChange, chordsOpen, onChordsToggle }) {
  const transpose = useTranspose(song.sections, song.meta.usesFlats, song.id)

  const fontSizeControl = {
    size: fontSize,
    up:   () => onFontSizeChange(Math.min(fontSize + 2, MAX_FONT)),
    down: () => onFontSizeChange(Math.max(fontSize - 2, MIN_FONT)),
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 w-full">
      <SongHeader
        meta={song.meta}
        transpose={transpose}
        lyricsOnly={lyricsOnly}
        fontSizeControl={fontSizeControl}
        onPerformanceMode={() => onPerformanceMode(transpose.transposedSections)}
      />
      <ChordStrip
        sections={transpose.transposedSections}
        open={chordsOpen}
        onToggle={onChordsToggle}
      />
      <SongBody sections={transpose.transposedSections} fontSize={fontSize} lyricsOnly={lyricsOnly} />
    </div>
  )
}
