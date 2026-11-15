import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '@/lib/toast'
import { sessione } from '@/services/api-client'
import { taskService, type TaskColonnaScelta, type TaskDisposizioneColonne } from '@/services/task-service'
import { pulisciScelte, sceltePredefinite } from '@/lib/task-colonne'

/**
 * Colonne della vista lista scelte dall'utente, salvate nel backend: una disposizione predefinita, che vale
 * ovunque, e quelle su misura delle singole liste. Le modifiche si vedono subito e si salvano poco dopo
 * (un trascinamento della larghezza non fa cento richieste).
 */

const PREDEFINITA = 'predefinita'
const RITARDO_SALVATAGGIO = 600
const DI_PARTENZA = sceltePredefinite()

let cache: Map<string, TaskColonnaScelta[]> | null = null
let cacheUtente: string | null = null
let inFlight: Promise<Map<string, TaskColonnaScelta[]>> | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

const utenteCorrente = () => sessione.token()

function carica(): Promise<Map<string, TaskColonnaScelta[]>> {
  const utente = utenteCorrente()
  if (cache && cacheUtente === utente) return Promise.resolve(cache)
  if (inFlight) return inFlight
  const p = taskService.getColonne().then(
    (elenco: TaskDisposizioneColonne[]) => {
      inFlight = null
      cache = new Map(elenco.map((d) => [d.contesto, pulisciScelte(d.colonne)]))
      cacheUtente = utente
      notify()
      return cache
    },
    (e) => {
      inFlight = null
      throw e
    },
  )
  inFlight = p
  return p
}

const contestoLista = (listaId: number) => `lista:${listaId}`

const stesse = (a: TaskColonnaScelta[], b: TaskColonnaScelta[]) =>
  a.length === b.length && a.every((c, i) => c.id === b[i].id && (c.larghezza ?? null) === (b[i].larghezza ?? null))

export interface TaskColonneStato {
  /** Colonne visibili dopo il titolo, nell'ordine */
  colonne: TaskColonnaScelta[]
  caricate: boolean
  /** Si sta lavorando su una lista (si può avere una disposizione su misura) */
  inLista: boolean
  /** La lista ha una disposizione sua */
  suMisura: boolean
  /** Vale la disposizione di partenza del gestionale (niente da ripristinare) */
  originali: boolean
  imposta: (colonne: TaskColonnaScelta[]) => void
  mostra: (id: string, dopo?: string | null) => void
  nascondi: (id: string) => void
  sposta: (id: string, verso: -1 | 1) => void
  ridimensiona: (id: string, larghezza: number | null) => void
  /** Accende o spegne la disposizione su misura della lista (spenta: torna a valere la predefinita) */
  impostaSuMisura: (attiva: boolean) => void
  ripristina: () => void
}

export function useTaskColonne(listaId: number | null): TaskColonneStato {
  const [, setVersione] = useState(0)
  const [caricate, setCaricate] = useState(cache != null && cacheUtente === utenteCorrente())
  const timer = useRef<number | null>(null)
  const daSalvare = useRef<{ contesto: string; colonne: TaskColonnaScelta[] } | null>(null)

  useEffect(() => {
    const l = () => setVersione((v) => v + 1)
    listeners.add(l)
    carica().then(() => setCaricate(true), () => setCaricate(true))
    return () => {
      listeners.delete(l)
    }
  }, [])

  const salvaOra = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = null
    const s = daSalvare.current
    daSalvare.current = null
    if (!s) return
    taskService.salvaColonne(s.contesto, s.colonne).catch((e) => {
      toast.error(e instanceof Error ? e.message : 'Colonne non salvate', { description: 'Le vedi così finché non ricarichi la pagina' })
    })
  }, [])

  // Uscendo dalla pagina (o cambiando lista) non si perde l'ultima modifica
  useEffect(() => () => salvaOra(), [salvaOra, listaId])

  const contestoProprio = listaId != null ? contestoLista(listaId) : null
  const suMisura = contestoProprio != null && !!cache?.has(contestoProprio)
  const contestoAttivo = suMisura && contestoProprio ? contestoProprio : PREDEFINITA
  // La cache sta fuori da React (condivisa fra le pagine): ogni sua modifica fa ridisegnare con `notify`
  const colonne = cache?.get(contestoAttivo) ?? cache?.get(PREDEFINITA) ?? DI_PARTENZA

  const scrivi = useCallback((contesto: string, nuove: TaskColonnaScelta[]) => {
    if (!cache) cache = new Map()
    cache.set(contesto, nuove)
    notify()
    if (daSalvare.current && daSalvare.current.contesto !== contesto) salvaOra()
    daSalvare.current = { contesto, colonne: nuove }
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(salvaOra, RITARDO_SALVATAGGIO)
  }, [salvaOra])

  const imposta = useCallback((nuove: TaskColonnaScelta[]) => scrivi(contestoAttivo, pulisciScelte(nuove)), [scrivi, contestoAttivo])

  const mostra = useCallback((id: string, dopo?: string | null) => {
    if (colonne.some((c) => c.id === id)) return
    const i = dopo ? colonne.findIndex((c) => c.id === dopo) : -1
    const nuove = [...colonne]
    nuove.splice(i >= 0 ? i + 1 : nuove.length, 0, { id, larghezza: null })
    imposta(nuove)
  }, [colonne, imposta])

  const nascondi = useCallback((id: string) => imposta(colonne.filter((c) => c.id !== id)), [colonne, imposta])

  const sposta = useCallback((id: string, verso: -1 | 1) => {
    const i = colonne.findIndex((c) => c.id === id)
    const j = i + verso
    if (i < 0 || j < 0 || j >= colonne.length) return
    const nuove = [...colonne]
    ;[nuove[i], nuove[j]] = [nuove[j], nuove[i]]
    imposta(nuove)
  }, [colonne, imposta])

  const ridimensiona = useCallback((id: string, larghezza: number | null) =>
    imposta(colonne.map((c) => (c.id === id ? { ...c, larghezza: larghezza == null ? null : Math.round(larghezza) } : c))),
  [colonne, imposta])

  const impostaSuMisura = useCallback((attiva: boolean) => {
    if (!contestoProprio) return
    if (attiva) {
      scrivi(contestoProprio, [...colonne])
      return
    }
    if (daSalvare.current?.contesto === contestoProprio) {
      if (timer.current != null) window.clearTimeout(timer.current)
      daSalvare.current = null
    }
    cache?.delete(contestoProprio)
    notify()
    taskService.ripristinaColonne(contestoProprio).catch(() => toast.error('Non sono riuscito a togliere le colonne su misura'))
  }, [contestoProprio, colonne, scrivi])

  // Su misura: la lista resta sua, con le colonne di partenza. Predefinita: si torna a quelle del gestionale.
  const ripristina = useCallback(() => {
    if (suMisura) {
      scrivi(contestoAttivo, DI_PARTENZA)
      return
    }
    if (daSalvare.current?.contesto === contestoAttivo) {
      if (timer.current != null) window.clearTimeout(timer.current)
      daSalvare.current = null
    }
    cache?.delete(contestoAttivo)
    notify()
    taskService.ripristinaColonne(contestoAttivo).catch(() => toast.error('Colonne non ripristinate'))
  }, [contestoAttivo, suMisura, scrivi])

  return {
    colonne,
    caricate,
    inLista: contestoProprio != null,
    suMisura,
    originali: stesse(colonne, DI_PARTENZA),
    imposta, mostra, nascondi, sposta, ridimensiona, impostaSuMisura, ripristina,
  }
}
