/*
  Stima di durata dei task, in minuti (campo `stimaMinuti`). Si scrive come si dice: «30m», «1h», «1h30»,
  «1,5h», «2 ore», «90» (minuti). Massimo 1000 ore, come nel backend.
*/

export const STIMA_MAX_MINUTI = 60_000

/** Scelte rapide del selettore. */
export const STIME_RAPIDE = [15, 30, 45, 60, 90, 120, 180, 240, 480]

/** «45 min», «2 h», «1 h 30» */
export function formatStima(minuti: number | null | undefined): string {
  if (minuti == null || minuti <= 0) return ''
  const h = Math.floor(minuti / 60)
  const m = minuti % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m}`
}

/** Dal testo ai minuti; null se non si capisce o è fuori dai limiti. */
export function parseStima(testo: string): number | null {
  const t = testo.trim().toLowerCase().replace(',', '.').replace(/\s+/g, '')
  if (!t) return null
  let minuti: number | null = null
  const solo = /^(\d+(?:\.\d+)?)$/.exec(t)
  const ore = /^(\d+(?:\.\d+)?)(?:h|ore|ora|o)(?:(\d{1,2})(?:m|min|minuti)?)?$/.exec(t)
  const min = /^(\d+)(?:m|min|minuti|')$/.exec(t)
  if (solo) minuti = Number(solo[1])
  else if (ore) minuti = Math.round(Number(ore[1]) * 60) + (ore[2] ? Number(ore[2]) : 0)
  else if (min) minuti = Number(min[1])
  if (minuti == null || !Number.isFinite(minuti)) return null
  minuti = Math.round(minuti)
  return minuti > 0 && minuti <= STIMA_MAX_MINUTI ? minuti : null
}

/** Somma delle stime di un gruppo di task (null se nessuno è stimato). */
export function totaleStime(righe: { stimaMinuti?: number | null }[]): number | null {
  const stimati = righe.filter((r) => r.stimaMinuti != null && r.stimaMinuti > 0)
  return stimati.length ? stimati.reduce((s, r) => s + (r.stimaMinuti ?? 0), 0) : null
}
