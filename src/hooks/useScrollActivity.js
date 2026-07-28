import { useState, useEffect } from 'react'

/**
 * True while any element inside `ref` is being scrolled, false after
 * `idleMs` of no scroll events. Scroll events don't bubble, so a
 * capture-phase listener on the container observes descendant scrollers.
 */
export function useScrollActivity(ref, idleMs = 1000) {
  const [scrolling, setScrolling] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let timer = null
    function onScroll() {
      setScrolling(true)
      clearTimeout(timer)
      timer = setTimeout(() => setScrolling(false), idleMs)
    }

    el.addEventListener('scroll', onScroll, true)
    return () => {
      clearTimeout(timer)
      el.removeEventListener('scroll', onScroll, true)
    }
  }, [ref, idleMs])

  return scrolling
}
