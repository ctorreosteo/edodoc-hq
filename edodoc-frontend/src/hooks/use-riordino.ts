import { useEffect, useState, type DragEvent } from "react"
import { toastErrore } from "@/lib/toast"

/**
 * Riordino con trascinamento (desktop) e frecce (tastiera e telefono). Il nuovo ordine si vede subito;
 * se il salvataggio fallisce la lista torna com'era.
 */
export function useRiordino<T extends { id: number }>(elementi: T[], salva: (ids: number[]) => Promise<void>) {
  const [ordine, setOrdine] = useState<number[] | null>(null)
  const [trascinato, setTrascinato] = useState<number | null>(null)
  const [sopra, setSopra] = useState<number | null>(null)

  useEffect(() => setOrdine(null), [elementi])

  const lista = ordine ? ordine.flatMap((id) => elementi.filter((e) => e.id === id)) : elementi

  const applica = (da: number, a: number) => {
    if (da < 0 || a < 0 || a >= lista.length || da === a) return
    const ids = lista.map((e) => e.id)
    const [spostato] = ids.splice(da, 1)
    ids.splice(a, 0, spostato)
    setOrdine(ids)
    salva(ids).catch((e) => {
      setOrdine(null)
      toastErrore(e)
    })
  }

  const posizione = (id: number) => lista.findIndex((e) => e.id === id)

  const trascina = (id: number) => ({
    draggable: true,
    "data-trascinato": trascinato === id ? "" : undefined,
    "data-sopra": sopra === id && trascinato !== id ? "" : undefined,
    onDragStart: (e: DragEvent) => {
      e.stopPropagation()
      e.dataTransfer.effectAllowed = "move"
      setTrascinato(id)
    },
    onDragOver: (e: DragEvent) => {
      // Moduli e lezioni si trascinano nella stessa pagina: ogni lista accetta solo i suoi elementi
      if (trascinato == null) return
      e.preventDefault()
      e.stopPropagation()
      setSopra(id)
    },
    onDragEnd: () => {
      setTrascinato(null)
      setSopra(null)
    },
    onDrop: (e: DragEvent) => {
      if (trascinato == null) return
      e.preventDefault()
      e.stopPropagation()
      applica(posizione(trascinato), posizione(id))
      setTrascinato(null)
      setSopra(null)
    },
  })

  return { lista, trascina, sposta: (id: number, delta: -1 | 1) => applica(posizione(id), posizione(id) + delta) }
}
