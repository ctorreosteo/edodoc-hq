import { useEffect, useState, useSyncExternalStore } from "react"

const GIRO_MS = 30_000
/** Sotto questa larghezza sette colonne non stanno: l'agenda mostra un giorno alla volta. */
const VISTA_GIORNO = "(max-width: 1023px)"

/** L'ora corrente, aggiornata di continuo: muove la linea di adesso e chiude le visite finite. */
export function useAdesso() {
  const [adesso, setAdesso] = useState(() => new Date())
  useEffect(() => {
    const giro = window.setInterval(() => setAdesso(new Date()), GIRO_MS)
    return () => window.clearInterval(giro)
  }, [])
  return adesso
}

function ascolta(avvisa: () => void) {
  const media = window.matchMedia(VISTA_GIORNO)
  media.addEventListener("change", avvisa)
  return () => media.removeEventListener("change", avvisa)
}

export const useVistaGiorno = () => useSyncExternalStore(ascolta, () => window.matchMedia(VISTA_GIORNO).matches)
