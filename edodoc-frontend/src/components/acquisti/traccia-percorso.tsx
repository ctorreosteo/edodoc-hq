import { euro } from "@/lib/format"
import { nonCoperto, quanti, tacche, tempoTrascorso } from "@/lib/incassi"
import type { Acquisto } from "@/types"

/** Una fascia sola con le parti dell'importo: stessa lettura nell'hero e in ogni riga. */
export function BarraImporti({ pagato, attesa, scaduto, buco, etichetta }: { pagato: number; attesa: number; scaduto: number; buco: number; etichetta: string }) {
  const parti = [{ serie: "incassato", valore: pagato }, { serie: "atteso", valore: attesa }, { serie: "scaduto", valore: scaduto }, { serie: "buco", valore: buco }].filter((p) => p.valore > 0)
  return (
    <div className="aq-barra" role="img" aria-label={etichetta}>
      {parti.map((p) => <i key={p.serie} data-serie={p.serie} style={{ flexGrow: p.valore }} />)}
    </div>
  )
}

/** Doppia traccia: sopra le visite e il tempo passato, sotto i soldi. */
export function TracciaPercorso({ acquisto }: { acquisto: Acquisto }) {
  const { percorso: p } = acquisto
  const buco = nonCoperto(acquisto)
  const tempo = Math.round(tempoTrascorso(p))
  const inCorso = p.stato === "ATTIVO" && tempo > 0 && tempo < 100
  const importi = [
    `${euro(acquisto.pagato)} incassati su ${euro(p.importoTotale)}`,
    acquisto.daPagare > 0 ? `${euro(acquisto.daPagare)} da incassare` : null,
    acquisto.scaduto > 0 ? `${euro(acquisto.scaduto)} scaduti` : null,
    buco > 0 ? `${euro(buco)} non coperti` : null,
  ].filter(Boolean).join(", ")

  return (
    <div className="aq-traccia">
      <p className="aq-traccia-riga"><span>{p.visiteEffettuate} di {quanti(p.visiteTotali, "visita", "visite")}</span></p>
      <div className="aq-visite" role="img"
        aria-label={`${p.visiteEffettuate} visite fatte, ${Math.max(0, p.visiteFissate - p.visiteEffettuate)} fissate, su ${p.visiteTotali}${inCorso ? `. Trascorso il ${tempo}% del percorso` : ""}`}>
        {tacche(p).map((stato, i) => <i key={i} data-visita={stato} />)}
        {inCorso ? <b className="aq-oggi" style={{ left: `${tempo}%` }} /> : null}
      </div>
      <p className="aq-traccia-riga"><span>{euro(acquisto.pagato)}</span><small>su {euro(p.importoTotale)}</small></p>
      <BarraImporti pagato={acquisto.pagato} attesa={acquisto.daPagare} scaduto={acquisto.scaduto} buco={buco} etichetta={importi} />
    </div>
  )
}
