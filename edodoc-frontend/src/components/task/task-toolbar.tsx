import { CalendarDays, Columns3, ListFilter, Plus, Rows3, Search, X } from "lucide-react"
import { forwardRef } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TaskPrioritaIcon } from "./task-riga-meta"
import { PRIORITA_VALORI, type TaskFiltri, type TaskVista } from "./task-utils"

const VISTE: { value: TaskVista; label: string; icon: typeof Rows3 }[] = [
  { value: "lista", label: "Lista", icon: Rows3 },
  { value: "kanban", label: "Kanban", icon: Columns3 },
  { value: "calendario", label: "Calendario", icon: CalendarDays },
]

/** Ricerca: "/" la mette a fuoco da qualsiasi punto della pagina. */
export const TaskSearch = forwardRef<HTMLInputElement, { value: string; onChange: (q: string) => void }>(function TaskSearch({ value, onChange }, ref) {
  return (
    <label className="tk-search">
      <Search aria-hidden />
      <input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Cerca task, paziente…" aria-label="Cerca task"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("")
            e.currentTarget.blur()
          }
        }} />
      {value ? <button type="button" className="tk-search-clear" onClick={() => onChange("")} aria-label="Svuota ricerca"><X /></button> : <kbd aria-hidden>/</kbd>}
    </label>
  )
})

export function TaskVistaSwitch({ value, onChange }: { value: TaskVista; onChange: (v: TaskVista) => void }) {
  return (
    <div className="tk-segmented" role="tablist" aria-label="Vista">
      {VISTE.map(({ value: v, label, icon: Icon }) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} data-active={value === v ? "" : undefined} onClick={() => onChange(v)}>
          <Icon aria-hidden /><span>{label}</span>
        </button>
      ))}
    </div>
  )
}

export function TaskFiltriPopover({ filtri, onChange }: { filtri: TaskFiltri; onChange: (patch: Partial<TaskFiltri>) => void }) {
  const attivi = (filtri.priorita ? 1 : 0) + (filtri.soloAutomatici ? 1 : 0)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="tk-btn tk-btn--ghost" data-active={attivi ? "" : undefined}>
          <ListFilter aria-hidden />
          <span>Filtri</span>
          {attivi ? <em className="tk-btn-count">{attivi}</em> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="tk-filters w-80 p-0" data-vl="scope" data-vl-page="task">
        <div className="tk-filters-head">
          <b>Filtri</b>
          {attivi ? <button type="button" className="tk-link" onClick={() => onChange({ priorita: null, soloAutomatici: false })}>Azzera</button> : null}
        </div>
        <div className="tk-filters-body">
          <div className="tk-field">
            <span className="tk-field-label">Priorità</span>
            <div className="tk-chips">
              {PRIORITA_VALORI.map((p) => (
                <button key={p} type="button" className="tk-chip-toggle" data-active={filtri.priorita === p ? "" : undefined}
                  onClick={() => onChange({ priorita: filtri.priorita === p ? null : p })}>
                  <TaskPrioritaIcon priorita={p} conEtichetta />
                </button>
              ))}
            </div>
          </div>
          <label className="tk-check">
            <Checkbox checked={filtri.soloAutomatici} onCheckedChange={(c) => onChange({ soloAutomatici: c === true })} />
            <span>Solo quelli creati da soli (rinnovi, esami, Tessera Sanitaria)</span>
          </label>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function TaskNuovoButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="vl-cta tk-hero-cta" data-m-primary="" onClick={onClick} title="Nuovo task (N)">
      <span className="vl-cta-icon" aria-hidden><Plus className="h-4 w-4" strokeWidth={2.75} /></span>
      <span className="vl-cta-label">Nuovo task</span>
      <kbd aria-hidden>N</kbd>
    </button>
  )
}

/** Sul telefono il "Nuovo task" è un pulsante fluttuante, sempre a portata di pollice. */
export function TaskNuovoFab({ onClick }: { onClick: () => void }) {
  return <button type="button" className="tk-fab" onClick={onClick} aria-label="Nuovo task"><Plus aria-hidden /></button>
}
