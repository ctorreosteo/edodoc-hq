import { addDays, format, isSameDay, parseISO, startOfYear } from "date-fns"
import { it } from "date-fns/locale"
import { CalendarArrowUp, CalendarClock, ChevronDown, ChevronUp, ChevronsUpDown, CircleAlert, History, Layers, PanelRight, Video, type LucideIcon } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { Chip } from "@/components/chip"
import { MenuVisita } from "@/components/menu-contestuali"
import { Cerca, Segmenti } from "@/components/pagamenti/comuni"
import { Tabella } from "@/components/pagina"
import { Caricamento, Errore, Vuoto } from "@/components/stati"
import { Input } from "@/components/ui/input"
import { useAzioni } from "@/contexts/azioni-context"
import { useDati } from "@/hooks/use-dati"
import { MODALITA_VISITA, STATO_VISITA, SYNC_GOOGLE, TIPO_VISITA } from "@/lib/etichette"
import { data, ora } from "@/lib/format"
import { formatDateOnlyLocal } from "@/lib/utils"
import { visiteService } from "@/services/gestionale"
import type { Visita } from "@/types"
import "@/style/pagamenti.css"

type Colonna = "data" | "ora" | "paziente" | "tipo" | "stato"
type Ordine = { colonna: Colonna; verso: "asc" | "desc" }

const STATI_FILTRO: Record<string, string> = {
  TUTTE: "Tutte", PROGRAMMATA: "Programmate", EFFETTUATA: "Effettuate", NON_PRESENTATO: "Non presentati", ANNULLATA: "Annullate",
}

const minutiDelGiorno = (v: Visita) => {
  const d = parseISO(v.inizio)
  return d.getHours() * 60 + d.getMinutes()
}

function confronta(a: Visita, b: Visita, colonna: Colonna) {
  switch (colonna) {
    case "data": return a.inizio.localeCompare(b.inizio)
    case "ora": return minutiDelGiorno(a) - minutiDelGiorno(b) || a.inizio.localeCompare(b.inizio)
    case "paziente": return a.pazienteNome.localeCompare(b.pazienteNome, "it") || a.inizio.localeCompare(b.inizio)
    case "tipo": return (TIPO_VISITA[a.tipo] ?? a.tipo).localeCompare(TIPO_VISITA[b.tipo] ?? b.tipo, "it") || a.inizio.localeCompare(b.inizio)
    case "stato": return (STATO_VISITA[a.stato]?.testo ?? a.stato).localeCompare(STATO_VISITA[b.stato]?.testo ?? b.stato, "it") || a.inizio.localeCompare(b.inizio)
  }
}

function cerca(visite: Visita[], testo: string) {
  const t = testo.trim().toLowerCase()
  if (!t) return visite
  return visite.filter((v) => `${v.pazienteNome} ${v.pazienteEmail ?? ""} ${v.pazienteCellulare ?? ""} ${v.id}`.toLowerCase().includes(t))
}

function Intestazione({ colonna, ordine, onOrdina, children }: { colonna: Colonna; ordine: Ordine; onOrdina: (c: Colonna) => void; children: ReactNode }) {
  const attiva = ordine.colonna === colonna
  const Icona = !attiva ? ChevronsUpDown : ordine.verso === "asc" ? ChevronUp : ChevronDown
  return (
    <th aria-sort={attiva ? (ordine.verso === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="vs-th-ordina" onClick={() => onOrdina(colonna)}>
        {children}<Icona aria-hidden data-attiva={attiva ? "" : undefined} />
      </button>
    </th>
  )
}

/** Tabella ordinabile: clic sulla riga apre la scheda laterale, tasto destro il menu della visita. */
export function TabellaVisite({ visite, conData, vuoto, ordineIniziale }: { visite: Visita[]; conData: boolean; vuoto: string; ordineIniziale?: Ordine }) {
  const azioni = useAzioni()
  const [ordine, setOrdine] = useState<Ordine>(ordineIniziale ?? { colonna: conData ? "data" : "ora", verso: "asc" })
  const righe = useMemo(() => {
    const copia = [...visite].sort((a, b) => confronta(a, b, ordine.colonna))
    return ordine.verso === "asc" ? copia : copia.reverse()
  }, [visite, ordine])
  const ordina = (colonna: Colonna) => setOrdine((o) => (o.colonna === colonna ? { colonna, verso: o.verso === "asc" ? "desc" : "asc" } : { colonna, verso: "asc" }))

  if (visite.length === 0) return <Vuoto titolo={vuoto} />

  return (
    <Tabella>
      <thead>
        <tr>
          {conData ? <Intestazione colonna="data" ordine={ordine} onOrdina={ordina}>Data</Intestazione> : null}
          <Intestazione colonna="ora" ordine={ordine} onOrdina={ordina}>Ora</Intestazione>
          <Intestazione colonna="paziente" ordine={ordine} onOrdina={ordina}>Paziente</Intestazione>
          <Intestazione colonna="tipo" ordine={ordine} onOrdina={ordina}>Tipo</Intestazione>
          <th>Percorso</th>
          <th>Modalità</th>
          <Intestazione colonna="stato" ordine={ordine} onOrdina={ordina}>Stato</Intestazione>
          <th>Google</th>
          <th className="vs-td-azioni"><span className="sr-only">Azioni</span></th>
        </tr>
      </thead>
      <tbody>
        {righe.map((v) => {
          const google = SYNC_GOOGLE[v.googleSyncStato]
          const stato = STATO_VISITA[v.stato]
          return (
            <MenuVisita key={v.id} visita={v}>
              <tr className="vs-tr" data-tipo={v.tipo} data-stato={v.stato} tabIndex={0} aria-label={`Apri la visita di ${v.pazienteNome}`}
                onClick={() => azioni.apriVisita(v)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    azioni.apriVisita(v)
                  }
                }}>
                {conData ? <td className="vs-td-data">{format(parseISO(v.inizio), "EEE d MMM yyyy", { locale: it })}</td> : null}
                <td className="vs-td-ora">{ora(v.inizio)}<small>–{ora(v.fine)}</small></td>
                <td className="vs-td-paziente">
                  <button type="button" className="vs-link-paziente" onClick={(e) => {
                    e.stopPropagation()
                    azioni.apriPaziente(v.pazienteId)
                  }}>{v.pazienteNome}</button>
                </td>
                <td><span className="vs-tipo"><i aria-hidden />{TIPO_VISITA[v.tipo] ?? v.tipo}</span></td>
                <td className="vs-td-numero">{v.numeroVisita ? `${v.numeroVisita} su ${v.visiteTotali}` : "—"}</td>
                <td>{MODALITA_VISITA[v.modalita] ?? v.modalita}</td>
                <td>{stato ? <Chip tono={stato.tono}>{stato.testo}</Chip> : v.stato}</td>
                <td>
                  {v.googleSyncStato === "ERRORE"
                    ? <span className="vs-google" data-tono="danger" title={v.googleSyncErrore ?? undefined}><CircleAlert aria-hidden />{google?.testo}</span>
                    : <span className="vs-google" data-tono={google?.tono}>{google?.testo ?? v.googleSyncStato}</span>}
                </td>
                <td className="vs-td-azioni">
                  {v.meetUrl && v.stato !== "ANNULLATA" ? (
                    <a className="vs-azione" href={v.meetUrl} target="_blank" rel="noopener noreferrer" aria-label={`Apri Google Meet con ${v.pazienteNome}`} title="Google Meet"
                      onClick={(e) => e.stopPropagation()}><Video aria-hidden /></a>
                  ) : null}
                  <button type="button" className="vs-azione" aria-label={`Dettagli della visita di ${v.pazienteNome}`} title="Dettagli"
                    onClick={(e) => {
                      e.stopPropagation()
                      azioni.apriVisita(v)
                    }}><PanelRight aria-hidden /></button>
                </td>
              </tr>
            </MenuVisita>
          )
        })}
      </tbody>
    </Tabella>
  )
}

/** Riquadro richiudibile come in Mobilitas: si carica la prima volta che lo apri. */
function Sezione({ tono, icona: Icona, titolo, descrizione, conteggio, aperta, onApri, children }: {
  tono: string; icona: LucideIcon; titolo: string; descrizione: string; conteggio?: number | null
  aperta: boolean; onApri: () => void; children: ReactNode
}) {
  return (
    <section className="vs-sezione vl-card" data-tono={tono} data-aperta={aperta ? "" : undefined}>
      <button type="button" className="vs-sezione-testa" aria-expanded={aperta} onClick={onApri}>
        <span className="vs-sezione-icona" aria-hidden><Icona /></span>
        <span className="vs-sezione-titoli">
          <strong>{titolo}{conteggio != null ? <span className="vl-card-count">{conteggio}</span> : null}</strong>
          <small>{descrizione}</small>
        </span>
        <ChevronDown className="vs-sezione-freccia" aria-hidden />
      </button>
      {aperta ? <div className="vs-sezione-corpo">{children}</div> : null}
    </section>
  )
}

function Giorno({ visite, vuoto, ricerca, onRicerca }: { visite: Visita[]; vuoto: string; ricerca: string; onRicerca: (t: string) => void }) {
  const filtrate = cerca(visite, ricerca)
  return (
    <>
      <div className="vs-sezione-filtri">
        <Cerca valore={ricerca} onValore={onRicerca} etichetta="Cerca tra le visite" segnaposto="Nome, email, telefono o ID" />
        {ricerca.trim() ? <span className="vs-sezione-esito">{filtrate.length === 0 ? "Nessun risultato" : `${filtrate.length} su ${visite.length}`}</span> : null}
      </div>
      <TabellaVisite visite={filtrate} conData={false} vuoto={ricerca.trim() ? "Nessuna visita per questa ricerca" : vuoto} />
    </>
  )
}

function Tutte() {
  const oggi = new Date()
  const [da, setDa] = useState(() => formatDateOnlyLocal(startOfYear(oggi)))
  const [a, setA] = useState(() => formatDateOnlyLocal(addDays(oggi, 90)))
  const [stato, setStato] = useState("TUTTE")
  const [ricerca, setRicerca] = useState("")
  const valido = da <= a
  const { dati, errore, riprova } = useDati(() => (valido ? visiteService.periodo(da, a) : Promise.resolve([])), [da, a, valido])

  const visite = dati ?? []
  const conteggi = Object.fromEntries(Object.keys(STATI_FILTRO).map((k) => [k, k === "TUTTE" ? visite.length : visite.filter((v) => v.stato === k).length]))
  const filtrate = cerca(visite.filter((v) => stato === "TUTTE" || v.stato === stato), ricerca)

  return (
    <>
      <div className="vs-sezione-filtri">
        <label className="vs-periodo">Dal<Input type="date" value={da} max={a} onChange={(e) => e.target.value && setDa(e.target.value)} className="h-8" /></label>
        <label className="vs-periodo">al<Input type="date" value={a} min={da} onChange={(e) => e.target.value && setA(e.target.value)} className="h-8" /></label>
        <Cerca valore={ricerca} onValore={setRicerca} etichetta="Cerca tra tutte le visite" segnaposto="Nome, email, telefono o ID" />
      </div>
      <div className="vs-sezione-filtri">
        <Segmenti voci={STATI_FILTRO} conteggi={conteggi} scelto={stato} onScelto={setStato} etichetta="Filtra per stato" />
      </div>
      {errore ? <Errore messaggio={errore} onRiprova={riprova} />
        : !dati ? <Caricamento />
          : <TabellaVisite visite={filtrate} conData vuoto={ricerca.trim() || stato !== "TUTTE" ? "Nessuna visita con questi filtri" : `Nessuna visita dal ${data(da)} al ${data(a)}`}
            ordineIniziale={{ colonna: "data", verso: "desc" }} />}
    </>
  )
}

/** Le tabelle sotto l'agenda: oggi, ieri, domani e l'elenco completo, come la pagina visite di Mobilitas. */
export function TabelleVisite() {
  const adesso = new Date()
  const ieri = addDays(adesso, -1)
  const domani = addDays(adesso, 1)
  const [aperte, setAperte] = useState<Record<string, boolean>>({ oggi: true })
  const [ricerche, setRicerche] = useState<Record<string, string>>({})
  const daIeri = formatDateOnlyLocal(ieri)
  const aDomani = formatDateOnlyLocal(domani)
  const { dati, errore, riprova } = useDati(() => visiteService.periodo(daIeri, aDomani), [daIeri, aDomani])

  const delGiorno = (giorno: Date) => (dati ?? []).filter((v) => isSameDay(parseISO(v.inizio), giorno))
  const valide = (visite: Visita[]) => visite.filter((v) => v.stato !== "ANNULLATA").length
  const apri = (chiave: string) => setAperte((s) => ({ ...s, [chiave]: !s[chiave] }))
  const ricerca = (chiave: string) => ({ ricerca: ricerche[chiave] ?? "", onRicerca: (t: string) => setRicerche((s) => ({ ...s, [chiave]: t })) })

  const giorni = [
    { chiave: "oggi", giorno: adesso, tono: "oggi", icona: CalendarClock, titolo: "Visite di oggi", descrizione: "La giornata, ora per ora", vuoto: "Nessuna visita oggi" },
    { chiave: "ieri", giorno: ieri, tono: "ieri", icona: History, titolo: "Visite di ieri", descrizione: "Da controllare: effettuate, assenti, da segnare", vuoto: "Nessuna visita ieri" },
    { chiave: "domani", giorno: domani, tono: "domani", icona: CalendarArrowUp, titolo: "Visite di domani", descrizione: "Chi vedi domani, per prepararti", vuoto: "Nessuna visita domani" },
  ]

  return (
    <div className="vs-tabelle">
      {giorni.map((g) => {
        const visite = delGiorno(g.giorno)
        return (
          <Sezione key={g.chiave} tono={g.tono} icona={g.icona} titolo={g.titolo}
            descrizione={`${g.descrizione} · ${format(g.giorno, "EEEE d MMMM", { locale: it })}`}
            conteggio={dati ? valide(visite) : null} aperta={!!aperte[g.chiave]} onApri={() => apri(g.chiave)}>
            {errore ? <Errore messaggio={errore} onRiprova={riprova} /> : !dati ? <Caricamento /> : <Giorno visite={visite} vuoto={g.vuoto} {...ricerca(g.chiave)} />}
          </Sezione>
        )
      })}
      <Sezione tono="tutte" icona={Layers} titolo="Tutte le visite" descrizione="Cerca e filtra per periodo e stato"
        aperta={!!aperte.tutte} onApri={() => apri("tutte")}>
        <Tutte />
      </Sezione>
    </div>
  )
}
