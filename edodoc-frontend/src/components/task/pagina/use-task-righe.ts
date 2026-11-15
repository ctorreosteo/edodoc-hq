import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '@/lib/toast'
import { emitTaskChanged, useTaskChanged } from '@/hooks/use-task-cambi'
import {
  taskService,
  type AggiornaTaskValori,
  type TaskConfig,
  type TaskFiltri,
  type TaskRiga,
} from '@/services/task-service'
import { applicaLocale, messaggioErrore } from './task-pagina-utils'
import { valoriCompletamento } from '@/lib/task-conferma-sottotask'

/** Per quanto un evento "task cambiato" emesso da questo elenco non deve farlo ricaricare. */
const FINESTRA_PROPRIA_MS = 2000

/** Le due chiavi di filtri guardano una lista, una cartella o una vista diverse? */
function altroAmbito(prima: string | null, dopo: string): boolean {
  if (!prima) return false
  const a = JSON.parse(prima) as TaskFiltri
  const b = JSON.parse(dopo) as TaskFiltri
  return a.listaId !== b.listaId || a.cartellaId !== b.cartellaId
}

/**
 * Elenco task per i filtri dati, ricaricato senza sfarfallii quando arrivano novità
 * (modifiche fatte altrove nel gestionale). Le modifiche fatte da qui aggiornano la riga
 * con la risposta del server e non provocano un nuovo caricamento. `filtri` null = non caricare.
 */
export function useTaskRighe(filtri: TaskFiltri | null, config: TaskConfig | null) {
  const [righe, setRighe] = useState<TaskRiga[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const chiave = filtri ? JSON.stringify(filtri) : null
  const chiaveCaricata = useRef<string | null>(null)
  /** I filtri di adesso: una risposta arrivata per filtri vecchi (es. la lista di prima) si scarta */
  const chiaveAttuale = useRef(chiave)
  chiaveAttuale.current = chiave
  const abort = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const configRef = useRef(config)
  configRef.current = config
  const righeRef = useRef(righe)
  righeRef.current = righe
  /** taskId → istante dell'ultima modifica fatta da questo elenco */
  const proprie = useRef(new Map<number, number>())

  const carica = useCallback(async () => {
    if (!chiave) {
      setRighe([])
      setLoading(false)
      return
    }
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    // Skeleton solo al primo caricamento di questi filtri: i refresh avvengono "sotto".
    // Cambiando lista, cartella o vista le righe di prima spariscono subito (una lista nuova parte vuota);
    // cambiando solo ricerca o filtri restano finché non arrivano le nuove, senza sfarfallii
    if (chiaveCaricata.current !== chiave) {
      setLoading(true)
      if (altroAmbito(chiaveCaricata.current, chiave)) setRighe([])
    }
    try {
      const data = await taskService.getTask(JSON.parse(chiave) as TaskFiltri)
      if (ctrl.signal.aborted || chiaveAttuale.current !== chiave) return
      setRighe(data)
      setError(null)
      chiaveCaricata.current = chiave
    } catch (e) {
      if (ctrl.signal.aborted) return
      setError(messaggioErrore(e, 'Impossibile caricare i task'))
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [chiave])

  useEffect(() => {
    void carica()
    return () => abort.current?.abort()
  }, [carica])

  // Il ricaricamento ritardato usa i filtri del momento in cui parte, non quelli di quando è stato chiesto:
  // creando una lista, l'avviso "task cambiato" arriva prima che la pagina passi alla lista nuova
  const caricaRef = useRef(carica)
  caricaRef.current = carica
  const ricaricaPresto = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void caricaRef.current(), 400)
  }, [])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  useTaskChanged((taskId) => {
    const quando = taskId != null ? proprie.current.get(taskId) : undefined
    if (quando && Date.now() - quando < FINESTRA_PROPRIA_MS) return
    ricaricaPresto()
  })

  const segnaPropria = (id: number) => proprie.current.set(id, Date.now())

  /**
   * Aggiornamento ottimistico; in caso di errore ricarica dal server. Restituisce la riga salvata (null se errore
   * o se l'utente annulla). Completando un task con sottotask aperti chiede prima se completare anche quelli.
   */
  const aggiornaRiga = useCallback(async (id: number, valoriRichiesti: AggiornaTaskValori): Promise<TaskRiga | null> => {
    const valori = await valoriCompletamento(valoriRichiesti, righeRef.current.find((r) => r.id === id))
    if (!valori) return null
    setRighe((prev) => prev.map((r) => (r.id === id ? applicaLocale(r, valori, configRef.current) : r)))
    try {
      const det = await taskService.aggiorna(id, valori)
      setRighe((prev) => prev.map((r) => (r.id === id ? det.task : r)))
      segnaPropria(id)
      emitTaskChanged(id)
      // Completati anche i sottotask: le loro righe si rileggono dal server
      if (valori.completaSottotask) void carica()
      return det.task
    } catch (e) {
      // Niente snapshot: altre modifiche nel frattempo potrebbero essere già salvate
      void carica()
      toast.error(messaggioErrore(e, 'Modifica non salvata'))
      return null
    }
  }, [carica])

  const sostituisciRiga = useCallback((riga: TaskRiga) => {
    setRighe((prev) => (prev.some((r) => r.id === riga.id) ? prev.map((r) => (r.id === riga.id ? riga : r)) : prev))
  }, [])

  const rimuoviRiga = useCallback((id: number) => setRighe((prev) => prev.filter((r) => r.id !== id)), [])

  /** Aggiunge una riga creata da qui (senza ricaricare l'elenco). */
  const aggiungiRiga = useCallback((riga: TaskRiga) => {
    segnaPropria(riga.id)
    setRighe((prev) => [riga, ...prev.filter((r) => r.id !== riga.id)])
  }, [])

  return { righe, setRighe, loading, error, ricarica: carica, aggiornaRiga, sostituisciRiga, rimuoviRiga, aggiungiRiga }
}
