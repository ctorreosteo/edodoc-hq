import { etichettaPercorso } from '@/lib/task-struttura'
import type { TaskConfig, TaskLista } from '@/services/task-service'

export interface GruppoListe {
  titolo: string
  liste: TaskLista[]
}

/** Liste utilizzabili (non archiviate) raggruppate per percorso di cartella. */
export function gruppiListe(config: TaskConfig): GruppoListe[] {
  const mappa = new Map<string, TaskLista[]>()
  for (const l of config.liste) {
    if (l.archiviata) continue
    const titolo = etichettaPercorso(config, l)
    mappa.set(titolo, [...(mappa.get(titolo) ?? []), l])
  }
  // Prima le liste alla radice, poi le cartelle in ordine alfabetico
  return [...mappa.entries()]
    .sort(([a], [b]) => {
      if (a === b) return 0
      if (!a) return -1
      if (!b) return 1
      return a.localeCompare(b, 'it')
    })
    .map(([titolo, liste]) => ({ titolo, liste }))
}

/** Liste in cui si possono creare o spostare task. */
export const listeUtilizzabili = (config: TaskConfig | null) => (config?.liste ?? []).filter((l) => !l.archiviata)

