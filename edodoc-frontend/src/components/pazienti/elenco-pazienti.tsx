import { Check, Search, X } from "lucide-react"
import { Chip } from "@/components/chip"
import { LuxAvatar } from "@/components/lux"
import { MenuPaziente } from "@/components/menu-contestuali"
import { Riquadro } from "@/components/pagina"
import { Vuoto } from "@/components/stati"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAzioni } from "@/contexts/azioni-context"
import { SITUAZIONE_PAGAMENTI, STATO_PAZIENTE, TIPO_PERCORSO } from "@/lib/etichette"
import { dataBreve, euro } from "@/lib/format"
import { checkInRaccolta, fineDelPercorso, gruppi, inPercorso, quandoVisita, tonoDi, type Lettura, type Ordine } from "@/lib/pazienti"
import type { Percorso } from "@/types"

const ORDINI: Record<Ordine, string> = { PRIORITA: "Per priorità", VISITA: "Per prossima visita", COGNOME: "Per cognome" }

/** Un tratto per visita: pieno se fatta, tratteggiato se fissata, vuoto se ancora da fissare. */
function BarraVisite({ percorso }: { percorso: Percorso }) {
  const fatte = Math.min(percorso.visiteEffettuate, percorso.visiteTotali)
  const fissate = Math.min(percorso.visiteFissate, percorso.visiteTotali)
  return (
    <span className="pz-barra" aria-hidden>
      {Array.from({ length: percorso.visiteTotali }, (_, i) => <i key={i} data-stato={i < fatte ? "fatta" : i < fissate ? "fissata" : undefined} />)}
    </span>
  )
}

function Tranquillo({ children }: { children: string }) {
  return <span className="pz-quieto"><Check aria-hidden />{children}</span>
}

function testoPagamenti({ p }: Lettura) {
  if (p.situazionePagamenti === "SCADUTO") return `Scaduto · residuo ${euro(p.residuo)}`
  const etichetta = SITUAZIONE_PAGAMENTI[p.situazionePagamenti].testo
  return p.residuo > 0 ? `${etichetta}: ${euro(p.residuo)}` : etichetta
}

function testoCheck(l: Lettura, oggi: Date) {
  if (!inPercorso(l.p)) return "Non previsto"
  if (l.p.checkSettimana) return "Compilato"
  return checkInRaccolta(oggi) ? "In arrivo" : "Manca"
}

function testoVisita(l: Lettura, oggi: Date) {
  if (l.p.prossimaVisita) return quandoVisita(l.p.prossimaVisita, oggi).testo
  return l.motivi.includes("VISITA") ? "Da fissare" : "Nessuna in agenda"
}

function testoPercorso({ p }: Lettura) {
  return p.percorso ? `${TIPO_PERCORSO[p.percorso.tipo]}, ${p.percorso.visiteFissate} visite fissate e ${p.percorso.visiteEffettuate} fatte su ${p.percorso.visiteTotali}` : "Nessun percorso"
}

function Riga({ lettura, oggi }: { lettura: Lettura; oggi: Date }) {
  const azioni = useAzioni()
  const { p, motivi } = lettura
  const percorso = p.percorso
  const inFine = motivi.includes("FINE_PERCORSO")
  const visita = p.prossimaVisita ? quandoVisita(p.prossimaVisita, oggi) : null
  const check = testoCheck(lettura, oggi)
  const descrizione = `Apri ${p.cognome} ${p.nome}. ${STATO_PAZIENTE[p.stato].testo}. ${testoPercorso(lettura)}. Prossima visita: ${testoVisita(lettura, oggi)}. Pagamenti: ${testoPagamenti(lettura)}. Check: ${check}.`

  return (
    <MenuPaziente paziente={p}>
      <li className="pz-voce" data-tono={tonoDi(motivi)}>
        <button type="button" className="pz-riga" aria-label={descrizione} onClick={() => azioni.apriPaziente(p.id)}>
          <span className="pz-chi">
            <LuxAvatar first={p.nome} second={p.cognome} />
            <span className="pz-nome">
              <strong>{p.cognome} {p.nome}</strong>
              <small>{STATO_PAZIENTE[p.stato].testo} · {p.email ?? p.cellulare ?? "nessun contatto"}</small>
            </span>
          </span>

          <span className="pz-cella pz-percorso" data-etichetta="Percorso">
            {percorso ? (
              <>
                <span className="pz-percorso-testa">
                  <BarraVisite percorso={percorso} />
                  <b>{percorso.visiteFissate}/{percorso.visiteTotali}</b>
                </span>
                {inFine ? <Chip tono="warn">{fineDelPercorso(percorso.dataFine)}</Chip> : <small>{TIPO_PERCORSO[percorso.tipo]} · fino al {dataBreve(percorso.dataFine)}</small>}
              </>
            ) : <small>Nessun percorso</small>}
          </span>

          <span className="pz-cella pz-prossima" data-etichetta="Prossima visita">
            {motivi.includes("VISITA") ? <Chip tono="info">Da fissare</Chip>
              : visita ? <span className="pz-visita" data-vicina={visita.vicina ? "" : undefined}>{visita.testo}</span>
              : <small>{testoVisita(lettura, oggi)}</small>}
          </span>

          <span className="pz-cella pz-pagamenti" data-etichetta="Pagamenti">
            {p.situazionePagamenti === "IN_REGOLA" ? <Tranquillo>In regola</Tranquillo> : <Chip tono={SITUAZIONE_PAGAMENTI[p.situazionePagamenti].tono}>{testoPagamenti(lettura)}</Chip>}
          </span>

          <span className="pz-cella pz-check" data-etichetta="Check">
            {!inPercorso(p) ? <small>—</small>
              : p.checkSettimana ? <Tranquillo>Compilato</Tranquillo>
              : motivi.includes("CHECK") ? <Chip tono="warn">Manca</Chip>
              : <small>In arrivo</small>}
          </span>
        </button>
      </li>
    </MenuPaziente>
  )
}

const TESTA = (
  <div className="pz-testa" aria-hidden>
    <span>Paziente</span><span>Percorso</span><span>Prossima visita</span><span>Pagamenti</span><span>Check</span>
  </div>
)

export function ElencoPazienti({ letture, totale, ricerca, stato, ordine, filtro, oggi, onRicerca, onStato, onOrdine, onLiberaFiltro }: {
  letture: Lettura[]
  totale: number
  ricerca: string
  stato: string
  ordine: Ordine
  filtro: string | null
  oggi: Date
  onRicerca: (testo: string) => void
  onStato: (stato: string) => void
  onOrdine: (ordine: Ordine) => void
  onLiberaFiltro: () => void
}) {
  const divisi = ordine === "PRIORITA" ? gruppi(letture) : [{ titolo: "", voci: letture }]

  return (
    <div id="pz-elenco" className="pz-ancora">
      <Riquadro titolo="Elenco" conteggio={letture.length} descrizione="Clic per aprire la scheda, tasto destro per tutte le azioni"
        azioni={
          <div className="pz-filtri">
            <div className="pz-cerca">
              <Search className="size-4" aria-hidden />
              <Input type="search" aria-label="Cerca paziente" placeholder="Cerca" value={ricerca} onChange={(e) => onRicerca(e.target.value)} />
            </div>
            <Select value={stato} onValueChange={onStato}>
              <SelectTrigger aria-label="Filtra per stato"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TUTTI">Tutti gli stati</SelectItem>
                {Object.entries(STATO_PAZIENTE).map(([k, v]) => <SelectItem key={k} value={k}>{v.testo}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={ordine} onValueChange={(v) => onOrdine(v as Ordine)}>
              <SelectTrigger aria-label="Ordina l'elenco"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ORDINI).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }>
        {filtro ? <button type="button" className="pz-filtro-attivo" onClick={onLiberaFiltro}>{filtro}<X className="size-3.5" aria-hidden /><span className="sr-only">Togli il filtro</span></button> : null}
        {letture.length === 0 ? <Vuoto titolo="Nessun paziente" descrizione={totale ? "Prova a cambiare i filtri." : "Aggiungi il primo paziente."} /> : (
          <div className="pz-lista">
            {TESTA}
            {divisi.map((g) => (
              <section key={g.titolo || "tutti"} aria-label={g.titolo || "Pazienti"}>
                {g.titolo ? <p className="pz-gruppo">{g.titolo}<span>{g.voci.length}</span></p> : null}
                <ul>{g.voci.map((l) => <Riga key={l.p.id} lettura={l} oggi={oggi} />)}</ul>
              </section>
            ))}
            <p className="pz-chiave" aria-hidden>
              <span><i data-stato="fatta" />Visita fatta</span>
              <span><i data-stato="fissata" />Fissata</span>
              <span><i />Da fissare</span>
            </p>
          </div>
        )}
      </Riquadro>
    </div>
  )
}
