import { CheckCircle2, Clapperboard, Cloud, RotateCcw, UploadCloud, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { useAzioni } from "@/contexts/azioni-context"
import { durata } from "@/lib/format"
import { toast } from "@/lib/toast"
import { corsiService } from "@/services/gestionale"
import { caricaVideoTus, validaVideo, VIDEO_ACCEPT } from "@/services/video-cloudflare"
import type { RigaLezione } from "@/types"

type Fase =
  | { tipo: "vuoto" }
  | { tipo: "preparazione" }
  | { tipo: "caricamento"; file: File; caricati: number }
  | { tipo: "elaborazione"; avanzamento: number | null }
  | { tipo: "pronto" }
  | { tipo: "errore"; messaggio: string; file?: File }

const POLLING_MS = 4000

function faseIniziale(lezione: RigaLezione): Fase {
  switch (lezione.videoStato) {
    case "ELABORAZIONE": return { tipo: "elaborazione", avanzamento: null }
    case "PRONTO": return { tipo: "pronto" }
    case "ERRORE": return { tipo: "errore", messaggio: lezione.videoErrore ?? "Cloudflare non è riuscito a elaborare il video" }
    default: return { tipo: "vuoto" }
  }
}

function megabyte(bytes: number) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`
}

function Barra({ percentuale }: { percentuale: number | null }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percentuale ?? undefined} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full bg-primary transition-[width] ${percentuale == null ? "w-1/3 animate-pulse" : ""}`} style={percentuale == null ? undefined : { width: `${percentuale}%` }} />
    </div>
  )
}

function ZonaFile({ onFile, titolo, testo }: { onFile: (file: File) => void; titolo: string; testo?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [sopra, setSopra] = useState(false)
  return (
    <button type="button" onClick={() => input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setSopra(true) }}
      onDragLeave={() => setSopra(false)}
      onDrop={(e) => {
        e.preventDefault()
        setSopra(false)
        const file = e.dataTransfer.files[0]
        if (file) onFile(file)
      }}
      className={`flex w-full flex-col items-center gap-1 rounded-xl border border-dashed p-6 text-center hover:bg-muted ${sopra ? "bg-muted" : ""}`}>
      <UploadCloud className="size-6 text-muted-foreground" aria-hidden />
      <span className="text-sm font-semibold">{titolo}</span>
      {testo ? <span className="text-xs text-muted-foreground">{testo}</span> : null}
      <input ref={input} type="file" accept={VIDEO_ACCEPT} hidden onClick={(e) => e.stopPropagation()} onChange={(e) => {
        const file = e.target.files?.[0]
        e.target.value = ""
        if (file) onFile(file)
      }} />
    </button>
  )
}

/** Il file va direttamente a Cloudflare; durata e stato arrivano da soli a elaborazione finita. */
export function VideoUploader({ lezione, onCambiata }: { lezione: RigaLezione; onCambiata: (lezione: RigaLezione) => void }) {
  const { conferma } = useAzioni()
  const [fase, setFase] = useState<Fase>(() => faseIniziale(lezione))
  const [iframe, setIframe] = useState<string | null>(null)
  const annulla = useRef<AbortController | null>(null)
  const notifica = useRef(onCambiata)
  useEffect(() => {
    notifica.current = onCambiata
  }, [onCambiata])

  const segui = useCallback(async () => {
    const stato = await corsiService.sincronizzaVideo(lezione.id)
    notifica.current(stato.lezione)
    if (stato.stato === "PRONTO") setFase({ tipo: "pronto" })
    else if (stato.stato === "ERRORE") setFase({ tipo: "errore", messaggio: stato.lezione.videoErrore ?? "Elaborazione non riuscita" })
    else setFase({ tipo: "elaborazione", avanzamento: stato.avanzamento })
  }, [lezione.id])

  const carica = useCallback(async (file: File) => {
    const errore = validaVideo(file)
    if (errore) {
      toast.error(errore)
      return
    }
    const controllo = new AbortController()
    annulla.current = controllo
    setIframe(null)
    setFase({ tipo: "preparazione" })
    try {
      const { uploadUrl } = await corsiService.avviaUploadVideo(lezione.id, file.size)
      await caricaVideoTus(file, uploadUrl, (caricati) => setFase({ tipo: "caricamento", file, caricati }), controllo.signal)
      setFase({ tipo: "elaborazione", avanzamento: null })
      // Il file è arrivato: se questa lettura fallisce ci pensa il giro di attesa
      await segui().catch(() => undefined)
    } catch (e) {
      if (controllo.signal.aborted) {
        setFase({ tipo: "vuoto" })
        toast.message("Caricamento annullato")
      } else {
        setFase({ tipo: "errore", messaggio: e instanceof Error ? e.message : "Caricamento non riuscito", file })
      }
    } finally {
      annulla.current = null
    }
  }, [lezione.id, segui])

  // Chiudere la finestra ferma il caricamento
  useEffect(() => () => annulla.current?.abort(), [])

  const staCaricando = fase.tipo === "preparazione" || fase.tipo === "caricamento"
  useEffect(() => {
    if (!staCaricando) return
    const avvisa = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", avvisa)
    return () => window.removeEventListener("beforeunload", avvisa)
  }, [staCaricando])

  const inElaborazione = fase.tipo === "elaborazione"
  useEffect(() => {
    if (!inElaborazione) return
    // Un errore di rete non ferma l'attesa: si riprova al giro dopo
    const giro = window.setInterval(() => void segui().catch(() => undefined), POLLING_MS)
    return () => window.clearInterval(giro)
  }, [inElaborazione, segui])

  const pronto = fase.tipo === "pronto"
  useEffect(() => {
    if (!pronto) return
    corsiService.riproduzione(lezione.id).then((r) => setIframe(r.iframeUrl)).catch(() => setIframe(null))
  }, [pronto, lezione.id])

  const sostituisci = (file: File) => conferma({
    titolo: "Sostituire il video?",
    descrizione: "Il video attuale viene eliminato subito: i pazienti non vedono la lezione finché il nuovo non è pronto.",
    etichetta: "Sostituisci",
    azione: async () => void carica(file),
  })

  if (fase.tipo === "vuoto") {
    return <ZonaFile onFile={(f) => void carica(f)} titolo="Trascina qui il video o scegli un file" testo="MP4, MOV, MKV o WebM, fino a 30 GB" />
  }

  if (fase.tipo === "preparazione" || fase.tipo === "caricamento") {
    const percentuale = fase.tipo === "caricamento" && fase.file.size ? Math.min(100, Math.floor((fase.caricati / fase.file.size) * 100)) : 0
    return (
      <div className="grid gap-2 rounded-xl border p-3">
        <div className="flex items-center gap-2">
          <Cloud className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{fase.tipo === "caricamento" ? fase.file.name : "Preparo il caricamento…"}</p>
          <span className="text-sm tabular-nums">{percentuale}%</span>
        </div>
        <Barra percentuale={percentuale} />
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{fase.tipo === "caricamento" ? `${megabyte(fase.caricati)} di ${megabyte(fase.file.size)}. Tieni aperta questa finestra.` : ""}</span>
          <button type="button" className="inline-flex items-center gap-1 underline" onClick={() => annulla.current?.abort()}><X className="size-3" aria-hidden />Annulla</button>
        </div>
      </div>
    )
  }

  if (fase.tipo === "elaborazione") {
    return (
      <div className="grid gap-2 rounded-xl border p-3">
        <div className="flex items-center gap-2">
          <Clapperboard className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="min-w-0 flex-1 text-sm font-semibold">Cloudflare sta preparando il video</p>
          {fase.avanzamento ? <span className="text-sm tabular-nums">{fase.avanzamento}%</span> : null}
        </div>
        <Barra percentuale={fase.avanzamento || null} />
        <p className="text-xs text-muted-foreground">Puoi chiudere la finestra: l'elaborazione continua.</p>
      </div>
    )
  }

  if (fase.tipo === "errore") {
    return (
      <div className="grid gap-2 rounded-xl border p-3" role="alert">
        <p className="text-sm font-semibold">Il video non è stato caricato</p>
        <p className="text-sm text-muted-foreground">{fase.messaggio}</p>
        <div className="flex flex-wrap gap-2">
          {fase.file ? (
            <Button type="button" size="sm" onClick={() => fase.file && void carica(fase.file)}><RotateCcw className="size-4" aria-hidden />Riprova</Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={() => setFase({ tipo: "vuoto" })}>Scegli un altro file</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <div className="aspect-video overflow-hidden rounded-xl bg-black">
        {iframe ? <iframe src={iframe} title={lezione.titolo} className="size-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /> : null}
      </div>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4" aria-hidden />Video pronto · {durata(lezione.durataSecondi)}
      </p>
      <ZonaFile onFile={sostituisci} titolo="Sostituisci video" />
    </div>
  )
}
