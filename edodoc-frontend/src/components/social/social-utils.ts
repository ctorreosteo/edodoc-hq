import { useEffect, useState } from 'react'
import type { SocialMetrica, SocialPiattaforma } from '@/services/social-service'

/* Formattazione e piccoli calcoli condivisi dalla pagina Social (i componenti stanno in social-ui.tsx). */

export const NOMI_PIATTAFORMA: Record<SocialPiattaforma, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
}

export function formatNumero(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString('it-IT')
}

/** 12.400 → 12,4K · 1.250.000 → 1,25M. Sotto i 10.000 il numero intero. */
export function formatCompatto(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${(n / 1_000_000).toLocaleString('it-IT', { maximumFractionDigits: 2 })}M`
  if (a >= 10_000) return `${(n / 1_000).toLocaleString('it-IT', { maximumFractionDigits: 1 })}K`
  return formatNumero(n)
}

export function formatPercentuale(r: number | null | undefined, decimali = 1): string {
  if (r == null || !Number.isFinite(r)) return '—'
  return `${(r * 100).toLocaleString('it-IT', { maximumFractionDigits: decimali })}%`
}

/** Variazione rispetto al periodo precedente: null se non confrontabile. */
export function variazione(m: Pick<SocialMetrica, 'valore' | 'precedente'> | null | undefined): number | null {
  if (!m || m.valore == null || m.precedente == null || m.precedente === 0) return null
  return (m.valore - m.precedente) / m.precedente
}

export function formatDurataMinuti(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—'
  if (min < 60) return `${Math.max(1, Math.round(min))} min`
  const ore = min / 60
  if (ore < 24) return `${ore.toLocaleString('it-IT', { maximumFractionDigits: 1 })} h`
  return `${(ore / 24).toLocaleString('it-IT', { maximumFractionDigits: 1 })} g`
}

const RTF = new Intl.RelativeTimeFormat('it-IT', { numeric: 'auto', style: 'short' })

/** "ora", "5 min fa", "3 h fa", "ieri", poi data breve. */
export function tempoFa(iso: string | null | undefined, adesso = Date.now()): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const sec = Math.round((t - adesso) / 1000)
  const a = Math.abs(sec)
  if (a < 45) return 'ora'
  if (a < 3600) return RTF.format(Math.round(sec / 60), 'minute')
  if (a < 86400) return RTF.format(Math.round(sec / 3600), 'hour')
  if (a < 86400 * 6) return RTF.format(Math.round(sec / 86400), 'day')
  return new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

export function dataOra(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

export function iniziali(nome: string | null | undefined): string {
  const parti = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  return ((parti[0]?.[0] ?? '') + (parti[1]?.[0] ?? '')).toUpperCase() || '?'
}

/** Tinta stabile per nome: lo stesso utente ha sempre lo stesso avatar. */
export function tintaPer(testo: string | null | undefined): number {
  let h = 0
  const s = testo ?? ''
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}

/** Data/ora locale "yyyy-MM-ddTHH:mm" per <input type="datetime-local">. */
export function locale(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export const LIMITE_INSTAGRAM = 2200
export const LIMITE_HASHTAG_INSTAGRAM = 30

export function contaHashtag(testo: string): number {
  return (testo.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length
}

export const ETICHETTE_AZIONE: Record<string, string> = {
  RISPOSTA_COMMENTO: 'ha risposto a un commento',
  MESSAGGIO: 'ha scritto in DM',
  MESSAGGIO_PRIVATO: 'ha risposto in privato a un commento',
  NASCOSTO: 'ha nascosto un commento',
  MOSTRATO: 'ha reso visibile un commento',
  ELIMINATO: 'ha eliminato un commento',
  MI_PIACE: 'ha messo mi piace a un commento',
  GESTITO: 'ha segnato come gestito',
  PUBBLICAZIONE: 'ha pubblicato un post',
}

/**
 * Colori delle serie letti dai token CSS della pagina (--so-fb, --so-ig): recharts li scrive come attributi SVG,
 * dove var() non si risolve. Si rileggono quando il tema cambia classe su <html>.
 */
export function useColoriSerie(): { fb: string; ig: string; superficie: string } {
  const leggi = () => {
    const el = document.querySelector('[data-vl-page="social"]') ?? document.documentElement
    const s = getComputedStyle(el)
    return {
      fb: s.getPropertyValue('--so-fb').trim() || '#1877f2',
      ig: s.getPropertyValue('--so-ig').trim() || '#e1306c',
      superficie: s.getPropertyValue('--vl-surface-solid').trim() || '#ffffff',
    }
  }
  const [colori, setColori] = useState(leggi)
  useEffect(() => {
    setColori(leggi())
    const oss = new MutationObserver(() => setColori(leggi()))
    oss.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => oss.disconnect()
  }, [])
  return colori
}

/** Regole "da gestire" condivise da hero, badge della tab e inbox: devono contare le stesse cose. */
export function commentoDaGestire(c: { risposto: boolean; gestito: boolean; daPagina: boolean }): boolean {
  return !c.risposto && !c.gestito && !c.daPagina
}

export function conversazioneDaGestire(d: { gestito: boolean; nonLetti: number; ultimoDaPagina: boolean }): boolean {
  return !d.gestito && (d.nonLetti > 0 || !d.ultimoDaPagina)
}
