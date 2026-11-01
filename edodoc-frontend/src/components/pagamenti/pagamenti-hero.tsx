import { CalendarClock, HandCoins, Plus, Receipt } from "lucide-react"
import { LuxHero, LuxKpi } from "@/components/lux"
import { CalendarioIncassi } from "@/components/pagamenti/calendario-incassi"
import { CifraGrande, SelettoreAnno, Verdetto } from "@/components/pagamenti/comuni"
import { Cta } from "@/components/pagina"
import { euro } from "@/lib/format"
import { nomeMese, quadroIncassi, quanti, ritardo } from "@/lib/incassi"

type Quadro = ReturnType<typeof quadroIncassi>

function apertura(q: Quadro) {
  const mese = nomeMese(q.questoMese)
  if (q.morosi.length > 0) {
    const giorni = q.morosi[0].giorni
    return {
      etichetta: "Da sollecitare",
      valore: q.scaduto,
      tono: "danger" as const,
      verdetto: `${quanti(q.morosi.length, "paziente", "pazienti")} · ${ritardo(giorni).toLowerCase()}`,
      sottotitolo: `Prima i solleciti, poi quello che deve arrivare a ${mese}`,
    }
  }
  if (q.attesoMese > 0) {
    return {
      etichetta: `Attesi a ${mese}`,
      valore: q.attesoMese,
      tono: "ok" as const,
      verdetto: "Nessuno da sollecitare",
      sottotitolo: `Nessun ritardo: restano ${quanti(q.attesiDelMese, "pagamento atteso", "pagamenti attesi")} a ${mese}`,
    }
  }
  return {
    etichetta: `Incassati a ${mese}`,
    valore: q.incassatoMese,
    tono: "ok" as const,
    verdetto: q.attesi > 0 ? "Nessuno da sollecitare" : "Nessun incasso in sospeso",
    sottotitolo: q.attesi > 0 ? `Nessun ritardo e niente in scadenza a ${mese}` : "Tutti i pagamenti previsti sono stati incassati",
  }
}

export function PagamentiHero({ q, anno, onAnno, mese, onMese, onNuovo }: {
  q: Quadro
  anno: number
  onAnno: (anno: number) => void
  mese: string | null
  onMese: (mese: string | null) => void
  onNuovo: () => void
}) {
  const a = apertura(q)
  const mostraMese = q.morosi.length > 0
  const nomeDelMese = nomeMese(q.questoMese)
  return (
    <LuxHero ariaLabel="Pagamenti" eyebrow="Incassi dei pazienti" title="Pagamenti" subtitle={a.sottotitolo}
      actions={(
        <>
          <SelettoreAnno anno={anno} onAnno={onAnno} />
          <Cta icona={Plus} onClick={onNuovo}>Nuovo pagamento</Cta>
        </>
      )}>
      <div className="pg-plancia">
        <div className="pg-apertura">
          <p className="pg-etichetta">{a.etichetta}</p>
          <CifraGrande valore={a.valore} />
          <Verdetto tono={a.tono}>{a.verdetto}</Verdetto>
          <ul className="pg-righe-hero">
            {mostraMese ? (
              <li>
                <span><strong>Attesi a {nomeDelMese}</strong><small>{q.inScadenzaOggi > 0 ? `${quanti(q.inScadenzaOggi, "scade", "scadono")} oggi` : quanti(q.attesiDelMese, "pagamento", "pagamenti")}</small></span>
                <strong>{euro(q.attesoMese)}</strong>
              </li>
            ) : null}
            <li>
              <span><strong>Già incassati a {nomeDelMese}</strong><small>Con data di pagamento nel mese</small></span>
              <strong>{euro(q.incassatoMese)}</strong>
            </li>
          </ul>
        </div>
        <CalendarioIncassi colonne={q.calendario} scaduto={q.scaduto} scelto={mese} onScelto={onMese} />
      </div>

      <div className="vl-kpis pg-kpis">
        <LuxKpi icon={<HandCoins className="size-4" />} label={`Incassato ${anno}`} value={euro(q.incassatoAnno)} foot="Tutti i pagamenti ricevuti nell'anno, percorsi e non" />
        <LuxKpi icon={<CalendarClock className="size-4" />} label="Da incassare" value={euro(q.attesoTotale)} foot={`${quanti(q.attesi, "pagamento", "pagamenti")} non ancora in ritardo, tutte le scadenze`} />
        <LuxKpi icon={<Receipt className="size-4" />} label="Da fatturare" value={q.daFatturare} unit={q.daFatturare === 1 ? "pagamento" : "pagamenti"} foot={`${euro(q.importoDaFatturare)} ricevuti senza fattura, tutti gli anni`} />
      </div>
    </LuxHero>
  )
}
