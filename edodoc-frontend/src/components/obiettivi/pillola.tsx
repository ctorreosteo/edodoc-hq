import { useEffect, useRef, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { AnelloMini } from "@/components/obiettivi/anello"
import { useDati } from "@/hooks/use-dati"
import { leggiObiettivo } from "@/lib/obiettivo"
import { useAdesso } from "@/lib/dashboard"
import { obiettiviService } from "@/services/gestionale"
import "@/style/obiettivi.css"

/** L'obiettivo sempre in vista, nella barra in alto di ogni pagina. */
export function PillolaObiettivo() {
  const { pathname } = useLocation()
  const adesso = useAdesso(60000)
  const { dati } = useDati(obiettiviService.carica, [])
  const prima = useRef<number | null>(null)
  const [festa, setFesta] = useState(false)

  const fatti = dati?.conquiste.length ?? null
  useEffect(() => {
    if (fatti == null) return
    if (prima.current != null && fatti > prima.current) {
      setFesta(true)
      const t = window.setTimeout(() => setFesta(false), 1800)
      prima.current = fatti
      return () => window.clearTimeout(t)
    }
    prima.current = fatti
  }, [fatti])

  if (!dati) return null
  const o = leggiObiettivo(dati, adesso)
  const ideale = o.fase === "corsa" ? o.atteso / o.target : null
  const nota = o.fase === "attesa"
    ? `T−${o.giorniAlVia}`
    : o.fatti >= o.target ? "fatto" : o.fase === "corsa" ? (o.scarto >= 0 ? `+${o.scarto}` : `${o.scarto}`) : null
  const tono = o.fase === "attesa" ? "info" : o.scarto >= 0 || o.fatti >= o.target ? "ok" : "warn"
  const descrizione = o.fase === "attesa"
    ? `Obiettivo ${o.anno}: ${o.fatti} su ${o.target}, si parte tra ${o.giorniAlVia} giorni`
    : `Obiettivo ${o.anno}: ${o.fatti} clienti su ${o.target}${o.fase === "corsa" ? `, ${o.scarto >= 0 ? "avanti" : "indietro"} di ${Math.abs(o.scarto)} sul ritmo` : ""}`

  return (
    <Link to="/obiettivi" className="ob-pillola" data-attiva={pathname === "/obiettivi" ? "" : undefined} data-festa={festa ? "" : undefined}
      aria-label={descrizione} title={descrizione}>
      <AnelloMini frazione={o.fatti / o.target} ideale={ideale} />
      <span className="ob-pillola-numeri"><b>{o.fatti}</b><small>/{o.target}</small></span>
      {nota ? <span className="ob-pillola-nota" data-tono={tono}>{nota}</span> : null}
    </Link>
  )
}
