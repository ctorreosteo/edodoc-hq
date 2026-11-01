import { DndContext, DragOverlay, PointerSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { addMonths, addWeeks, differenceInCalendarDays, format, isSameMonth, isToday, isWeekend, parseISO } from "date-fns"
import { it } from "date-fns/locale"
import { CalendarOff, ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Task } from "@/types"
import { TaskPosticipaMenu } from "./task-posticipa"
import { eFatto, giorniDa, gruppoScadenza, intervalloCalendario, isoGiorno, type TaskCalendarioModo } from "./task-utils"

const GIORNI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]
const MAX_CHIP_MESE = 3
const SENZA = "senza-scadenza"
const DESKTOP = "(min-width: 641px)"

type Comuni = {
  onApri: (t: Task) => void
  onNuovoIl: (giorno: string) => void
  onSposta: (t: Task, giorno: string | null) => void
}

export function TaskCalendarioView({ righe, onSposta, onApri, onNuovoIl }: Comuni & { righe: Task[] }) {
  const [riferimento, setRiferimento] = useState(() => new Date())
  const [modo, setModo] = useState<TaskCalendarioModo>("mese")
  const [trascinato, setTrascinato] = useState<Task | null>(null)
  const [selezionato, setSelezionato] = useState(() => isoGiorno(new Date()))
  const { da, a } = intervalloCalendario(riferimento, modo)
  const giorni = giorniDa(da, differenceInCalendarDays(a, da) + 1)

  const perGiorno = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const r of righe) {
      if (!r.scadenza) continue
      m.set(r.scadenza, [...(m.get(r.scadenza) ?? []), r])
    }
    m.forEach((list) => list.sort((x, y) => Number(eFatto(x)) - Number(eFatto(y)) || x.id - y.id))
    return m
  }, [righe])
  const senzaScadenza = useMemo(() => righe.filter((r) => !r.scadenza && !eFatto(r)), [righe])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const sposta = (t: Task, giorno: string | null) => {
    if (giorno !== t.scadenza) onSposta(t, giorno)
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setTrascinato(null)
    const t = righe.find((r) => r.id === Number(active.id))
    if (over && t) sposta(t, over.id === SENZA ? null : String(over.id))
  }

  const titolo = modo === "mese"
    ? format(riferimento, "MMMM yyyy", { locale: it })
    : isSameMonth(da, a)
      ? `${format(da, "d", { locale: it })} – ${format(a, "d MMMM yyyy", { locale: it })}`
      : `${format(da, "d MMM", { locale: it })} – ${format(a, "d MMM yyyy", { locale: it })}`

  const naviga = (n: number) => setRiferimento(modo === "mese" ? addMonths(riferimento, n) : addWeeks(riferimento, n))
  const comuni: Comuni = { onApri, onNuovoIl, onSposta: sposta }
  const delGiorno = perGiorno.get(selezionato) ?? []

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd} onDragCancel={() => setTrascinato(null)}
      onDragStart={(e) => setTrascinato(righe.find((r) => r.id === Number(e.active.id)) ?? null)}>
      <div className="tkb-cal-wrap">
        <div className="tkb-cal" data-modo={modo}>
          <div className="tkb-cal-head">
            <div className="tkb-cal-nav">
              <button type="button" className="tkb-icon-btn" onClick={() => naviga(-1)} aria-label="Precedente"><ChevronLeft className="size-4" /></button>
              <button type="button" className="tkb-btn" onClick={() => {
                setRiferimento(new Date())
                setSelezionato(isoGiorno(new Date()))
              }}>Oggi</button>
              <button type="button" className="tkb-icon-btn" onClick={() => naviga(1)} aria-label="Successivo"><ChevronRight className="size-4" /></button>
              <p className="tkb-cal-title" role="heading" aria-level={2}>{titolo}</p>
            </div>
            <div className="tkb-seg" role="tablist" aria-label="Periodo">
              {(["mese", "settimana"] as const).map((m) => (
                <button key={m} type="button" role="tab" aria-selected={modo === m} onClick={() => setModo(m)}>{m === "mese" ? "Mese" : "Settimana"}</button>
              ))}
            </div>
          </div>

          {modo === "mese" ? (
            <>
              <div className="tkb-cal-dows" aria-hidden>
                {GIORNI.map((g, i) => <div key={g} className="tkb-cal-dow" data-weekend={i >= 5 ? "" : undefined}>{g}</div>)}
              </div>
              <div className="tkb-cal-grid" role="grid" aria-label={titolo}>
                {giorni.map((d) => {
                  const iso = isoGiorno(d)
                  return (
                    <GiornoMese key={iso} iso={iso} data={d} fuoriMese={!isSameMonth(d, riferimento)} items={perGiorno.get(iso) ?? []}
                      selezionato={iso === selezionato} onSeleziona={() => setSelezionato(iso)} {...comuni} />
                  )
                })}
              </div>
              <div className="tkb-agenda" aria-live="polite">
                <div className="tkb-agenda-title">
                  <span>{format(parseISO(selezionato), "EEEE d MMMM", { locale: it })}</span>
                  <button type="button" className="tkb-icon-btn" aria-label="Nuovo task in questo giorno" onClick={() => onNuovoIl(selezionato)}><Plus className="size-4" /></button>
                </div>
                {delGiorno.length ? delGiorno.map((r) => <ChipBody key={r.id} task={r} onClick={() => onApri(r)} />) : <div className="tkb-tray-empty">Niente in programma</div>}
              </div>
            </>
          ) : (
            <div className="tkb-cal-scroll-x">
              <div className="tkb-week tkb-week--giorni">
                {giorni.map((d) => (
                  <div key={isoGiorno(d)} className="tkb-week-dow" data-today={isToday(d) ? "" : undefined} role="columnheader">
                    {format(d, "EEE", { locale: it })} <b>{format(d, "d")}</b>
                  </div>
                ))}
                {giorni.map((d) => {
                  const iso = isoGiorno(d)
                  return (
                    <Fascia key={iso} id={iso} oggi={isToday(d)} onNuovo={() => onNuovoIl(iso)}>
                      {(perGiorno.get(iso) ?? []).map((r) => <Chip key={r.id} task={r} onApri={onApri} />)}
                    </Fascia>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <Vassoio items={senzaScadenza} onApri={onApri} />
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {trascinato ? <ChipBody task={trascinato} overlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function GiornoMese({ iso, data, fuoriMese, items, selezionato, onSeleziona, onApri, onNuovoIl, onSposta }: Comuni & {
  iso: string
  data: Date
  fuoriMese: boolean
  items: Task[]
  selezionato: boolean
  onSeleziona: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: iso })
  const visibili = items.slice(0, MAX_CHIP_MESE)
  const altri = items.length - visibili.length
  const etichetta = format(data, "EEEE d MMMM", { locale: it })
  const popover = { iso, data, items, onApri, onNuovoIl, onSposta }
  return (
    <div ref={setNodeRef} role="gridcell" aria-label={`${etichetta}, ${items.length} task`} className="tkb-day"
      data-out={fuoriMese ? "" : undefined} data-today={isToday(data) ? "" : undefined} data-weekend={isWeekend(data) ? "" : undefined}
      data-over={isOver ? "" : undefined} data-sel={selezionato ? "" : undefined}
      onClick={(e) => {
        onSeleziona()
        // Clic sullo spazio vuoto del giorno (desktop): nuovo task in quella data
        const t = e.target as HTMLElement
        if ((t === e.currentTarget || t.classList.contains("tkb-day-items")) && window.matchMedia(DESKTOP).matches) onNuovoIl(iso)
      }}>
      <div className="tkb-day-head">
        <GiornoPopover {...popover}
          trigger={<button type="button" className="tkb-day-num" aria-label={`Apri ${etichetta}`}
            onClick={(e) => {
              if (!window.matchMedia(DESKTOP).matches) {
                e.preventDefault()
                onSeleziona()
              }
            }}>{format(data, "d")}</button>} />
        <button type="button" className="tkb-day-add" aria-label={`Nuovo task ${etichetta}`} onClick={(e) => {
          e.stopPropagation()
          onNuovoIl(iso)
        }}><Plus /></button>
      </div>
      <div className="tkb-day-items">
        {visibili.map((r) => <Chip key={r.id} task={r} onApri={onApri} />)}
      </div>
      {altri > 0 ? (
        <GiornoPopover {...popover} trigger={<button type="button" className="tkb-more" onClick={(e) => e.stopPropagation()}>+{altri} altri</button>} />
      ) : null}
      {items.length ? (
        <span className="tkb-day-dots" aria-hidden>
          {items.slice(0, 6).map((r) => <i key={r.id} style={{ ["--tk-c" as string]: r.lista.colore }} />)}
        </span>
      ) : null}
    </div>
  )
}

/** Tutti i task di un giorno, ognuno con "Sposta a…" (alternativa da tastiera al trascinamento). */
function GiornoPopover({ iso, data, items, trigger, onApri, onNuovoIl, onSposta }: Comuni & { iso: string; data: Date; items: Task[]; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="tkb-pop w-72 p-2" data-vl="scope" data-vl-page="task" onClick={(e) => e.stopPropagation()}>
        <b className="tkb-pop-title">{format(data, "EEEE d MMMM", { locale: it })}</b>
        <div className="tkb-pop-items">
          {items.map((r) => (
            <div key={r.id} className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <ChipBody task={r} onClick={() => {
                  setOpen(false)
                  onApri(r)
                }} />
              </div>
              <TaskPosticipaMenu titolo="Sposta a…" scadenza={r.scadenza} onPosticipa={(s) => onSposta(r, s)} />
            </div>
          ))}
          {!items.length ? <div className="tkb-tray-empty">Niente in programma</div> : null}
        </div>
        <button type="button" className="tkb-quick-add mt-1" onClick={() => {
          setOpen(false)
          onNuovoIl(iso)
        }}>
          <Plus className="size-4" aria-hidden /> Nuovo task in questo giorno
        </button>
      </PopoverContent>
    </Popover>
  )
}

function Fascia({ id, oggi, onNuovo, children }: { id: string; oggi: boolean; onNuovo: () => void; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} role="gridcell" className="tkb-slot" data-today={oggi ? "" : undefined} data-over={isOver ? "" : undefined}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) onNuovo()
      }}>
      {children}
    </div>
  )
}

function Chip({ task, onApri }: { task: Task; onApri: (t: Task) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} role="presentation" className="tkb-chip-drag" data-dragging={isDragging ? "" : undefined} onClick={(e) => e.stopPropagation()}>
      <ChipBody task={task} onClick={() => onApri(task)} />
    </div>
  )
}

function ChipBody({ task, onClick, overlay }: { task: Task; onClick?: () => void; overlay?: boolean }) {
  const fatto = eFatto(task)
  return (
    <button type="button" className="tkb-chip" style={{ ["--tk-c" as string]: task.lista.colore }} data-chiuso={fatto ? "" : undefined}
      data-late={!fatto && gruppoScadenza(task) === "ritardo" ? "" : undefined} data-overlay={overlay ? "" : undefined} onClick={onClick} title={task.titolo}>
      <span className="tkb-chip-title">{task.titolo}</span>
    </button>
  )
}

function Vassoio({ items, onApri }: { items: Task[]; onApri: (t: Task) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: SENZA })
  return (
    <aside ref={setNodeRef} className="tkb-tray" data-over={isOver ? "" : undefined} aria-label="Task senza scadenza">
      <header>
        <CalendarOff aria-hidden />
        <b>Senza scadenza</b>
        <em>{items.length}</em>
      </header>
      <p>Trascinali su un giorno per pianificarli. Trascina qui un task per togliere la scadenza.</p>
      <div className="tkb-tray-items">
        {items.map((r) => <Chip key={r.id} task={r} onApri={onApri} />)}
        {!items.length ? <div className="tkb-tray-empty">Tutto pianificato ✨</div> : null}
      </div>
    </aside>
  )
}
