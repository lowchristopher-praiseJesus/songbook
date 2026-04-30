import { TouchSensor } from '@dnd-kit/core'

/**
 * Drop-in replacement for TouchSensor that does NOT call event.preventDefault()
 * on touchend/touchcancel when the drag was never activated (i.e. a quick tap).
 *
 * The stock TouchSensor always calls preventDefault() on touchend, which
 * suppresses the browser's synthetic click event even for ordinary taps.
 * This breaks click handlers on any element that is an ancestor of a draggable.
 *
 * By skipping preventDefault() for non-activated touches, quick taps still
 * fire click events while long-presses (>= activationConstraint.delay) still
 * work as drags.
 */
export class LongPressTouchSensor extends TouchSensor {
  handleEnd(event) {
    if (!this.activated) {
      this.detach()
      this.props.onCancel()
      return
    }
    event.preventDefault()
    this.detach()
    this.props.onEnd()
  }

  handleCancel(event) {
    if (!this.activated) {
      this.detach()
      this.props.onCancel()
      return
    }
    event.preventDefault()
    this.detach()
    this.props.onCancel()
  }
}

LongPressTouchSensor.activators = TouchSensor.activators
