import type { PlannerStatoCanale, PlannerStatoPost } from '@/services/planner-service'

/* Testi e numeri del Planner social (stati, numeri compatti, dimensioni, durate). */

export const ETICHETTA_STATO: Record<PlannerStatoPost, string> = {
  IDEA: 'Idea',
  BOZZA: 'Bozza',
  IN_APPROVAZIONE: 'Da approvare',
  PROGRAMMATO: 'Programmato',
  IN_PUBBLICAZIONE: 'Si pubblica…',
  DA_COMPLETARE: 'Da completare',
  PUBBLICATO: 'Pubblicato',
  PARZIALE: 'Parziale',
  ERRORE: 'Errore',
}

export const ETICHETTA_STATO_CANALE: Record<PlannerStatoCanale, string> = {
  IN_ATTESA: 'In attesa',
  IN_PUBBLICAZIONE: 'Si pubblica…',
  DA_PUBBLICARE: 'Da pubblicare a mano',
  PUBBLICATO: 'Pubblicato',
  ERRORE: 'Errore',
}

const NUM = new Intl.NumberFormat('it-IT')
const COMPATTO = new Intl.NumberFormat('it-IT', { notation: 'compact', maximumFractionDigits: 1 })

export function numero(v: number | null | undefined): string {
  return v == null ? '—' : NUM.format(v)
}

export function compatto(v: number | null | undefined): string {
  return v == null ? '—' : v < 10000 ? NUM.format(v) : COMPATTO.format(v)
}

export function dimensioneFile(byte: number): string {
  if (byte < 1024 * 1024) return `${Math.max(1, Math.round(byte / 1024))} KB`
  return `${(byte / 1024 / 1024).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB`
}

export function durata(secondi: number | null | undefined): string {
  if (!secondi) return ''
  const s = Math.round(secondi)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
