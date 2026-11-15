import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { addMonths, addWeeks, differenceInCalendarDays, format, isSameDay, isSameMonth, isToday, isWeekend } from 'date-fns'
import { it } from 'date-fns/locale'
import { CalendarOff, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TASK_LAYER_Z, TaskAvatarStack, isScaduto, parseDataLocale } from '@/components/task/task-ui'
import { TaskPosticipaMenu } from '@/components/task/task-posticipa'
import { etichettaOra, oraNelGiorno, spostaPeriodo } from '@/lib/task-periodo'
import { isStatoChiuso, type AggiornaTaskValori, type TaskConfig, type TaskRiga } from '@/services/task-service'
import { confrontaOrdine, giorniDa, intervalloCalendario, isoGiorno, type TaskCalendarioModo } from './task-pagina-utils'
import '@/style/lux-task-board.css'

const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const MAX_CHIP_MESE = 3
const SENZA = 'senza-scadenza'
/** Fasce orarie della vista settimana */
const ORE = Array.from({ length: 15 }, (_, i) => 7 + i) // 07–21
const COLORE_PREDEFINITO = '#6366F1'

interface Props {
  config: TaskConfig
  righe: TaskRiga[]
  /** Task aperti senza scadenza, per il vassoio laterale */
  senzaScadenza: TaskRiga[]
  loading: boolean
  riferimento: Date
  onRiferimento: (d: Date) => void
  modo: TaskCalendarioModo
  onModo: (m: TaskCalendarioModo) => void
  aggiornaRiga: (id: number, v: AggiornaTaskValori) => Promise<TaskRiga | null>
  onApri: (id: number) => void
  onNuovoIl: (giorno: string) => void
}

/** id delle zone di rilascio: "2026-10-23" (giorno, ora invariata), "2026-10-23|09" (fascia), "2026-10-23|-" (senza orario) */
function decodificaZona(id: string): { giorno: string | null; ora?: string | null } {
  if (id === SENZA) return { giorno: null }
  const [giorno, ora] = id.split('|')
  if (ora === undefined) return { giorno }
  return { giorno, ora: ora === '-' ? null : `${ora}:00:00` }
}

export function TaskCalendarioView({
  config, righe, senzaScadenza, loading, riferimento, onRiferimento, modo, onModo, aggiornaRiga, onApri, onNuovoIl,
}: Props) {
  const [trascinato, setTrascinato] = useState<TaskRiga | null>(null)
  const [selezionato, setSelezionato] = useState<string>(() => isoGiorno(new Date()))
  const coloreLista = useMemo(() => new Map(config.liste.map((l) => [l.id, l.colore])), [config.liste])
  const { da, a } = intervalloCalendario(riferimento, modo)
  const giorni = giorniDa(da, differenceInCalendarDays(a, da) + 1)

  const perGiorno = useMemo(() => {
    const m = new Map<string, TaskRiga[]>()
    for (const r of righe) {
      if (!r.scadenza) continue
      const list = m.get(r.scadenza) ?? []
      list.push(r)
      m.set(r.scadenza, list)
    }
    m.forEach((list) => list.sort((x, y) =>
      Number(isStatoChiuso(x.stato)) - Number(isStatoChiuso(y.stato)) ||
      (oraNelGiorno(x) ?? '99').localeCompare(oraNelGiorno(y) ?? '99') || confrontaOrdine(x, y)))
    return m
  }, [righe])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const tutte = useMemo(() => new Map([...righe, ...senzaScadenza].map((r) => [r.id, r])), [righe, senzaScadenza])

  const sposta = (r: TaskRiga, giorno: string | null, ora: string | null | undefined) => {
    if (giorno == null) {
      if (r.scadenza != null) void aggiornaRiga(r.id, { scadenza: null, scadenzaOra: null })
      return
    }
    // L'orario si sposta tutto insieme (inizio e fine), con la stessa durata
    const p = spostaPeriodo(r, giorno, ora)
    if (p.scadenza === r.scadenza && p.scadenzaOra === r.scadenzaOra && p.dataInizio === r.dataInizio && p.inizioOra === r.inizioOra) return
    void aggiornaRiga(r.id, p)
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setTrascinato(null)
    if (!over) return
    const r = tutte.get(Number(active.id))
    if (!r) return
    const { giorno, ora } = decodificaZona(String(over.id))
    sposta(r, giorno, ora)
  }

  const titolo = modo === 'mese'
    ? format(riferimento, 'MMMM yyyy', { locale: it })
    : isSameMonth(da, a)
      ? `${format(da, 'd', { locale: it })} – ${format(a, 'd MMMM yyyy', { locale: it })}`
      : `${format(da, 'd MMM', { locale: it })} – ${format(a, 'd MMM yyyy', { locale: it })}`

  const naviga = (n: number) => onRiferimento(modo === 'mese' ? addMonths(riferimento, n) : addWeeks(riferimento, n))

  const props = { coloreLista, onApri, onNuovoIl, onSposta: sposta }
  const delGiorno = perGiorno.get(selezionato) ?? []
  const dataSelezionata = parseDataLocale(selezionato) ?? new Date()

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin}
      onDragStart={(e) => setTrascinato(tutte.get(Number(e.active.id)) ?? null)}
      onDragEnd={onDragEnd} onDragCancel={() => setTrascinato(null)}>
      <div className="tkb-cal-wrap">
        <div className="tkb-cal" data-modo={modo} aria-busy={loading || undefined}>
          <div className="tkb-cal-head">
            <div className="tkb-cal-nav">
              <button type="button" className="tkb-icon-btn" onClick={() => naviga(-1)} aria-label="Precedente"><ChevronLeft className="size-4" /></button>
              <button type="button" className="tkb-btn" onClick={() => {
                onRiferimento(new Date())
                setSelezionato(isoGiorno(new Date()))
              }}>Oggi</button>
              <button type="button" className="tkb-icon-btn" onClick={() => naviga(1)} aria-label="Successivo"><ChevronRight className="size-4" /></button>
              <p className="tkb-cal-title" role="heading" aria-level={2}>{titolo}</p>
            </div>
            <div className="tkb-seg" role="tablist" aria-label="Periodo">
              {(['mese', 'settimana'] as const).map((m) => (
                <button key={m} type="button" role="tab" aria-selected={modo === m} onClick={() => onModo(m)}>
                  {m === 'mese' ? 'Mese' : 'Settimana'}
                </button>
              ))}
            </div>
          </div>

          {modo === 'mese' ? (
            <>
              <div className="tkb-cal-dows" aria-hidden>
                {GIORNI.map((g, i) => <div key={g} className="tkb-cal-dow" data-weekend={i >= 5 ? '' : undefined}>{g}</div>)}
              </div>
              <div className="tkb-cal-grid" role="grid" aria-label={titolo}>
                {giorni.map((d) => {
                  const iso = isoGiorno(d)
                  return (
                    <GiornoMese key={iso} iso={iso} data={d} fuoriMese={!isSameMonth(d, riferimento)}
                      items={perGiorno.get(iso) ?? []} selezionato={iso === selezionato}
                      onSeleziona={() => setSelezionato(iso)} {...props} />
                  )
                })}
              </div>
              <div className="tkb-agenda" aria-live="polite">
                <div className="tkb-agenda-title">
                  <span>{format(dataSelezionata, 'EEEE d MMMM', { locale: it })}</span>
                  <button type="button" className="tkb-icon-btn" aria-label="Nuovo task in questo giorno"
                    onClick={() => onNuovoIl(selezionato)}><Plus className="size-4" /></button>
                </div>
                {delGiorno.length ? delGiorno.map((r) => (
                  <ChipBody key={r.id} riga={r} colore={coloreLista.get(r.listaId)} onClick={() => onApri(r.id)} />
                )) : <div className="tkb-tray-empty">Niente in programma</div>}
              </div>
            </>
          ) : (
            <Settimana giorni={giorni} perGiorno={perGiorno} {...props} />
          )}
        </div>

        <Vassoio items={senzaScadenza} coloreLista={coloreLista} onApri={onApri} />
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {trascinato ? <ChipBody riga={trascinato} colore={coloreLista.get(trascinato.listaId)} overlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}

interface ComuniProps {
  coloreLista: Map<number, string>
  onApri: (id: number) => void
  onNuovoIl: (giorno: string) => void
  onSposta: (r: TaskRiga, giorno: string | null, ora: string | null | undefined) => void
}

function GiornoMese({ iso, data, fuoriMese, items, selezionato, onSeleziona, coloreLista, onApri, onNuovoIl, onSposta }: ComuniProps & {
  iso: string
  data: Date
  fuoriMese: boolean
  items: TaskRiga[]
  selezionato: boolean
  onSeleziona: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: iso })
  const visibili = items.slice(0, MAX_CHIP_MESE)
  const altri = items.length - visibili.length
  const oggi = isToday(data)
  const etichetta = format(data, 'EEEE d MMMM', { locale: it })
  return (
    <div ref={setNodeRef} role="gridcell" aria-label={`${etichetta}, ${items.length} task`} className="tkb-day"
      data-out={fuoriMese ? '' : undefined} data-today={oggi ? '' : undefined} data-weekend={isWeekend(data) ? '' : undefined}
      data-over={isOver ? '' : undefined} data-sel={selezionato ? '' : undefined}
      onClick={(e) => {
        onSeleziona()
        // Clic sullo spazio vuoto del giorno (desktop): nuovo task in quella data
        const t = e.target as HTMLElement
        if ((t === e.currentTarget || t.classList.contains('tkb-day-items')) && window.matchMedia('(min-width: 641px)').matches) onNuovoIl(iso)
      }}>
      <div className="tkb-day-head">
        <GiornoPopover iso={iso} data={data} items={items} coloreLista={coloreLista} onApri={onApri} onNuovoIl={onNuovoIl}
          onSposta={onSposta}
          trigger={<button type="button" className="tkb-day-num" aria-label={`Apri ${etichetta}`}
            onClick={(e) => {
              if (!window.matchMedia('(min-width: 641px)').matches) {
                e.preventDefault()
                onSeleziona()
              }
            }}>{format(data, 'd')}</button>} />
        <button type="button" className="tkb-day-add" onClick={(e) => {
          e.stopPropagation()
          onNuovoIl(iso)
        }} aria-label={`Nuovo task ${etichetta}`}>
          <Plus />
        </button>
      </div>
      <div className="tkb-day-items">
        {visibili.map((r) => <Chip key={r.id} riga={r} colore={coloreLista.get(r.listaId)} onApri={onApri} />)}
      </div>
      {altri > 0 ? (
        <GiornoPopover iso={iso} data={data} items={items} coloreLista={coloreLista} onApri={onApri} onNuovoIl={onNuovoIl}
          onSposta={onSposta}
          trigger={<button type="button" className="tkb-more" onClick={(e) => e.stopPropagation()}>+{altri} altri</button>} />
      ) : null}
      {items.length ? (
        <span className="tkb-day-dots" aria-hidden>
          {items.slice(0, 6).map((r) => <i key={r.id} style={{ ['--tk-c' as string]: coloreLista.get(r.listaId) ?? COLORE_PREDEFINITO }} />)}
        </span>
      ) : null}
    </div>
  )
}

/** Tutti i task di un giorno, ognuno con "Sposta a…" (alternativa da tastiera al trascinamento). */
function GiornoPopover({ iso, data, items, trigger, coloreLista, onApri, onNuovoIl, onSposta }: ComuniProps & {
  iso: string
  data: Date
  items: TaskRiga[]
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className={`tkb-pop w-72 p-2 ${TASK_LAYER_Z}`} data-vl="scope" data-vl-page="task"
        onClick={(e) => e.stopPropagation()}>
        <b className="tkb-pop-title">{format(data, 'EEEE d MMMM', { locale: it })}</b>
        <div className="tkb-pop-items">
          {items.map((r) => (
            <div key={r.id} className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <ChipBody riga={r} colore={coloreLista.get(r.listaId)} onClick={() => {
                  setOpen(false)
                  onApri(r.id)
                }} />
              </div>
              <TaskPosticipaMenu titolo="Sposta a…" scadenza={r.scadenza} scadenzaOra={r.scadenzaOra}
                onPosticipa={(s, o) => onSposta(r, s, o)} />
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

function Settimana({ giorni, perGiorno, coloreLista, onApri, onNuovoIl, onSposta }: ComuniProps & {
  giorni: Date[]
  perGiorno: Map<string, TaskRiga[]>
}) {
  const scorri = useRef<HTMLDivElement>(null)
  const [adesso, setAdesso] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setAdesso(new Date()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  // Apre la settimana all'ora corrente (o alle 8)
  useEffect(() => {
    const el = scorri.current
    if (!el) return
    const ora = Math.max(7, Math.min(21, new Date().getHours() - 1))
    const riga = el.querySelector<HTMLElement>(`[data-ora="${ora}"]`)
    if (riga) el.scrollTop = riga.offsetTop
  }, [])

  const oraDi = (r: TaskRiga) => {
    const ora = oraNelGiorno(r)
    return ora ? Math.max(7, Math.min(21, Number(ora.slice(0, 2)))) : null
  }

  return (
    <div className="tkb-cal-scroll-x">
      {/* Intestazione e "tutto il giorno" restano ferme, scorrono solo le fasce orarie */}
      <div className="tkb-week tkb-week-top" role="row">
        <div className="tkb-week-corner" />
        {giorni.map((d) => (
          <div key={isoGiorno(d)} className="tkb-week-dow" data-today={isToday(d) ? '' : undefined} role="columnheader">
            {format(d, 'EEE', { locale: it })} <b>{format(d, 'd')}</b>
          </div>
        ))}
        <div className="tkb-week-label tkb-week-allday-label">Senza orario</div>
        {giorni.map((d) => {
          const iso = isoGiorno(d)
          const items = (perGiorno.get(iso) ?? []).filter((r) => !oraNelGiorno(r))
          return (
            <Fascia key={`${iso}|-`} id={`${iso}|-`} allday oggi={isToday(d)} onNuovo={() => onNuovoIl(iso)}>
              {items.map((r) => <Chip key={r.id} riga={r} colore={coloreLista.get(r.listaId)} onApri={onApri} />)}
            </Fascia>
          )
        })}
      </div>
      <div className="tkb-week-scroll" ref={scorri}>
        <div className="tkb-week" role="grid">
          {ORE.map((h) => (
            <FasciaRiga key={h} ora={h} giorni={giorni} perGiorno={perGiorno} oraDi={oraDi} adesso={adesso}
              coloreLista={coloreLista} onApri={onApri} onNuovoIl={onNuovoIl} onSposta={onSposta} />
          ))}
        </div>
      </div>
    </div>
  )
}

function FasciaRiga({ ora, giorni, perGiorno, oraDi, adesso, coloreLista, onApri, onNuovoIl }: ComuniProps & {
  ora: number
  giorni: Date[]
  perGiorno: Map<string, TaskRiga[]>
  oraDi: (r: TaskRiga) => number | null
  adesso: Date
}) {
  const hh = String(ora).padStart(2, '0')
  return (
    <>
      <div className="tkb-week-label" data-ora={ora}>{hh}:00</div>
      {giorni.map((d) => {
        const iso = isoGiorno(d)
        const items = (perGiorno.get(iso) ?? []).filter((r) => oraDi(r) === ora)
        const oraCorrente = isSameDay(d, adesso) && adesso.getHours() === ora
        return (
          <Fascia key={`${iso}|${hh}`} id={`${iso}|${hh}`} oggi={isToday(d)} adesso={oraCorrente} onNuovo={() => onNuovoIl(iso)}>
            {items.map((r) => <Chip key={r.id} riga={r} colore={coloreLista.get(r.listaId)} onApri={onApri} />)}
          </Fascia>
        )
      })}
    </>
  )
}

function Fascia({ id, allday, oggi, adesso, onNuovo, children }: {
  id: string
  allday?: boolean
  oggi: boolean
  adesso?: boolean
  onNuovo: () => void
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} role="gridcell" className="tkb-slot" data-allday={allday ? '' : undefined}
      data-today={oggi ? '' : undefined} data-now={adesso ? '' : undefined} data-over={isOver ? '' : undefined}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) onNuovo()
      }}>
      {children}
    </div>
  )
}

function Chip({ riga, colore, onApri }: { riga: TaskRiga; colore: string | undefined; onApri: (id: number) => void }) {
  // In sola lettura il task si apre ma non si sposta
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: riga.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} role="presentation" className="tkb-chip-drag"
      data-dragging={isDragging ? '' : undefined} onClick={(e) => e.stopPropagation()}>
      <ChipBody riga={riga} colore={colore} onClick={() => onApri(riga.id)} />
    </div>
  )
}

function ChipBody({ riga, colore, onClick, overlay }: { riga: TaskRiga; colore: string | undefined; onClick?: () => void; overlay?: boolean }) {
  const chiuso = isStatoChiuso(riga.stato)
  return (
    <button type="button" className="tkb-chip" style={{ ['--tk-c' as string]: colore ?? COLORE_PREDEFINITO }}
      data-chiuso={chiuso ? '' : undefined} data-late={isScaduto(riga) ? '' : undefined}
      data-overlay={overlay ? '' : undefined}
      onClick={onClick} title={riga.titolo}>
      {etichettaOra(riga) ? <time>{etichettaOra(riga)}</time> : null}
      <span className="tkb-chip-title">{riga.titolo}</span>
    </button>
  )
}

function Vassoio({ items, coloreLista, onApri }: { items: TaskRiga[]; coloreLista: Map<number, string>; onApri: (id: number) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: SENZA })
  return (
    <aside ref={setNodeRef} className="tkb-tray" data-over={isOver ? '' : undefined} aria-label="Task senza scadenza">
      <header>
        <CalendarOff aria-hidden />
        <b>Senza scadenza</b>
        <em>{items.length}</em>
      </header>
      <p>Trascinali su un giorno per pianificarli. Trascina qui un task per togliere la scadenza.</p>
      <div className="tkb-tray-items">
        {items.map((r) => <TrayItem key={r.id} riga={r} colore={coloreLista.get(r.listaId)} onApri={onApri} />)}
        {!items.length ? <div className="tkb-tray-empty">Tutto pianificato ✨</div> : null}
      </div>
    </aside>
  )
}

function TrayItem({ riga, colore, onApri }: { riga: TaskRiga; colore: string | undefined; onApri: (id: number) => void }) {
  // In sola lettura il task si apre ma non si sposta
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: riga.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} role="presentation" className="tkb-chip-drag"
      data-dragging={isDragging ? '' : undefined}>
      <button type="button" className="tkb-chip" style={{ ['--tk-c' as string]: colore ?? COLORE_PREDEFINITO }}
        onClick={() => onApri(riga.id)} title={riga.titolo}>
        <span className="tkb-chip-title">{riga.titolo}</span>
        {riga.assegnatari.length ? <TaskAvatarStack persone={riga.assegnatari} max={2} size="xs" /> : null}
      </button>
    </div>
  )
}
