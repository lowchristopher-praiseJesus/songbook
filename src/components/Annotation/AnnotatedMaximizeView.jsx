import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { SongBody } from '../SongList/SongBody'
import { AnnotationLayer } from './AnnotationLayer'
import { useAnnotationStore } from '../../store/annotationStore'

function clampPan(pan, scale, baseline, container) {
  if (!container) return pan
  const scaledW = baseline.width * scale
  const scaledH = baseline.height * scale
  const minX = Math.min(0, container.clientWidth - scaledW)
  const minY = Math.min(0, container.clientHeight - scaledH)
  return {
    x: Math.min(0, Math.max(minX, pan.x)),
    y: Math.min(0, Math.max(minY, pan.y)),
  }
}

/**
 * Renders the maximize-mode song body. Before a song has any ink, this is a
 * thin passthrough to the normal dynamic fit-to-screen rendering (unchanged
 * behavior). Once a song has a frozen annotation baseline (see
 * annotationStore.captureBaseline), it instead renders the song at its fixed
 * baseline size and uniformly CSS-scales that whole box to fit the current
 * screen — so ink (drawn in the same box) can never drift from the content
 * it's attached to, no matter how the live viewport changes.
 */
export function AnnotatedMaximizeView({
  sections,
  fontSize,
  lyricsOnly,
  annotationsVisible,
  sectionRefs,
  bodyRef,
  fitFontSize,
  fitColumns,
  paginated,
  totalColumns,
  currentPage,
  pageColWidth,
  fitAvailableHeight,
  containerRef,
}) {
  const baseline = useAnnotationStore(s => s.baseline)
  const annotateMode = useAnnotationStore(s => s.annotateMode)
  const userZoom = useAnnotationStore(s => s.userZoom)
  const pan = useAnnotationStore(s => s.pan)
  const setPan = useAnnotationStore(s => s.setPan)

  const outerRef = useRef(null)
  const [fitScale, setFitScale] = useState(1)
  const [availableHeight, setAvailableHeight] = useState(0)

  // The maximize overlay's content column is auto-height (sized to fit its
  // children), not a flex/grid item — so a plain `height: 100%` on this
  // wrapper would resolve against an ancestor with no defined height and
  // collapse to 0. Measure the real available space directly against the
  // scrollable containerRef instead, the same way useFitToScreen does.
  //
  // useLayoutEffect (not useEffect) is required here: this fires the first
  // time `baseline` goes from null to set, i.e. the exact render where this
  // component switches from the live branch to this frozen one. A plain
  // useEffect runs after the browser paints, so that first frame would
  // paint with the still-default fitScale/availableHeight (1 / 0) — visible
  // as a one-frame zoom flash right when annotating starts — before the
  // effect corrects it a moment later. useLayoutEffect computes the correct
  // values before that first paint, matching how useFitToScreen's own
  // measurement effect avoids the same class of flash.
  //
  // `containerRef` is a prop attached to a DOM node several components up
  // the tree (SongView), not by this component — but React fires layout
  // effects bottom-up (children before parents). On a fresh mount where
  // this component's own outerRef AND that ancestor's containerRef are
  // BOTH being attached within the same commit (e.g. entering maximize mode
  // directly on an already-annotated song, so this component is born
  // straight into the baseline branch instead of transitioning into it
  // while already mounted), this effect can run before SongView's own
  // commit step has attached containerRef.current yet. The synchronous
  // measure() below then silently no-ops against a still-null container,
  // and — since the resulting availableHeight of 0 doesn't come from an
  // actual container resize — no ResizeObserver callback ever fires
  // afterward to correct it, leaving the song permanently blank until
  // something else (e.g. navigating to another song and back) forces a
  // fresh mount that happens to race the timing differently. Re-running
  // once more on the next animation frame — by which point the whole
  // commit, including the ancestor's ref attachment, has long since
  // settled — catches and corrects that case.
  useLayoutEffect(() => {
    if (!baseline) return
    const outer = outerRef.current
    if (!outer) return

    let observer = null
    const measure = () => {
      const container = containerRef?.current
      if (!container) return
      const containerRect = container.getBoundingClientRect()
      const outerRect = outer.getBoundingClientRect()
      const outerTopInContainer = outerRect.top - containerRect.top + container.scrollTop
      const height = Math.max(0, container.clientHeight - outerTopInContainer)
      setAvailableHeight(height)
      const scale = Math.min(outer.clientWidth / baseline.width, height / baseline.height)
      setFitScale(scale > 0 && isFinite(scale) ? scale : 1)
      if (!observer) {
        observer = new ResizeObserver(measure)
        observer.observe(container)
      }
    }
    measure()
    const rafId = requestAnimationFrame(measure)

    return () => {
      cancelAnimationFrame(rafId)
      if (observer) observer.disconnect()
    }
  }, [baseline, containerRef])

  // Re-clamp pan whenever the effective scale changes (window resize, zoom
  // level change) so content can't get stranded off-screen.
  useEffect(() => {
    if (!baseline) return
    const clamped = clampPan(pan, fitScale * userZoom, baseline, outerRef.current)
    if (clamped.x !== pan.x || clamped.y !== pan.y) setPan(clamped)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline, fitScale, userZoom])

  const startPan = useCallback((e) => {
    if (annotateMode || userZoom <= 1 || !baseline) return
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startPanValue = pan
    const scale = fitScale * userZoom
    function onMove(ev) {
      const next = { x: startPanValue.x + (ev.clientX - startX), y: startPanValue.y + (ev.clientY - startY) }
      setPan(clampPan(next, scale, baseline, outerRef.current))
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [annotateMode, userZoom, baseline, pan, fitScale, setPan])

  if (!baseline) {
    return (
      <div ref={bodyRef} className="relative">
        <SongBody
          sections={sections}
          fontSize={fontSize}
          lyricsOnly={lyricsOnly}
          fitMode={fitFontSize !== null}
          fitColumns={fitColumns}
          paginated={paginated}
          totalColumns={totalColumns}
          currentPage={currentPage}
          pageColWidth={pageColWidth}
          availableHeight={fitAvailableHeight}
          annotationsVisible={annotationsVisible}
          sectionRefs={sectionRefs}
          overlay={
            <AnnotationLayer
              active={annotateMode}
              fitFontSize={fitFontSize}
              fitColumns={fitColumns}
              paginated={paginated}
              totalColumns={totalColumns}
              pageColWidth={pageColWidth}
              fitAvailableHeight={fitAvailableHeight}
            />
          }
        />
      </div>
    )
  }

  const scale = fitScale * userZoom

  return (
    <div
      ref={outerRef}
      className="relative w-full overflow-hidden"
      style={{ height: `${availableHeight}px` }}
      onPointerDown={startPan}
    >
      <div
        className="absolute top-0 left-0"
        style={{
          width: `${baseline.width}px`,
          height: `${baseline.height}px`,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: 'top left',
          '--fit-fs': `${baseline.fontSize}px`,
          cursor: !annotateMode && userZoom > 1 ? 'grab' : 'default',
        }}
      >
        <SongBody
          sections={sections}
          fontSize={fontSize}
          lyricsOnly={lyricsOnly}
          fitMode
          fitColumns={baseline.columns}
          paginated={baseline.paginated}
          totalColumns={baseline.totalColumns}
          currentPage={currentPage}
          pageColWidth={baseline.pageColWidth}
          availableHeight={baseline.availableHeight}
          annotationsVisible={annotationsVisible}
          overlay={<AnnotationLayer active={annotateMode} fitFontSize={baseline.fontSize} fitColumns={baseline.columns} />}
        />
      </div>
    </div>
  )
}
