import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type Modifier,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowDown, ArrowLeftToLine, ArrowRightToLine, ArrowUp, ChevronDown, EyeOff, MoveHorizontal, Plus, Sparkles,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TASK_LAYER_Z } from '@/components/task/task-ui'
import type { TaskColonneStato } from '@/hooks/use-task-colonne'
import {
  COLONNA_DI, COLONNE_TASK, GRUPPI_COLONNE, larghezzaColonna, varLarghezza, type TaskColonnaId,
} from '@/lib/task-colonne'
import type { TaskColonnaScelta } from '@/services/task-service'
import type { TaskOrdinamento, TaskOrdinamentoCampo } from './task-pagina-utils'

const soloOrizzontale: Modifier = ({ transform }) => ({ ...transform, y: 0 })

/**
 * Intestazioni delle colonne di un riquadro: si trascinano per cambiare l'ordine (vale per tutti i riquadri),
 * si allargano dal bordo destro e hanno un menu con ordina, sposta, nascondi, aggiungi qui.
 */
export function TaskIntestazioniColonne({ colonne, stato, ordinamento, onOrdina, totale, contenitore }: {
  colonne: TaskColonnaScelta[]
  stato: TaskColonneStato
  ordinamento: TaskOrdinamento
  onOrdina: (o: TaskOrdinamento) => void
  totale: (id: TaskColonnaId) => { testo: string; titolo: string; tono?: string } | null
  /** Dove vivono le variabili delle larghezze (il contenitore di tutti i riquadri) */
  contenitore: () => HTMLElement | null
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const da = stato.colonne.findIndex((c) => c.id === active.id)
    const a = stato.colonne.findIndex((c) => c.id === over.id)
    if (da < 0 || a < 0) return
    const nuove = [...stato.colonne]
    const [presa] = nuove.splice(da, 1)
    nuove.splice(a, 0, presa)
    stato.imposta(nuove)
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[soloOrizzontale]} onDragEnd={onDragEnd}>
      <SortableContext items={colonne.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
        {colonne.map((c, i) => (
          <Intestazione key={c.id} scelta={c} stato={stato} ordinamento={ordinamento} onOrdina={onOrdina}
            primo={i === 0} ultimo={i === colonne.length - 1} totale={totale(c.id as TaskColonnaId)} contenitore={contenitore} />
        ))}
      </SortableContext>
    </DndContext>
  )
}

function Intestazione({ scelta, stato, ordinamento, onOrdina, primo, ultimo, totale, contenitore }: {
  scelta: TaskColonnaScelta
  stato: TaskColonneStato
  ordinamento: TaskOrdinamento
  onOrdina: (o: TaskOrdinamento) => void
  primo: boolean
  ultimo: boolean
  totale: { testo: string; titolo: string; tono?: string } | null
  contenitore: () => HTMLElement | null
}) {
  const def = COLONNA_DI.get(scelta.id as TaskColonnaId)!
  const [menu, setMenu] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: def.id })
  const campo = def.id as TaskOrdinamentoCampo
  const attivo = def.ordina && ordinamento.campo === campo
  const ordinaVerso = (dir: 'asc' | 'desc') => onOrdina({ campo, dir })
  const clicOrdina = () => onOrdina(attivo
    ? { campo, dir: ordinamento.dir === 'asc' ? 'desc' : 'asc' }
    : { campo, dir: def.ordina ?? 'asc' })

  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition }
  const nascoste = GRUPPI_COLONNE.map((g) => ({
    ...g,
    colonne: COLONNE_TASK.filter((c) => c.gruppo === g.id && !stato.colonne.some((s) => s.id === c.id)),
  })).filter((g) => g.colonne.length)

  return (
    <span ref={setNodeRef} {...attributes} {...listeners} style={style} role="columnheader" tabIndex={-1}
      aria-roledescription="colonna trascinabile" className={`tk-hc tk-c-${def.id}`} data-col={def.id}
      data-allinea={def.allinea} data-dragging={isDragging ? '' : undefined} data-menu={menu ? '' : undefined}
      aria-sort={attivo ? (ordinamento.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu(true)
      }}>
      {def.ordina ? (
        <button type="button" className="tk-sort tk-hc-label" data-active={attivo ? '' : undefined} onClick={clicOrdina}
          title={`${def.label}: ${def.descrizione}. Clic per ordinare, trascina per spostare`}>
          <span>{def.breve ?? def.label}</span>
          {attivo ? (ordinamento.dir === 'asc' ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />) : null}
        </button>
      ) : (
        <span className="tk-hc-label" title={def.descrizione}>{def.breve ?? def.label}</span>
      )}
      {totale ? <em className="tk-stima-totale tk-hc-totale" data-tono={totale.tono} title={totale.titolo}>{totale.testo}</em> : null}

      <DropdownMenu open={menu} onOpenChange={setMenu} modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="tk-hc-menu" aria-label={`Opzioni della colonna ${def.label}`}
            onPointerDown={(e) => e.stopPropagation()}>
            <ChevronDown aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={`tk-hc-dropdown w-60 ${TASK_LAYER_Z}`}>
          <DropdownMenuLabel className="tk-hc-dropdown-head">
            <def.icona aria-hidden />
            <span><b>{def.label}</b><small>{def.descrizione}</small></span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {def.ordina ? (
            <>
              <DropdownMenuItem onSelect={() => ordinaVerso('asc')}><ArrowUp /> Ordina crescente</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => ordinaVerso('desc')}><ArrowDown /> Ordina decrescente</DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem disabled={primo} onSelect={() => stato.sposta(def.id, -1)}><ArrowLeftToLine /> Sposta a sinistra</DropdownMenuItem>
          <DropdownMenuItem disabled={ultimo} onSelect={() => stato.sposta(def.id, 1)}><ArrowRightToLine /> Sposta a destra</DropdownMenuItem>
          <DropdownMenuItem disabled={scelta.larghezza == null} onSelect={() => stato.ridimensiona(def.id, null)}>
            <MoveHorizontal /> Larghezza originale
          </DropdownMenuItem>
          {nascoste.length ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><Plus /> Aggiungi una colonna qui</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className={`max-h-96 w-60 overflow-y-auto ${TASK_LAYER_Z}`}>
                {nascoste.map((g) => (
                  <div key={g.id}>
                    <DropdownMenuLabel className="tk-hc-dropdown-gruppo">{g.label}</DropdownMenuLabel>
                    {g.colonne.map((c) => (
                      <DropdownMenuItem key={c.id} onSelect={() => stato.mostra(c.id, def.id)}>
                        <c.icona /> {c.label}
                        {c.smart ? <Sparkles className="ml-auto text-violet-500" aria-label="Smart" /> : null}
                      </DropdownMenuItem>
                    ))}
                  </div>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => stato.nascondi(def.id)}><EyeOff /> Nascondi colonna</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ManigliaLarghezza id={def.id} larghezza={larghezzaColonna(scelta)} minima={def.minima} contenitore={contenitore}
        onFine={(w) => stato.ridimensiona(def.id, w)} onReset={() => stato.ridimensiona(def.id, null)} />
    </span>
  )
}

/**
 * Bordo destro dell'intestazione: si trascina per allargare. Durante il trascinamento cambia solo la variabile
 * CSS sul contenitore (fluido anche con centinaia di righe); al rilascio la larghezza si salva.
 */
function ManigliaLarghezza({ id, larghezza, minima, contenitore, onFine, onReset }: {
  id: string
  larghezza: number
  minima: number
  contenitore: () => HTMLElement | null
  onFine: (w: number) => void
  onReset: () => void
}) {
  const inizio = useRef<{ x: number; w: number } | null>(null)
  const [attiva, setAttiva] = useState(false)
  const calcola = (x: number) => Math.max(minima, Math.min(1200, (inizio.current?.w ?? larghezza) + x - (inizio.current?.x ?? x)))
  return (
    <span className="tk-hc-resize" data-attiva={attiva ? '' : undefined} role="separator" aria-orientation="vertical"
      aria-label="Trascina per cambiare la larghezza, doppio clic per quella originale" title="Trascina per allargare · doppio clic: larghezza originale"
      onPointerDown={(e) => {
        e.stopPropagation()
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        inizio.current = { x: e.clientX, w: larghezza }
        setAttiva(true)
        document.body.dataset.tkResize = ''
      }}
      onPointerMove={(e) => {
        if (!inizio.current) return
        contenitore()?.style.setProperty(varLarghezza(id), `${calcola(e.clientX)}px`)
      }}
      onPointerUp={(e) => {
        if (!inizio.current) return
        const w = calcola(e.clientX)
        inizio.current = null
        setAttiva(false)
        delete document.body.dataset.tkResize
        if (Math.abs(w - larghezza) >= 2) onFine(w)
      }}
      onPointerCancel={() => {
        inizio.current = null
        setAttiva(false)
        delete document.body.dataset.tkResize
        contenitore()?.style.setProperty(varLarghezza(id), `${larghezza}px`)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onReset()
      }}
      onClick={(e) => e.stopPropagation()} />
  )
}

/** Il «+» in fondo all'intestazione: apre il pannello delle colonne. */
export function TaskAggiungiColonna({ children }: { children: ReactNode }) {
  return <span className="tk-hc-piu" role="columnheader" onClick={(e) => e.stopPropagation()}>{children}</span>
}
