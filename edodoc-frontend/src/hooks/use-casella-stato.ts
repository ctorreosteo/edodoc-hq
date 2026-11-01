import { useEffect, useRef, useSyncExternalStore } from "react"
import { casellaNonCollegata, casellaService, type EmailStato } from "@/services/casella-service"

/**
 * Stato della casella condiviso tra badge della sidebar e pagina Email: un solo polling per scheda,
 * più frequente con la pagina aperta, fermo con la scheda nascosta. Se la casella non è collegata si spegne.
 */

const LENTO_MS = 60_000
const VELOCE_MS = 20_000

type Istantanea = { nonLetti: number | null; historyId: string | null; disattivo: boolean }

let corrente: Istantanea = { nonLetti: null, historyId: null, disattivo: false }
const ascoltatori = new Set<() => void>()
const ascoltatoriNovita = new Set<(s: EmailStato) => void>()
let utilizzatori = 0
let veloci = 0
let timer: ReturnType<typeof setTimeout> | null = null
let inVolo: Promise<void> | null = null

function imposta(parziale: Partial<Istantanea>) {
  corrente = { ...corrente, ...parziale }
  ascoltatori.forEach((fn) => fn())
}

function controlla(): Promise<void> {
  if (inVolo || corrente.disattivo) return inVolo ?? Promise.resolve()
  const dal = corrente.historyId
  inVolo = casellaService.stato(dal)
    .then((s) => {
      imposta({ nonLetti: s.inArrivoNonLetti, historyId: s.historyId })
      if (dal && s.cambiato) ascoltatoriNovita.forEach((fn) => fn(s))
    })
    .catch((errore) => {
      if (casellaNonCollegata(errore)) imposta({ disattivo: true })
    })
    .finally(() => {
      inVolo = null
    })
  return inVolo
}

function pianifica(ms?: number) {
  if (timer) clearTimeout(timer)
  if (utilizzatori === 0 || corrente.disattivo) return
  timer = setTimeout(() => {
    if (document.hidden) {
      pianifica()
      return
    }
    void controlla().finally(() => pianifica())
  }, ms ?? (veloci > 0 ? VELOCE_MS : LENTO_MS))
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && utilizzatori > 0) pianifica(300)
})

const iscrivi = (fn: () => void) => {
  ascoltatori.add(fn)
  return () => {
    ascoltatori.delete(fn)
  }
}
const leggi = () => corrente

/** Forza un controllo a breve, dopo un'azione che cambia i contatori. */
export function aggiornaCasellaStato(ms = 600) {
  pianifica(ms)
}

/** La pagina riparte da qui dopo aver caricato la casella, così non si ricarica per ciò che ha già visto. */
export function allineaCasellaStato(historyId: string, nonLetti?: number) {
  imposta({ historyId, nonLetti: nonLetti ?? corrente.nonLetti, disattivo: false })
}

export function useCasellaStato({ veloce = false }: { veloce?: boolean } = {}) {
  const istantanea = useSyncExternalStore(iscrivi, leggi)

  useEffect(() => {
    utilizzatori++
    if (veloce) veloci++
    pianifica(corrente.nonLetti == null ? 800 : undefined)
    return () => {
      utilizzatori--
      if (veloce) veloci--
      if (utilizzatori === 0 && timer) clearTimeout(timer)
    }
  }, [veloce])

  return { nonLetti: istantanea.nonLetti ?? 0, disattivo: istantanea.disattivo }
}

/** Callback quando la casella cambia da fuori: email arrivate, azioni da Gmail o da un altro dispositivo. */
export function useCasellaNovita(callback: (s: EmailStato) => void) {
  const ref = useRef(callback)
  ref.current = callback
  useEffect(() => {
    const fn = (s: EmailStato) => ref.current(s)
    ascoltatoriNovita.add(fn)
    return () => {
      ascoltatoriNovita.delete(fn)
    }
  }, [])
}
