import { CircleCheckBig, Plus, SearchX, Sparkles } from "lucide-react"

type Variante = "inbox" | "lista" | "filtri"

const TESTI: Record<Variante, { titolo: string; testo: string; icon: typeof Sparkles }> = {
  inbox: { titolo: "Tutto in ordine", testo: "Non hai task aperti. Rinnovi, esami e scadenze arrivano qui da soli.", icon: CircleCheckBig },
  lista: { titolo: "Nessun task qui", testo: "Crea il primo task: dagli una scadenza e collegalo a un paziente.", icon: Sparkles },
  filtri: { titolo: "Nessun risultato", testo: "Nessun task aperto corrisponde alla ricerca o ai filtri attivi.", icon: SearchX },
}

export function TaskEmpty({ variante, onNuovo }: { variante: Variante; onNuovo?: () => void }) {
  const t = TESTI[variante]
  const Icon = t.icon
  return (
    <div className="tk-empty" data-variante={variante}>
      <span className="tk-empty-art" aria-hidden>
        <span className="tk-empty-ring" />
        <span className="tk-empty-ring tk-empty-ring--2" />
        <Icon />
      </span>
      <b>{t.titolo}</b>
      <span>{t.testo}</span>
      {onNuovo ? <button type="button" className="tk-cta tk-cta--sm" onClick={onNuovo}><Plus aria-hidden /><span>Nuovo task</span></button> : null}
    </div>
  )
}
