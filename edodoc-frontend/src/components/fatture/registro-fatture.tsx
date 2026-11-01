import { Check, Landmark, Mail, Receipt } from "lucide-react"
import { useCallback } from "react"
import { MenuFattura, MenuPagamento } from "@/components/menu-contestuali"
import { Azione, Cerca, Segmenti } from "@/components/pagamenti/comuni"
import { Riquadro } from "@/components/pagina"
import { Vuoto } from "@/components/stati"
import { useAzioni } from "@/contexts/azioni-context"
import { data, dataOra, euro } from "@/lib/format"
import { fatturePerMese, FILTRI_FATTURE, nomeMeseConAnno, passaFiltroFattura, statoTessera } from "@/lib/incassi"
import { toast, toastErrore } from "@/lib/toast"
import { fattureService } from "@/services/gestionale"
import type { Fattura, Pagamento } from "@/types"

/** Stessa chiamata del menu contestuale: si annulla da lì con «Togli inserita». */
export function useSegnaTessera() {
  const { aggiorna } = useAzioni()
  return useCallback(async (fatturaId: number, numero: number) => {
    try {
      await fattureService.segnaTessera(fatturaId, true)
      toast.success(`Fattura n. ${numero} segnata in Tessera Sanitaria`)
      aggiorna()
    } catch (e) {
      toastErrore(e)
    }
  }, [aggiorna])
}

function Passi({ fattura: f }: { fattura: Fattura }) {
  const azioni = useAzioni()
  const segna = useSegnaTessera()
  const tessera = statoTessera(f)
  if (f.stato === "ANNULLATA") {
    return (
      <div className="ft-annullata">
        <span className="pg-stato" data-tono="muted">Annullata</span>
        <small>{f.motivoAnnullamento ?? "Motivo non indicato"}{f.tsStato === "INSERITA" ? " · Risulta inserita in Tessera Sanitaria" : ""}</small>
      </div>
    )
  }
  return (
    <div className="ft-passi">
      {f.emailInviataIl ? (
        <span className="ft-passo" title={`Inviata il ${dataOra(f.emailInviataIl)}`}><Check className="size-3.5" aria-hidden />Inviata il {data(f.emailInviataIl.slice(0, 10))}</span>
      ) : (
        <Azione icona={Mail} forte etichetta={`Invia la fattura n. ${f.numero}`} onClick={() => azioni.inviaEmail({ tipo: "FATTURA", pazienteId: f.pazienteId, fatturaId: f.id })}>Invia</Azione>
      )}
      {tessera === "inserita" ? <span className="ft-passo" title={f.tsInseritaIl ? `Inserita il ${dataOra(f.tsInseritaIl)}` : undefined}><Check className="size-3.5" aria-hidden />In Tessera</span> : null}
      {tessera === "opposizione" ? <span className="ft-passo" data-spento="">Opposizione</span> : null}
      {tessera === "da-inserire" ? <Azione icona={Landmark} etichetta={`Segna la fattura n. ${f.numero} inserita in Tessera Sanitaria`} onClick={() => void segna(f.id, f.numero)}>Segna in Tessera</Azione> : null}
    </div>
  )
}

function RigaFattura({ fattura: f }: { fattura: Fattura }) {
  const annullata = f.stato === "ANNULLATA"
  return (
    <MenuFattura fattura={f}>
      <li className="ft-riga" data-annullata={annullata ? "" : undefined}>
        <button type="button" className="ft-riga-corpo" aria-label={`Apri il PDF della fattura n. ${f.numero}`} onClick={() => void fattureService.apriPdf(f.id).catch(toastErrore)}>
          <span className="ft-numero"><strong>{f.numero}</strong><small>{data(f.dataEmissione)}</small></span>
          <span className="pg-riga-chi"><strong>{f.intestatario}</strong><small>{f.pagamentoDescrizione ?? f.descrizione}</small></span>
          <span className="ft-importi"><strong>{euro(f.importoTotale)}</strong><small>Imponibile {euro(f.imponibile)}</small></span>
        </button>
        <Passi fattura={f} />
      </li>
    </MenuFattura>
  )
}

function RigaDaEmettere({ pagamento: p }: { pagamento: Pagamento }) {
  const azioni = useAzioni()
  return (
    <MenuPagamento pagamento={p}>
      <li className="ft-riga">
        <button type="button" className="ft-riga-corpo" onClick={() => azioni.apriPaziente(p.pazienteId)}>
          <span className="ft-numero" aria-hidden><Receipt className="size-4" /></span>
          <span className="pg-riga-chi"><strong>{p.pazienteNome}</strong><small>{p.descrizione}</small></span>
          <span className="ft-importi"><strong>{euro(p.importo)}</strong><small>Pagato il {data(p.dataPagamento)}</small></span>
        </button>
        <div className="ft-passi"><Azione icona={Receipt} forte etichetta={`Emetti fattura per ${p.pazienteNome}`} onClick={() => azioni.nuovaFattura({ pagamento: p })}>Emetti fattura</Azione></div>
      </li>
    </MenuPagamento>
  )
}

export function RegistroFatture({ fatture, daEmettere, anno, filtro, onFiltro, ricerca, onRicerca }: {
  fatture: Fattura[]
  daEmettere: Pagamento[]
  anno: number
  filtro: string
  onFiltro: (filtro: string) => void
  ricerca: string
  onRicerca: (testo: string) => void
}) {
  const testo = ricerca.trim().toLowerCase()
  const conteggi = Object.fromEntries(Object.keys(FILTRI_FATTURE).map((k) => [k, k === "DA_EMETTERE" ? daEmettere.length : fatture.filter((f) => passaFiltroFattura(f, k)).length]))
  const inEmissione = filtro === "DA_EMETTERE"
  const pagamenti = daEmettere.filter((p) => !testo || `${p.pazienteNome} ${p.descrizione}`.toLowerCase().includes(testo))
  const righe = fatture.filter((f) => passaFiltroFattura(f, filtro) && (!testo || `${f.numero} ${f.intestatario} ${f.codiceFiscale}`.toLowerCase().includes(testo)))
  const mesi = fatturePerMese(righe)

  return (
    <Riquadro titolo={inEmissione ? "Incassi da fatturare" : `Fatture ${anno}`} conteggio={inEmissione ? pagamenti.length : righe.length}
      descrizione={inEmissione ? "Pagamenti ricevuti senza fattura, di tutti gli anni" : "Clic per il PDF, tasto destro per invio e annullamento"}
      azioni={<Cerca valore={ricerca} onValore={onRicerca} etichetta="Cerca" segnaposto={inEmissione ? "Cerca paziente o voce" : "Numero, nome o codice fiscale"} />}>
      <div className="pg-filtri">
        <Segmenti voci={FILTRI_FATTURE} conteggi={conteggi} scelto={filtro} onScelto={onFiltro} etichetta="Filtra le fatture" />
      </div>
      {inEmissione ? (
        pagamenti.length === 0 ? <Vuoto titolo="Nessun incasso da fatturare" descrizione={testo ? "Prova con un'altra ricerca." : "Ogni pagamento ricevuto ha la sua fattura."} /> : (
          <ul className="ft-elenco">{pagamenti.map((p) => <RigaDaEmettere key={p.id} pagamento={p} />)}</ul>
        )
      ) : mesi.length === 0 ? <Vuoto titolo="Nessuna fattura" descrizione={testo || filtro !== "TUTTE" ? "Prova a cambiare i filtri." : "Le fatture nascono da un pagamento registrato."} /> : (
        <div className="pg-registro">
          {mesi.map((m) => (
            <section key={m.mese} aria-label={nomeMeseConAnno(m.mese)}>
              <header className="pg-mese"><span>{nomeMeseConAnno(m.mese)}</span><span>{euro(m.totale)}</span></header>
              <ul className="ft-elenco">{m.fatture.map((f) => <RigaFattura key={f.id} fattura={f} />)}</ul>
            </section>
          ))}
        </div>
      )}
    </Riquadro>
  )
}
