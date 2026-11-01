import type { TaskCartella, TaskLista, TaskStruttura } from "@/types"

export type NodoCartella = { cartella: TaskCartella; figli: NodoCartella[]; liste: TaskLista[] }

export type AlberoTask = {
  radiceCartelle: NodoCartella[]
  radiceListe: TaskLista[]
  archiviateCartelle: TaskCartella[]
  archiviateListe: TaskLista[]
}

const perOrdine = <T extends { ordine: number; nome: string }>(a: T, b: T) =>
  a.ordine - b.ordine || a.nome.localeCompare(b.nome, "it", { sensitivity: "base" })

/** Una cartella archiviata nasconde tutto quello che contiene: si ripristina dalla sezione "Archiviate". */
function cartellaNascosta(struttura: TaskStruttura, id: number): boolean {
  return percorsoCartella(struttura, id).some((c) => c.archiviata)
}

export function costruisciAlbero(struttura: TaskStruttura): AlberoTask {
  const nodi = new Map<number, NodoCartella>()
  struttura.cartelle.forEach((c) => {
    if (!cartellaNascosta(struttura, c.id)) nodi.set(c.id, { cartella: c, figli: [], liste: [] })
  })

  const radiceCartelle: NodoCartella[] = []
  nodi.forEach((n) => {
    const p = n.cartella.parentId
    if (p == null) radiceCartelle.push(n)
    else nodi.get(p)?.figli.push(n)
  })

  const radiceListe: TaskLista[] = []
  struttura.liste.forEach((l) => {
    if (l.archiviata) return
    if (l.cartellaId == null) radiceListe.push(l)
    else nodi.get(l.cartellaId)?.liste.push(l)
  })

  const ordinaNodo = (n: NodoCartella) => {
    n.figli.sort((a, b) => perOrdine(a.cartella, b.cartella))
    n.liste.sort(perOrdine)
    n.figli.forEach(ordinaNodo)
  }
  radiceCartelle.sort((a, b) => perOrdine(a.cartella, b.cartella))
  radiceCartelle.forEach(ordinaNodo)
  radiceListe.sort(perOrdine)

  return {
    radiceCartelle,
    radiceListe,
    archiviateCartelle: struttura.cartelle.filter((c) => c.archiviata).sort(perOrdine),
    archiviateListe: struttura.liste.filter((l) => l.archiviata).sort(perOrdine),
  }
}

/** Cartelle dalla radice a quella indicata (compresa). */
export function percorsoCartella(struttura: TaskStruttura, cartellaId: number | null): TaskCartella[] {
  const perId = new Map(struttura.cartelle.map((c) => [c.id, c]))
  const out: TaskCartella[] = []
  let id = cartellaId
  while (id != null) {
    const c = perId.get(id)
    if (!c) break
    out.unshift(c)
    id = c.parentId
  }
  return out
}

/** La cartella e tutte le sue sottocartelle. */
export function discendenti(struttura: TaskStruttura, cartellaId: number): Set<number> {
  const out = new Set<number>()
  const coda = [cartellaId]
  while (coda.length) {
    const id = coda.pop()!
    if (out.has(id)) continue
    out.add(id)
    coda.push(...struttura.cartelle.filter((c) => c.parentId === id).map((c) => c.id))
  }
  return out
}

/** Liste non archiviate contenute nella cartella, sottocartelle comprese. */
export function listeDellaCartella(struttura: TaskStruttura, cartellaId: number): TaskLista[] {
  const cartelle = discendenti(struttura, cartellaId)
  return struttura.liste.filter((l) => !l.archiviata && l.cartellaId != null && cartelle.has(l.cartellaId))
}

export function cartellaVuota(struttura: TaskStruttura, cartellaId: number): boolean {
  return !struttura.cartelle.some((c) => c.parentId === cartellaId) && !struttura.liste.some((l) => l.cartellaId === cartellaId)
}

const nomePercorso = (struttura: TaskStruttura, cartellaId: number | null) =>
  percorsoCartella(struttura, cartellaId).map((c) => c.nome).join(" / ")

/** Le liste in cui si possono mettere task, nell'ordine dell'albero: chiave "lista:ID", testo "Cartella / Lista". */
export function opzioniListe(struttura: TaskStruttura): Record<string, string> {
  const { radiceCartelle, radiceListe } = costruisciAlbero(struttura)
  const out: Record<string, string> = {}
  const visita = (n: NodoCartella) => {
    n.liste.forEach((l) => { out[`lista:${l.id}`] = `${nomePercorso(struttura, l.cartellaId)} / ${l.nome}` })
    n.figli.forEach(visita)
  }
  radiceCartelle.forEach(visita)
  radiceListe.forEach((l) => { out[`lista:${l.id}`] = l.nome })
  return out
}

/** Dove si può mettere una lista o una cartella: chiave "cartella:ID" o "radice". */
export function opzioniContenitori(struttura: TaskStruttura, escludiId?: number): Record<string, string> {
  const esclusi = escludiId != null ? discendenti(struttura, escludiId) : new Set<number>()
  const out: Record<string, string> = { radice: "Radice (nessuna cartella)" }
  const visita = (n: NodoCartella) => {
    if (esclusi.has(n.cartella.id)) return
    out[`cartella:${n.cartella.id}`] = nomePercorso(struttura, n.cartella.id)
    n.figli.forEach(visita)
  }
  costruisciAlbero(struttura).radiceCartelle.forEach(visita)
  return out
}

/** Selezione della pagina e chiavi delle tendine: "miei", "tutti", "lista:ID", "cartella:ID". */
const idDa = (prefisso: string, s: string | null) => {
  if (!s?.startsWith(prefisso)) return null
  const id = Number(s.slice(prefisso.length))
  return Number.isInteger(id) ? id : null
}
export const listaDaSelezione = (s: string | null) => idDa("lista:", s)
export const cartellaDaSelezione = (s: string | null) => idDa("cartella:", s)
export const chiaveContenitore = (id: number | null) => (id == null ? "radice" : `cartella:${id}`)

/** Dove finisce un task quando non si è dentro una lista precisa. */
export const listaPredefinita = (struttura: TaskStruttura) => struttura.liste.find((l) => l.codice === "GENERALE")
