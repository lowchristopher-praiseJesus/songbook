import { useRef } from 'react'
import { useTranspose } from '../../hooks/useTranspose'
import { useFitToScreen } from '../../hooks/useFitToScreen'
import { SongHeader } from './SongHeader'
import { SongBody } from './SongBody'
import { ChordStrip } from '../Chords/ChordStrip'
import { exportLyricsPdf } from '../../lib/exportPdf'

export function SongList({
  song,
  onPerformanceMode,
  lyricsOnly = false,
  fontSize = 16,
  onFontSizeChange,
  chordsOpen,
  onChordsToggle,
  onEdit,
  isFit = false,
  containerRef,
}) {
  const transpose = useTranspose(song.sections, song.meta.usesFlats, song.id)
  const headerRef = useRef(null)
  const { fitFontSize, fitColumns, shadowRef } = useFitToScreen({
    enabled: isFit,
    containerRef,
    headerRef,
    lyricsOnly,
  })

  return (
    <div
      className="max-w-2xl mx-auto px-4 py-6 w-full relative"
      style={isFit && fitFontSize ? { '--fit-fs': `${fitFontSize}px` } : undefined}
    >
      <SongHeader
        meta={song.meta}
        transpose={transpose}
        lyricsOnly={lyricsOnly}
        onPerformanceMode={() => onPerformanceMode(transpose.transposedSections)}
        onExportPdf={() => exportLyricsPdf(song.meta, song.sections)}
        onEdit={onEdit}
        headerRef={headerRef}
      />
      {!lyricsOnly && (
        <ChordStrip
          sections={transpose.transposedSections}
          open={chordsOpen}
          onToggle={onChordsToggle}
        />
      )}
      <SongBody
        sections={transpose.transposedSections}
        fontSize={fontSize}
        lyricsOnly={lyricsOnly}
        fitMode={isFit && fitFontSize !== null}
        fitColumns={fitColumns}
      />
      {isFit && (
        <div
          ref={shadowRef}
          style={{
            position: 'absolute',
            top: '-9999px',
            left: 0,
            visibility: 'hidden',
            width: '100%',
            overflow: 'hidden',
          }}
        >
          <SongBody
            sections={transpose.transposedSections}
            fontSize={fontSize}
            lyricsOnly={lyricsOnly}
            fitMode
          />
        </div>
      )}
    </div>
  )
}
