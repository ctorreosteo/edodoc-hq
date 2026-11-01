import { AlertTriangle, Check, ChevronDown, CircleCheck, Clock, Receipt } from "lucide-react"
import { useMemo, useState } from "react"
import { MenuPagamento } from "@/components/menu-contestuali"
import { Azione, Cerca, Segmenti } from "@/components/pagamenti/comuni"
import { Riquadro } from "@/components/pagina"
import { Vuoto } from "@/components/stati"
import { useAzioni } from "@/contexts/azioni-context"
import { METODO_PAGAMENTO, TIPO_PERCORSO } from "@/lib/etichette"
import { data, euro } from "@/lib/format"
import { FILTRI_PAGAMENTI, nomeMeseConAnno, passaFiltroPagamento, quanti, registroPerMese, type Pacchetto } from "@/lib/incassi"
import type { Pagamento } from "@/types"

function Stato({ pagamento }: { pagamento: Pagamento }) {
  if (pagamento.stato === "PAGATO") return <span className="pg-stato" data-tono="ok"><Check className="size-3" aria-hidden />Pagato</span>
  if (pagamento.scaduto) return <span className="pg-stato" data-tono="danger"><AlertTriangle className="size-3" aria-hidden />Scaduto</span>
  return <span className="pg-stato" data-tono="warn"><Clock className="size-3" aria-hidden />Da pagare</span>
}

function Fattura({ pagamento }: { pagamento: Pagamento }) {
  const azioni = useAzioni()
  if (pagamento.fatturato) return <span className="pg-fattura-fatta"><CircleCheck className="size-3.5" aria-hidden />Fattura emessa</span>
  if (pagamento.stato !== "PAGATO") return <span className="pg-fattura-vuota" aria-hidden />
  return <Azione icona={Receipt} etichetta={`Emetti fattura per ${pagamento.pazienteNome}`} onClick={() => azioni.nuovaFattura({ pagamento })}>Emetti fattura</Azione>
}

function RigaRegistro({ pagamento }: { pagamento: Pagamento }) {
  const azioni = useAzioni()
  const p = pagamento
  return (
    <MenuPagamento pagamento={p}>
      <li className="pg-riga">
        <button type="button" className="pg-riga-corpo" onClick={() => (p.stato === "DA_PAGARE" ? azioni.registraPagamento(p) : azioni.apriPaziente(p.pazienteId))}>
          <span className="pg-riga-chi"><strong>{p.pazienteNome}</strong><small>{p.descrizione}</small></span>
          <span className="pg-riga-info"><span>{p.percorsoTipo ? TIPO_PERCORSO[p.percorsoTipo] : "Fuori percorso"}</span><small>{p.metodo ? METODO_PAGAMENTO[p.metodo] : "Metodo non indicato"}</small></span>
          <span className="pg-riga-info">
            <span>{p.dataPagamento ? `Pagato il ${data(p.dataPagamento)}` : `Scade il ${data(p.scadenza)}`}</span>
            {p.dataPagamento ? <small>Scadenza {data(p.scadenza)}</small> : null}
          </span>
          <span className="pg-riga-importo"><strong>{euro(p.importo)}</strong><Stato pagamento={p} /></span>
        </button>
        <span className="pg-riga-fattura"><Fattura pagamento={p} /></span>
      </li>
    </MenuPagamento>
  )
}

function RigaPacchetto({ pacchetto }: { pacchetto: Pacchetto }) {
  const [aperto, setAperto] = useState(false)
  const [primo] = pacchetto.righe
  const totale = pacchetto.righe.reduce((s, p) => s + p.importo, 0)
  return (
    <li className="pg-pacchetto">
      <button type="button" className="pg-pacchetto-testa" aria-expanded={aperto} onClick={() => setAperto((a) => !a)}>
        <span className="pg-riga-corpo" data-pacchetto="">
          <span className="pg-pacchetto-chi">
            <span className="pg-pacchetto-numero" aria-hidden>{pacchetto.righe.length}</span>
            <span className="pg-riga-chi"><strong>{primo.pazienteNome}</strong><small>{quanti(pacchetto.righe.length, "pagamento", "pagamenti")} dello stesso giorno</small></span>
          </span>
          <span className="pg-riga-info"><span>{primo.percorsoTipo ? TIPO_PERCORSO[primo.percorsoTipo] : "Fuori percorso"}</span><small>{primo.metodo ? METODO_PAGAMENTO[primo.metodo] : "Metodo non indicato"}</small></span>
          <span className="pg-riga-info"><span>{primo.dataPagamento ? `Pagati il ${data(primo.dataPagamento)}` : `Scadono il ${data(primo.scadenza)}`}</span></span>
          <span className="pg-riga-importo"><strong>{euro(totale)}</strong><Stato pagamento={primo} /></span>
        </span>
        <span className="pg-pacchetto-coda">
          {primo.stato === "PAGATO" ? <span>{primo.fatturato ? "Fatture emesse" : "Da fatturare"}</span> : null}
          <ChevronDown className="pg-freccia size-4" data-aperta={aperto ? "" : undefined} aria-hidden />
        </span>
      </button>
      {aperto ? <ul className="pg-pacchetto-righe">{pacchetto.righe.map((p) => <RigaRegistro key={p.id} pagamento={p} />)}</ul> : null}
    </li>
  )
}

export function RegistroPagamenti({ righe, anno }: { righe: Pagamento[]; anno: number }) {
  const [filtro, setFiltro] = useState("TUTTI")
  const [ricerca, setRicerca] = useState("")

  const conteggi = useMemo(() => Object.fromEntries(Object.keys(FILTRI_PAGAMENTI).map((k) => [k, righe.filter((p) => passaFiltroPagamento(p, k, anno)).length])), [righe, anno])
  const mesi = useMemo(() => {
    const testo = ricerca.trim().toLowerCase()
    return registroPerMese(righe.filter((p) => passaFiltroPagamento(p, filtro, anno) && (!testo || `${p.pazienteNome} ${p.descrizione}`.toLowerCase().includes(testo))))
  }, [righe, filtro, ricerca, anno])
  const totale = mesi.reduce((s, m) => s + m.pacchetti.reduce((t, p) => t + p.righe.length, 0), 0)
  const legatoAllAnno = filtro === "TUTTI" || filtro === "PAGATI"

  return (
    <Riquadro titolo={legatoAllAnno ? `Registro ${anno}` : "Registro"} conteggio={totale}
      descrizione={legatoAllAnno ? "Tasto destro per registrare, modificare o annullare" : "Questa lista comprende tutti gli anni"}
      azioni={<Cerca valore={ricerca} onValore={setRicerca} etichetta="Cerca" segnaposto="Cerca paziente o voce" />}>
      <div className="pg-filtri">
        <Segmenti voci={FILTRI_PAGAMENTI} conteggi={conteggi} scelto={filtro} onScelto={setFiltro} etichetta="Filtra i pagamenti" />
      </div>
      {mesi.length === 0 ? <Vuoto titolo="Nessun pagamento" descrizione={ricerca.trim() ? "Prova con un'altra ricerca." : legatoAllAnno ? `Nessun movimento nel ${anno}.` : "Niente in questa lista."} /> : (
        <div className="pg-registro">
          {mesi.map((m) => (
            <section key={m.mese} aria-label={nomeMeseConAnno(m.mese)}>
              <header className="pg-mese">
                <span>{nomeMeseConAnno(m.mese)}</span>
                <span>
                  {m.incassato > 0 ? `${euro(m.incassato)} incassati` : ""}
                  {m.incassato > 0 && m.atteso > 0 ? " · " : ""}
                  {m.atteso > 0 ? `${euro(m.atteso)} da incassare` : ""}
                </span>
              </header>
              <ul>
                {m.pacchetti.map((p) => (p.righe.length > 1 ? <RigaPacchetto key={p.chiave} pacchetto={p} /> : <RigaRegistro key={p.chiave} pagamento={p.righe[0]} />))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Riquadro>
  )
}
