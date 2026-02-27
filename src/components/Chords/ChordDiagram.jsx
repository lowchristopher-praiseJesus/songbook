import { SPRITE_W, SPRITE_H } from '../../lib/chords/chordSprite'

/**
 * Renders a single chord diagram by cropping the guitar-chord-chart.png sprite.
 * @param {{ x: number, y: number }} sprite - pixel crop origin
 */
export function ChordDiagram({ sprite }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width:               SPRITE_W,
        height:              SPRITE_H,
        backgroundImage:     'url(/guitar-chord-chart.png)',
        backgroundSize:      '1000px 1545px',
        backgroundPosition:  `-${sprite.x}px -${sprite.y}px`,
        backgroundRepeat:    'no-repeat',
        flexShrink:          0,
      }}
    />
  )
}
