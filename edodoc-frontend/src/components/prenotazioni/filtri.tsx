import { CalendarRange, RotateCcw, X } from "lucide-react"
import { Cerca, Segmenti, SelettoreAnno } from "@/components/pagamenti/comuni"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ESITO, etichettaPeriodo, filtriIniziali, MESI, ORDINE_STATI, PERIODI, RISPOSTA_INVITO, STATO_PRENOTAZIONE, type Filtri, type Periodo } from "@/lib/prenotazioni"
import type { StatoPrenotazione } from "@/types"

const CAMPI = { chiamata: "Della chiamata", prenotazione: "Di prenotazione" }
const ESITI: Record<string, string> = { TUTTI: "Qualsiasi esito", NESSUNO: "Senza esito", ...Object.fromEntries(Object.entries(ESITO).map(([k, v]) => [k, v.testo])) }
const INVITI: Record<string, string> = { TUTTI: "Qualsiasi risposta", ...Object.fromEntries(Object.entries(RISPOSTA_INVITO).map(([k, v]) => [k, v.testo])) }

function Scelta({ valore, onValore, voci, etichetta, className }: {
  valore: string; onValore: (v: string) => void; voci: Record<string, string>; etichetta: string; className?: string
}) {
  return (
    <Select value={valore} onValueChange={onValore}>
      <SelectTrigger aria-label={etichetta} className={className} data-on={valore !== "TUTTI" ? "" : undefined}><SelectValue /></SelectTrigger>
      <SelectContent>
        {Object.entries(voci).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

/**
 * Filtri della pagina Prenotazioni, sullo schema di Richieste in Mobilitas: su quale data guardare,
 * periodo a segmenti con il dettaglio accanto, stati con i conteggi, esito, risposta all'invito e ricerca.
 * Sotto, il riassunto di cosa si sta guardando e il tasto per azzerare.
 */
export function FiltriPrenotazioni({ filtri, onFiltri, conteggi, risultati }: {
  filtri: Filtri
  onFiltri: (f: Filtri) => void
  conteggi: Record<StatoPrenotazione, number>
  risultati: number
}) {
  const f = filtri
  const imposta = (patch: Partial<Filtri>) => onFiltri({ ...f, ...patch })
  const iniziali = filtriIniziali()
  const cambiaPeriodo = (periodo: string) => imposta({ periodo: periodo as Periodo })
  const toggleStato = (s: StatoPrenotazione) => imposta({ stati: f.stati.includes(s) ? f.stati.filter((x) => x !== s) : [...f.stati, s] })

  const parti = [etichettaPeriodo(f), f.campo === "chiamata" ? "data della chiamata" : "data di prenotazione"]
  if (f.stati.length) parti.push(f.stati.length === 1 ? STATO_PRENOTAZIONE[f.stati[0]].testo : `${f.stati.length} stati`)
  if (f.esito !== "TUTTI") parti.push(ESITI[f.esito])
  if (f.invito !== "TUTTI") parti.push(`invito ${INVITI[f.invito].toLowerCase()}`)
  if (f.ricerca.trim()) parti.push(`“${f.ricerca.trim()}”`)
  const modificati = f.campo !== iniziali.campo || f.periodo !== iniziali.periodo || f.mese !== iniziali.mese || f.anno !== iniziali.anno
    || f.stati.length > 0 || f.esito !== "TUTTI" || f.invito !== "TUTTI" || !!f.ricerca.trim()

  return (
    <section className="pr-filtri" aria-label="Filtri delle discovery call">
      <div className="pr-riga">
        <span className="pr-etichetta">Data</span>
        <Segmenti voci={CAMPI} scelto={f.campo} onScelto={(campo) => imposta({ campo: campo as Filtri["campo"] })} etichetta="Su quale data filtrare" />
      </div>

      <div className="pr-riga pr-riga--periodo">
        <span className="pr-etichetta"><CalendarRange aria-hidden />Periodo</span>
        <div className="pr-periodo-segmenti">
          <Segmenti voci={PERIODI} scelto={f.periodo} onScelto={cambiaPeriodo} etichetta="Periodo" />
        </div>
        <Scelta className="pr-periodo-tendina" valore={f.periodo} onValore={cambiaPeriodo} voci={PERIODI} etichetta="Periodo" />
        <div className="pr-dettaglio">
          {f.periodo === "mese" ? (
            <Select value={String(f.mese)} onValueChange={(v) => imposta({ mese: Number(v) })}>
              <SelectTrigger aria-label="Mese" className="pr-mese"><SelectValue /></SelectTrigger>
              <SelectContent>{MESI.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          ) : null}
          {f.periodo === "trimestre" ? (
            <Segmenti voci={{ 0: "1°", 1: "2°", 2: "3°", 3: "4°" }} scelto={String(f.trimestre)} onScelto={(v) => imposta({ trimestre: Number(v) })} etichetta="Trimestre" />
          ) : null}
          {f.periodo === "semestre" ? (
            <Segmenti voci={{ 0: "1° semestre", 1: "2° semestre" }} scelto={String(f.semestre)} onScelto={(v) => imposta({ semestre: Number(v) })} etichetta="Semestre" />
          ) : null}
          {["mese", "trimestre", "semestre", "anno"].includes(f.periodo) ? <SelettoreAnno anno={f.anno} onAnno={(anno) => imposta({ anno })} /> : null}
          {f.periodo === "giorno" ? (
            <Input type="date" className="pr-data" aria-label="Giorno" value={f.giorno} onChange={(e) => imposta({ giorno: e.target.value })} />
          ) : null}
          {f.periodo === "intervallo" ? (
            <>
              <label className="pr-sub"><span>Dal</span><Input type="date" className="pr-data" value={f.da} onChange={(e) => imposta({ da: e.target.value })} /></label>
              <label className="pr-sub"><span>Al</span><Input type="date" className="pr-data" value={f.a} onChange={(e) => imposta({ a: e.target.value })} /></label>
            </>
          ) : null}
          {f.periodo !== iniziali.periodo || f.mese !== iniziali.mese || f.anno !== iniziali.anno ? (
            <button type="button" className="pr-azzera-periodo" title="Torna al mese corrente" aria-label="Torna al mese corrente"
              onClick={() => imposta({ periodo: iniziali.periodo, mese: iniziali.mese, anno: iniziali.anno })}><X aria-hidden /></button>
          ) : null}
        </div>
      </div>

      <div className="pr-riga">
        <span className="pr-etichetta">Stato</span>
        <div className="pr-stati" role="group" aria-label="Stati">
          {ORDINE_STATI.map((s) => (
            <button key={s} type="button" className="pr-stato" data-tono={STATO_PRENOTAZIONE[s].tono} aria-pressed={f.stati.includes(s)}
              data-vuoto={conteggi[s] === 0 ? "" : undefined} onClick={() => toggleStato(s)}>
              <i aria-hidden />{STATO_PRENOTAZIONE[s].breve}<b>{conteggi[s]}</b>
            </button>
          ))}
        </div>
      </div>

      <div className="pr-riga pr-riga--campi">
        <Scelta valore={f.esito} onValore={(v) => imposta({ esito: v as Filtri["esito"] })} voci={ESITI} etichetta="Esito" className="pr-tendina" />
        <Scelta valore={f.invito} onValore={(v) => imposta({ invito: v as Filtri["invito"] })} voci={INVITI} etichetta="Risposta all'invito" className="pr-tendina" />
        <div className="pr-cerca">
          <Cerca valore={f.ricerca} onValore={(ricerca) => imposta({ ricerca })} etichetta="Cerca discovery call" segnaposto="Nome, email, telefono, obiettivo" />
        </div>
      </div>

      <footer className="pr-riassunto">
        <p><b>{risultati}</b> discovery call · {parti.join(" · ")}</p>
        {modificati ? (
          <button type="button" onClick={() => onFiltri({ ...iniziali })}><RotateCcw aria-hidden />Azzera filtri</button>
        ) : null}
      </footer>
    </section>
  )
}
