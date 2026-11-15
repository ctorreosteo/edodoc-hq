import type { TaskCartella, TaskConfig, TaskLista } from '@/services/task-service'

export interface NodoCartella {
  cartella: TaskCartella
  figli: NodoCartella[]
  liste: TaskLista[]
}

export interface AlberoTask {
  /** Cartelle attive alla radice, con il loro contenuto */
  radiceCartelle: NodoCartella[]
  /** Liste attive alla radice */
  radiceListe: TaskLista[]
  /** Cartelle visibili la cui cartella che le contiene non è visibile ("condivise con me") */
  condiviseCartelle: NodoCartella[]
  /** Liste visibili la cui cartella non è visibile ("condivise con me") */
  condiviseListe: TaskLista[]
  /** Archiviate (arrivano solo a chi le gestisce): elenco piatto */
  archiviateCartelle: TaskCartella[]
  archiviateListe: TaskLista[]
}

const perOrdine = <T extends { ordine: number; nome: string }>(a: T, b: T) =>
  a.ordine - b.ordine || a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' })

/**
 * Albero della navigazione. Una cartella archiviata nasconde tutto quello che contiene
 * (si ripristina dalla sezione "Archiviate"); ciò che sta in una cartella non visibile finisce in "Condivisi con me".
 */
export function costruisciAlbero(config: TaskConfig): AlberoTask {
  const perId = new Map(config.cartelle.map((c) => [c.id, c]))
  // Una cartella è "nascosta" se lei o una cartella sopra (visibile) è archiviata
  const memo = new Map<number, boolean>()
  const nascosta = (id: number, visti = new Set<number>()): boolean => {
    const m = memo.get(id)
    if (m !== undefined) return m
    const c = perId.get(id)
    let r = false
    if (c) {
      if (c.archiviata) r = true
      else if (c.parentId != null && perId.has(c.parentId) && !visti.has(id)) {
        visti.add(id)
        r = nascosta(c.parentId, visti)
      }
    }
    memo.set(id, r)
    return r
  }

  const nodi = new Map<number, NodoCartella>()
  config.cartelle.forEach((c) => {
    if (!nascosta(c.id)) nodi.set(c.id, { cartella: c, figli: [], liste: [] })
  })

  const radiceCartelle: NodoCartella[] = []
  const condiviseCartelle: NodoCartella[] = []
  nodi.forEach((n) => {
    const p = n.cartella.parentId
    if (p == null) radiceCartelle.push(n)
    else if (nodi.has(p)) nodi.get(p)!.figli.push(n)
    else if (!perId.has(p)) condiviseCartelle.push(n)
  })

  const radiceListe: TaskLista[] = []
  const condiviseListe: TaskLista[] = []
  config.liste.forEach((l) => {
    if (l.archiviata) return
    if (l.cartellaId == null) radiceListe.push(l)
    else if (nodi.has(l.cartellaId)) nodi.get(l.cartellaId)!.liste.push(l)
    else if (!perId.has(l.cartellaId)) condiviseListe.push(l)
  })

  const ordinaNodo = (n: NodoCartella) => {
    n.figli.sort((a, b) => perOrdine(a.cartella, b.cartella))
    n.liste.sort(perOrdine)
    n.figli.forEach(ordinaNodo)
  }
  radiceCartelle.sort((a, b) => perOrdine(a.cartella, b.cartella))
  condiviseCartelle.sort((a, b) => perOrdine(a.cartella, b.cartella))
  radiceCartelle.forEach(ordinaNodo)
  condiviseCartelle.forEach(ordinaNodo)
  radiceListe.sort(perOrdine)
  condiviseListe.sort(perOrdine)

  return {
    radiceCartelle,
    radiceListe,
    condiviseCartelle,
    condiviseListe,
    archiviateCartelle: config.cartelle.filter((c) => c.archiviata).sort(perOrdine),
    archiviateListe: config.liste.filter((l) => l.archiviata).sort(perOrdine),
  }
}

/** Cartelle dalla radice a quella indicata (compresa); solo quelle visibili. */
export function percorsoCartella(config: TaskConfig, cartellaId: number | null): TaskCartella[] {
  const perId = new Map(config.cartelle.map((c) => [c.id, c]))
  const out: TaskCartella[] = []
  const visti = new Set<number>()
  let id = cartellaId
  while (id != null && !visti.has(id)) {
    visti.add(id)
    const c = perId.get(id)
    if (!c) break
    out.unshift(c)
    id = c.parentId
  }
  return out
}

/** "Spazio / Cartella" della lista (stringa vuota se è alla radice). */
export function etichettaPercorso(config: TaskConfig, lista: TaskLista): string {
  return percorsoCartella(config, lista.cartellaId).map((c) => c.nome).join(' / ')
}

/** La cartella e tutte le sue sottocartelle (visibili). */
export function discendenti(config: TaskConfig, cartellaId: number): Set<number> {
  const figli = new Map<number, number[]>()
  config.cartelle.forEach((c) => {
    if (c.parentId != null) figli.set(c.parentId, [...(figli.get(c.parentId) ?? []), c.id])
  })
  const out = new Set<number>()
  const coda = [cartellaId]
  while (coda.length) {
    const id = coda.pop()!
    if (out.has(id)) continue
    out.add(id)
    coda.push(...(figli.get(id) ?? []))
  }
  return out
}

/** Liste (non archiviate) contenute nella cartella, sottocartelle comprese. */
export function listeDellaCartella(config: TaskConfig, cartellaId: number): TaskLista[] {
  const cartelle = discendenti(config, cartellaId)
  return config.liste.filter((l) => !l.archiviata && l.cartellaId != null && cartelle.has(l.cartellaId))
}

/** La cartella contiene qualcosa (anche archiviato o non visibile a chi guarda, per quanto noto)? */
export function cartellaVuota(config: TaskConfig, cartellaId: number): boolean {
  return !config.cartelle.some((c) => c.parentId === cartellaId) && !config.liste.some((l) => l.cartellaId === cartellaId)
}
