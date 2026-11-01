import { Check, CircleCheck, CircleDashed, CircleEllipsis, Eye, TriangleAlert, Upload } from "lucide-react"
import type { ReactNode } from "react"
import { CopertinaCorso } from "@/components/corsi/corso-ui"
import { visibile, vociMancanti, type FaseCorso, type contiLezioni } from "@/lib/corsi"
import type { ModuloConLezioni, RigaCorso, RigaLezione } from "@/types"

const MASSIMO_VOCI = 6

type Conti = ReturnType<typeof contiLezioni>
type StatoPasso = "fatto" | "attuale" | "futuro"

const lezioni = (n: number) => `${n} ${n === 1 ? "lezione" : "lezioni"}`

function frase(fase: FaseCorso, corso: RigaCorso, c: Conti): ReactNode {
  switch (fase) {
    case "vuoto": return <><strong>Si parte da qui.</strong> {corso.moduli === 0 ? "Crea un modulo e aggiungi la prima lezione." : "Aggiungi la prima lezione al modulo."}</>
    case "contenuti": return <><strong>Serve almeno una lezione completa.</strong> Carica un video o scrivi un testo.</>
    case "lezioni": return <><strong>{c.complete === 1 ? "Una lezione è completa" : `${c.complete} lezioni sono complete`}.</strong> Pubblicane almeno una con l'occhio, poi potrai pubblicare il corso.</>
    case "pronto": return <><strong>Pronto da pubblicare.</strong> I pazienti vedranno {lezioni(c.pubblicate)}{c.pubblicate < c.totali ? ", le altre restano nascoste" : ""}.</>
    case "online": return <><strong>Visibile nell'app.</strong> I pazienti vedono {c.pubblicate} {c.pubblicate === 1 ? "lezione" : "lezioni"} su {c.totali}.</>
    case "online-vuoto": return <><strong>Pubblicato, ma nell'app non compare.</strong> Nessuna lezione è pubblicata e completa.</>
  }
}

export function CorsoFlusso({ corso, conti, fase, onCopertina }: { corso: RigaCorso; conti: Conti; fase: FaseCorso; onCopertina: () => void }) {
  const fatti = [conti.complete > 0, conti.pubblicate > 0, corso.pubblicato && conti.pubblicate > 0]
  const attuale = fatti.indexOf(false)
  const passi = [
    { nome: "Contenuti", nota: conti.totali > 0 ? `${conti.complete} su ${conti.totali} complete` : "Nessuna lezione" },
    { nome: "Lezioni pubblicate", nota: conti.pubblicate > 0 ? `${conti.pubblicate} su ${conti.totali}` : "Almeno una" },
    { nome: "Corso nell'app", nota: corso.pubblicato ? "Pubblicato" : "Ancora in bozza" },
  ]
  return (
    <div className="cs-plancia">
      <button type="button" className="cs-plancia-copertina" aria-label="Cambia copertina e testi del corso" onClick={onCopertina}>
        <CopertinaCorso id={corso.copertinaId} titolo={corso.titolo} conTitolo={false} />
      </button>
      <div className="cs-flusso">
        <ol className="cs-passi" aria-label="Avanzamento verso la pubblicazione">
          {passi.map((p, i) => {
            const stato: StatoPasso = fatti[i] ? "fatto" : i === attuale ? "attuale" : "futuro"
            return (
              <li key={p.nome} className="cs-passo-flusso" data-stato={stato} aria-current={stato === "attuale" ? "step" : undefined}>
                <span className="cs-passo-segno">{stato === "fatto" ? <Check aria-label="Fatto" /> : i + 1}</span>
                <span className="cs-passo-nome">{p.nome}</span>
                <span className="cs-passo-nota">{p.nota}</span>
              </li>
            )
          })}
        </ol>
        <p className="cs-flusso-frase">{frase(fase, corso, conti)}</p>
      </div>
    </div>
  )
}

const ICONA_MOTIVO = (urgente: boolean, lezione: RigaLezione) => {
  if (!urgente) return lezione.completa ? Eye : CircleEllipsis
  return lezione.videoStato === "ERRORE" ? TriangleAlert : lezione.tipo === "VIDEO" ? Upload : CircleDashed
}

export function CosaManca({ corso, moduli, conti, onLezione }: {
  corso: RigaCorso
  moduli: ModuloConLezioni[]
  conti: Conti
  onLezione: (moduloId: number, lezione: RigaLezione) => void
}) {
  const voci = vociMancanti(moduli)
  const mostrate = voci.slice(0, MASSIMO_VOCI)
  const moduliVisibili = moduli.filter((m) => m.lezioni.some(visibile)).length
  return (
    <aside className="cs-lato" aria-label="Cosa manca">
      {voci.length > 0 ? (
        <>
          <div>
            <p className="cs-lato-titolo">Cosa manca</p>
            <p className="cs-lato-sotto">{voci.length === 1 ? "Una lezione da sistemare: clicca per aprirla." : `${voci.length} lezioni da sistemare: clicca per aprirle.`}</p>
          </div>
          <ul className="cs-mancanti">
            {mostrate.map(({ lezione, motivo, urgente }) => {
              const Icona = ICONA_MOTIVO(urgente, lezione)
              return (
                <li key={lezione.id}>
                  <button type="button" className="cs-mancante" data-urgente={urgente ? "" : undefined} onClick={() => onLezione(lezione.moduloId, lezione)}>
                    <Icona aria-hidden />
                    <span><strong>{lezione.titolo}</strong><small>{motivo}</small></span>
                  </button>
                </li>
              )
            })}
          </ul>
          {voci.length > MASSIMO_VOCI ? <p className="cs-mancanti-altre">e altre {voci.length - MASSIMO_VOCI} nella lista</p> : null}
        </>
      ) : (
        <div>
          <p className="cs-lato-titolo"><CircleCheck className="mr-1 inline size-4" aria-hidden />Nessuna lezione in sospeso</p>
          <p className="cs-lato-sotto">{conti.pubblicate === 1 ? "L'unica lezione è pubblicata." : "Tutte le lezioni sono pubblicate."}</p>
        </div>
      )}
      <p className="cs-lato-app">
        <span>Nell'app del paziente</span>
        <strong>{corso.pubblicato && conti.pubblicate > 0 ? `${lezioni(conti.pubblicate)} in ${moduliVisibili} ${moduliVisibili === 1 ? "modulo" : "moduli"}` : "Ancora niente"}</strong>
      </p>
    </aside>
  )
}
