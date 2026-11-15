import { useEffect, useRef } from 'react'
import { mailingService, type MailingPanoramica } from '@/services/mailing-service'

/*
  Collante tra la shell (mailing-pagina.tsx) e le schede.
  EdoDoc non ha WebSocket: al posto degli eventi realtime di Mobilitas le schede ricaricano con
  usePollingMailing(attivo, cb) — ogni 10 s, solo mentre la scheda del browser è visibile e solo se
  c'è qualcosa in invio (lo decide il chiamante con `attivo`).
  panoramicaCondivisa(giorni): stessa richiesta per hero e scheda Panoramica (dedup + cache di 15 s).
*/

export const POLLING_MAILING_MS = 10_000

/** Richiama `cb` ogni `ms` finché `attivo` è vero e la pagina è visibile; al ritorno sulla scheda ricarica subito. */
export function usePollingMailing(attivo: boolean, cb: () => void, ms = POLLING_MAILING_MS) {
  const ref = useRef(cb)
  useEffect(() => {
    ref.current = cb
  })
  useEffect(() => {
    if (!attivo) return
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') ref.current()
    }, ms)
    const suVisibile = () => {
      if (document.visibilityState === 'visible') ref.current()
    }
    document.addEventListener('visibilitychange', suVisibile)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', suVisibile)
    }
  }, [attivo, ms])
}

const CACHE_MS = 15_000
const cache = new Map<number, { quando: number; dati: Promise<MailingPanoramica> }>()

/** Panoramica dedotta: chiamate ravvicinate con gli stessi giorni condividono la stessa richiesta. */
export function panoramicaCondivisa(giorni: number, forza = false): Promise<MailingPanoramica> {
  const c = cache.get(giorni)
  if (!forza && c && Date.now() - c.quando < CACHE_MS) return c.dati
  const dati = mailingService.panoramica(giorni)
  cache.set(giorni, { quando: Date.now(), dati })
  dati.catch(() => cache.delete(giorni))
  return dati
}
