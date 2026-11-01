import { Inbox, Loader2 } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"

export function Caricamento({ etichetta = "Caricamento…" }: { etichetta?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {etichetta}
    </div>
  )
}

export function Vuoto({ titolo, descrizione, icona }: { titolo: string; descrizione?: string; icona?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 py-12 text-center">
      <div className="mb-1 text-muted-foreground [&_svg]:size-7">{icona ?? <Inbox aria-hidden />}</div>
      <p className="font-semibold">{titolo}</p>
      {descrizione ? <p className="text-sm text-muted-foreground">{descrizione}</p> : null}
    </div>
  )
}

export function Errore({ messaggio, onRiprova }: { messaggio: string; onRiprova: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="font-semibold">{messaggio}</p>
      <Button variant="outline" onClick={onRiprova}>Riprova</Button>
    </div>
  )
}
