import { useEffect, useState } from "react"
import { useAzioni } from "@/contexts/azioni-context"
import { Campo, Griglia, Scelta } from "@/components/forms/campo"
import { Finestra } from "@/components/forms/finestra"
import { PazienteCombobox } from "@/components/forms/paziente-combobox"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DURATA_VISITA, MODALITA_VISITA, TIPO_VISITA } from "@/lib/etichette"
import { toast, toastErrore } from "@/lib/toast"
import { oggiIso } from "@/lib/utils"
import { visiteService } from "@/services/gestionale"
import type { Visita } from "@/types"

export function VisitaDialog({ open, onOpenChange, visita, pazienteId, inizio }: {
  open: boolean
  onOpenChange: (a: boolean) => void
  visita?: Visita
  pazienteId?: number
  inizio?: string
}) {
  const { aggiorna } = useAzioni()
  const [paziente, setPaziente] = useState<number | null>(null)
  const [tipo, setTipo] = useState("CONTROLLO")
  const [modalita, setModalita] = useState("ONLINE")
  const [quando, setQuando] = useState("")
  const [durata, setDurata] = useState(30)
  const [conMeet, setConMeet] = useState(true)
  const [invita, setInvita] = useState(true)
  const [note, setNote] = useState("")
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => {
    if (!open) return
    if (visita) {
      setPaziente(visita.pazienteId)
      setTipo(visita.tipo)
      setModalita(visita.modalita)
      setQuando(visita.inizio.slice(0, 16))
      setDurata(Math.round((new Date(visita.fine).getTime() - new Date(visita.inizio).getTime()) / 60000))
      setConMeet(visita.conMeet)
      setInvita(visita.invitaPaziente)
      setNote(visita.note ?? "")
    } else {
      setPaziente(pazienteId ?? null)
      setTipo("CONTROLLO")
      setModalita("ONLINE")
      setQuando(inizio ?? `${oggiIso()}T09:00`)
      setDurata(30)
      setConMeet(true)
      setInvita(true)
      setNote("")
    }
  }, [open, visita, pazienteId, inizio])

  const cambiaTipo = (nuovo: string) => {
    setTipo(nuovo)
    if (!visita) setDurata(DURATA_VISITA[nuovo])
  }

  const cambiaModalita = (nuova: string) => {
    setModalita(nuova)
    setConMeet(nuova === "ONLINE")
  }

  const salva = async () => {
    if (!paziente) return toastErrore(new Error("Scegli il paziente"))
    setInCorso(true)
    try {
      const corpo = { pazienteId: paziente, tipo, modalita, inizio: quando, durataMinuti: durata, conMeet, invitaPaziente: invita, note: note || null }
      if (visita) await visiteService.aggiorna(visita.id, corpo)
      else await visiteService.crea(corpo)
      toast.success(visita ? "Visita aggiornata" : "Visita fissata")
      aggiorna()
      onOpenChange(false)
    } catch (e) {
      toastErrore(e)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Finestra open={open} onOpenChange={onOpenChange} titolo={visita ? "Modifica visita" : "Nuova visita"} salva={salva} inCorso={inCorso}
      descrizione="Numero della visita e titolo sul calendario seguono il percorso attivo del paziente.">
      <Campo etichetta="Paziente" id="visita-paziente">
        <PazienteCombobox id="visita-paziente" valore={paziente} onChange={setPaziente} disabled={!!visita || !!pazienteId} />
      </Campo>
      <Griglia>
        <Campo etichetta="Tipo" id="visita-tipo"><Scelta id="visita-tipo" valore={tipo} onChange={cambiaTipo} opzioni={TIPO_VISITA} /></Campo>
        <Campo etichetta="Modalità" id="visita-modalita"><Scelta id="visita-modalita" valore={modalita} onChange={cambiaModalita} opzioni={MODALITA_VISITA} /></Campo>
        <Campo etichetta="Data e ora" id="visita-quando"><Input id="visita-quando" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} required /></Campo>
        <Campo etichetta="Durata (minuti)" id="visita-durata"><Input id="visita-durata" type="number" min={5} max={240} step={5} value={durata} onChange={(e) => setDurata(Number(e.target.value))} required /></Campo>
      </Griglia>
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Checkbox id="visita-meet" checked={conMeet} onCheckedChange={(v) => setConMeet(v === true)} />
          <Label htmlFor="visita-meet">Crea il link Google Meet</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="visita-invita" checked={invita} onCheckedChange={(v) => setInvita(v === true)} />
          <Label htmlFor="visita-invita">Invia l'invito al paziente</Label>
        </div>
      </div>
      <Campo etichetta="Note" id="visita-note"><Textarea id="visita-note" value={note} onChange={(e) => setNote(e.target.value)} /></Campo>
    </Finestra>
  )
}
