import { useTranspose } from '../../hooks/useTranspose'
import { SongHeader } from './SongHeader'
import { SongBody } from './SongBody'
import { ChordStrip } from '../Chords/ChordStrip'
import { exportLyricsPdf } from '../../lib/exportPdf'


export function SongList({ song, onPerformanceMode, lyricsOnly = false, fontSize = 16, onFontSizeChange, chordsOpen, onChordsToggle, onEdit }) {
  const transpose = useTranspose(song.sections, song.meta.usesFlats, song.id)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 w-full">
      <SongHeader
        meta={song.meta}
        transpose={transpose}
        lyricsOnly={lyricsOnly}
        onPerformanceMode={() => onPerformanceMode(transpose.transposedSections)}
        onExportPdf={() => exportLyricsPdf(song.meta, song.sections)}
        onEdit={onEdit}
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
