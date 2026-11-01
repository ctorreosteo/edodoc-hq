import { format, parseISO } from "date-fns"
import { Ban, Check, CircleAlert, ClipboardCheck, TriangleAlert, Video, X, type LucideIcon } from "lucide-react"
import type { CSSProperties } from "react"
import { MenuVisita } from "@/components/menu-contestuali"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useAzioni } from "@/contexts/azioni-context"
import { TIPO_VISITA } from "@/lib/etichette"
import { ora } from "@/lib/format"
import { descriviVisita, rigaVisita, statoBlocco, type StatoBlocco } from "@/lib/visite"
import type { Visita } from "@/types"

const ICONA_STATO: Partial<Record<StatoBlocco, { icona: LucideIcon; testo: string }>> = {
  fatta: { icona: Check, testo: "Effettuata" },
  assente: { icona: X, testo: "Non presentato" },
  annullata: { icona: Ban, testo: "Annullata" },
  "da-segnare": { icona: ClipboardCheck, testo: "Da segnare" },
}

export function EsitoVisita({ stato }: { stato: StatoBlocco }) {
  const voce = ICONA_STATO[stato]
  if (!voce) return null
  const Icona = voce.icona
  return <Icona className="vs-esito" aria-hidden />
}

function LinkMeet({ visita }: { visita: Visita }) {
  if (!visita.meetUrl || visita.stato === "ANNULLATA") return null
  return (
    <a className="vs-meet" href={visita.meetUrl} target="_blank" rel="noopener noreferrer" aria-label={`Apri Google Meet con ${visita.pazienteNome}`} title="Apri Google Meet">
      <Video aria-hidden />
    </a>
  )
}

/** Un solo blocco per griglia e lista: cambia la geometria, non il comportamento. */
export function BloccoVisita({ visita, adesso, stile, taglia, avviso, stretto }: {
  visita: Visita
  adesso: Date
  stile?: CSSProperties
  taglia: "mini" | "corta" | "lunga" | "riga"
  avviso?: boolean
  /** Affiancato ad altre visite: restano solo ora e nome, il resto è nel menu. */
  stretto?: boolean
}) {
  const azioni = useAzioni()
  const stato = statoBlocco(visita, adesso)
  const annullata = stato === "annullata"
  const descrizione = descriviVisita(visita, adesso)
  const erroreGoogle = visita.googleSyncStato === "ERRORE"
  return (
    <MenuVisita visita={visita}>
      <div className="vs-blocco" data-tipo={visita.tipo} data-stato={stato} data-taglia={taglia} data-avviso={avviso ? "" : undefined} data-stretto={stretto ? "" : undefined} style={stile}>
        <button type="button" aria-label={descrizione} aria-disabled={annullata || undefined} title={descrizione}
          onClick={() => {
            if (!annullata) azioni.modificaVisita(visita)
          }}>
          <span className="vs-blocco-testa">
            <span className="vs-blocco-ora">{ora(visita.inizio)}</span>
            <span className="vs-blocco-nome">{visita.pazienteNome}</span>
          </span>
          {taglia !== "mini" ? <span className="vs-blocco-riga">{taglia === "riga" ? `${TIPO_VISITA[visita.tipo]} · ${rigaVisita(visita)}` : rigaVisita(visita)}</span> : null}
          <span className="vs-blocco-segni">
            {avviso ? <TriangleAlert aria-hidden /> : null}
            {erroreGoogle ? <CircleAlert className="vs-segno-errore" aria-hidden /> : null}
            <EsitoVisita stato={stato} />
          </span>
        </button>
        <LinkMeet visita={visita} />
      </div>
    </MenuVisita>
  )
}

/** Oltre tre visite nello stesso momento: il riquadro le elenca tutte, con le stesse azioni. */
export function BloccoAltre({ visite, adesso, stile }: { visite: Visita[]; adesso: Date; stile: CSSProperties }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="vs-altre" style={stile} aria-label={`Altre ${visite.length} visite nello stesso orario`}>+{visite.length}</button>
      </PopoverTrigger>
      <PopoverContent className="w-72" data-vl="">
        <p className="vs-altre-titolo">{format(parseISO(visite[0].inizio), "HH:mm")}: stesso orario</p>
        <div className="vs-altre-lista">
          {visite.map((v) => <BloccoVisita key={v.id} visita={v} adesso={adesso} taglia="riga" />)}
        </div>
      </PopoverContent>
    </Popover>
  )
}
