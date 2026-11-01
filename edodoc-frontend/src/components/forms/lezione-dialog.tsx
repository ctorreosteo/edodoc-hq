import { useEffect, useState } from "react"
import { TestoMarkdown } from "@/components/corsi/testo-markdown"
import { VideoUploader } from "@/components/corsi/video-uploader"
import { Campo } from "@/components/forms/campo"
import { Finestra } from "@/components/forms/finestra"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useAzioni } from "@/contexts/azioni-context"
import { toast, toastErrore } from "@/lib/toast"
import { corsiService } from "@/services/gestionale"
import type { RigaLezione, TipoLezione } from "@/types"

export function LezioneDialog({ open, onOpenChange, moduloId, tipo, lezione: iniziale }: {
  open: boolean
  onOpenChange: (a: boolean) => void
  moduloId: number
  tipo: TipoLezione
  lezione?: RigaLezione
}) {
  const { aggiorna } = useAzioni()
  const [lezione, setLezione] = useState(iniziale)
  const [titolo, setTitolo] = useState("")
  const [descrizione, setDescrizione] = useState("")
  const [contenuto, setContenuto] = useState("")
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => {
    if (!open) return
    setLezione(iniziale)
    setTitolo(iniziale?.titolo ?? "")
    setDescrizione(iniziale?.descrizione ?? "")
    setContenuto(iniziale?.contenuto ?? "")
  }, [open, iniziale])

  const salva = async () => {
    setInCorso(true)
    try {
      const corpo = { tipo, titolo, descrizione: descrizione || null, contenuto: tipo === "TESTO" ? contenuto : null }
      const salvata = lezione ? await corsiService.aggiornaLezione(lezione.id, corpo) : await corsiService.creaLezione(moduloId, corpo)
      aggiorna()
      if (tipo === "VIDEO" && !lezione) {
        // La lezione esiste: la finestra resta aperta per caricare il video
        setLezione(salvata)
        return
      }
      toast.success(lezione ? "Lezione aggiornata" : "Lezione creata")
      onOpenChange(false)
    } catch (e) {
      toastErrore(e)
    } finally {
      setInCorso(false)
    }
  }

  const nuova = !lezione
  const titoloFinestra = nuova ? (tipo === "VIDEO" ? "Nuova lezione video" : "Nuova lezione scritta") : "Modifica lezione"

  return (
    <Finestra open={open} onOpenChange={onOpenChange} titolo={titoloFinestra} larga salva={salva} inCorso={inCorso}
      etichettaSalva={nuova && tipo === "VIDEO" ? "Continua" : "Salva"}
      descrizione={nuova && tipo === "VIDEO" ? "Dopo il titolo carichi il file" : undefined}>
      <Campo etichetta="Titolo" id="lezione-titolo"><Input id="lezione-titolo" value={titolo} onChange={(e) => setTitolo(e.target.value)} required /></Campo>
      <Campo etichetta="Descrizione breve (facoltativa)" id="lezione-descrizione"><Input id="lezione-descrizione" value={descrizione} onChange={(e) => setDescrizione(e.target.value)} /></Campo>
      {tipo === "VIDEO" && lezione ? (
        <VideoUploader lezione={lezione} onCambiata={(l) => { setLezione(l); aggiorna() }} />
      ) : null}
      {tipo === "TESTO" ? (
        <Tabs defaultValue="scrivi" className="grid gap-2">
          <TabsList className="w-fit">
            <TabsTrigger value="scrivi">Scrivi</TabsTrigger>
            <TabsTrigger value="anteprima">Anteprima</TabsTrigger>
          </TabsList>
          <TabsContent value="scrivi" className="mt-0 grid gap-1.5">
            <Textarea aria-label="Testo della lezione" className="min-h-64" value={contenuto} onChange={(e) => setContenuto(e.target.value)} />
            <p className="text-xs text-muted-foreground"># Titolo · ## Sottotitolo · **grassetto** · - elenco</p>
          </TabsContent>
          <TabsContent value="anteprima" className="mt-0 min-h-64 rounded-md border p-3">
            {contenuto.trim() ? <TestoMarkdown testo={contenuto} /> : <p className="text-sm text-muted-foreground">Ancora nessun testo</p>}
          </TabsContent>
        </Tabs>
      ) : null}
    </Finestra>
  )
}
