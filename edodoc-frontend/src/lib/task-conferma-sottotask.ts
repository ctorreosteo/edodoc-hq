import type { AggiornaTaskValori } from '@/services/task-service'

/*
  Conferma «completa anche i sottotask»: la finestra è TaskConfermaSottotaskHost (montata in App.tsx),
  qui il modo di aprirla da qualsiasi punto (lista, kanban, dettaglio, azioni multiple, documenti).
*/

export type RichiestaConfermaSottotask = { titolo: string; aperti: number; principali: number; rispondi: (si: boolean) => void }

let apri: ((r: RichiestaConfermaSottotask) => void) | null = null

/** La finestra si registra al montaggio; restituisce la funzione che la toglie. */
export function registraConfermaSottotask(fn: (r: RichiestaConfermaSottotask) => void): () => void {
  apri = fn
  return () => {
    if (apri === fn) apri = null
  }
}

/** Chiede se completare anche i sottotask aperti. Senza la finestra montata non blocca (risponde sì). */
export function chiediCompletaSottotask(titolo: string, aperti: number, principali = 1): Promise<boolean> {
  if (!apri) return Promise.resolve(true)
  const mostra = apri
  return new Promise((rispondi) => mostra({ titolo, aperti, principali, rispondi }))
}

/**
 * Valori da salvare per un task: se lo si completa e ha sottotask aperti, dopo la conferma aggiunge
 * `completaSottotask`; null = annullato dall'utente (non salvare niente).
 */
export async function valoriCompletamento(
  valori: AggiornaTaskValori,
  task: { titolo: string; parentId: number | null; sottotaskAperti?: number } | null | undefined,
): Promise<AggiornaTaskValori | null> {
  const aperti = task?.sottotaskAperti ?? 0
  if (valori.stato !== 'COMPLETATO' || !task || task.parentId != null || aperti <= 0) return valori
  return (await chiediCompletaSottotask(task.titolo, aperti)) ? { ...valori, completaSottotask: true } : null
}

