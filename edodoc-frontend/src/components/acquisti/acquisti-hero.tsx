import { AlertTriangle, CircleDashed, Plus, Repeat, type LucideIcon } from "lucide-react"
import { BarraImporti } from "@/components/acquisti/traccia-percorso"
import { LuxHero } from "@/components/lux"
import { Verdetto } from "@/components/pagamenti/comuni"
import { Cta } from "@/components/pagina"
import { useConteggio } from "@/hooks/use-conteggio"
import { euro } from "@/lib/format"
import { quadroAcquisti, quanti } from "@/lib/incassi"

type Quadro = ReturnType<typeof quadroAcquisti>

function Attenzione({ icona: Icona, titolo, numero, testo, attivo, onClick }: { icona: LucideIcon; titolo: string; numero: number; testo: string; attivo: boolean; onClick: () => void }) {
  return (
    <button type="button" className="aq-attenzione" aria-pressed={attivo} disabled={numero === 0} onClick={onClick}>
      <span className="aq-attenzione-testa"><Icona className="size-4" aria-hidden />{titolo}</span>
      <strong>{numero}</strong>
      <small>{testo}</small>
    </button>
  )
}

const VOCI = [
  { serie: "incassato", nome: "Incassato sui percorsi", nota: "Solo pagamenti collegati", chiave: "incassato" },
  { serie: "atteso", nome: "Da incassare", nota: "Rate non ancora scadute", chiave: "daIncassare" },
  { serie: "scaduto", nome: "Scaduto", nota: "Rate oltre la scadenza", chiave: "scaduto" },
  { serie: "buco", nome: "Non coperto", nota: "Nessun pagamento collegato", chiave: "nonCoperto" },
] as const

export function AcquistiHero({ q, filtro, onFiltro, onNuovo }: { q: Quadro; filtro: string; onFiltro: (filtro: string) => void; onNuovo: () => void }) {
  const attivi = Math.round(useConteggio(q.attivi))
  const scegli = (chiave: string) => onFiltro(filtro === chiave ? "ATTIVI" : chiave)
  const vuoto = q.validi === 0
  const daSeguire = q.conScaduto + q.scoperti

  return (
    <LuxHero ariaLabel="Acquisti" eyebrow="Percorsi venduti" title="Acquisti" subtitle="A che punto è ogni paziente: visite fatte, soldi arrivati e cosa manca"
      actions={<Cta icona={Plus} onClick={onNuovo}>Nuovo acquisto</Cta>}>
      <div className="aq-plancia">
        <div className="pg-apertura">
          <p className="pg-etichetta">Percorsi in corso</p>
          <p className="pg-valore">{attivi}</p>
          {vuoto ? <Verdetto tono="ok">Nessun acquisto registrato</Verdetto> : (
            <Verdetto tono={q.conScaduto > 0 ? "danger" : daSeguire > 0 ? "warn" : "ok"}>
              {q.conScaduto > 0 ? `${quanti(q.conScaduto, "percorso", "percorsi")} con rate scadute` : q.scoperti > 0 ? `${quanti(q.scoperti, "percorso", "percorsi")} da verificare` : "Tutti in regola"}
            </Verdetto>
          )}
          <p className="pg-nota">{quanti(q.validi, "acquisto valido", "acquisti validi")}, annullati esclusi</p>
        </div>

        <div className="aq-valore">
          <p className="aq-valore-titolo">Dove sono i {euro(q.valore)} dei percorsi venduti</p>
          <BarraImporti pagato={q.incassato} attesa={q.daIncassare} scaduto={q.scaduto} buco={q.nonCoperto}
            etichetta={`${euro(q.incassato)} incassati, ${euro(q.daIncassare)} da incassare, ${euro(q.scaduto)} scaduti, ${euro(q.nonCoperto)} non coperti`} />
          <ul className="aq-valore-voci">
            {VOCI.map((v) => (
              <li key={v.serie}>
                <i data-serie={v.serie} aria-hidden />
                <span><small>{v.nome}</small><strong>{euro(q[v.chiave])}</strong><small>{v.nota}</small></span>
              </li>
            ))}
          </ul>
          {q.fuoriPercorso > 0 ? <p className="pg-nota">Altri {euro(q.fuoriPercorso)} sono incassi fuori percorso: stanno nel totale di Pagamenti, non in questa fascia.</p> : null}
        </div>
      </div>

      <div className="aq-attenzioni" role="group" aria-label="Situazioni da seguire">
        <Attenzione icona={AlertTriangle} titolo="Rate scadute" numero={q.conScaduto} testo={q.conScaduto > 0 ? `${euro(q.scaduto)} da sollecitare` : "Nessuna rata oltre la scadenza"} attivo={filtro === "SCADUTI"} onClick={() => scegli("SCADUTI")} />
        <Attenzione icona={CircleDashed} titolo="Non coperti" numero={q.scoperti} testo={q.scoperti > 0 ? "Parte del prezzo senza pagamento: rate annullate o incasso fuori percorso" : "Ogni piano ha i suoi pagamenti"} attivo={filtro === "NON_COPERTI"} onClick={() => scegli("NON_COPERTI")} />
        <Attenzione icona={Repeat} titolo="Verso il rinnovo" numero={q.rinnovi} testo={q.rinnovi > 0 ? "Ultima visita in vista o meno di 30 giorni alla fine" : "Nessun percorso in chiusura"} attivo={filtro === "RINNOVO"} onClick={() => scegli("RINNOVO")} />
      </div>
    </LuxHero>
  )
}
