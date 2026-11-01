import { useEffect, useState } from "react"
import { Campo } from "@/components/forms/campo"
import { CopertinaCampo, NESSUNA_SCELTA, type SceltaCopertina } from "@/components/forms/copertina-campo"
import { Finestra } from "@/components/forms/finestra"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useAzioni } from "@/contexts/azioni-context"
import { toast, toastErrore } from "@/lib/toast"
import { corsiService } from "@/services/gestionale"
import type { RigaModulo } from "@/types"

export function ModuloDialog({ open, onOpenChange, corsoId, modulo }: {
  open: boolean
  onOpenChange: (a: boolean) => void
  corsoId: number
  modulo?: RigaModulo
}) {
  const { aggiorna } = useAzioni()
  const [titolo, setTitolo] = useState("")
  const [descrizione, setDescrizione] = useState("")
  const [copertina, setCopertina] = useState<SceltaCopertina>(NESSUNA_SCELTA)
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitolo(modulo?.titolo ?? "")
    setDescrizione(modulo?.descrizione ?? "")
    setCopertina(NESSUNA_SCELTA)
  }, [open, modulo])

  const salva = async () => {
    setInCorso(true)
    try {
      const corpo = { titolo, descrizione: descrizione || null }
      const salvato = modulo ? await corsiService.aggiornaModulo(modulo.id, corpo) : await corsiService.creaModulo(corsoId, corpo)
      if (copertina.file) await corsiService.caricaCopertinaModulo(salvato.id, copertina.file)
      else if (copertina.rimossa) await corsiService.togliCopertinaModulo(salvato.id)
      toast.success(modulo ? "Modulo aggiornato" : "Modulo creato")
      aggiorna()
      onOpenChange(false)
    } catch (e) {
      toastErrore(e)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Finestra open={open} onOpenChange={onOpenChange} titolo={modulo ? "Modifica modulo" : "Nuovo modulo"} salva={salva} inCorso={inCorso}>
      <CopertinaCampo attuale={modulo?.copertinaId ?? null} scelta={copertina} onChange={setCopertina} />
      <Campo etichetta="Titolo" id="modulo-titolo"><Input id="modulo-titolo" value={titolo} onChange={(e) => setTitolo(e.target.value)} required /></Campo>
      <Campo etichetta="Descrizione" id="modulo-descrizione"><Textarea id="modulo-descrizione" value={descrizione} onChange={(e) => setDescrizione(e.target.value)} /></Campo>
    </Finestra>
  )
}
