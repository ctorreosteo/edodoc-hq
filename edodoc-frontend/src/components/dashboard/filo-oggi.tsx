import { format } from "date-fns"
import { Check, Circle, X } from "lucide-react"
import { useState } from "react"
import { AltreAzioni } from "@/components/dashboard/altre-azioni"
import { MenuVisita } from "@/components/menu-contestuali"
import { useAzioni } from "@/contexts/azioni-context"
import { testoTempo, type Tappa, type VoceFilo } from "@/lib/dashboard"
import { MODALITA_VISITA, TIPO_VISITA } from "@/lib/etichette"
import { ora } from "@/lib/format"
import { toast, toastErrore } from "@/lib/toast"
import { visiteService } from "@/services/gestionale"

const ESITO = { fatta: "Effettuata", saltata: "Non presentato", "in-corso": "In corso", prossima: "Prossima" }

function Perla({ fase }: { fase: Tappa["fase"] }) {
  if (fase === "fatta") return <Check className="size-3" strokeWidth={3} aria-hidden />
  if (fase === "saltata") return <X className="size-3" strokeWidth={3} aria-hidden />
  if (fase === "in-corso" || fase === "prossima") return <Circle className="size-2 fill-current" aria-hidden />
  return null
}

function RigaTappa({ tappa }: { tappa: Tappa }) {
  const azioni = useAzioni()
  const [salvo, setSalvo] = useState(false)
  const { visita: v, fase } = tappa

  const segna = async () => {
    setSalvo(true)
    try {
      await visiteService.cambiaStato(v.id, "EFFETTUATA")
      toast.success("Visita effettuata")
      azioni.aggiorna()
    } catch (e) {
      toastErrore(e)
    } finally {
      setSalvo(false)
    }
  }

  return (
    <MenuVisita visita={v}>
      <li className="db-tappa" data-fase={fase}>
        <span className="db-tappa-ora">{ora(v.inizio)}</span>
        <span className="db-perla" aria-hidden><Perla fase={fase} /></span>
        <div className="db-tappa-corpo">
          <button type="button" className="db-tappa-nome" onClick={() => azioni.apriPaziente(v.pazienteId)}>{v.pazienteNome}</button>
          <p className="db-tappa-meta">{TIPO_VISITA[v.tipo]} · {MODALITA_VISITA[v.modalita]}</p>
        </div>
        <div className="db-tappa-azioni">
          {fase === "da-segnare" ? (
            <button type="button" className="db-segna" disabled={salvo} onClick={() => void segna()} aria-label={`Segna effettuata la visita di ${v.pazienteNome}`}>
              <Check className="size-3.5" aria-hidden />Segna effettuata
            </button>
          ) : fase !== "dopo" ? <span className="db-esito">{ESITO[fase]}</span> : null}
          <AltreAzioni etichetta={`Altre azioni per la visita di ${v.pazienteNome}`} />
        </div>
      </li>
    </MenuVisita>
  )
}

/** Il segno della pagina: le visite di oggi su un solo filo, con l'orologio infilato al punto giusto. */
export function FiloOggi({ voci, adesso }: { voci: VoceFilo[]; adesso: Date }) {
  return (
    <div className="db-filo-box">
      <p className="db-filo-titolo">Il filo di oggi</p>
      <ol className="db-filo">
        {voci.map((voce, i) => {
          if (voce.tipo === "tappa") return <RigaTappa key={voce.tappa.visita.id} tappa={voce.tappa} />
          if (voce.tipo === "libero") {
            return (
              <li key={`libero-${i}`} className="db-libero">
                <span className="db-perla" aria-hidden />
                <span className="db-libero-testo">{testoTempo(voce.minuti)} liberi</span>
              </li>
            )
          }
          return (
            <li key="adesso" className="db-adesso">
              <span className="db-adesso-ora">{format(adesso, "HH:mm")}</span>
              <span className="db-perla" aria-hidden />
              <span className="db-adesso-testo">Adesso{voce.minuti && voce.minuti >= 5 ? ` · ${testoTempo(voce.minuti)} liberi` : ""}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
