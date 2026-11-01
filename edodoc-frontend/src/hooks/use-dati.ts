import { useCallback, useEffect, useState, type DependencyList } from "react"
import { useAzioni } from "@/contexts/azioni-context"

/** Carica dati e li ricarica quando cambiano le dipendenze o quando una finestra salva qualcosa. */
export function useDati<T>(carica: () => Promise<T>, dipendenze: DependencyList) {
  const { versione } = useAzioni()
  const [dati, setDati] = useState<T | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [tentativo, setTentativo] = useState(0)

  useEffect(() => {
    let annullato = false
    setErrore(null)
    carica()
      .then((risultato) => {
        if (!annullato) setDati(risultato)
      })
      .catch((e: Error) => {
        if (!annullato) setErrore(e.message)
      })
    return () => {
      annullato = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dipendenze, versione, tentativo])

  const riprova = useCallback(() => setTentativo((t) => t + 1), [])
  return { dati, errore, riprova }
}
