import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { User } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { MenuTask } from "@/components/menu-contestuali"
import { PRIORITA } from "@/lib/etichette"
import type { Task } from "@/types"
import { TaskCheck } from "./task-check"
import { TaskPosticipaMenu } from "./task-posticipa"
import { TaskAggiuntaRapida } from "./task-riga-meta"
import { coloreTipo, eFatto, formatScadenza, gruppoScadenza, ordina, PRIORITA_VALORI, type TaskCreaRapido, type TaskModifica } from "./task-utils"

/** Quanti completati mostrare prima di "Mostra tutti". */
const MAX_COMPLETATI = 30
const FATTI = "FATTI"

/** Il task ha solo due stati: le colonne sono le priorità più i completati. */
const COLONNE = [...PRIORITA_VALORI, FATTI]

type Props = {
  righe: Task[]
  mostraTipo: boolean
  salva: (t: Task, modifica: TaskModifica) => Promise<Task | null>
  onToggleCompleta: (t: Task, el: HTMLElement | null) => Promise<Task | null>
  onApri: (t: Task) => void
  onCreaRapido: TaskCreaRapido
}

const colonnaDi = (t: Task) => (eFatto(t) ? FATTI : t.priorita)

export function TaskKanbanView({ righe, mostraTipo, salva, onToggleCompleta, onApri, onCreaRapido }: Props) {
  const [tuttiCompletati, setTuttiCompletati] = useState(false)
  const [attivoId, setAttivoId] = useState<number | null>(null)
  const perId = useMemo(() => new Map(righe.map((r) => [r.id, r])), [righe])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    setAttivoId(null)
    const riga = perId.get(Number(active.id))
    const colonna = over ? String(over.id) : null
    if (!riga || !colonna || colonna === colonnaDi(riga)) return
    if (colonna === FATTI) {
      await onToggleCompleta(riga, null)
      return
    }
    // Da "Completati" a una priorità: si riapre e prende quella priorità
    const riaperta = eFatto(riga) ? await onToggleCompleta(riga, null) : riga
    if (riaperta && riaperta.priorita !== colonna) await salva(riaperta, { priorita: colonna })
  }

  const attivo = attivoId != null ? perId.get(attivoId) : undefined

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e) => setAttivoId(Number(e.active.id))}
      onDragEnd={(e) => void onDragEnd(e)} onDragCancel={() => setAttivoId(null)}>
      <div className="tkb-board" style={{ ["--tkb-ncol" as string]: COLONNE.length }}>
        {COLONNE.map((c) => {
          const fatti = c === FATTI
          const tutte = righe.filter((r) => colonnaDi(r) === c)
          const items = fatti
            ? [...tutte].sort((a, b) => (b.completatoIl ?? "").localeCompare(a.completatoIl ?? ""))
            : ordina(tutte, { campo: "scadenza", dir: "asc" })
          const visibili = fatti && !tuttiCompletati ? items.slice(0, MAX_COMPLETATI) : items
          return (
            <Colonna key={c} codice={c} label={fatti ? "Completati" : PRIORITA[c].testo} totale={tutte.length}
              aggiunta={fatti ? null : <div className="tkb-quick"><TaskAggiuntaRapida priorita={c} onCrea={onCreaRapido} /></div>}>
              {visibili.map((r) => (
                <Card key={r.id} task={r} mostraTipo={mostraTipo} onApri={onApri} onCompleta={(el) => void onToggleCompleta(r, el)}
                  onPosticipa={(s) => void salva(r, { scadenza: s })} />
              ))}
              {!visibili.length ? <div className="tkb-col-empty">{fatti ? "Trascina qui per chiudere" : "Nessun task"}</div> : null}
              {items.length > visibili.length ? (
                <button type="button" className="tkb-col-more" onClick={() => setTuttiCompletati(true)}>Mostra tutti ({items.length})</button>
              ) : null}
            </Colonna>
          )
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.2, 0.9, 0.3, 1.2)" }}>
        {attivo ? <CardBody task={attivo} mostraTipo={mostraTipo} overlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function Colonna({ codice, label, totale, aggiunta, children }: { codice: string; label: string; totale: number; aggiunta: ReactNode; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: codice })
  return (
    <section className="tkb-col" data-stato={codice} data-over={isOver ? "" : undefined} aria-label={`${label}, ${totale} task`}>
      <header className="tkb-col-head">
        <i aria-hidden />
        <b>{label}</b>
        <em>{totale}</em>
      </header>
      {aggiunta}
      <div ref={setNodeRef} className="tkb-col-body">{children}</div>
    </section>
  )
}

function Card({ task, mostraTipo, onApri, onCompleta, onPosticipa }: {
  task: Task
  mostraTipo: boolean
  onApri: (t: Task) => void
  onCompleta: (el: HTMLElement) => void
  onPosticipa: (scadenza: string | null) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  return (
    <MenuTask task={task}>
      <div ref={setNodeRef} className="tkb-card-wrap" data-dragging={isDragging ? "" : undefined} {...attributes} {...listeners}
        aria-label={task.titolo} onClick={() => onApri(task)}
        onKeyDown={(e) => {
          listeners?.onKeyDown?.(e)
          if (e.key === "Enter" && !e.defaultPrevented) onApri(task)
        }}>
        <CardBody task={task} mostraTipo={mostraTipo} onCompleta={onCompleta} onPosticipa={onPosticipa} />
      </div>
    </MenuTask>
  )
}

function CardBody({ task, mostraTipo, overlay, onCompleta, onPosticipa }: {
  task: Task
  mostraTipo: boolean
  overlay?: boolean
  onCompleta?: (el: HTMLElement) => void
  onPosticipa?: (scadenza: string | null) => void
}) {
  const fatto = eFatto(task)
  const gruppo = gruppoScadenza(task)
  const tono = fatto ? undefined : gruppo === "ritardo" ? "late" : gruppo === "oggi" ? "today" : undefined
  return (
    <article className="tkb-card" data-overlay={overlay ? "" : undefined} data-chiuso={fatto ? "" : undefined} data-priorita={task.priorita}>
      <div className="tkb-card-top">
        <TaskCheck size="sm" completato={fatto} onToggle={(el) => onCompleta?.(el)} />
        <p className="tkb-titolo">{task.titolo}</p>
        {onPosticipa && !fatto ? (
          <div className="tkb-card-actions" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <TaskPosticipaMenu scadenza={task.scadenza} onPosticipa={onPosticipa} />
          </div>
        ) : null}
      </div>
      <div className="tkb-card-meta">
        <span className="tkb-card-meta-info">
          {task.scadenza ? <span className="tkb-scad" data-tono={tono}>{formatScadenza(task.scadenza)}</span> : null}
          {task.pazienteNome ? <span className="tkb-paz" title={task.pazienteNome}><User aria-hidden />{task.pazienteNome}</span> : null}
          {mostraTipo ? (
            <span className="tkb-lista" style={{ ["--tk-c" as string]: coloreTipo(task.tipo) }} title={task.tipo.etichetta}>
              <i aria-hidden />{task.tipo.etichetta}
            </span>
          ) : null}
        </span>
      </div>
    </article>
  )
}
