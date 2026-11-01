import { CalendarOff, CalendarPlus, CircleCheck, ClipboardList, UserRound, Video } from "lucide-react"
import type { ReactNode } from "react"
import { AltreAzioni } from "@/components/dashboard/altre-azioni"
import { FiloOggi } from "@/components/dashboard/filo-oggi"
import { LuxHero } from "@/components/lux"
import { MenuVisita } from "@/components/menu-contestuali"
import { Cta } from "@/components/pagina"
import { useAzioni } from "@/contexts/azioni-context"
import { conta, fraseGiornata, leggiGiornata, partiTempo, type Scena } from "@/lib/dashboard"
import { MODALITA_VISITA, TIPO_VISITA } from "@/lib/etichette"
import { dataLunga, ora } from "@/lib/format"
import { oggiIso } from "@/lib/utils"
import type { Dashboard, Visita } from "@/types"

function Tempo({ prima, minuti }: { prima: string; minuti: number }) {
  return (
    <p className="db-tempo">
      <span className="db-tempo-prima">{prima}</span>
      {partiTempo(minuti).map((p) => <span key={p.unita} className="db-tempo-parte">{p.numero}<small>{p.unita}</small></span>)}
    </p>
  )
}

function SchedaVisita({ etichetta, tempo, visita, poi }: { etichetta: string; tempo: ReactNode; visita: Visita; poi: Visita | null }) {
  const azioni = useAzioni()
  const percorso = visita.numeroVisita && visita.visiteTotali ? ` ${visita.numeroVisita} su ${visita.visiteTotali}` : ""
  return (
    <MenuVisita visita={visita}>
      <div className="db-scena">
        <p className="db-scena-etichetta">{etichetta}</p>
        {tempo}
        <button type="button" className="db-scena-nome" onClick={() => azioni.apriPaziente(visita.pazienteId)}>{visita.pazienteNome}</button>
        <p className="db-scena-meta">{ora(visita.inizio)}–{ora(visita.fine)} · {TIPO_VISITA[visita.tipo]}{percorso} · {MODALITA_VISITA[visita.modalita]}</p>
        <div className="db-scena-azioni">
          {visita.meetUrl ? (
            <a className="db-pulsante" data-primario="" href={visita.meetUrl} target="_blank" rel="noopener noreferrer"><Video className="size-4" aria-hidden />Apri Google Meet</a>
          ) : null}
          <button type="button" className="db-pulsante" onClick={() => azioni.apriPaziente(visita.pazienteId)}><UserRound className="size-4" aria-hidden />Apri la scheda</button>
          <AltreAzioni etichetta={`Altre azioni per la visita di ${visita.pazienteNome}`} />
        </div>
        {visita.conMeet && !visita.meetUrl ? <p className="db-scena-nota">Link Meet non ancora disponibile</p> : null}
        {poi ? <p className="db-scena-poi">Poi {poi.pazienteNome} alle {ora(poi.inizio)}</p> : null}
      </div>
    </MenuVisita>
  )
}

function Chiusura({ icona, titolo, testo }: { icona: ReactNode; titolo: string; testo: string }) {
  return (
    <div className="db-scena">
      <p className="db-scena-etichetta">Oggi</p>
      <p className="db-tempo" data-frase="">{icona}{titolo}</p>
      <p className="db-scena-meta">{testo}</p>
    </div>
  )
}

function ScenaOggi({ scena, visiteSettimana }: { scena: Scena; visiteSettimana: number }) {
  if (scena.tipo === "in-corso") {
    return <SchedaVisita etichetta="Visita in corso" tempo={<Tempo prima="ancora" minuti={scena.minuti} />} visita={scena.visita} poi={scena.poi} />
  }
  if (scena.tipo === "prossima") {
    return <SchedaVisita etichetta="Prossima visita" tempo={<Tempo prima="tra" minuti={scena.minuti} />} visita={scena.visita} poi={scena.poi} />
  }
  if (scena.tipo === "vuota") {
    return <Chiusura icona={<CalendarOff aria-hidden />} titolo="Nessuna visita" testo={visiteSettimana ? `Niente in agenda per oggi. Questa settimana: ${conta(visiteSettimana, "visita", "visite")}.` : "Niente in agenda per oggi."} />
  }
  const esiti = [
    scena.effettuate ? conta(scena.effettuate, "effettuata", "effettuate") : null,
    scena.saltate ? conta(scena.saltate, "non presentato", "non presentati") : null,
  ].filter(Boolean).join(", ")
  if (scena.daSegnare.length) {
    return <Chiusura icona={<ClipboardList aria-hidden />} titolo={`${scena.daSegnare.length} da segnare`} testo={`Le visite di oggi sono finite${esiti ? ` (${esiti})` : ""}: resta da dire com'è andata.`} />
  }
  return <Chiusura icona={<CircleCheck aria-hidden />} titolo="Visite finite" testo={`Oggi: ${esiti}.`} />
}

export function OggiHero({ d, nome, adesso }: { d: Dashboard; nome: string; adesso: Date }) {
  const azioni = useAzioni()
  const { tappe, voci, scena } = leggiGiornata(d.visiteOggi, adesso)

  return (
    <LuxHero ariaLabel="La giornata di oggi" eyebrow={dataLunga(oggiIso())} title={`Ciao ${nome}`} subtitle={fraseGiornata(d, tappe.length)}
      actions={<Cta icona={CalendarPlus} onClick={() => azioni.nuovaVisita()}>Nuova visita</Cta>}>
      <div className="db-plancia" data-sola={tappe.length ? undefined : ""}>
        <ScenaOggi scena={scena} visiteSettimana={d.visiteSettimana} />
        {tappe.length ? <FiloOggi voci={voci} adesso={adesso} /> : null}
      </div>
    </LuxHero>
  )
}
