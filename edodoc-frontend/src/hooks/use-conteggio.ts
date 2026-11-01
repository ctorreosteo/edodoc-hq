import { useEffect, useRef, useState } from "react"

export const movimentoRidotto = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** Fa salire un numero fino a `valore`, partendo da quello mostrato prima. */
export function useConteggio(valore: number, durata = 900) {
  const [mostrato, setMostrato] = useState(0)
  const attuale = useRef(0)

  useEffect(() => {
    if (movimentoRidotto()) {
      attuale.current = valore
      setMostrato(valore)
      return
    }
    const partenza = attuale.current
    const inizio = performance.now()
    let frame = requestAnimationFrame(function passo(ora) {
      const t = Math.min(1, (ora - inizio) / durata)
      attuale.current = partenza + (valore - partenza) * (1 - (1 - t) ** 3)
      setMostrato(attuale.current)
      if (t < 1) frame = requestAnimationFrame(passo)
    })
    return () => cancelAnimationFrame(frame)
  }, [valore, durata])

  return mostrato
}
