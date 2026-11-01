import { CircleDollarSign, Landmark, Plus, Target, Trash2, Wallet } from "lucide-react"
import { useState } from "react"
import { Chip } from "@/components/chip"
import { Campo, Griglia, Scelta } from "@/components/forms/campo"
import { Finestra } from "@/components/forms/finestra"
import { LuxHero, LuxKpi } from "@/components/lux"
import { Cta, Pagina, Riquadro, Tabella } from "@/components/pagina"
import { Caricamento, Errore, Vuoto } from "@/components/stati"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAzioni } from "@/contexts/azioni-context"
import { useDati } from "@/hooks/use-dati"
import { data, euro, euroTondi } from "@/lib/format"
import { CATEGORIA, CATEGORIE_ENTRATA, CATEGORIE_USCITA } from "@/lib/etichette"
import { toast, toastErrore } from "@/lib/toast"
import { oggiIso } from "@/lib/utils"
import { financeService } from "@/services/gestionale"

const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"]
const TIPI = { ENTRATA: "Entrata", USCITA: "Uscita" }

function MovimentoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (a: boolean) => void }) {
  const { aggiorna } = useAzioni()
  const [tipo, setTipo] = useState("ENTRATA")
  const [categoria, setCategoria] = useState("YOUTUBE_ADS")
  const [giorno, setGiorno] = useState(oggiIso())
  const [descrizione, setDescrizione] = useState("")
  const [importo, setImporto] = useState("")
  const categorie = tipo === "ENTRATA" ? CATEGORIE_ENTRATA : CATEGORIE_USCITA

  const salva = async () => {
    try {
      await financeService.creaMovimento({ tipo, categoria, data: giorno, descrizione, importo: Number(importo), note: null })
      toast.success("Movimento salvato")
      aggiorna()
      setDescrizione("")
      setImporto("")
      onOpenChange(false)
    } catch (e) {
      toastErrore(e)
    }
  }

  return (
    <Finestra open={open} onOpenChange={onOpenChange} titolo="Nuovo movimento" salva={salva}
      descrizione="Gli incassi dei pazienti arrivano da soli dai pagamenti: qui passa tutto il resto.">
      <Griglia>
        <Campo etichetta="Tipo" id="mov-tipo">
          <Scelta id="mov-tipo" valore={tipo} opzioni={TIPI} onChange={(t) => {
            setTipo(t)
            setCategoria(t === "ENTRATA" ? "YOUTUBE_ADS" : "IMPOSTE")
          }} />
        </Campo>
        <Campo etichetta="Categoria" id="mov-categoria"><Scelta id="mov-categoria" valore={categoria} onChange={setCategoria} opzioni={categorie} /></Campo>
        <Campo etichetta="Data" id="mov-data"><Input id="mov-data" type="date" value={giorno} onChange={(e) => setGiorno(e.target.value)} required /></Campo>
        <Campo etichetta="Importo (€)" id="mov-importo"><Input id="mov-importo" type="number" min="0.01" step="0.01" value={importo} onChange={(e) => setImporto(e.target.value)} required /></Campo>
      </Griglia>
      <Campo etichetta="Descrizione" id="mov-descrizione"><Input id="mov-descrizione" value={descrizione} onChange={(e) => setDescrizione(e.target.value)} required /></Campo>
    </Finestra>
  )
}

function ScadenzaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (a: boolean) => void }) {
  const { aggiorna } = useAzioni()
  const [titolo, setTitolo] = useState("")
  const [categoria, setCategoria] = useState("IMPOSTE")
  const [giorno, setGiorno] = useState(oggiIso())
  const [importo, setImporto] = useState("")

  const salva = async () => {
    try {
      await financeService.creaScadenza({ titolo, categoria, dataScadenza: giorno, importoStimato: importo ? Number(importo) : null, note: null })
      toast.success("Scadenza salvata")
      aggiorna()
      setTitolo("")
      setImporto("")
      onOpenChange(false)
    } catch (e) {
      toastErrore(e)
    }
  }

  return (
    <Finestra open={open} onOpenChange={onOpenChange} titolo="Nuova scadenza" salva={salva}
      descrizione="Due settimane prima compare un task in automatico.">
      <Campo etichetta="Titolo" id="sc-titolo"><Input id="sc-titolo" value={titolo} onChange={(e) => setTitolo(e.target.value)} required /></Campo>
      <Griglia>
        <Campo etichetta="Categoria" id="sc-categoria"><Scelta id="sc-categoria" valore={categoria} onChange={setCategoria} opzioni={CATEGORIE_USCITA} /></Campo>
        <Campo etichetta="Data" id="sc-data"><Input id="sc-data" type="date" value={giorno} onChange={(e) => setGiorno(e.target.value)} required /></Campo>
        <Campo etichetta="Importo stimato (€)" id="sc-importo"><Input id="sc-importo" type="number" min="0" step="0.01" value={importo} onChange={(e) => setImporto(e.target.value)} /></Campo>
      </Griglia>
    </Finestra>
  )
}

export default function Finance() {
  const azioni = useAzioni()
  const [anno, setAnno] = useState(new Date().getFullYear())
  const [movimentoAperto, setMovimentoAperto] = useState(false)
  const [scadenzaAperta, setScadenzaAperta] = useState(false)
  const { dati, errore, riprova } = useDati(async () => {
    const [riepilogo, movimenti, scadenze] = await Promise.all([financeService.riepilogo(anno), financeService.movimenti(anno), financeService.scadenze(anno)])
    return { riepilogo, movimenti, scadenze }
  }, [anno])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />
  const { riepilogo: r, movimenti, scadenze } = dati

  const elimina = (id: number, descrizione: string) => azioni.conferma({
    titolo: "Eliminare il movimento?",
    descrizione,
    etichetta: "Elimina",
    azione: async () => {
      await financeService.eliminaMovimento(id)
      azioni.aggiorna()
    },
  })

  const paga = (id: number, titolo: string, importo: number | null) => azioni.conferma({
    titolo: `Segnare pagata: ${titolo}?`,
    descrizione: importo != null ? `Crea un'uscita di ${euro(importo)} con data di oggi.` : "Importo non stimato: indicalo sotto.",
    etichetta: "Segna pagata",
    richiediTesto: importo == null ? "Importo pagato (€)" : undefined,
    azione: async (testo) => {
      const valore = importo ?? Number(testo.replace(",", "."))
      if (!(valore > 0)) throw new Error("Importo non valido")
      await financeService.pagaScadenza(id, oggiIso(), valore)
      toast.success("Scadenza pagata")
      azioni.aggiorna()
    },
  })

  const livello1 = r.livelli[0]

  return (
    <Pagina>
      <LuxHero ariaLabel="Finance" eyebrow={`Anno ${r.anno} · regime forfettario`} title="Finance" subtitle="Il foglio Cassa, calcolato da pagamenti e movimenti"
        actions={<Cta icona={Plus} onClick={() => setMovimentoAperto(true)}>Nuovo movimento</Cta>}>
        <div className="vl-kpis">
          <LuxKpi icon={<CircleDollarSign className="size-4" />} label="Fatturato lordo" value={euroTondi(r.totali.lordo)} progress={(r.totali.lordo / r.soglia) * 100} foot={`Soglia ${euroTondi(r.soglia)}`} />
          <LuxKpi icon={<Target className="size-4" />} label="Margine dalla soglia" value={euroTondi(livello1.margineSoglia)} foot={r.candidatureAperte ? "Candidature aperte" : "Candidature da chiudere"} />
          <LuxKpi icon={<Landmark className="size-4" />} label="Imposte e cassa maturate" value={euroTondi(r.totali.impostaSostitutiva + r.totali.cassaPrevidenziale)} foot="Da accantonare" />
          <LuxKpi icon={<Wallet className="size-4" />} label="Saldo cassa" value={euroTondi(r.saldoCassa)} foot="Entrate meno uscite registrate" />
        </div>
      </LuxHero>

      <Riquadro titolo="Previsione" descrizione={`Obiettivo ${euroTondi(r.obiettivo)}. Le candidature si chiudono quando il margine del Livello 1 scende sotto ${euroTondi(r.valoreNuovoCliente)}.`}
        azioni={<Input aria-label="Anno" type="number" value={anno} onChange={(e) => setAnno(Number(e.target.value) || anno)} className="w-24" />}>
        <Tabella>
          <TableHeader>
            <TableRow>
              <TableHead>Scenario</TableHead>
              <TableHead>Totale</TableHead>
              <TableHead>Dall'obiettivo</TableHead>
              <TableHead>Dalla soglia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.livelli.map((l) => (
              <TableRow key={l.nome}>
                <TableCell>
                  <span className="block font-semibold">{l.nome}</span>
                  <span className="block text-xs text-muted-foreground">{l.descrizione}</span>
                </TableCell>
                <TableCell className="tabular-nums font-semibold">{euro(l.totale)}</TableCell>
                <TableCell className="tabular-nums">{euro(l.margineObiettivo)}</TableCell>
                <TableCell><Chip tono={l.margineSoglia < 0 ? "danger" : l.margineSoglia < r.valoreNuovoCliente ? "warn" : "ok"}>{euro(l.margineSoglia)}</Chip></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Tabella>
      </Riquadro>

      <Riquadro titolo="Cassa mese per mese">
        <Tabella>
          <TableHeader>
            <TableRow>
              <TableHead>Mese</TableHead>
              <TableHead>Pazienti</TableHead>
              <TableHead>YouTube</TableHead>
              <TableHead>Altro</TableHead>
              <TableHead>Lordo</TableHead>
              <TableHead>Imposta 5%</TableHead>
              <TableHead>Contributo 4%</TableHead>
              <TableHead>Cassa 15%</TableHead>
              <TableHead>Uscite</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...r.mesi, r.totali].map((m) => (
              <TableRow key={m.mese} className={m.mese === 0 ? "font-bold" : ""}>
                <TableCell className="font-semibold">{m.mese === 0 ? "Totale" : MESI[m.mese - 1]}</TableCell>
                <TableCell className="tabular-nums">{euro(m.pazienti)}</TableCell>
                <TableCell className="tabular-nums">{euro(m.youtube)}</TableCell>
                <TableCell className="tabular-nums">{euro(m.altro)}</TableCell>
                <TableCell className="tabular-nums font-semibold">{euro(m.lordo)}</TableCell>
                <TableCell className="tabular-nums">{euro(m.impostaSostitutiva)}</TableCell>
                <TableCell className="tabular-nums">{euro(m.contributoInFattura)}</TableCell>
                <TableCell className="tabular-nums">{euro(m.cassaPrevidenziale)}</TableCell>
                <TableCell className="tabular-nums">{euro(m.uscite)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Tabella>
      </Riquadro>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
        <Riquadro titolo="Scadenze fiscali" conteggio={scadenze.length} azioni={<Button size="sm" variant="outline" onClick={() => setScadenzaAperta(true)}><Plus aria-hidden />Scadenza</Button>}>
          {scadenze.length === 0 ? <Vuoto titolo="Nessuna scadenza" descrizione="Aggiungi quota ordine, cassa e F24." /> : (
            <ul className="grid gap-2">
              {scadenze.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{s.titolo}</p>
                    <p className="truncate text-xs text-muted-foreground">{CATEGORIA[s.categoria]} · {data(s.dataScadenza)}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{s.importoStimato != null ? euro(s.importoStimato) : "—"}</span>
                  {s.stato === "PAGATA" ? <Chip tono="ok">Pagata</Chip> : <Button size="sm" variant="outline" onClick={() => paga(s.id, s.titolo, s.importoStimato)}>Paga</Button>}
                </li>
              ))}
            </ul>
          )}
        </Riquadro>

        <Riquadro titolo="Movimenti" conteggio={movimenti.length}>
          {movimenti.length === 0 ? <Vuoto titolo="Nessun movimento" /> : (
            <ul className="grid gap-2 max-h-96 overflow-y-auto">
              {movimenti.map((m) => (
                <li key={m.id} className="flex items-center gap-3 rounded-xl border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{m.descrizione}</p>
                    <p className="truncate text-xs text-muted-foreground">{CATEGORIA[m.categoria]} · {data(m.data)}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{m.tipo === "USCITA" ? "−" : "+"}{euro(m.importo)}</span>
                  <Button size="icon" variant="ghost" aria-label={`Elimina ${m.descrizione}`} onClick={() => elimina(m.id, m.descrizione)}><Trash2 /></Button>
                </li>
              ))}
            </ul>
          )}
        </Riquadro>
      </div>

      <MovimentoDialog open={movimentoAperto} onOpenChange={setMovimentoAperto} />
      <ScadenzaDialog open={scadenzaAperta} onOpenChange={setScadenzaAperta} />
    </Pagina>
  )
}
