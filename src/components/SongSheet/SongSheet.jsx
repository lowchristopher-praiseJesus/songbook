import { useTranspose } from '../../hooks/useTranspose'
import { SongHeader } from './SongHeader'
import { SongBody } from './SongBody'

export function SongSheet({ song, onPerformanceMode, fontSize = 16 }) {
  const transpose = useTranspose(song.sections, song.meta.usesFlats)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 w-full">
      <SongHeader
        meta={song.meta}
        transpose={transpose}
        onPerformanceMode={onPerformanceMode}
      />
      <SongBody sections={transpose.transposedSections} fontSize={fontSize} />
    </div>
  )
}
