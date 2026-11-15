import { differenceInCalendarDays } from 'date-fns'
import type { TaskRiga } from '@/services/task-service'

/** Intervallo in giorni (indici dal primo giorno del Gantt), estremi compresi. */
export interface Span { s: number; f: number }

const giorno = (iso: string | null, base: Date): number | null => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null
  return m ? differenceInCalendarDays(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), base) : null
}

/** Le date del task come giorni da `base`: inizio → scadenza, solo scadenza (traguardo) o solo inizio; null se non è pianificato. */
export function spanDi(r: Pick<TaskRiga, 'dataInizio' | 'scadenza'>, base: Date): Span | null {
  const s = giorno(r.dataInizio, base)
  const f = giorno(r.scadenza, base)
  if (s != null && f != null) return { s: Math.min(s, f), f }
  if (f != null) return { s: f, f }
  if (s != null) return { s, f: s }
  return null
}

/**
 * Dipendenze fine → inizio: chi aspetta parte il giorno dopo la fine di chi è aspettato. Partendo dai task spostati
 * (`partenza`), o rimettendo in fila quelli in `coda`, i successori che partirebbero troppo presto scorrono avanti
 * con la loro durata. Non tira mai indietro nessuno; quelli non `spostabili` restano dove sono (e restano in conflitto).
 * Restituisce le nuove date di tutti i task toccati, partenza compresa.
 */
export function cascata(
  partenza: Map<number, Span>,
  spans: Map<number, Span>,
  successori: Map<number, number[]>,
  spostabile: (id: number) => boolean,
  coda: number[] = [...partenza.keys()],
): Map<number, Span> {
  const out = new Map(partenza)
  const daFare = [...coda]
  let giri = 0
  while (daFare.length && giri++ < 20_000) {
    const id = daFare.shift()!
    const p = out.get(id) ?? spans.get(id)
    if (!p) continue
    for (const sId of successori.get(id) ?? []) {
      const sp = out.get(sId) ?? spans.get(sId)
      if (!sp || !spostabile(sId)) continue
      if (sp.s <= p.f) {
        const d = p.f + 1 - sp.s
        out.set(sId, { s: sp.s + d, f: sp.f + d })
        daFare.push(sId)
      }
    }
  }
  return out
}

/**
 * La catena che decide quando si finisce: dai task aperti che finiscono per ultimi, all'indietro, i predecessori che
 * finiscono a ridosso (o dopo) l'inizio del successivo. Ritardarne uno sposta la fine di tutto.
 */
export function catenaCritica(spans: Map<number, Span>, predecessori: Map<number, number[]>, aperto: (id: number) => boolean): Set<number> {
  const out = new Set<number>()
  const aperti = [...spans].filter(([id]) => aperto(id))
  if (!aperti.length) return out
  const fine = Math.max(...aperti.map(([, sp]) => sp.f))
  const coda = aperti.filter(([, sp]) => sp.f === fine).map(([id]) => id)
  while (coda.length) {
    const id = coda.shift()!
    if (out.has(id)) continue
    out.add(id)
    const sp = spans.get(id)
    for (const p of predecessori.get(id) ?? []) {
      const pp = spans.get(p)
      if (sp && pp && aperto(p) && pp.f + 1 >= sp.s) coda.push(p)
    }
  }
  return out
}
