import { useRef, useEffect } from 'react'
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
  hideChordDiagram = false,
  fontSize = 16,
  onFontSizeChange,
  chordsOpen,
  onChordsToggle,
  onEdit,
  isFit = false,
  containerRef,
  sectionRefs,
  headerRef,
}) {
  const transpose = useTranspose(song.sections, song.meta.usesFlats, song.id, song.meta.capo ?? 0)

  useEffect(() => {
    document.documentElement.style.setProperty('--lyrics-size', `${fontSize}px`)
  }, [fontSize])
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
      className={`w-full relative px-4 py-6 ${isFit ? '' : 'max-w-2xl mx-auto'}`}
      style={isFit && fitFontSize ? { '--fit-fs': `${fitFontSize}px` } : undefined}
    >
      <div ref={headerRef}>
        {!isFit && (
          <>
            <SongHeader
              meta={song.meta}
              transpose={transpose}
              lyricsOnly={lyricsOnly}
              onPerformanceMode={() => onPerformanceMode(transpose.transposedSections)}
              onExportPdf={() => exportLyricsPdf(song.meta, song.sections, annotationsVisible)}
              onEdit={onEdit}
              annotationsVisible={annotationsVisible}
              onAnnotationsToggle={() => setAnnotationsVisible(!annotationsVisible)}
              songId={song.id}
            />
            {!lyricsOnly && !hideChordDiagram && (
              <ChordStrip
                sections={transpose.transposedSections}
                open={chordsOpen}
                onToggle={onChordsToggle}
              />
            )}
          </>
        )}
      </div>
      <div ref={bodyRef}>
        <SongBody
          sections={transpose.transposedSections}
          fontSize={fontSize}
          lyricsOnly={lyricsOnly}
          fitMode={isFit && fitFontSize !== null}
          fitColumns={fitColumns}
          annotationsVisible={annotationsVisible}
          sectionRefs={sectionRefs}
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
