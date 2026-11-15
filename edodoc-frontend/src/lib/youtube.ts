import { useEffect, useRef, useState } from 'react'

/* Pagina YouTube: formattazione, utilità e hook condivisi dai componenti in components/youtube. */

/** Messaggio leggibile da un errore dell'API (il backend scrive già il testo per il dottore). */
export function errorMessage(err: unknown, fallback = 'Errore nel caricamento.') {
  if (err instanceof Error && err.message) return err.message
  return fallback
}

const intero = new Intl.NumberFormat('it-IT')
const compatto = new Intl.NumberFormat('it-IT', { notation: 'compact', maximumFractionDigits: 1 })
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

export const fmt = {
  int: (n: number | null | undefined) => (n == null ? '—' : intero.format(Math.round(n))),
  compact: (n: number | null | undefined) => (n == null ? '—' : n < 10_000 ? intero.format(Math.round(n)) : compatto.format(n)),
  pct: (n: number | null | undefined, dec = 1) => (n == null ? '—' : `${n.toLocaleString('it-IT', { maximumFractionDigits: dec })}%`),
  eur: (n: number | null | undefined) => (n == null ? '—' : euro.format(n)),
  ore: (minuti: number | null | undefined) => (minuti == null ? '—' : `${intero.format(Math.round(minuti / 60))} h`),
  durata: (sec: number | null | undefined) => {
    if (sec == null) return '—'
    const s = Math.round(sec)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const r = s % 60
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
  },
  data: (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
  giorno: (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }),
  fa: (iso: string | null | undefined) => {
    if (!iso) return ''
    const diff = (Date.now() - new Date(iso).getTime()) / 1000
    if (diff < 60) return 'adesso'
    if (diff < 3600) return `${Math.floor(diff / 60)} min fa`
    if (diff < 86400) return `${Math.floor(diff / 3600)} h fa`
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} g fa`
    return fmt.data(iso)
  },
}

export function variazione(attuale: number, precedente: number): number | null {
  if (!precedente) return attuale ? null : 0
  return ((attuale - precedente) / Math.abs(precedente)) * 100
}

/** Valore numerico che sale da 0 alla prima comparsa (tile KPI). */
export function useConteggio(obiettivo: number, durata = 900) {
  const [v, setV] = useState(0)
  const da = useRef(0)
  useEffect(() => {
    const inizio = performance.now()
    const partenza = da.current
    let raf = 0
    const passo = (t: number) => {
      const k = Math.min(1, (t - inizio) / durata)
      const e = 1 - Math.pow(1 - k, 3)
      const x = partenza + (obiettivo - partenza) * e
      setV(x)
      da.current = x
      if (k < 1) raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [obiettivo, durata])
  return v
}

export function copia(testo: string, toast: { success: (m: string) => void }) {
  void navigator.clipboard?.writeText(testo).then(() => toast.success('Copiato negli appunti'))
}

export const urlVideo = (id: string) => `https://www.youtube.com/watch?v=${id}`
export const urlStudioVideo = (id: string) => `https://studio.youtube.com/video/${id}/edit`

/** Prossimo traguardo "tondo" sopra il valore (1k, 2.5k, 5k, 10k, 25k, …). */
export function prossimoTraguardo(n: number) {
  const passi = [1, 2.5, 5]
  let base = 100
  for (;;) {
    for (const p of passi) {
      const t = p * base
      if (t > n) return t
    }
    base *= 10
  }
}
