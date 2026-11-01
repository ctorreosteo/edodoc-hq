import { useEffect, useState } from "react"
import { Campo } from "@/components/forms/campo"
import { CopertinaCampo, NESSUNA_SCELTA, type SceltaCopertina } from "@/components/forms/copertina-campo"
import { Finestra } from "@/components/forms/finestra"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast, toastErrore } from "@/lib/toast"
import { corsiService } from "@/services/gestionale"
import type { RigaCorso } from "@/types"

export function CorsoDialog({ open, onOpenChange, corso, onSalvato }: {
  open: boolean
  onOpenChange: (a: boolean) => void
  corso?: RigaCorso
  onSalvato: (id: number) => void
}) {
  const [titolo, setTitolo] = useState("")
  const [descrizione, setDescrizione] = useState("")
  const [copertina, setCopertina] = useState<SceltaCopertina>(NESSUNA_SCELTA)
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitolo(corso?.titolo ?? "")
    setDescrizione(corso?.descrizione ?? "")
    setCopertina(NESSUNA_SCELTA)
  }, [open, corso])

  const salva = async () => {
    setInCorso(true)
    try {
      const corpo = { titolo, descrizione: descrizione || null }
      const salvato = corso ? await corsiService.aggiorna(corso.id, corpo) : await corsiService.crea(corpo)
      const id = salvato.corso.id
      if (copertina.file) await corsiService.caricaCopertina(id, copertina.file)
      else if (copertina.rimossa) await corsiService.togliCopertina(id)
      toast.success(corso ? "Corso aggiornato" : "Corso creato")
      onOpenChange(false)
      onSalvato(id)
    } catch (e) {
      toastErrore(e)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Finestra open={open} onOpenChange={onOpenChange} titolo={corso ? "Modifica corso" : "Nuovo corso"}
      descrizione={corso ? undefined : "Il corso nasce in bozza: i pazienti lo vedono solo quando lo pubblichi"} salva={salva} inCorso={inCorso}>
      <CopertinaCampo attuale={corso?.copertinaId ?? null} scelta={copertina} onChange={setCopertina} />
      <Campo etichetta="Titolo" id="corso-titolo"><Input id="corso-titolo" value={titolo} onChange={(e) => setTitolo(e.target.value)} required /></Campo>
      <Campo etichetta="Descrizione" id="corso-descrizione"><Textarea id="corso-descrizione" value={descrizione} onChange={(e) => setDescrizione(e.target.value)} placeholder="Cosa impara il paziente" /></Campo>
    </Finestra>
  )
}
