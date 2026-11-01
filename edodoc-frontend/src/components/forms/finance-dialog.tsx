import { useState } from "react"
import { Campo, Griglia, Scelta } from "@/components/forms/campo"
import { Finestra } from "@/components/forms/finestra"
import { Input } from "@/components/ui/input"
import { useAzioni } from "@/contexts/azioni-context"
import { CATEGORIE_ENTRATA, CATEGORIE_USCITA } from "@/lib/etichette"
import { toast, toastErrore } from "@/lib/toast"
import { oggiIso } from "@/lib/utils"
import { financeService } from "@/services/gestionale"
import type { Movimento, ScadenzaFiscale } from "@/types"

const TIPI = { ENTRATA: "Entrata", USCITA: "Uscita" }

export function MovimentoDialog({ open, onOpenChange, movimento }: { open: boolean; onOpenChange: (a: boolean) => void; movimento?: Movimento | null }) {
  const { aggiorna } = useAzioni()
  const [tipo, setTipo] = useState(movimento?.tipo ?? "ENTRATA")
  const [categoria, setCategoria] = useState(movimento?.categoria ?? "YOUTUBE_ADS")
  const [giorno, setGiorno] = useState(movimento?.data ?? oggiIso())
  const [descrizione, setDescrizione] = useState(movimento?.descrizione ?? "")
  const [importo, setImporto] = useState(movimento ? String(movimento.importo) : "")
  const categorie = tipo === "ENTRATA" ? CATEGORIE_ENTRATA : CATEGORIE_USCITA

  const salva = async () => {
    try {
      const corpo = { tipo, categoria, data: giorno, descrizione, importo: Number(importo), note: movimento?.note ?? null }
      await (movimento ? financeService.aggiornaMovimento(movimento.id, corpo) : financeService.creaMovimento(corpo))
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
    <Finestra open={open} onOpenChange={onOpenChange} titolo={movimento ? "Modifica movimento" : "Nuovo movimento"} salva={salva}
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

export function ScadenzaDialog({ open, onOpenChange, scadenza }: { open: boolean; onOpenChange: (a: boolean) => void; scadenza?: ScadenzaFiscale | null }) {
  const { aggiorna } = useAzioni()
  const [titolo, setTitolo] = useState(scadenza?.titolo ?? "")
  const [categoria, setCategoria] = useState(scadenza?.categoria ?? "IMPOSTE")
  const [giorno, setGiorno] = useState(scadenza?.dataScadenza ?? oggiIso())
  const [importo, setImporto] = useState(scadenza?.importoStimato != null ? String(scadenza.importoStimato) : "")

  const salva = async () => {
    try {
      const corpo = { titolo, categoria, dataScadenza: giorno, importoStimato: importo ? Number(importo) : null, note: scadenza?.note ?? null }
      await (scadenza ? financeService.aggiornaScadenza(scadenza.id, corpo) : financeService.creaScadenza(corpo))
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
    <Finestra open={open} onOpenChange={onOpenChange} titolo={scadenza ? "Modifica scadenza" : "Nuova scadenza"} salva={salva}
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
