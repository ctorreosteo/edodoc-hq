import { format, isSameDay, parseISO } from "date-fns"
import { it } from "date-fns/locale"
import { CalendarPlus, CalendarSearch, UserRound, Video } from "lucide-react"
import { LuxHero } from "@/components/lux"
import { MenuVisita } from "@/components/menu-contestuali"
import { Cta } from "@/components/pagina"
import { useAzioni } from "@/contexts/azioni-context"
import { useConteggio } from "@/hooks/use-conteggio"
import { MODALITA_VISITA, TIPO_VISITA } from "@/lib/etichette"
import { conta, nomeGiorno, tempo, type DensitaGiorno, type Prossima } from "@/lib/visite"

/** Le ore prenotate di ogni giorno sulla stessa scala: mezza giornata di visite riempie la colonna. */
const SCALA_MINIMA_MINUTI = 240

function Prossimo({ prossima, adesso }: { prossima: Prossima | null; adesso: Date }) {
  const azioni = useAzioni()
  if (!prossima) {
    return (
      <div className="vs-prossima" data-vuota="">
        <p className="vs-prossima-etichetta">Prossima visita</p>
        <p className="vs-prossima-nome">Nessuna in programma</p>
        <p className="vs-prossima-quando">L'agenda dei prossimi due mesi è libera.</p>
      </div>
    )
  }
  const { visita, inCorso, quando } = prossima
  const inizio = parseISO(visita.inizio)
  const giorno = nomeGiorno(inizio, adesso)
  return (
    <MenuVisita visita={visita}>
      <div className="vs-prossima" data-in-corso={inCorso ? "" : undefined}>
        <p className="vs-prossima-etichetta">{inCorso ? "In corso adesso" : "Prossima visita"}</p>
        <p className="vs-prossima-nome">{visita.pazienteNome}</p>
        <p className="vs-prossima-quando">
          <strong>{giorno} alle {format(inizio, "HH:mm")}</strong>
          <span>{quando}</span>
        </p>
        <p className="vs-prossima-tipo">
          {TIPO_VISITA[visita.tipo]}{visita.numeroVisita ? ` · ${visita.numeroVisita} su ${visita.visiteTotali}` : ""} · {MODALITA_VISITA[visita.modalita]}
        </p>
        <div className="vs-prossima-azioni">
          {visita.meetUrl ? <a className="vs-azione" data-principale="" href={visita.meetUrl} target="_blank" rel="noopener noreferrer"><Video aria-hidden />Entra in Meet</a> : null}
          <button type="button" className="vs-azione" onClick={() => azioni.apriPaziente(visita.pazienteId)}><UserRound aria-hidden />Apri il paziente</button>
        </div>
      </div>
    </MenuVisita>
  )
}

function Densita({ voci, adesso, scelto, onScelto }: { voci: DensitaGiorno[]; adesso: Date; scelto: number | null; onScelto: (indice: number) => void }) {
  const massimo = Math.max(SCALA_MINIMA_MINUTI, ...voci.map((v) => v.minuti))
  return (
    <div className="vs-densita" role="group" aria-label="Tempo prenotato giorno per giorno">
      {voci.map((v, i) => {
        const oggi = isSameDay(v.giorno, adesso)
        const nome = format(v.giorno, "EEEE d MMMM", { locale: it })
        return (
          <button key={v.giorno.toISOString()} type="button" className="vs-densita-giorno" data-oggi={oggi ? "" : undefined} aria-pressed={scelto === i}
            aria-label={`${nome}: ${v.visite > 0 ? `${conta(v.visite, "visita", "visite")}, ${tempo(v.minuti)}` : "nessuna visita"}`}
            title={v.visite > 0 ? `${conta(v.visite, "visita", "visite")} · ${tempo(v.minuti)}` : "Nessuna visita"} onClick={() => onScelto(i)}>
            <span className="vs-densita-traccia">
              {v.minuti > 0 ? <span className="vs-densita-valore">{tempo(v.minuti)}</span> : null}
              <i style={{ height: v.minuti > 0 ? `${Math.max(6, (v.minuti / massimo) * 100)}%` : 0 }} />
            </span>
            <span className="vs-densita-nome">{format(v.giorno, "EEEEE", { locale: it })}</span>
            <span className="vs-densita-numero">{format(v.giorno, "d")}</span>
          </button>
        )
      })}
    </div>
  )
}

export function VisiteHero({ frase, prossima, adesso, densita, scelto, onScelto, minutiTotali, visiteTotali, daSegnare, periodo, inCaricamento, onNuova }: {
  frase: string
  prossima: Prossima | null
  adesso: Date
  densita: DensitaGiorno[]
  scelto: number | null
  onScelto: (indice: number) => void
  minutiTotali: number
  visiteTotali: number
  daSegnare: number
  periodo: string
  inCaricamento: boolean
  onNuova: () => void
}) {
  const mostrate = Math.round(useConteggio(visiteTotali, 600))
  return (
    <LuxHero ariaLabel="Visite" eyebrow="Agenda" title="Visite" subtitle={frase} actions={<Cta icona={CalendarPlus} onClick={onNuova}>Nuova visita</Cta>}>
      <div className="vs-plancia">
        <Prossimo prossima={prossima} adesso={adesso} />
        <div className="vs-settimana">
          <div className="vs-settimana-testa">
            <p>{periodo}</p>
            <dl>
              {inCaricamento ? null : visiteTotali > 0 ? (
                <>
                  <div><dt>Visite</dt><dd>{mostrate}</dd></div>
                  <div><dt>Prenotato</dt><dd>{tempo(minutiTotali)}</dd></div>
                  {daSegnare > 0 ? <div data-avviso=""><dt>Da segnare</dt><dd>{daSegnare}</dd></div> : null}
                </>
              ) : <div data-vuota=""><dt className="sr-only">Stato</dt><dd><CalendarSearch aria-hidden />Settimana libera</dd></div>}
            </dl>
          </div>
          <Densita voci={densita} adesso={adesso} scelto={scelto} onScelto={onScelto} />
        </div>
      </div>
    </LuxHero>
  )
}
