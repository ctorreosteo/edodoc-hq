import { useMemo, useState, type ReactNode } from 'react'
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type Modifier,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Eye, EyeOff, GripVertical, Lock, Plus, RotateCcw, Search, Sparkles, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TASK_LAYER_Z } from '@/components/task/task-ui'
import type { TaskColonneStato } from '@/hooks/use-task-colonne'
import {
  COLONNA_DI, COLONNE_TASK, GRUPPI_COLONNE, PRESET_COLONNE, type TaskColonnaDef, type TaskColonnaId,
} from '@/lib/task-colonne'

const soloVerticale: Modifier = ({ transform }) => ({ ...transform, x: 0 })

const normalizza = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Pannello delle colonne della lista, come su ClickUp: cerchi, accendi e spegni, trascini per cambiare
 * l'ordine, parti da una disposizione pronta. Le modifiche si vedono subito nella lista dietro.
 */
export function TaskColonnePannello({ stato, mostraLista, children, align = 'end' }: {
  stato: TaskColonneStato
  /** La colonna Lista ha senso solo dove si vedono più liste */
  mostraLista: boolean
  children: ReactNode
  align?: 'start' | 'end'
}) {
  const [q, setQ] = useState('')
  const visibili = stato.colonne.map((c) => c.id as TaskColonnaId)
  const inVista = new Set(visibili)
  const filtro = normalizza(q.trim())
  const corrisponde = (c: TaskColonnaDef) =>
    !filtro || normalizza(`${c.label} ${c.descrizione}`).includes(filtro)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const da = stato.colonne.findIndex((c) => c.id === active.id)
    const a = stato.colonne.findIndex((c) => c.id === over.id)
    if (da >= 0 && a >= 0) stato.imposta(arrayMove(stato.colonne, da, a))
  }

  const presetAttivo = useMemo(() => PRESET_COLONNE.find((p) =>
    p.colonne.length === visibili.length && p.colonne.every((id, i) => id === visibili[i]))?.id ?? null,
  [visibili])

  const disponibili = GRUPPI_COLONNE.map((g) => ({
    ...g,
    colonne: COLONNE_TASK.filter((c) => c.gruppo === g.id && !inVista.has(c.id) && corrisponde(c)),
  })).filter((g) => g.colonne.length)

  const visibiliFiltrate = stato.colonne.filter((c) => {
    const def = COLONNA_DI.get(c.id as TaskColonnaId)
    return def && corrisponde(def)
  })

  return (
    <Popover onOpenChange={(o) => !o && setQ('')}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} sideOffset={8} className={`tk-colp ${TASK_LAYER_Z}`} data-vl="scope" data-vl-page="task"
        onOpenAutoFocus={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()}>
        <header className="tk-colp-head">
          <div>
            <h3>Colonne</h3>
            <p>{stato.suMisura ? 'Su misura per questa lista' : stato.inLista ? 'Valgono per tutte le liste' : 'Valgono per tutte le liste e le viste'}</p>
          </div>
          <span className="tk-colp-count">{visibili.length + 1}</span>
        </header>

        <label className="tk-colp-search">
          <Search aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca una colonna…" aria-label="Cerca una colonna" />
          {q ? <button type="button" onClick={() => setQ('')} aria-label="Svuota la ricerca"><X aria-hidden /></button> : null}
        </label>

        <div className="tk-colp-body">
          {!filtro ? (
            <section className="tk-colp-preset" aria-label="Disposizioni pronte">
              {PRESET_COLONNE.map((p) => (
                <button key={p.id} type="button" data-active={presetAttivo === p.id ? '' : undefined} title={p.descrizione}
                  onClick={() => stato.imposta(p.colonne.map((id) => ({ id, larghezza: stato.colonne.find((c) => c.id === id)?.larghezza ?? null })))}>
                  <p.icona aria-hidden />
                  <span>{p.label}</span>
                </button>
              ))}
            </section>
          ) : null}

          <section className="tk-colp-sez">
            <h4>In vista <em>{visibili.length + 1}</em></h4>
            <ul className="tk-colp-lista">
              {!filtro || normalizza('task titolo').includes(filtro) ? (
                <li className="tk-colp-voce" data-fissa="">
                  <span className="tk-colp-grip" aria-hidden><Lock /></span>
                  <span className="tk-colp-ico" aria-hidden>T</span>
                  <span className="tk-colp-txt"><b>Task</b><small>Il titolo resta sempre il primo</small></span>
                </li>
              ) : null}
              <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[soloVerticale]} onDragEnd={onDragEnd}>
                <SortableContext items={visibiliFiltrate.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                  {visibiliFiltrate.map((c) => (
                    <VoceVisibile key={c.id} def={COLONNA_DI.get(c.id as TaskColonnaId)!} trascinabile={!filtro}
                      nota={c.id === 'lista' && !mostraLista ? 'Qui c’è una lista sola: compare nelle viste con più liste' : undefined}
                      onNascondi={() => stato.nascondi(c.id)} />
                  ))}
                </SortableContext>
              </DndContext>
            </ul>
          </section>

          {disponibili.map((g) => (
            <section key={g.id} className="tk-colp-sez" data-gruppo={g.id}>
              <h4>{g.label}</h4>
              <ul className="tk-colp-lista">
                {g.colonne.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="tk-colp-voce" data-aggiungi="" onClick={() => stato.mostra(c.id)}>
                      <span className="tk-colp-ico" aria-hidden><c.icona /></span>
                      <span className="tk-colp-txt">
                        <b>{c.label}{c.smart ? <span className="tk-colp-smart"><Sparkles aria-hidden />Smart</span> : null}</b>
                        <small>{c.descrizione}</small>
                      </span>
                      <span className="tk-colp-add" aria-label={`Mostra ${c.label}`}><Plus aria-hidden /></span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {filtro && !visibiliFiltrate.length && !disponibili.length ? (
            <p className="tk-colp-vuoto">Nessuna colonna per «{q.trim()}»</p>
          ) : null}
        </div>

        <footer className="tk-colp-foot">
          {stato.inLista ? (
            <button type="button" role="switch" aria-checked={stato.suMisura} className="tk-colp-switch"
              onClick={() => stato.impostaSuMisura(!stato.suMisura)}>
              <span className="tk-colp-switch-track" aria-hidden><i /></span>
              <span>
                <b>Solo per questa lista</b>
                <small>{stato.suMisura ? 'Le altre liste restano come sono' : 'Spento: le colonne valgono ovunque'}</small>
              </span>
            </button>
          ) : <span />}
          <button type="button" className="tk-colp-reset" disabled={stato.originali} onClick={stato.ripristina}
            title={stato.suMisura ? 'Questa lista torna alle colonne di partenza' : 'Torna alle colonne di partenza'}>
            <RotateCcw aria-hidden /> Ripristina
          </button>
        </footer>
      </PopoverContent>
    </Popover>
  )
}

function VoceVisibile({ def, trascinabile, nota, onNascondi }: {
  def: TaskColonnaDef
  trascinabile: boolean
  nota?: string
  onNascondi: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: def.id, disabled: !trascinabile })
  return (
    <li ref={setNodeRef} className="tk-colp-voce" data-dragging={isDragging ? '' : undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}>
      <button type="button" className="tk-colp-grip" aria-label={`Sposta ${def.label}`} {...attributes} {...listeners}
        disabled={!trascinabile}>
        <GripVertical aria-hidden />
      </button>
      <span className="tk-colp-ico" aria-hidden><def.icona /></span>
      <span className="tk-colp-txt">
        <b>{def.label}{def.smart ? <span className="tk-colp-smart"><Sparkles aria-hidden />Smart</span> : null}</b>
        <small>{nota ?? def.descrizione}</small>
      </span>
      <button type="button" className="tk-colp-eye" onClick={onNascondi} aria-label={`Nascondi ${def.label}`} title="Nascondi">
        <Eye aria-hidden className="tk-colp-eye-on" />
        <EyeOff aria-hidden className="tk-colp-eye-off" />
      </button>
    </li>
  )
}
