import type { MailingBlocco, MailingDocumento } from '@/services/mailing-service'
import { clonaBlocco, trovaBlocco } from '@/lib/mailing-render'

/* Operazioni immutabili sul documento dell'editor (tutte restituiscono un documento nuovo). */

export type Destinazione = { indice: number } | { colonnaDi: string; colonna: number; indice: number }

function mappaBlocchi(doc: MailingDocumento, fn: (blocchi: MailingBlocco[], genitore: MailingBlocco | null, colonna: number) => MailingBlocco[]): MailingDocumento {
  const blocchi = fn(doc.blocchi, null, -1).map((b) =>
    b.colonne ? { ...b, colonne: b.colonne.map((col, c) => fn(col, b, c)) } : b,
  )
  return { ...doc, blocchi }
}

export function aggiornaProps(doc: MailingDocumento, id: string, patch: Record<string, unknown>): MailingDocumento {
  return mappaBlocchi(doc, (lista) => lista.map((b) => (b.id === id ? { ...b, props: { ...b.props, ...patch } } : b)))
}

export function sostituisciBlocco(doc: MailingDocumento, id: string, nuovo: MailingBlocco): MailingDocumento {
  return mappaBlocchi(doc, (lista) => lista.map((b) => (b.id === id ? nuovo : b)))
}

export function rimuoviBlocco(doc: MailingDocumento, id: string): MailingDocumento {
  return mappaBlocchi(doc, (lista) => lista.filter((b) => b.id !== id))
}

/** Duplica subito dopo l'originale; restituisce anche l'id della copia. */
export function duplicaBlocco(doc: MailingDocumento, id: string): { doc: MailingDocumento; id: string | null } {
  let nuovoId: string | null = null
  const nuovo = mappaBlocchi(doc, (lista) => {
    const i = lista.findIndex((b) => b.id === id)
    if (i === -1) return lista
    const copia = clonaBlocco(lista[i])
    nuovoId = copia.id
    return [...lista.slice(0, i + 1), copia, ...lista.slice(i + 1)]
  })
  return { doc: nuovo, id: nuovoId }
}

export function spostaBlocco(doc: MailingDocumento, id: string, delta: number): MailingDocumento {
  return mappaBlocchi(doc, (lista) => {
    const i = lista.findIndex((b) => b.id === id)
    if (i === -1) return lista
    const j = Math.max(0, Math.min(lista.length - 1, i + delta))
    if (i === j) return lista
    const copia = [...lista]
    const [b] = copia.splice(i, 1)
    copia.splice(j, 0, b)
    return copia
  })
}

export function riordinaRadice(doc: MailingDocumento, da: number, a: number): MailingDocumento {
  const copia = [...doc.blocchi]
  const [b] = copia.splice(da, 1)
  copia.splice(a, 0, b)
  return { ...doc, blocchi: copia }
}

export function inserisciBlocco(doc: MailingDocumento, blocco: MailingBlocco, dest: Destinazione): MailingDocumento {
  if ('colonnaDi' in dest) {
    return {
      ...doc,
      blocchi: doc.blocchi.map((b) => {
        if (b.id !== dest.colonnaDi || !b.colonne) return b
        const colonne = b.colonne.map((col, c) => (c === dest.colonna ? [...col.slice(0, dest.indice), blocco, ...col.slice(dest.indice)] : col))
        return { ...b, colonne }
      }),
    }
  }
  const i = Math.max(0, Math.min(doc.blocchi.length, dest.indice))
  return { ...doc, blocchi: [...doc.blocchi.slice(0, i), blocco, ...doc.blocchi.slice(i)] }
}

/** Dove aggiungere un blocco "con un click": dopo la selezione, altrimenti prima del piè di pagina. */
export function destinazioneClick(doc: MailingDocumento, selezione: string | null, annidabile: boolean): Destinazione {
  if (selezione) {
    const t = trovaBlocco(doc.blocchi, selezione)
    if (t?.genitore && annidabile) return { colonnaDi: t.genitore.id, colonna: t.colonna, indice: t.indice + 1 }
    if (t?.genitore) return { indice: doc.blocchi.findIndex((b) => b.id === t.genitore!.id) + 1 }
    if (t && t.blocco.tipo !== 'piedipagina') return { indice: t.indice + 1 }
  }
  const piede = doc.blocchi.findIndex((b) => b.tipo === 'piedipagina')
  return { indice: piede === -1 ? doc.blocchi.length : piede }
}

/** Elenco piatto in ordine di lettura (per la selezione con le frecce). */
export function ordineLettura(doc: MailingDocumento): string[] {
  const ids: string[] = []
  for (const b of doc.blocchi) {
    ids.push(b.id)
    b.colonne?.forEach((col) => col.forEach((f) => ids.push(f.id)))
  }
  return ids
}

export function contaBlocchi(doc: MailingDocumento): number {
  return ordineLettura(doc).length
}
