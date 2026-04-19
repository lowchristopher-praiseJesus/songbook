import { useRef } from 'react'
import { useTranspose } from '../../hooks/useTranspose'
import { useFitToScreen } from '../../hooks/useFitToScreen'
import { SongHeader } from './SongHeader'
import { SongBody } from './SongBody'
import { ChordStrip } from '../Chords/ChordStrip'
import { exportLyricsPdf } from '../../lib/exportPdf'
import { useLocalStorage } from '../../hooks/useLocalStorage'

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
  const bodyRef = useRef(null)
  const [annotationsVisible, setAnnotationsVisible] = useLocalStorage('songsheet_annotations_visible', true)
  const { fitFontSize, fitColumns, shadowRef } = useFitToScreen({
    enabled: isFit,
    containerRef,
    bodyRef,
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
        onExportPdf={() => exportLyricsPdf(song.meta, song.sections, annotationsVisible)}
        onEdit={onEdit}
        annotationsVisible={annotationsVisible}
        onAnnotationsToggle={() => setAnnotationsVisible(!annotationsVisible)}
      />
      {!lyricsOnly && (
        <ChordStrip
          sections={transpose.transposedSections}
          open={chordsOpen}
          onToggle={onChordsToggle}
        />
      )}
      <div ref={bodyRef}>
        <SongBody
          sections={transpose.transposedSections}
          fontSize={fontSize}
          lyricsOnly={lyricsOnly}
          fitMode={isFit && fitFontSize !== null}
          fitColumns={fitColumns}
          annotationsVisible={annotationsVisible}
        />
      </div>
      {isFit && (
        <div
          ref={shadowRef}
          style={{
            position: 'absolute',
            top: '-9999px',
            left: '1rem',
            visibility: 'hidden',
            width: 'calc(100% - 2rem)',
            overflow: 'hidden',
          }}
        >
          <SongBody
            sections={transpose.transposedSections}
            fontSize={fontSize}
            lyricsOnly={lyricsOnly}
            fitMode
            annotationsVisible={annotationsVisible}
          />
        </div>
      )}
    </div>
  )
}
