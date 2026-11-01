import { ArrowRight, CircleCheck, Clock, Layers, ListVideo, Plus } from "lucide-react"
import { Link } from "react-router-dom"
import { CopertinaCorso, StatoCorso } from "@/components/corsi/corso-ui"
import { durata } from "@/lib/format"
import type { SchedaCorso } from "@/lib/corsi"

const PASSI_INIZIALI = [
  { titolo: "Dai un titolo al corso", testo: "E una copertina, se ce l'hai già" },
  { titolo: "Aggiungi moduli e lezioni", testo: "Video da caricare o testi da scrivere" },
  { titolo: "Pubblica", testo: "I pazienti lo vedono subito nell'app" },
]

export function CartaCorso({ scheda }: { scheda: SchedaCorso }) {
  const { corso, fase, passo, manca, pubblicate } = scheda
  const quota = corso.lezioni > 0 ? (pubblicate / corso.lezioni) * 100 : 0
  return (
    <Link to={`/corsi/${corso.id}`} className="cs-carta">
      <div className="cs-carta-copertina">
        <CopertinaCorso id={corso.copertinaId} titolo={corso.titolo} />
        <StatoCorso fase={fase} />
      </div>
      <div className="cs-carta-corpo">
        <div className="cs-avanzamento">
          <p className="cs-passo" data-fase={fase}>{fase === "online" || fase === "pronto" ? <CircleCheck aria-hidden /> : null}{passo}</p>
          {corso.lezioni > 0 ? (
            <>
              <span className="cs-misura" role="progressbar" aria-label="Lezioni pubblicate" aria-valuemin={0} aria-valuemax={corso.lezioni} aria-valuenow={pubblicate}>
                <i style={{ width: `${quota}%` }} />
              </span>
              <p className="cs-avanzamento-conto">{pubblicate} su {corso.lezioni} {corso.lezioni === 1 ? "lezione pubblicata" : "lezioni pubblicate"}</p>
            </>
          ) : null}
        </div>
        {manca.length > 0 ? <ul className="cs-manca" aria-label="Cosa manca">{manca.slice(0, 3).map((m) => <li key={m}>{m}</li>)}</ul> : null}
        <div className="cs-carta-piede">
          <span><Layers aria-hidden />{corso.moduli} {corso.moduli === 1 ? "modulo" : "moduli"}</span>
          <span><ListVideo aria-hidden />{corso.lezioni} {corso.lezioni === 1 ? "lezione" : "lezioni"}</span>
          {corso.secondiVideo > 0 ? <span><Clock aria-hidden />{durata(corso.secondiVideo)}</span> : null}
          <ArrowRight className="cs-carta-freccia" aria-hidden />
        </div>
      </div>
    </Link>
  )
}

export function CartaNuovo({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="cs-carta-nuova" onClick={onClick}>
      <span aria-hidden><Plus /></span>
      <strong>Nuovo corso</strong>
      <small>Titolo e copertina, il resto dopo</small>
    </button>
  )
}

export function CorsiVuoto({ onCrea }: { onCrea: () => void }) {
  return (
    <section className="cs-vuoto" aria-label="Primo corso">
      <div className="cs-vuoto-copertina"><CopertinaCorso id={null} titolo="Il tuo primo corso" /></div>
      <div className="cs-vuoto-guida">
        <p className="cs-vuoto-titolo">Costruisci il primo corso</p>
        <ol>
          {PASSI_INIZIALI.map((p, i) => (
            <li key={p.titolo}>
              <span aria-hidden>{i + 1}</span>
              <div><strong>{p.titolo}</strong><small>{p.testo}</small></div>
            </li>
          ))}
        </ol>
        <button type="button" className="vl-cta cs-cta" onClick={onCrea}>
          <span className="vl-cta-icon" aria-hidden><Plus className="size-4" /></span>
          <span className="vl-cta-label">Crea il primo corso</span>
        </button>
      </div>
    </section>
  )
}
