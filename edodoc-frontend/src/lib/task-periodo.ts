/*
  Orario di un task: dall'inizio (dataInizio + inizioOra) alla fine (scadenza + scadenzaOra), come lo legge il
  selettore «Orario» e il calendario dei task. Date "YYYY-MM-DD", ore "HH:mm:ss" nel task e "HH:mm" nella bozza del selettore.
*/
import { addDays, addMinutes, differenceInCalendarDays, differenceInMinutes, format, isSameDay } from 'date-fns'
import { it } from 'date-fns/locale'

export type Periodo = {
  dataInizio: string | null
  inizioOra: string | null
  scadenza: string | null
  scadenzaOra: string | null
}

/** Il periodo mentre lo si modifica: le due date ci sono sempre, le ore sono facoltative. */
export type BozzaPeriodo = { da: string; daOra: string | null; a: string; aOra: string | null }

/** Durate rapide, in minuti. */
export const DURATE_RAPIDE = [30, 60, 90, 120, 180, 240]

/** Ore del selettore, ogni quarto d'ora dalle 6 alle 23:45. */
export const ORARI_PERIODO: string[] = Array.from({ length: (24 - 6) * 4 }, (_, i) => {
  const minuti = 6 * 60 + i * 15
  return `${String(Math.floor(minuti / 60)).padStart(2, '0')}:${String(minuti % 60).padStart(2, '0')}`
})

const giorno = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const iso = (d: Date) => format(d, 'yyyy-MM-dd')
const hhmm = (ora: string | null | undefined) => (ora ? ora.slice(0, 5) : null)
const momento = (data: string, ora: string) => {
  const [h, m] = ora.split(':').map(Number)
  const d = giorno(data)
  d.setHours(h, m, 0, 0)
  return d
}

/** «Oggi», «Domani», «Ieri», «gio 14 nov», «14 nov 2027». */
export function giornoBreve(data: string, oggi = new Date()): string {
  const d = giorno(data)
  if (isSameDay(d, oggi)) return 'Oggi'
  if (isSameDay(d, addDays(oggi, 1))) return 'Domani'
  if (isSameDay(d, addDays(oggi, -1))) return 'Ieri'
  return format(d, d.getFullYear() === oggi.getFullYear() ? 'EEE d MMM' : 'd MMM yyyy', { locale: it })
}

const maiuscola = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function bozzaDa(p: Periodo, oggi: string): BozzaPeriodo {
  const a = p.scadenza ?? p.dataInizio ?? oggi
  return {
    da: p.dataInizio ?? a,
    daOra: p.dataInizio ? hhmm(p.inizioOra) : null,
    a,
    aOra: hhmm(p.scadenzaOra),
  }
}

/** Minuti fra inizio e fine, solo con entrambe le ore. */
export function minutiBozza(b: BozzaPeriodo): number | null {
  if (!b.daOra || !b.aOra) return null
  return differenceInMinutes(momento(b.a, b.aOra), momento(b.da, b.daOra))
}

/** Cosa non va nella bozza, o null se si può salvare (come TaskService.periodo nel backend). */
export function erroreBozza(b: BozzaPeriodo): string | null {
  if (b.da > b.a) return 'La fine viene prima dell\'inizio'
  const minuti = minutiBozza(b)
  if (minuti != null && minuti <= 0) return 'L\'ora di fine deve venire dopo l\'ora d\'inizio'
  return null
}

/** Fine = inizio + minuti (anche il giorno dopo, se si passa la mezzanotte). Senza ora d'inizio non cambia niente. */
export function conDurata(b: BozzaPeriodo, minuti: number): BozzaPeriodo {
  if (!b.daOra) return b
  const fine = addMinutes(momento(b.da, b.daOra), minuti)
  return { ...b, a: iso(fine), aOra: format(fine, 'HH:mm') }
}

/** Nuovo inizio: la fine si sposta con lui e la durata resta (se c'era). */
export function spostaInizio(b: BozzaPeriodo, da: string, daOra: string | null): BozzaPeriodo {
  const minuti = minutiBozza(b)
  const giorni = differenceInCalendarDays(giorno(b.a), giorno(b.da))
  const spostata = { ...b, da, daOra }
  if (minuti != null && minuti > 0 && daOra) return conDurata(spostata, minuti)
  return { ...spostata, a: iso(addDays(giorno(da), Math.max(giorni, 0))) }
}

/** Dalla bozza ai campi del task. La data d'inizio resta vuota se non serve (stesso giorno, senza ora, mai indicata). */
export function periodoDaBozza(b: BozzaPeriodo, originale: Periodo): Periodo {
  const conInizio = b.daOra != null || b.da !== b.a || originale.dataInizio != null
  return {
    dataInizio: conInizio ? b.da : null,
    inizioOra: conInizio && b.daOra ? `${b.daOra}:00` : null,
    scadenza: b.a,
    scadenzaOra: b.aOra ? `${b.aOra}:00` : null,
  }
}

/** Il task ha un orario vero e proprio: un'ora d'inizio, o un inizio in un altro giorno. */
export function haOrario(p: Periodo): boolean {
  return p.dataInizio != null && (p.inizioOra != null || (p.scadenza != null && p.dataInizio !== p.scadenza))
}

/** Testo della chip «Orario»: «Gio 14 nov · 10:00–11:30», «Lun 10 → ven 14 nov»; null senza un orario. */
export function riassuntoPeriodo(p: Periodo, oggi = new Date()): string | null {
  if (!haOrario(p) || !p.dataInizio) return null
  const da = p.dataInizio
  const a = p.scadenza ?? da
  const daOra = hhmm(p.inizioOra)
  const aOra = hhmm(p.scadenzaOra)
  const g = (d: string) => giornoBreve(d, oggi)
  if (daOra) {
    if (da === a) return maiuscola(`${g(da)} · ${daOra}${aOra ? `–${aOra}` : ''}`)
    return maiuscola(`${g(da)} ${daOra} → ${g(a)}${aOra ? ` ${aOra}` : ''}`)
  }
  return maiuscola(`${g(da)} → ${g(a)}${aOra ? ` ${aOra}` : ''}`)
}

const stessoGiorno = (p: Periodo) => p.dataInizio == null || p.dataInizio === p.scadenza

/** Ora a cui il task sta nel giorno della scadenza: l'ora d'inizio se comincia quel giorno, altrimenti l'ora di scadenza. */
export function oraNelGiorno(p: Periodo): string | null {
  return stessoGiorno(p) && p.dataInizio && p.inizioOra ? p.inizioOra : p.scadenzaOra
}

/** Etichetta corta dell'ora sulle chip del calendario: «10:00–11:30», «15:00». */
export function etichettaOra(p: Periodo): string | null {
  const ora = hhmm(oraNelGiorno(p))
  if (!ora) return null
  const fine = hhmm(p.scadenzaOra)
  return stessoGiorno(p) && p.dataInizio && p.inizioOra && fine ? `${ora}–${fine}` : ora
}

/**
 * Task trascinato nel calendario su un giorno (ora undefined: tiene gli orari), sulla riga «Senza orario» (ora null)
 * o su un'ora: tutto l'orario si sposta insieme e la durata resta.
 */
export function spostaPeriodo(p: Periodo, giornoNuovo: string, ora: string | null | undefined): Periodo {
  const delta = p.scadenza ? differenceInCalendarDays(giorno(giornoNuovo), giorno(p.scadenza)) : 0
  const inizioSpostato = p.dataInizio ? iso(addDays(giorno(p.dataInizio), delta)) : null
  if (ora === undefined) return { ...p, dataInizio: inizioSpostato, scadenza: giornoNuovo }
  if (ora === null) {
    return { dataInizio: stessoGiorno(p) ? null : inizioSpostato, inizioOra: null, scadenza: giornoNuovo, scadenzaOra: null }
  }
  const b = bozzaDa(p, giornoNuovo)
  const minuti = minutiBozza(b)
  if (stessoGiorno(p) && p.inizioOra && minuti != null && minuti > 0) {
    const fine = addMinutes(momento(giornoNuovo, ora.slice(0, 5)), minuti)
    return { dataInizio: giornoNuovo, inizioOra: `${ora.slice(0, 5)}:00`, scadenza: iso(fine), scadenzaOra: `${format(fine, 'HH:mm')}:00` }
  }
  const inizioOra = inizioSpostato === giornoNuovo && p.inizioOra && p.inizioOra >= ora ? null : p.inizioOra
  return { dataInizio: inizioSpostato, inizioOra: inizioSpostato ? inizioOra : null, scadenza: giornoNuovo, scadenzaOra: ora }
}
