import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { sessione } from '@/services/api-client'
import { taskService, type TaskConfig } from '@/services/task-service'

/**
 * Config dei task (cartelle, liste, etichette) condivisa da tutti i componenti:
 * una sola richiesta per utente, finché qualcuno non chiama invalidateTaskConfig().
 * La cache appartiene all'utente che l'ha caricata: se nella stessa scheda entra un altro utente si ricarica.
 */

let cache: TaskConfig | null = null
let cacheUtente: string | null = null
let inFlight: Promise<TaskConfig> | null = null
const listeners = new Set<(config: TaskConfig | null) => void>()

const notify = () => listeners.forEach((l) => l(cache))

/** La sessione identifica chi ha caricato la cache. */
const utenteCorrente = (): string | null => sessione.token()

/** Scarta la cache se è di un altro utente (logout + login nella stessa scheda). */
const verificaUtente = () => {
  const u = utenteCorrente()
  if (cache && cacheUtente !== u) {
    cache = null
    inFlight = null
    notify()
  }
}

const fetchConfig = (force = false): Promise<TaskConfig> => {
  verificaUtente()
  if (cache && !force) return Promise.resolve(cache)
  if (inFlight && !force) return inFlight
  const utente = utenteCorrente()
  const p = taskService.getConfig().then(
    (config) => {
      if (inFlight === p) inFlight = null
      if (utente !== utenteCorrente()) return config
      cache = config
      cacheUtente = utente
      notify()
      return config
    },
    (error) => {
      if (inFlight === p) inFlight = null
      throw error
    },
  )
  inFlight = p
  return p
}

/** Ricarica la config per tutti i componenti montati (es. dopo aver creato una lista o un'etichetta). */
export function invalidateTaskConfig(): Promise<void> {
  return fetchConfig(true).then(
    () => undefined,
    () => undefined,
  )
}

export function useTaskConfig(): {
  config: TaskConfig | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
} {
  const { utente } = useAuth()
  const utenteId = utente?.id ?? null
  const [config, setConfig] = useState<TaskConfig | null>(() => (cacheUtente === utenteCorrente() ? cache : null))
  const [loading, setLoading] = useState(!config)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    verificaUtente()
    const listener = (c: TaskConfig | null) => setConfig(c)
    listeners.add(listener)
    let cancelled = false
    setConfig(cache)
    if (!cache && utenteId != null) {
      setLoading(true)
      fetchConfig()
        .then((c) => {
          if (!cancelled) {
            setConfig(c)
            setError(null)
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Errore nel caricamento dei task')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }
    return () => {
      cancelled = true
      listeners.delete(listener)
    }
  }, [utenteId])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      await fetchConfig(true)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nel caricamento dei task')
    } finally {
      setLoading(false)
    }
  }, [])

  return { config, loading, error, reload }
}
