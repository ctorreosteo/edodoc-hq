import { Banknote, CalendarX, ClipboardX, Flag, type LucideIcon } from "lucide-react"
import { LuxAvatar } from "@/components/lux"
import { MenuPaziente } from "@/components/menu-contestuali"
import { useAzioni } from "@/contexts/azioni-context"
import { etichettaMotivo, MOTIVI, TONO_MOTIVO, type Lettura, type Motivo } from "@/lib/pazienti"

export const ICONA_MOTIVO: Record<Motivo, LucideIcon> = { PAGAMENTO: Banknote, FINE_PERCORSO: Flag, CHECK: ClipboardX, VISITA: CalendarX }

const MASSIMO_PILA = 5

const quante = (n: number) => (n === 1 ? "Manca 1 visita" : `Mancano ${n} visite`)

/**
 * Ogni paziente sul gradino delle visite che gli mancano: a parità di gradino un mantenimento da 4
 * e un percorso da 6 sono alla stessa distanza dal rinnovo. Chi ha un problema porta l'icona del motivo.
 */
export function ScalaPercorsi({ letture, gradino, oggi, onGradino }: {
  letture: Lettura[]
  gradino: number | null
  oggi: Date
  onGradino: (gradino: number | null) => void
}) {
  const azioni = useAzioni()
  const inScala = letture.filter((l) => l.rimanenti != null)

  if (inScala.length === 0) return <p className="pz-scala-vuota">Nessun percorso attivo: qui vedrai a che punto è ogni paziente.</p>

  const massimo = Math.max(...inScala.map((l) => l.p.percorso?.visiteTotali ?? 0), 1)
  const conclusi = inScala.some((l) => l.rimanenti === 0)
  const gradini = Array.from({ length: massimo + (conclusi ? 1 : 0) }, (_, i) => massimo - i)
  const presenti = MOTIVI.filter((m) => inScala.some((l) => l.motivi[0] === m))

  return (
    <figure className="pz-scala">
      <figcaption>
        <strong>A che punto sono</strong>
        <span>Visite che mancano alla fine del percorso</span>
      </figcaption>
      <div className="pz-gradini" style={{ gridTemplateColumns: `repeat(${gradini.length}, minmax(0, 1fr))` }}>
        {gradini.map((n) => {
          const voci = inScala.filter((l) => l.rimanenti === n)
          // In pila prima chi ha un problema: se la colonna è piena restano fuori quelli in regola
          const visibili = [...voci].sort((a, b) => b.punteggio - a.punteggio).slice(0, MASSIMO_PILA)
          const altri = voci.length - visibili.length
          return (
            <div key={n} className="pz-gradino" data-scelto={gradino === n ? "" : undefined}>
              <div className="pz-pila">
                {visibili.map((l, i) => {
                  const motivo = l.motivi[0]
                  const Icona = motivo ? ICONA_MOTIVO[motivo] : null
                  const nome = `${l.p.nome} ${l.p.cognome}`
                  const descrizione = l.motivi.length ? `${nome}: ${l.motivi.map((m) => etichettaMotivo(m, 1, oggi)).join(", ")}` : nome
                  return (
                    <MenuPaziente key={l.p.id} paziente={l.p}>
                      <button type="button" className="pz-gettone" style={{ animationDelay: `${i * 45}ms` }} title={descrizione} aria-label={`Apri ${descrizione}`} data-tono={motivo ? TONO_MOTIVO[motivo] : undefined} onClick={() => azioni.apriPaziente(l.p.id)}>
                        <LuxAvatar first={l.p.nome} second={l.p.cognome} />
                        {Icona ? <i aria-hidden><Icona /></i> : null}
                      </button>
                    </MenuPaziente>
                  )
                })}
                {altri > 0 ? <button type="button" className="pz-altri" aria-label={`Mostra altri ${altri} pazienti: ${quante(n).toLowerCase()}`} onClick={() => onGradino(n)}>+{altri}</button> : null}
              </div>
              <button type="button" className="pz-gradino-numero" aria-pressed={gradino === n} disabled={voci.length === 0 && gradino !== n} aria-label={n === 0 ? "Filtra chi ha fatto tutte le visite" : `Filtra: ${quante(n).toLowerCase()}`} onClick={() => onGradino(gradino === n ? null : n)}>
                {n === 0 ? "Fine" : n}
              </button>
            </div>
          )
        })}
      </div>
      {presenti.length > 0 ? (
        <ul className="pz-legenda">
          {presenti.map((m) => {
            const Icona = ICONA_MOTIVO[m]
            return <li key={m} data-tono={TONO_MOTIVO[m]}><i aria-hidden><Icona /></i>{etichettaMotivo(m, 1, oggi)}</li>
          })}
        </ul>
      ) : null}
    </figure>
  )
}
