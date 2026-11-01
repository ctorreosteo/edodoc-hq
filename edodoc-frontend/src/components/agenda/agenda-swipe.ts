import { useEffect, useRef, type RefObject, type TouchEvent as RTouchEvent } from 'react'

/**
 * Swipe orizzontale con il dito: verso +1 = avanti (dito verso sinistra). Ignora gli scorrimenti verticali,
 * le due dita e i gesti lenti; con `segui` l'elemento accompagna il dito mentre si sposta.
 */
export function useSwipeOrizzontale(onSwipe: (verso: 1 | -1) => void, opzioni: { segui?: RefObject<HTMLElement | null>; bloccato?: () => boolean } = {}) {
  const stato = useRef<{ x: number; y: number; t: number; orizzontale: boolean | null } | null>(null)
  const cb = useRef(onSwipe)
  cb.current = onSwipe
  const { segui, bloccato } = opzioni

  // Una volta deciso che è orizzontale, la vista non deve anche scorrere in verticale.
  useEffect(() => {
    const el = segui?.current
    if (!el) return
    const muovi = (e: TouchEvent) => {
      if (stato.current?.orizzontale) e.preventDefault()
    }
    el.addEventListener('touchmove', muovi, { passive: false })
    return () => el.removeEventListener('touchmove', muovi)
  }, [segui])

  /** Torna al centro, oppure esce dal lato dello swipe e solo dopo cambia periodo (il nuovo entra dall'altro lato). */
  const rilascia = (dx: number, conferma: boolean, dopo?: () => void) => {
    const el = segui?.current
    if (!el) {
      dopo?.()
      return
    }
    el.style.transition = 'transform 160ms cubic-bezier(0.32, 0.72, 0, 1), opacity 160ms'
    if (!conferma) {
      el.style.transform = ''
      el.style.opacity = ''
      return
    }
    el.style.transform = `translateX(${dx < 0 ? -56 : 56}px)`
    el.style.opacity = '0'
    window.setTimeout(() => {
      dopo?.()
      el.style.transition = 'none'
      el.style.transform = ''
      el.style.opacity = ''
    }, 150)
  }

  return {
    onTouchStart: (e: RTouchEvent) => {
      if (e.touches.length !== 1 || bloccato?.()) {
        stato.current = null
        return
      }
      stato.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), orizzontale: null }
    },
    onTouchMove: (e: RTouchEvent) => {
      const s = stato.current
      if (!s) return
      if (e.touches.length !== 1 || bloccato?.()) {
        stato.current = null
        rilascia(0, false)
        return
      }
      const dx = e.touches[0].clientX - s.x
      const dy = e.touches[0].clientY - s.y
      if (s.orizzontale === null && Math.hypot(dx, dy) > 10) s.orizzontale = Math.abs(dx) > Math.abs(dy) * 1.3
      if (s.orizzontale && segui?.current) {
        segui.current.style.transition = 'none'
        segui.current.style.transform = `translateX(${dx * 0.55}px)`
        segui.current.style.opacity = String(Math.max(0.35, 1 - Math.abs(dx) / 600))
      }
    },
    onTouchEnd: (e: RTouchEvent) => {
      const s = stato.current
      stato.current = null
      if (!s || !s.orizzontale) return
      const dx = e.changedTouches[0].clientX - s.x
      const veloce = Math.abs(dx) / Math.max(1, Date.now() - s.t) > 0.45
      const conferma = Math.abs(dx) > 70 || (veloce && Math.abs(dx) > 30)
      const verso = dx < 0 ? 1 : -1
      rilascia(dx, conferma, conferma ? () => cb.current(verso) : undefined)
    },
    onTouchCancel: () => {
      stato.current = null
      rilascia(0, false)
    },
  }
}
