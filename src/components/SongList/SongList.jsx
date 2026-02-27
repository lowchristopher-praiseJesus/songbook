import { useTranspose } from '../../hooks/useTranspose'
import { SongHeader } from './SongHeader'
import { SongBody } from './SongBody'
import { ChordStrip } from '../Chords/ChordStrip'


export function SongList({ song, onPerformanceMode, lyricsOnly = false, fontSize = 16, onFontSizeChange, chordsOpen, onChordsToggle }) {
  const transpose = useTranspose(song.sections, song.meta.usesFlats, song.id)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 w-full">
      <SongHeader
        meta={song.meta}
        transpose={transpose}
        lyricsOnly={lyricsOnly}
        onPerformanceMode={() => onPerformanceMode(transpose.transposedSections)}
      />
      {!lyricsOnly && (
        <ChordStrip
          sections={transpose.transposedSections}
          open={chordsOpen}
          onToggle={onChordsToggle}
        />
      )}
      <SongBody sections={transpose.transposedSections} fontSize={fontSize} lyricsOnly={lyricsOnly} />
    </div>
  )
}
