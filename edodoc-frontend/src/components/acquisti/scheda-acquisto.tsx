import { ChevronDown, Info, Mail, Repeat } from "lucide-react"
import { useState } from "react"
import { RigaPagamento } from "@/components/acquisti/riga-pagamento"
import { TracciaPercorso } from "@/components/acquisti/traccia-percorso"
import { LuxAvatar } from "@/components/lux"
import { MenuAcquisto } from "@/components/menu-contestuali"
import { Azione, partiNome } from "@/components/pagamenti/comuni"
import { useAzioni } from "@/contexts/azioni-context"
import { PIANO_PAGAMENTO, TIPO_PERCORSO } from "@/lib/etichette"
import { data, euro } from "@/lib/format"
import { nonCoperto, statoAcquisto, versoRinnovo } from "@/lib/incassi"
import type { Acquisto } from "@/types"

function dettaglioStato(a: Acquisto) {
  const buco = nonCoperto(a)
  if (a.scaduto > 0) return `${euro(a.scaduto)} oltre la scadenza${buco > 0 ? `, ${euro(buco)} senza pagamento` : ""}`
  if (buco > 0) return `${euro(buco)} senza pagamento`
  if (a.daPagare > 0) return a.prossimaScadenza ? `${euro(a.daPagare)}, prossima il ${data(a.prossimaScadenza)}` : euro(a.daPagare)
  if (a.percorso.stato === "CONCLUSO") return "Percorso concluso"
  return a.percorso.stato === "ATTIVO" ? "Nessuna rata aperta" : ""
}

function SpiegaNonCoperto({ acquisto, fuoriPercorso }: { acquisto: Acquisto; fuoriPercorso: number }) {
  return (
    <p className="aq-spiega">
      <Info className="size-4" aria-hidden />
      <span>
        Il piano vale {euro(acquisto.percorso.importoTotale)}: {euro(acquisto.pagato)} incassati e {euro(acquisto.daPagare + acquisto.scaduto)} in attesa.
        I restanti {euro(nonCoperto(acquisto))} non hanno un pagamento collegato, di solito perché le rate sono state annullate.
        {fuoriPercorso > 0 ? ` Per questo paziente risultano ${euro(fuoriPercorso)} incassati fuori percorso: controlla se comprendono questa cifra.` : ""}
      </span>
    </p>
  )
}

export function SchedaAcquisto({ acquisto, fuoriPercorso }: { acquisto: Acquisto; fuoriPercorso: number }) {
  const azioni = useAzioni()
  const [aperto, setAperto] = useState(false)
  const { percorso: p, pazienteNome } = acquisto
  const { primo, secondo } = partiNome(pazienteNome)
  const stato = statoAcquisto(acquisto)
  const buco = nonCoperto(acquisto)
  const annullato = p.stato === "ANNULLATO"

  return (
    <MenuAcquisto acquisto={acquisto}>
      <li className="aq-scheda" data-tono={stato.tono}>
        <div className="aq-scheda-riga">
          <button type="button" className="aq-chi" onClick={() => azioni.apriPaziente(p.pazienteId)}>
            <LuxAvatar first={primo} second={secondo} />
            <span>
              <strong>{pazienteNome}</strong>
              <small>{TIPO_PERCORSO[p.tipo]} · {PIANO_PAGAMENTO[p.pianoPagamento]}</small>
              <small>{data(p.dataInizio)} – {data(p.dataFine)}</small>
            </span>
          </button>
          <TracciaPercorso acquisto={acquisto} />
          <div className="aq-stato">
            <span className="pg-stato" data-tono={stato.tono}>{stato.testo}</span>
            <small>{dettaglioStato(acquisto)}</small>
          </div>
          <div className="aq-azioni">
            {acquisto.scaduto > 0 ? (
              <Azione icona={Mail} forte etichetta={`Sollecita ${pazienteNome}`} onClick={() => azioni.inviaEmail({ tipo: "SOLLECITO_PAGAMENTO", pazienteId: p.pazienteId })}>Sollecita</Azione>
            ) : versoRinnovo(acquisto) ? (
              <Azione icona={Repeat} etichetta={`Rinnovo o mantenimento per ${pazienteNome}`} onClick={() => azioni.nuovoPercorso(p.pazienteId)}>Rinnova</Azione>
            ) : null}
            <button type="button" className="aq-apri" aria-expanded={aperto} aria-label={`Pagamenti di ${pazienteNome}: ${acquisto.pagamenti.length}`} onClick={() => setAperto((a) => !a)}>
              <span aria-hidden>{acquisto.pagamenti.length}</span>
              <ChevronDown className="pg-freccia size-4" data-aperta={aperto ? "" : undefined} aria-hidden />
            </button>
          </div>
        </div>
        {aperto ? (
          <div className="aq-dettaglio">
            {buco > 0 && !annullato ? <SpiegaNonCoperto acquisto={acquisto} fuoriPercorso={fuoriPercorso} /> : null}
            {acquisto.pagamenti.length === 0 ? <p className="aq-nessuno">Nessun pagamento collegato</p> : (
              <ul className="aq-rate">{acquisto.pagamenti.map((r) => <RigaPagamento key={r.id} pagamento={r} />)}</ul>
            )}
          </div>
        ) : null}
      </li>
    </MenuAcquisto>
  )
}
