import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react"
import { useMemo, useState } from "react"
import { MenuTask } from "@/components/menu-contestuali"
import { Checkbox } from "@/components/ui/checkbox"
import type { Task } from "@/types"
import { TaskPosticipaMenu } from "./task-posticipa"
import { TaskEmpty } from "./task-empty"
import {
  TaskAggiuntaRapida, TaskAutomaticoTag, TaskPazienteTag, TaskPrioritaIcon, TaskPrioritaMenu, TaskRigaCheck, TaskRigaPosticipa, TaskScadenzaLabel, TaskTipoDot,
} from "./task-riga-meta"
import { ordina, tastiRiga, type TaskCreaRapido, type TaskModifica, type TaskOrdinamento, type TaskOrdinamentoCampo } from "./task-utils"

type Props = {
  /** Task aperti già filtrati */
  righe: Task[]
  mostraTipo: boolean
  ordinamento: TaskOrdinamento
  onOrdinamento: (o: TaskOrdinamento) => void
  salva: (t: Task, modifica: TaskModifica) => Promise<Task | null>
  onToggleCompleta: (t: Task, el: HTMLButtonElement) => Promise<Task | null>
  onApri: (t: Task) => void
  selezionati: Set<number>
  onSelezionati: (s: Set<number>) => void
  onCreaRapido: TaskCreaRapido
  cercando: boolean
}

const COLONNE: { campo: TaskOrdinamentoCampo; label: string; className: string }[] = [
  { campo: "titolo", label: "Task", className: "tk-c-titolo" },
  { campo: "scadenza", label: "Scadenza", className: "tk-c-scadenza" },
  { campo: "priorita", label: "Priorità", className: "tk-c-priorita" },
]

export function TaskListaView({ righe, mostraTipo, ordinamento, onOrdinamento, salva, onToggleCompleta, onApri, selezionati, onSelezionati, onCreaRapido, cercando }: Props) {
  const [chiuso, setChiuso] = useState(false)
  const ordinate = useMemo(() => ordina(righe, ordinamento), [righe, ordinamento])
  const ids = ordinate.map((r) => r.id)
  const tuttiSel = ids.length > 0 && ids.every((id) => selezionati.has(id))

  if (!righe.length && cercando) return <TaskEmpty variante="filtri" />

  const ordinaPer = (campo: TaskOrdinamentoCampo) =>
    onOrdinamento({ campo, dir: ordinamento.campo === campo && ordinamento.dir === "asc" ? "desc" : "asc" })

  const toggleSel = (id: number) => {
    const next = new Set(selezionati)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelezionati(next)
  }

  const bottoneOrdina = (c: (typeof COLONNE)[number]) => (
    <button type="button" className="tk-sort" data-active={ordinamento.campo === c.campo ? "" : undefined}
      onClick={(e) => {
        e.stopPropagation()
        ordinaPer(c.campo)
      }}>
      {c.label}
      {ordinamento.campo === c.campo ? (ordinamento.dir === "asc" ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />) : null}
    </button>
  )
  const ariaSort = (campo: TaskOrdinamentoCampo) => (ordinamento.campo === campo ? (ordinamento.dir === "asc" ? "ascending" : "descending") : undefined)

  return (
    <div className="tk-tabelle">
      <div className="tk-table" data-con-lista={mostraTipo ? "" : undefined} data-selezione={selezionati.size ? "" : undefined} role="table" aria-label="Task da fare">
        <section className="tk-group" data-stato="DA_FARE" role="rowgroup">
          {/* L'header è lo stato del riquadro: un clic ovunque lo chiude o lo riapre */}
          <div className="tk-thead" role="row" data-chiuso={chiuso ? "" : undefined} onClick={() => setChiuso((c) => !c)}>
            <span className="tk-c-sel" role="columnheader" aria-label="Selezione" onClick={(e) => e.stopPropagation()}>
              {ids.length ? (
                <Checkbox checked={tuttiSel ? true : ids.some((id) => selezionati.has(id)) ? "indeterminate" : false} className="tk-group-check" aria-label="Seleziona tutti"
                  onCheckedChange={() => onSelezionati(new Set(tuttiSel ? [] : ids))} />
              ) : null}
            </span>
            <span className="tk-c-titolo" role="columnheader" aria-sort={ariaSort("titolo")}>
              <button type="button" className="tk-group-toggle" aria-expanded={!chiuso}>
                <ChevronDown className="tk-chevron" data-closed={chiuso ? "" : undefined} aria-hidden />
                <span className="tk-group-dot" aria-hidden />
                <b>Da fare</b>
                <em>{righe.length}</em>
              </button>
              {!chiuso ? bottoneOrdina(COLONNE[0]) : null}
            </span>
            {!chiuso ? COLONNE.slice(1).map((c) => (
              <span key={c.campo} className={c.className} role="columnheader" aria-sort={ariaSort(c.campo)}>{bottoneOrdina(c)}</span>
            )) : null}
            {!chiuso && mostraTipo ? <span className="tk-c-lista" role="columnheader">Tipo</span> : null}
          </div>
          {!chiuso ? (
            <>
              {ordinate.map((r) => (
                <Riga key={r.id} task={r} mostraTipo={mostraTipo} selezionato={selezionati.has(r.id)} onSel={() => toggleSel(r.id)}
                  onApri={onApri} salva={salva} onToggleCompleta={onToggleCompleta} />
              ))}
              <TaskAggiuntaRapida onCrea={onCreaRapido} />
            </>
          ) : null}
        </section>
      </div>
    </div>
  )
}

function Riga({ task, mostraTipo, selezionato, onSel, onApri, salva, onToggleCompleta }: {
  task: Task
  mostraTipo: boolean
  selezionato: boolean
  onSel: () => void
  onApri: Props["onApri"]
  salva: Props["salva"]
  onToggleCompleta: Props["onToggleCompleta"]
}) {
  // I controlli inline non devono aprire il task
  const ferma = (e: React.SyntheticEvent) => e.stopPropagation()
  return (
    <MenuTask task={task}>
      <div role="row" tabIndex={0} data-tk-riga="" className="tk-row" data-selected={selezionato ? "" : undefined} aria-label={task.titolo}
        onClick={() => onApri(task)} onKeyDown={(e) => tastiRiga(e, () => onApri(task))}>
        <span className="tk-c-sel" role="cell" onClick={ferma}>
          <Checkbox checked={selezionato} onCheckedChange={onSel} aria-label={`Seleziona ${task.titolo}`} />
        </span>
        <span className="tk-c-titolo" role="cell">
          <TaskRigaCheck task={task} onToggle={(el) => void onToggleCompleta(task, el)} />
          <span className="tk-riga-main">
            <span className="tk-riga-title"><b>{task.titolo}</b></span>
            {task.pazienteNome || task.automatico ? (
              <span className="tk-riga-sub">
                <TaskPazienteTag task={task} />
                <TaskAutomaticoTag task={task} compatto />
              </span>
            ) : null}
          </span>
          <TaskRigaPosticipa task={task} onPosticipa={(s) => void salva(task, { scadenza: s })} />
        </span>
        <span className="tk-c-scadenza tk-cell-quiet" role="cell" onClick={ferma}>
          <TaskPosticipaMenu titolo="Scadenza" align="start" scadenza={task.scadenza} onPosticipa={(s) => void salva(task, { scadenza: s })}
            trigger={<button type="button" className="tk-cell-btn" aria-label="Scadenza">{task.scadenza ? <TaskScadenzaLabel task={task} /> : <span className="tk-muted">—</span>}</button>} />
        </span>
        <span className="tk-c-priorita tk-cell-quiet" role="cell" onClick={ferma}>
          <TaskPrioritaMenu valore={task.priorita} onChange={(p) => void salva(task, { priorita: p })}
            trigger={<button type="button" className="tk-cell-btn" aria-label="Priorità"><TaskPrioritaIcon priorita={task.priorita} conEtichetta /></button>} />
        </span>
        {mostraTipo ? <span className="tk-c-lista" role="cell"><TaskTipoDot task={task} /></span> : null}
      </div>
    </MenuTask>
  )
}
