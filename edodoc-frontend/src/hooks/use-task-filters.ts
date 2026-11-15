import { useCallback, useEffect, useState } from 'react'
import {
  FILTRI_VUOTI,
  type TaskFiltriPagina,
  type TaskOrdinamento,
  type TaskVistaPagina,
} from '@/components/task/pagina/task-pagina-utils'

/**
 * Preferenze della pagina Task per utente, in localStorage `task-filters`:
 * { [utenteId]: { lista, vista, ordinamento, filtri } }. La ricerca testuale non si salva.
 */
const STORAGE_KEY = 'task-filters'

export interface TaskPreferenze {
  /** 'miei' | 'tutti' | id lista | 'cartella:ID', come nel parametro ?lista= */
  lista: string
  vista: TaskVistaPagina
  ordinamento: TaskOrdinamento
  filtri: TaskFiltriPagina
}

const DEFAULT: TaskPreferenze = {
  lista: 'miei',
  vista: 'lista',
  ordinamento: { campo: 'scadenza', dir: 'asc' },
  filtri: FILTRI_VUOTI,
}

const VISTE = new Set<TaskVistaPagina>(['lista', 'kanban', 'calendario', 'gantt'])

function leggiTutto(): Record<string, Partial<TaskPreferenze>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function leggi(utenteId: number | null | undefined): TaskPreferenze {
  if (utenteId == null) return DEFAULT
  const p = leggiTutto()[String(utenteId)]
  if (!p) return DEFAULT
  return {
    lista: typeof p.lista === 'string' && p.lista ? p.lista : DEFAULT.lista,
    vista: p.vista && VISTE.has(p.vista) ? p.vista : DEFAULT.vista,
    ordinamento: p.ordinamento?.campo ? p.ordinamento : DEFAULT.ordinamento,
    filtri: { ...FILTRI_VUOTI, ...(p.filtri ?? {}), q: '', stati: Array.isArray(p.filtri?.stati) ? p.filtri.stati : [] },
  }
}

export function useTaskFilters(utenteId: number | null | undefined) {
  const [stato, setStato] = useState(() => ({ utenteId, pref: leggi(utenteId) }))
  // Cambio utente (logout/login senza ricaricare): si riparte dalle sue preferenze
  if (stato.utenteId !== utenteId) setStato({ utenteId, pref: leggi(utenteId) })
  const pref = stato.utenteId === utenteId ? stato.pref : leggi(utenteId)
  const setPref = useCallback(
    (fn: (p: TaskPreferenze) => TaskPreferenze) => setStato((s) => ({ ...s, pref: fn(s.pref) })),
    [],
  )

  useEffect(() => {
    if (utenteId == null || stato.utenteId !== utenteId) return
    try {
      const tutto = leggiTutto()
      tutto[String(utenteId)] = { ...pref, filtri: { ...pref.filtri, q: '' } }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tutto))
    } catch {
      // storage non disponibile: le preferenze valgono solo per questa sessione
    }
  }, [pref, utenteId, stato.utenteId])

  const aggiorna = useCallback((patch: Partial<TaskPreferenze>) => setPref((p) => ({ ...p, ...patch })), [setPref])
  const aggiornaFiltri = useCallback(
    (patch: Partial<TaskFiltriPagina>) => setPref((p) => ({ ...p, filtri: { ...p.filtri, ...patch } })),
    [setPref],
  )
  const resetFiltri = useCallback(() => setPref((p) => ({ ...p, filtri: { ...FILTRI_VUOTI, q: p.filtri.q } })), [setPref])

  return { pref, aggiorna, aggiornaFiltri, resetFiltri }
}
