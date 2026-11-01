import { Chip } from "@/components/chip"
import { urlCopertina } from "@/services/gestionale"
import type { RigaLezione } from "@/types"

export function CopertinaCorso({ id, titolo }: { id: string | null; titolo: string }) {
  return (
    <div className="flex aspect-video w-full items-center justify-center overflow-hidden bg-muted">
      {id ? <img src={urlCopertina(id)} alt="" loading="lazy" className="size-full object-cover" />
        : <span className="text-3xl font-bold text-muted-foreground" aria-hidden>{titolo.charAt(0).toUpperCase()}</span>}
    </div>
  )
}

export function StatoCorso({ pubblicato }: { pubblicato: boolean }) {
  return <Chip tono={pubblicato ? "ok" : "muted"}>{pubblicato ? "Pubblicato" : "Bozza"}</Chip>
}

export function StatoLezione({ lezione }: { lezione: RigaLezione }) {
  if (lezione.tipo === "VIDEO") {
    if (lezione.videoStato === "ELABORAZIONE") return <Chip tono="info">In elaborazione</Chip>
    if (lezione.videoStato === "ERRORE") return <Chip tono="danger">Errore video</Chip>
    if (lezione.videoStato !== "PRONTO") return <Chip tono="warn">Video da caricare</Chip>
  } else if (!lezione.completa) {
    return <Chip tono="warn">Testo da scrivere</Chip>
  }
  return <Chip tono={lezione.pubblicata ? "ok" : "muted"}>{lezione.pubblicata ? "Pubblicata" : "Bozza"}</Chip>
}
