import { ChevronDown, Folder, Inbox, Layers, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { useState } from "react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useAzioni } from "@/contexts/azioni-context"
import { cartellaDaSelezione, listaDaSelezione } from "@/lib/task-struttura"
import type { Task } from "@/types"
import { TaskAlbero, type TaskAlberoAzioni } from "./task-albero"
import { TaskListaIcona } from "./task-lista-icona"
import { gruppoScadenza, type TaskSelezione } from "./task-utils"

type Props = {
  /** Solo i task aperti: i conteggi della barra */
  aperti: Task[]
  selezione: TaskSelezione
  azioni: TaskAlberoAzioni
}

function Conteggio({ aperti }: { aperti: Task[] }) {
  const gruppi = aperti.map((t) => gruppoScadenza(t))
  const ritardo = gruppi.filter((g) => g === "ritardo").length
  const oggi = gruppi.filter((g) => g === "oggi").length
  const n = ritardo + oggi
  if (!n) return null
  return <em className="tk-rail-count" data-tone={ritardo ? "late" : "today"} title={`${ritardo} in ritardo, ${oggi} oggi`}>{n}</em>
}

/** Navigazione desktop: "I miei task", "Tutti i task" e la struttura di cartelle e liste. */
export function TaskRail({ compatta, onToggleCompatta, aperti, selezione, azioni }: Props & { compatta: boolean; onToggleCompatta: () => void }) {
  return (
    <nav className="tk-rail" data-compatta={compatta ? "" : undefined} aria-label="Cartelle e liste dei task">
      <button type="button" className="tk-rail-item tk-rail-item--home" data-active={selezione === "miei" ? "" : undefined}
        aria-current={selezione === "miei" ? "page" : undefined} title="I miei task" onClick={() => azioni.onSeleziona("miei")}>
        <span className="tk-rail-home-icon" aria-hidden><Inbox /></span>
        <span className="tk-rail-label">I miei task</span>
        <Conteggio aperti={aperti} />
      </button>
      <button type="button" className="tk-rail-item" data-active={selezione === "tutti" ? "" : undefined}
        aria-current={selezione === "tutti" ? "page" : undefined} title="Tutti i task" onClick={() => azioni.onSeleziona("tutti")}>
        <span className="tk-rail-home-icon tk-rail-home-icon--all" aria-hidden><Layers /></span>
        <span className="tk-rail-label">Tutti i task</span>
      </button>

      <TaskAlbero aperti={aperti} selezione={selezione} azioni={azioni} trascinabile={!compatta} compatta={compatta} />

      <div className="tk-rail-foot">
        <button type="button" className="tk-rail-toggle" onClick={onToggleCompatta}
          aria-label={compatta ? "Espandi elenco liste" : "Riduci elenco liste"} title={compatta ? "Espandi" : "Riduci"}>
          {compatta ? <PanelLeftOpen /> : <PanelLeftClose />}
        </button>
      </div>
    </nav>
  )
}

/** Navigazione su telefono: segmenti fissi in alto (I miei · Liste ▾ · Tutti); "Liste" apre l'albero dal basso. */
export function TaskNavMobile({ aperti, selezione, azioni }: Props) {
  const { struttura } = useAzioni()
  const [aperto, setAperto] = useState(false)
  const lista = struttura.liste.find((l) => l.id === listaDaSelezione(selezione))
  const cartella = struttura.cartelle.find((c) => c.id === cartellaDaSelezione(selezione))
  const corrente = lista ?? cartella
  // Ogni scelta chiude il pannello; creare apre il suo dialog al posto del pannello
  const azioniSheet: TaskAlberoAzioni = {
    onSeleziona: (s) => {
      setAperto(false)
      azioni.onSeleziona(s)
    },
    onCrea: (tipo, parentId) => {
      setAperto(false)
      azioni.onCrea(tipo, parentId)
    },
  }
  return (
    <nav className="tk-navm" aria-label="Cartelle e liste dei task">
      <button type="button" data-active={selezione === "miei" ? "" : undefined} onClick={() => azioni.onSeleziona("miei")}>
        <Inbox aria-hidden /><span>I miei</span><Conteggio aperti={aperti} />
      </button>
      <button type="button" data-active={corrente ? "" : undefined} onClick={() => setAperto(true)} aria-haspopup="dialog"
        style={corrente ? { ["--tk-c" as string]: corrente.colore } : undefined}>
        {lista ? <TaskListaIcona lista={lista} size="sm" /> : cartella ? <Folder aria-hidden style={{ color: cartella.colore }} /> : null}
        <span className="tk-navm-label">{corrente ? corrente.nome : "Liste"}</span>
        <ChevronDown aria-hidden />
      </button>
      <button type="button" data-active={selezione === "tutti" ? "" : undefined} onClick={() => azioni.onSeleziona("tutti")}>
        <Layers aria-hidden /><span>Tutti</span>
      </button>

      <Sheet open={aperto} onOpenChange={setAperto}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-[1.5rem] p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
          <div data-vl="scope" data-vl-page="task" className="tk-albero-sheet">
            <SheetHeader className="tk-albero-sheet-head">
              <SheetTitle>Cartelle e liste</SheetTitle>
              <SheetDescription className="sr-only">Scegli una cartella o una lista da aprire</SheetDescription>
            </SheetHeader>
            <div className="tk-albero-sheet-body">
              <TaskAlbero aperti={aperti} selezione={selezione} azioni={azioniSheet} variante="sheet" />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  )
}
