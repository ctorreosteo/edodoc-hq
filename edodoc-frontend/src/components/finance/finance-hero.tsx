import { CalendarClock, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Landmark, Plus, Sparkles, TriangleAlert, Wallet } from "lucide-react"
import { COLORI_SCENARI, CurvaSoglia } from "@/components/finance/curva-soglia"
import { LuxHero, LuxKpi } from "@/components/lux"
import { Cta } from "@/components/pagina"
import { useConteggio } from "@/hooks/use-conteggio"
import { accantonamenti, giorniDa, quandoScade, verdetto } from "@/lib/finance"
import { euroTondi } from "@/lib/format"
import type { Movimento, RiepilogoFinance, ScadenzaFiscale } from "@/types"

const ICONA_VERDETTO = { ok: CircleCheck, warn: TriangleAlert, danger: CircleAlert }

function distanza(margine: number) {
  if (margine === 0) return "Sulla soglia"
  return margine < 0 ? `${euroTondi(-margine)} oltre la soglia` : `${euroTondi(margine)} sotto la soglia`
}

export function FinanceHero({ r, movimenti, scadenze, anno, onAnno, onNuovoMovimento }: {
  r: RiepilogoFinance
  movimenti: Movimento[]
  scadenze: ScadenzaFiscale[]
  anno: number
  onAnno: (anno: number) => void
  onNuovoMovimento: () => void
}) {
  const incassato = useConteggio(r.totali.lordo)
  const giudizio = verdetto(r)
  const { daAccantonare, cassaLibera, versato } = accantonamenti(r, movimenti)
  const prossima = scadenze.find((s) => s.stato !== "PAGATA")
  const Icona = ICONA_VERDETTO[giudizio.tono]
  const annoMassimo = new Date().getFullYear() + 1

  return (
    <LuxHero ariaLabel="Finance" eyebrow={`Regime forfettario · soglia ${euroTondi(r.soglia)}`} title="Finance" subtitle={giudizio.testo}
      actions={(
        <>
          <div className="fi-anno" role="group" aria-label="Anno">
            <button type="button" aria-label="Anno precedente" onClick={() => onAnno(anno - 1)}><ChevronLeft className="size-4" aria-hidden /></button>
            <span aria-live="polite">{anno}</span>
            <button type="button" aria-label="Anno successivo" disabled={anno >= annoMassimo} onClick={() => onAnno(anno + 1)}><ChevronRight className="size-4" aria-hidden /></button>
          </div>
          <Cta icona={Plus} onClick={onNuovoMovimento}>Nuovo movimento</Cta>
        </>
      )}>
      <div className="fi-plancia">
        <div className="fi-traguardo">
          <p className="fi-traguardo-etichetta">Fatturato lordo {r.anno}</p>
          <p className="fi-traguardo-valore">{euroTondi(incassato)}</p>
          <p className="fi-verdetto" data-tono={giudizio.tono}><Icona className="size-4" aria-hidden />{giudizio.titolo}</p>
          <ul className="fi-scenari" aria-label="Previsione a fine anno">
            {r.livelli.map((l, i) => (
              <li key={l.nome}>
                <i data-tratteggio={i > 0 ? "" : undefined} style={{ color: COLORI_SCENARI[i] }} aria-hidden />
                <span className="fi-scenario-nome">
                  <strong>{l.nome}</strong>
                  <small>{l.descrizione}</small>
                </span>
                <span className="fi-scenario-valori">
                  <strong>{euroTondi(l.totale)}</strong>
                  <small>{distanza(l.margineSoglia)}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <CurvaSoglia r={r} />
      </div>

      <div className="vl-kpis">
        <LuxKpi icon={<Wallet className="size-4" />} label="Saldo cassa" value={euroTondi(r.saldoCassa)} foot={`Entrate meno uscite del ${r.anno}`} />
        <LuxKpi icon={<Landmark className="size-4" />} label="Da accantonare" value={euroTondi(daAccantonare)} foot={versato > 0 ? `Già versati ${euroTondi(versato)}` : "Imposta, cassa e contributo"} />
        <LuxKpi icon={<Sparkles className="size-4" />} label="Cassa libera" value={euroTondi(cassaLibera)} foot="Saldo meno accantonamenti" highlight
          title="Stima: considera i versamenti a imposte e cassa dell'anno come pagati per quest'anno" />
        <LuxKpi icon={<CalendarClock className="size-4" />} label="Prossima scadenza" value={prossima ? quandoScade(giorniDa(prossima.dataScadenza)).testo : "Nessuna"}
          foot={prossima ? `${prossima.titolo}${prossima.importoStimato != null ? ` · ${euroTondi(prossima.importoStimato)}` : ""}` : "Nulla da pagare quest'anno"} />
      </div>
    </LuxHero>
  )
}
