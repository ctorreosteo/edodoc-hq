import { ChevronDown, Inbox, Layers, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { useState } from "react"
import { iconaTask } from "@/components/menu-contestuali"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { Task, TipoTask } from "@/types"
import { coloreTipo, gruppoScadenza, type TaskSelezione } from "./task-utils"

type Props = {
  tipi: TipoTask[]
  /** Solo i task aperti: i conteggi della barra */
  aperti: Task[]
  selezione: TaskSelezione
  onSeleziona: (s: TaskSelezione) => void
}

function Conteggio({ aperti }: { aperti: Task[] }) {
  const gruppi = aperti.map((t) => gruppoScadenza(t))
  const ritardo = gruppi.filter((g) => g === "ritardo").length
  const oggi = gruppi.filter((g) => g === "oggi").length
  const n = ritardo + oggi
  if (!n) return null
  return <em className="tk-rail-count" data-tone={ritardo ? "late" : "today"} title={`${ritardo} in ritardo, ${oggi} oggi`}>{n}</em>
}

function IconaTipo({ tipo }: { tipo: TipoTask }) {
  const Icona = iconaTask(tipo.icona)
  return <span className="tk-lista-icona" data-size="sm" aria-hidden><Icona /></span>
}

function VociTipi({ tipi, aperti, selezione, onSeleziona }: Props) {
  return (
    <>
      <p className="tk-rail-section-title">Tipi</p>
      <ul className="tk-rail-list">
        {tipi.map((tipo) => {
          const attivo = selezione === tipo.codice
          return (
            <li key={tipo.id}>
              <button type="button" className="tk-rail-item" data-active={attivo ? "" : undefined} aria-current={attivo ? "page" : undefined}
                style={{ ["--tk-c" as string]: coloreTipo(tipo) }} title={tipo.etichetta} onClick={() => onSeleziona(tipo.codice)}>
                <IconaTipo tipo={tipo} />
                <span className="tk-rail-label">{tipo.etichetta}</span>
                <Conteggio aperti={aperti.filter((t) => t.tipo.codice === tipo.codice)} />
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** Navigazione desktop: "I miei task", "Tutti i task" e un elemento per ogni tipo. */
export function TaskRail({ compatta, onToggleCompatta, ...props }: Props & { compatta: boolean; onToggleCompatta: () => void }) {
  const { aperti, selezione, onSeleziona } = props
  return (
    <nav className="tk-rail" data-compatta={compatta ? "" : undefined} aria-label="Tipi di task">
      <button type="button" className="tk-rail-item tk-rail-item--home" data-active={selezione === "miei" ? "" : undefined}
        aria-current={selezione === "miei" ? "page" : undefined} title="I miei task" onClick={() => onSeleziona("miei")}>
        <span className="tk-rail-home-icon" aria-hidden><Inbox /></span>
        <span className="tk-rail-label">I miei task</span>
        <Conteggio aperti={aperti} />
      </button>
      <button type="button" className="tk-rail-item" data-active={selezione === "tutti" ? "" : undefined}
        aria-current={selezione === "tutti" ? "page" : undefined} title="Tutti i task" onClick={() => onSeleziona("tutti")}>
        <span className="tk-rail-home-icon tk-rail-home-icon--all" aria-hidden><Layers /></span>
        <span className="tk-rail-label">Tutti i task</span>
      </button>

      <VociTipi {...props} />

      <div className="tk-rail-foot">
        <button type="button" className="tk-rail-toggle" onClick={onToggleCompatta}
          aria-label={compatta ? "Espandi elenco tipi" : "Riduci elenco tipi"} title={compatta ? "Espandi" : "Riduci"}>
          {compatta ? <PanelLeftOpen /> : <PanelLeftClose />}
        </button>
      </div>
    </nav>
  )
}

/** Navigazione su telefono: segmenti fissi in alto (I miei · Tipi ▾ · Tutti); "Tipi" apre l'elenco dal basso. */
export function TaskNavMobile(props: Props) {
  const { tipi, aperti, selezione, onSeleziona } = props
  const [aperto, setAperto] = useState(false)
  const corrente = tipi.find((t) => t.codice === selezione)
  return (
    <nav className="tk-navm" aria-label="Tipi di task">
      <button type="button" data-active={selezione === "miei" ? "" : undefined} onClick={() => onSeleziona("miei")}>
        <Inbox aria-hidden /><span>I miei</span><Conteggio aperti={aperti} />
      </button>
      <button type="button" data-active={corrente ? "" : undefined} onClick={() => setAperto(true)} aria-haspopup="dialog"
        style={corrente ? { ["--tk-c" as string]: coloreTipo(corrente) } : undefined}>
        {corrente ? <IconaTipo tipo={corrente} /> : null}
        <span className="tk-navm-label">{corrente ? corrente.etichetta : "Tipi"}</span>
        <ChevronDown aria-hidden />
      </button>
      <button type="button" data-active={selezione === "tutti" ? "" : undefined} onClick={() => onSeleziona("tutti")}>
        <Layers aria-hidden /><span>Tutti</span>
      </button>

      <Sheet open={aperto} onOpenChange={setAperto}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-[1.5rem] p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
          <div data-vl="scope" data-vl-page="task" className="tk-albero-sheet">
            <SheetHeader className="tk-albero-sheet-head">
              <SheetTitle>Tipi di task</SheetTitle>
              <SheetDescription className="sr-only">Scegli un tipo da aprire</SheetDescription>
            </SheetHeader>
            <div className="tk-albero-sheet-body">
              <VociTipi {...props} onSeleziona={(s) => {
                setAperto(false)
                onSeleziona(s)
              }} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  )
}
