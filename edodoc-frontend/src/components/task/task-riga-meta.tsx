import { AlarmClock, CornerDownLeft, Flag, Loader2, Plus, Sparkles, User } from "lucide-react"
import { useState, type ReactNode } from "react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { PRIORITA } from "@/lib/etichette"
import { cn } from "@/lib/utils"
import type { Task } from "@/types"
import { TaskCheck } from "./task-check"
import { TaskPosticipaMenu } from "./task-posticipa"
import { eFatto, formatScadenza, gruppoScadenza, parseRapido, PRIORITA_VALORI, type TaskCreaRapido } from "./task-utils"

const COLORI_PRIORITA: Record<string, string> = {
  ALTA: "text-rose-600 fill-rose-500 dark:text-rose-400 dark:fill-rose-400",
  MEDIA: "text-amber-500 fill-amber-400 dark:text-amber-300 dark:fill-amber-300",
  BASSA: "text-slate-400 fill-slate-300 dark:text-white/40 dark:fill-white/30",
}

export function TaskPrioritaIcon({ priorita, conEtichetta }: { priorita: string; conEtichetta?: boolean }) {
  const testo = PRIORITA[priorita]?.testo ?? priorita
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px]" title={`Priorità: ${testo}`}>
      <Flag className={cn("size-3.5 shrink-0", COLORI_PRIORITA[priorita])} aria-hidden />
      {conEtichetta ? <span>{testo}</span> : null}
    </span>
  )
}

export function TaskPrioritaMenu({ valore, onChange, trigger }: { valore?: string; onChange: (p: string) => void; trigger: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
        {PRIORITA_VALORI.filter((p) => p !== valore).map((p) => (
          <DropdownMenuItem key={p} onSelect={() => onChange(p)}><TaskPrioritaIcon priorita={p} conEtichetta /></DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TaskScadenzaLabel({ task }: { task: Task }) {
  if (!task.scadenza) return null
  const fatto = eFatto(task)
  const gruppo = fatto ? null : gruppoScadenza(task)
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap text-[13px] tabular-nums",
      gruppo === "ritardo" && "font-semibold text-rose-600 dark:text-rose-400",
      gruppo === "oggi" && "font-semibold text-amber-600 dark:text-amber-300",
      gruppo !== "ritardo" && gruppo !== "oggi" && "text-muted-foreground",
      fatto && "line-through opacity-70")}>
      {formatScadenza(task.scadenza)}
    </span>
  )
}

export function TaskPazienteTag({ task }: { task: Task }) {
  if (!task.pazienteNome) return null
  return (
    <span className="tk-paziente" title="Paziente collegato">
      <User aria-hidden />
      <span>{task.pazienteNome}</span>
    </span>
  )
}

export function TaskAutomaticoTag({ task, compatto }: { task: Task; compatto?: boolean }) {
  if (!task.automatico) return null
  return (
    <span className="tk-paziente" title="Creato da solo: rinnovi, esami, Tessera Sanitaria">
      <Sparkles aria-hidden />
      {compatto ? null : <span>Automatico</span>}
    </span>
  )
}

export function TaskListaDot({ task }: { task: Task }) {
  const colore = task.lista.colore
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px]">
      <span className="size-2.5 shrink-0 rounded-[4px]" style={{ backgroundColor: colore, boxShadow: `0 0 0 3px color-mix(in srgb, ${colore} 18%, transparent)` }} />
      <span className="truncate">{task.lista.nome}</span>
    </span>
  )
}

/** Cerchio "completa" di una riga: non apre il dettaglio. `onToggle` riceve il bottone (per i coriandoli). */
export function TaskRigaCheck({ task, onToggle }: { task: Task; onToggle: (el: HTMLButtonElement) => void }) {
  return (
    <span className="tk-riga-check" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <TaskCheck completato={eFatto(task)} onToggle={onToggle} />
    </span>
  )
}

/** Pulsante "Posticipa" della riga: su desktop compare al passaggio. `data-tk-posticipa` serve alla scorciatoia "p". */
export function TaskRigaPosticipa({ task, onPosticipa }: { task: Task; onPosticipa: (scadenza: string | null) => void }) {
  if (eFatto(task)) return null
  return (
    <span className="tk-riga-posticipa" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <TaskPosticipaMenu scadenza={task.scadenza} onPosticipa={onPosticipa}
        trigger={
          <button type="button" className="tk-row-action" data-tk-posticipa="" aria-label="Posticipa" title="Posticipa (P)">
            <AlarmClock aria-hidden />
          </button>
        } />
    </span>
  )
}

/** "+ Aggiungi task": Invio crea il task; "domani" o "!alta" in fondo al testo fissano scadenza e priorità. */
export function TaskAggiuntaRapida({ onCrea, priorita }: { onCrea: TaskCreaRapido; priorita?: string }) {
  const [attivo, setAttivo] = useState(false)
  const [testo, setTesto] = useState("")
  const [salvando, setSalvando] = useState(false)

  const invia = async () => {
    const { titolo, extra } = parseRapido(testo)
    if (!titolo || salvando) return
    setSalvando(true)
    const ok = await onCrea(titolo, { priorita, ...extra })
    setSalvando(false)
    if (ok) setTesto("")
  }

  if (!attivo) {
    return (
      <button type="button" className="tk-quick-add" onClick={() => setAttivo(true)}>
        <Plus aria-hidden /> Aggiungi task
      </button>
    )
  }
  return (
    <div className="tk-quick-add tk-quick-add--open">
      <span className="tk-quick-add-icon" aria-hidden>{salvando ? <Loader2 className="animate-spin" /> : <Plus />}</span>
      <input className="tk-quick-add-input" value={testo} autoFocus aria-label="Nuovo task" placeholder="Es. Richiamare Rossi domani !alta"
        onChange={(e) => setTesto(e.target.value)}
        onBlur={() => {
          if (!testo.trim()) setAttivo(false)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            void invia()
          } else if (e.key === "Escape") {
            setTesto("")
            setAttivo(false)
          }
        }} />
      <span className="tk-quick-add-hint" aria-hidden><CornerDownLeft /> Invio</span>
    </div>
  )
}
