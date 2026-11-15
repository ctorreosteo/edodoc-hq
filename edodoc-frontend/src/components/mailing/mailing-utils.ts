import { useEffect, useRef, useState } from 'react'
import type { MailingBaseGiuridica, MailingCoinvolgimento, MailingStatoCampagna, MailingStatoContatto, MailingStatoPaziente, MailingTag, MailingTipoContatto } from '@/services/mailing-service'
const cognomeNome = (o: { nome?: string | null; cognome?: string | null }) => `${o.cognome ?? ''} ${o.nome ?? ''}`.trim()

/*
  Formattazione e piccoli calcoli condivisi dalla pagina Email Marketing (shell, panoramica, contatti,
  campagne, automazioni, template). Nel contratto i tassi sono già percentuali 0–100.
*/

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

/** Percentuale già in 0–100 (come i tassi del backend): 42.37 → "42,4%". '—' se null. */
export function formatPercentuale(n: number | null | undefined, decimali = 1): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toLocaleString('it-IT', { maximumFractionDigits: decimali })}%`
}

/** Importo in euro senza decimali sopra i 100 €. */
export function formatEuro(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: Number.isInteger(n) || Math.abs(n) >= 100 ? 0 : 2,
    maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2,
  })
}

/** Variazione relativa (0,12 = +12%) rispetto al periodo precedente: null se non confrontabile. */
export function variazione(attuale: number | null | undefined, precedente: number | null | undefined): number | null {
  if (attuale == null || precedente == null || !Number.isFinite(attuale) || !Number.isFinite(precedente)) return null
  if (precedente === 0) return null
  return (attuale - precedente) / Math.abs(precedente)
}

const RTF = new Intl.RelativeTimeFormat('it-IT', { numeric: 'auto', style: 'short' })

/** "ora", "5 min fa", "3 h fa", "ieri", poi data breve. Funziona anche per date future ("tra 2 h"). */
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

/** "mar 4 nov, 09:30" */
export function dataOra(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** "4 nov 2026" (accetta anche "yyyy-MM-dd"). */
export function dataBreve(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function iniziali(nome: string | null | undefined): string {
  const parti = (nome ?? '').trim().split(/[\s@._-]+/).filter(Boolean)
  return ((parti[0]?.[0] ?? '') + (parti[1]?.[0] ?? '')).toUpperCase() || '?'
}

/** Tinta stabile per testo: la stessa persona ha sempre lo stesso avatar. */
export function tintaPer(testo: string | null | undefined): number {
  let h = 0
  const s = testo ?? ''
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}

/** Nome mostrato di un contatto: "Nome Cognome" o, in mancanza, l'email. */
export function nomeContatto(c: { nome?: string | null; cognome?: string | null; email?: string | null }): string {
  const n = `${c.nome ?? ''} ${c.cognome ?? ''}`.trim()
  return n || c.email || 'Contatto'
}

/** Negli elenchi di contatti: «Cognome Nome» o, in mancanza, l'email. nomeContatto resta per avatar e frasi. */
export function nomeContattoInElenco(c: { nome?: string | null; cognome?: string | null; email?: string | null }): string {
  return cognomeNome(c) || c.email || 'Contatto'
}

export type ToneMailing = 'neutro' | 'info' | 'ok' | 'avviso' | 'errore'

const ETICHETTE_STATO_CONTATTO: Record<MailingStatoContatto, string> = {
  ISCRITTO: 'Iscritto',
  DISISCRITTO: 'Disiscritto',
  RIMBALZATO: 'Indirizzo non valido',
  SEGNALATO_SPAM: 'Segnalato come spam',
  ARCHIVIATO: 'Archiviato',
}

const TONI_STATO_CONTATTO: Record<MailingStatoContatto, ToneMailing> = {
  ISCRITTO: 'ok',
  DISISCRITTO: 'neutro',
  RIMBALZATO: 'avviso',
  SEGNALATO_SPAM: 'errore',
  ARCHIVIATO: 'neutro',
}

export function etichettaStatoContatto(stato: MailingStatoContatto): string {
  return ETICHETTE_STATO_CONTATTO[stato] ?? stato
}

/** Tono (per .ml-badge--{tono}) dello stato di un contatto. */
export function coloreStatoContatto(stato: MailingStatoContatto): ToneMailing {
  return TONI_STATO_CONTATTO[stato] ?? 'neutro'
}

const ETICHETTE_STATO_CAMPAGNA: Record<MailingStatoCampagna, string> = {
  BOZZA: 'Bozza',
  PROGRAMMATA: 'Programmata',
  IN_INVIO: 'In invio',
  TEST_AB: 'Test A/B in corso',
  IN_PAUSA: 'In pausa',
  INVIATA: 'Inviata',
  ANNULLATA: 'Annullata',
}

const TONI_STATO_CAMPAGNA: Record<MailingStatoCampagna, ToneMailing> = {
  BOZZA: 'neutro',
  PROGRAMMATA: 'info',
  IN_INVIO: 'info',
  TEST_AB: 'info',
  IN_PAUSA: 'avviso',
  INVIATA: 'ok',
  ANNULLATA: 'errore',
}

export function etichettaStatoCampagna(stato: MailingStatoCampagna): string {
  return ETICHETTE_STATO_CAMPAGNA[stato] ?? stato
}

export function toneStatoCampagna(stato: MailingStatoCampagna): ToneMailing {
  return TONI_STATO_CAMPAGNA[stato] ?? 'neutro'
}

export const ETICHETTE_BASE_GIURIDICA: Record<MailingBaseGiuridica, string> = {
  CONSENSO: 'Consenso esplicito',
  CLIENTE_SOFT_SPAM: 'Paziente del dottore',
  MANUALE: 'Inserito a mano',
}

export const ETICHETTE_STATO_PAZIENTE: Record<MailingStatoPaziente, string> = {
  LEAD: 'Lead',
  LISTA_ATTESA: 'Lista d’attesa',
  ATTIVO: 'In percorso',
  MANTENIMENTO: 'Mantenimento',
  CONCLUSO: 'Concluso',
}

export function etichettaStatoPaziente(s: MailingStatoPaziente): string {
  return ETICHETTE_STATO_PAZIENTE[s] ?? s
}

export function etichettaBaseGiuridica(b: MailingBaseGiuridica): string {
  return ETICHETTE_BASE_GIURIDICA[b] ?? b
}

export function etichettaTipoContatto(t: MailingTipoContatto): string {
  return t === 'PAZIENTE' ? 'Paziente' : t === 'LEAD' ? 'Lead' : 'Altro'
}

/** Colore di un tag: quello scelto oppure uno stabile derivato dal nome. */
export function coloreTag(tag: Pick<MailingTag, 'nome' | 'colore'>): string {
  if (tag.colore && /^#[0-9a-f]{6}$/i.test(tag.colore)) return tag.colore
  return `hsl(${tintaPer(tag.nome)} 62% 48%)`
}

/** Nome mostrato di un tag: quelli di sistema (LEAD_PRENOTATO_LOMBALGIA) diventano leggibili. */
export function nomeTag(tag: Pick<MailingTag, 'nome' | 'sistema'>): string {
  if (!tag.sistema || !/^[A-Z0-9_]+$/.test(tag.nome)) return tag.nome
  const parole = tag.nome.split('_').filter(Boolean).map((p, i) => (p.length <= 2 ? p : i === 0 ? p.charAt(0) + p.slice(1).toLowerCase() : p.toLowerCase()))
  return parole.join(' ')
}

export const COINVOLGIMENTO: Record<MailingCoinvolgimento, { etichetta: string; descrizione: string }> = {
  ATTIVO: { etichetta: 'Attivo', descrizione: 'Ha aperto almeno una email negli ultimi 30 giorni' },
  TIEPIDO: { etichetta: 'Tiepido', descrizione: 'Ha aperto tra 30 e 90 giorni fa' },
  DORMIENTE: { etichetta: 'Dormiente', descrizione: 'Nessuna apertura da più di 90 giorni' },
  MAI: { etichetta: 'Mai aperto', descrizione: 'Non ha ancora aperto nessuna email' },
}

export function etichettaCoinvolgimento(c: MailingCoinvolgimento): string {
  return COINVOLGIMENTO[c]?.etichetta ?? c
}

export type ColoriMailing = {
  s1: string
  s2: string
  s3: string
  s4: string
  s5: string
  ok: string
  avviso: string
  errore: string
  testo: string
  griglia: string
  superficie: string
}

const COLORI_PREDEFINITI: ColoriMailing = {
  s1: '#6250d6',
  s2: '#15966a',
  s3: '#e05a26',
  s4: '#2a78d6',
  s5: '#d55181',
  ok: '#19c463',
  avviso: '#f59e0b',
  errore: '#ef4444',
  testo: 'rgba(0, 37, 82, 0.45)',
  griglia: 'rgba(0, 37, 82, 0.08)',
  superficie: '#ffffff',
}

function leggiColori(): ColoriMailing {
  if (typeof document === 'undefined') return COLORI_PREDEFINITI
  const el = document.querySelector('[data-vl-page="mailing"]') ?? document.documentElement
  const s = getComputedStyle(el)
  const v = (nome: string, fallback: string) => s.getPropertyValue(nome).trim() || fallback
  return {
    s1: v('--ml-s1', COLORI_PREDEFINITI.s1),
    s2: v('--ml-s2', COLORI_PREDEFINITI.s2),
    s3: v('--ml-s3', COLORI_PREDEFINITI.s3),
    s4: v('--ml-s4', COLORI_PREDEFINITI.s4),
    s5: v('--ml-s5', COLORI_PREDEFINITI.s5),
    ok: v('--ml-ok', COLORI_PREDEFINITI.ok),
    avviso: v('--ml-avviso', COLORI_PREDEFINITI.avviso),
    errore: v('--ml-errore', COLORI_PREDEFINITI.errore),
    testo: v('--vl-ink-3', COLORI_PREDEFINITI.testo),
    griglia: v('--vl-line', COLORI_PREDEFINITI.griglia),
    superficie: v('--ml-carta', COLORI_PREDEFINITI.superficie),
  }
}

/**
 * Colori dei grafici letti dai token CSS calcolati della pagina (--ml-s1…5, stati, testo, griglia):
 * recharts li scrive come attributi SVG, dove var() non si risolve. Si rileggono quando il tema cambia
 * classe su <html> e dopo il primo render (la radice [data-vl-page="mailing"] potrebbe non esserci ancora).
 */
export function useColoriMailing(): ColoriMailing {
  const [colori, setColori] = useState<ColoriMailing>(leggiColori)
  useEffect(() => {
    const aggiorna = () =>
      setColori((prima) => {
        const nuovi = leggiColori()
        return (Object.keys(nuovi) as (keyof ColoriMailing)[]).some((k) => nuovi[k] !== prima[k]) ? nuovi : prima
      })
    aggiorna()
    const oss = new MutationObserver(aggiorna)
    oss.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => oss.disconnect()
  }, [])
  return colori
}

/** Ticker che fa ridisegnare i "x min fa" senza ricaricare nulla. */
export function useAdesso(ogniMs = 15_000): number {
  const [adesso, setAdesso] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setAdesso(Date.now()), ogniMs)
    return () => window.clearInterval(id)
  }, [ogniMs])
  return adesso
}

/** Valore che rincorre il target in modo fluido (contatori dei KPI). Rispetta prefers-reduced-motion. */
export function useNumeroAnimato(target: number | null | undefined, durataMs = 900): number | null {
  const [valore, setValore] = useState<number | null>(target ?? null)
  const corrente = useRef<number | null>(target ?? null)
  useEffect(() => {
    if (target == null || !Number.isFinite(target)) {
      corrente.current = target ?? null
      setValore(target ?? null)
      return
    }
    const ridotto = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const da = corrente.current ?? 0
    if (ridotto || da === target) {
      corrente.current = target
      setValore(target)
      return
    }
    let partenza: number | null = null
    let frame = 0
    const passo = (t: number) => {
      if (partenza == null) partenza = t
      const p = Math.min(1, (t - partenza) / durataMs)
      const e = 1 - Math.pow(1 - p, 3)
      const v = da + (target - da) * e
      corrente.current = v
      setValore(v)
      if (p < 1) frame = requestAnimationFrame(passo)
    }
    frame = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(frame)
  }, [target, durataMs])
  return valore
}

// ───────────────────────── Indirizzo per le prove ─────────────────────────
// In EdoDoc l'utente non ha un'email nel profilo: l'ultimo indirizzo usato per una prova si ricorda nel browser.

const CHIAVE_EMAIL_PROVA = 'edodoc-mailing-email-prova'

export function emailProvaRicordata(): string {
  try {
    return localStorage.getItem(CHIAVE_EMAIL_PROVA) ?? ''
  } catch {
    return ''
  }
}

export function ricordaEmailProva(indirizzo: string | null | undefined) {
  const e = indirizzo?.trim().toLowerCase()
  if (!e) return
  try {
    localStorage.setItem(CHIAVE_EMAIL_PROVA, e)
  } catch {
    /* storage non disponibile: pazienza */
  }
}

/** Rotta della pagina Email Marketing (App.tsx). */
export const MAILING_URL = '/email-marketing'
