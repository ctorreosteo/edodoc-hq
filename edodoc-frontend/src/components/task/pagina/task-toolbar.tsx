import { forwardRef } from 'react'
import { CalendarDays, ChartGantt, Columns3, ListFilter, Plus, Rows3, Search, X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TaskEtichettaChip, TaskPrioritaIcon, TaskStatoBadge, TASK_LAYER_Z, nomeCompleto } from '@/components/task/task-ui'
import { TASK_PRIORITA, TASK_STATI, type TaskConfig, type TaskPriorita } from '@/services/task-service'
import { idDaRiferimento } from '@/lib/task-riferimento'
import { contaFiltriAttivi, type TaskFiltriPagina, type TaskVistaPagina } from './task-pagina-utils'

const TUTTI = '__tutti'

const VISTE: { value: TaskVistaPagina; label: string; icon: typeof Rows3 }[] = [
  { value: 'lista', label: 'Lista', icon: Rows3 },
  { value: 'kanban', label: 'Kanban', icon: Columns3 },
  { value: 'calendario', label: 'Calendario', icon: CalendarDays },
  { value: 'gantt', label: 'Gantt', icon: ChartGantt },
]

interface SearchProps {
  value: string
  onChange: (q: string) => void
  /** "#123" o un link a un task, confermato con Invio (o incollato): apre quel task in qualsiasi lista */
  onApriId: (id: number) => void
}

/** Ricerca: "/" la mette a fuoco da qualsiasi punto della pagina. */
export const TaskSearch = forwardRef<HTMLInputElement, SearchProps>(function TaskSearch({ value, onChange, onApriId }, ref) {
  return (
    <label className="tk-search">
      <Search aria-hidden />
      <input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Cerca task, paziente, #ID…"
        aria-label="Cerca task" onPaste={(e) => {
          // Un link incollato apre subito il task, senza lasciare l'URL nella ricerca
          const testo = e.clipboardData.getData('text')
          const id = /[?&]task=/.test(testo) ? idDaRiferimento(testo) : null
          if (id != null) {
            e.preventDefault()
            onApriId(id)
          }
        }} onKeyDown={(e) => {
          const id = e.key === 'Enter' ? idDaRiferimento(value) : null
          if (id != null) {
            e.preventDefault()
            onChange('')
            onApriId(id)
          } else if (e.key === 'Escape') {
            onChange('')
            e.currentTarget.blur()
          }
        }} />
      {value ? (
        <button type="button" className="tk-search-clear" onClick={() => onChange('')} aria-label="Svuota ricerca"><X /></button>
      ) : <kbd aria-hidden>/</kbd>}
    </label>
  )
})

export function TaskVistaSwitch({ value, onChange }: { value: TaskVistaPagina; onChange: (v: TaskVistaPagina) => void }) {
  return (
    <div className="tk-segmented" role="tablist" aria-label="Vista">
      {VISTE.map(({ value: v, label, icon: Icon }) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} data-active={value === v ? '' : undefined}
          onClick={() => onChange(v)}>
          <Icon aria-hidden /><span>{label}</span>
        </button>
      ))}
    </div>
  )
}

interface FiltriProps {
  config: TaskConfig
  filtri: TaskFiltriPagina
  onChange: (patch: Partial<TaskFiltriPagina>) => void
  onReset: () => void
  meId: number | null
  /** Nella giornata assegnatario e stati non servono */
  ridotti?: boolean
  /** Kanban: opzione per vedere annullati e completati vecchi (lista e "I miei task" hanno l'archivio) */
  storicoKanban?: boolean
}

export function TaskFiltriPopover({ config, filtri, onChange, onReset, meId, ridotti, storicoKanban }: FiltriProps) {
  const attivi = contaFiltriAttivi(filtri)
  const toggleStato = (s: (typeof TASK_STATI)[number]['value']) =>
    onChange({ stati: filtri.stati.includes(s) ? filtri.stati.filter((x) => x !== s) : [...filtri.stati, s] })

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="tk-btn tk-btn--ghost" data-active={attivi ? '' : undefined}>
          <ListFilter aria-hidden />
          <span>Filtri</span>
          {attivi ? <em className="tk-btn-count">{attivi}</em> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className={`tk-filters w-80 p-0 ${TASK_LAYER_Z}`} data-vl="scope" data-vl-page="task">
        <div className="tk-filters-head">
          <b>Filtri</b>
          {attivi ? <button type="button" className="tk-link" onClick={onReset}>Azzera</button> : null}
        </div>
        <div className="tk-filters-body">
          {!ridotti ? (
            <div className="tk-field">
              <span className="tk-field-label">Assegnatario</span>
              <Select value={filtri.assegnatoA != null ? String(filtri.assegnatoA) : TUTTI}
                onValueChange={(v) => onChange({ assegnatoA: v === TUTTI ? null : Number(v) })}>
                <SelectTrigger className="h-9 text-[13px]!"><SelectValue /></SelectTrigger>
                <SelectContent className={TASK_LAYER_Z}>
                  <SelectItem value={TUTTI}>Chiunque</SelectItem>
                  {meId != null ? <SelectItem value={String(meId)}>Io</SelectItem> : null}
                  {config.operatori.filter((o) => o.id !== meId).map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>{nomeCompleto(o)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="tk-field">
            <span className="tk-field-label">Priorità</span>
            <div className="tk-chips">
              {TASK_PRIORITA.map((p) => (
                <button key={p.value} type="button" className="tk-chip-toggle" data-active={filtri.priorita === p.value ? '' : undefined}
                  onClick={() => onChange({ priorita: filtri.priorita === p.value ? null : (p.value as TaskPriorita) })}>
                  <TaskPrioritaIcon priorita={p.value} showLabel />
                </button>
              ))}
            </div>
          </div>

          {config.etichette.length ? (
            <div className="tk-field">
              <span className="tk-field-label">Etichetta</span>
              <div className="tk-chips">
                {config.etichette.map((e) => (
                  <button key={e.id} type="button" className="tk-chip-toggle tk-chip-toggle--bare"
                    data-active={filtri.etichettaId === e.id ? '' : undefined}
                    onClick={() => onChange({ etichettaId: filtri.etichettaId === e.id ? null : e.id })}>
                    <TaskEtichettaChip etichetta={e} />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {!ridotti ? (
            <div className="tk-field">
              <span className="tk-field-label">Stato</span>
              <div className="tk-chips">
                {TASK_STATI.map((s) => (
                  <button key={s.value} type="button" className="tk-chip-toggle tk-chip-toggle--bare"
                    data-active={filtri.stati.includes(s.value) ? '' : undefined} onClick={() => toggleStato(s.value)}>
                    <TaskStatoBadge stato={s.value} />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {storicoKanban ? (
            <label className="tk-check">
              <Checkbox checked={filtri.mostraCompletati} onCheckedChange={(c) => onChange({ mostraCompletati: c === true })} />
              <span>Anche annullati e completati più vecchi di 30 giorni</span>
            </label>
          ) : null}
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
  return (
    <button type="button" className="tk-fab" onClick={onClick} aria-label="Nuovo task">
      <Plus aria-hidden />
    </button>
  )
}

