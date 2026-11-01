import { CalendarDays, CircleCheck, ClipboardCheck, UserPlus, Users } from "lucide-react"
import { LuxHero, LuxKpi } from "@/components/lux"
import { Cta } from "@/components/pagina"
import { ICONA_MOTIVO, ScalaPercorsi } from "@/components/pazienti/scala-percorsi"
import { useAzioni } from "@/contexts/azioni-context"
import { useConteggio } from "@/hooks/use-conteggio"
import { entroSetteGiorni, etichettaMotivo, inPercorso, MOTIVI, ordina, quandoVisita, TONO_MOTIVO, type Lettura, type Motivo } from "@/lib/pazienti"

function sottotitolo(daSeguire: number, totale: number) {
  if (totale === 0) return "Aggiungi il primo paziente per iniziare"
  if (daSeguire === 0) return "Pagamenti, check, visite e percorsi sono tutti in ordine"
  return "Chi ha bisogno di te adesso, e perché"
}

export function PazientiHero({ letture, motivo, gradino, oggi, onMotivo, onGradino }: {
  letture: Lettura[]
  motivo: Motivo | null
  gradino: number | null
  oggi: Date
  onMotivo: (motivo: Motivo | null) => void
  onGradino: (gradino: number | null) => void
}) {
  const azioni = useAzioni()
  const daSeguire = letture.filter((l) => l.motivi.length > 0).length
  const mostrato = Math.round(useConteggio(daSeguire))
  const attivi = letture.filter((l) => inPercorso(l.p))
  const compilati = attivi.filter((l) => l.p.checkSettimana).length
  const prossima = ordina(letture, "VISITA")[0]?.p
  const inSettimana = letture.filter((l) => entroSetteGiorni(l.p.prossimaVisita)).length

  const conteggio = (m: Motivo) => (m === "CHECK" ? attivi.filter((l) => l.checkAssente).length : letture.filter((l) => l.motivi.includes(m)).length)

  return (
    <LuxHero ariaLabel="Pazienti" eyebrow={`${attivi.length} in percorso · ${letture.length} in anagrafica`} title="Pazienti" subtitle={sottotitolo(daSeguire, letture.length)}
      actions={<Cta icona={UserPlus} onClick={() => azioni.nuovoPaziente()}>Nuovo paziente</Cta>}>
      <div className="pz-plancia">
        <div className="pz-attenzione">
          {daSeguire > 0 ? (
            <>
              <p className="pz-attenzione-valore">{mostrato}</p>
              <p className="pz-attenzione-etichetta">{daSeguire === 1 ? "paziente da seguire" : "pazienti da seguire"}</p>
            </>
          ) : letture.length > 0 ? (
            <p className="pz-tutto-ok"><CircleCheck aria-hidden />Nessuno da seguire</p>
          ) : null}
          <div className="pz-motivi" role="group" aria-label="Filtra per motivo">
            {MOTIVI.map((m) => {
              const n = conteggio(m)
              const Icona = ICONA_MOTIVO[m]
              const inAttesa = m === "CHECK" && n > 0 && !letture.some((l) => l.motivi.includes("CHECK"))
              return (
                <button key={m} type="button" className="pz-motivo" data-tono={inAttesa ? undefined : TONO_MOTIVO[m]} aria-pressed={motivo === m} disabled={n === 0} onClick={() => onMotivo(motivo === m ? null : m)}>
                  <i aria-hidden><Icona /></i>
                  <span>{etichettaMotivo(m, n, oggi)}</span>
                  <strong>{n}</strong>
                </button>
              )
            })}
          </div>
        </div>
        <ScalaPercorsi letture={letture} gradino={gradino} oggi={oggi} onGradino={onGradino} />
      </div>

      <div className="vl-kpis vl-kpis--3">
        <LuxKpi icon={<Users className="size-4" />} label="In percorso" value={attivi.length} foot={`${letture.length} in anagrafica`} />
        <LuxKpi icon={<ClipboardCheck className="size-4" />} label="Check di questa settimana" value={compilati} unit={`/${attivi.length}`} progress={attivi.length ? (compilati / attivi.length) * 100 : 0} />
        <LuxKpi icon={<CalendarDays className="size-4" />} label="Prossima visita" value={prossima?.prossimaVisita ? quandoVisita(prossima.prossimaVisita, oggi).testo : "Nessuna"}
          foot={prossima?.prossimaVisita ? `${prossima.nome} ${prossima.cognome}${inSettimana > 1 ? ` · ${inSettimana} pazienti entro 7 giorni` : ""}` : "Nessuna visita in agenda"} />
      </div>
    </LuxHero>
  )
}
