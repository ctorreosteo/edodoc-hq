import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '@/lib/youtube'
import { youtubeService, type YoutubeLive } from '@/services/youtube-service'

const OGNI_MS = 30_000

/** Contatori pubblici aggiornati ogni 30 secondi (in pausa quando la scheda non è visibile). */
export function useLive(attivo: boolean) {
  const [live, setLive] = useState<YoutubeLive | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const primo = useRef<YoutubeLive | null>(null)

  useEffect(() => {
    if (!attivo) return
    let ferma = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const ctrl = new AbortController()
    const giro = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const l = await youtubeService.live(7, ctrl.signal)
          if (ferma) return
          if (!primo.current) primo.current = l
          setLive(l)
          setErrore(null)
        } catch (e) {
          if (!ferma && !ctrl.signal.aborted) setErrore(errorMessage(e, 'Dati live non disponibili'))
        }
      }
      if (!ferma) timer = setTimeout(giro, OGNI_MS)
    }
    void giro()
    const visibile = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer)
        void giro()
      }
    }
    document.addEventListener('visibilitychange', visibile)
    return () => {
      ferma = true
      ctrl.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', visibile)
    }
  }, [attivo])

  return { live, errore, primo: primo.current }
}
