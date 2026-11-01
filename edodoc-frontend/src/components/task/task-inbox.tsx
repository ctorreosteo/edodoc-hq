import { ChevronDown, Sparkles } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { MenuTask } from "@/components/menu-contestuali"
import type { Task } from "@/types"
import { TaskEmpty } from "./task-empty"
import { TaskAutomaticoTag, TaskPazienteTag, TaskPrioritaIcon, TaskRigaCheck, TaskRigaPosticipa, TaskScadenzaLabel, TaskListaDot } from "./task-riga-meta"
import { eFatto, GRUPPI_SCADENZA, gruppoScadenza, inFiltroRapido, ordina, tastiRiga, type GruppoScadenza, type TaskFiltroRapido } from "./task-utils"

/** Quanto resta visibile (in uscita) una riga appena completata. */
const USCITA_MS = 650

type Props = {
  /** Task aperti già filtrati */
  righe: Task[]
  filtroRapido: TaskFiltroRapido
  onFiltroRapido: (f: TaskFiltroRapido) => void
  onApri: (t: Task) => void
  onToggleCompleta: (t: Task, el: HTMLButtonElement) => Promise<Task | null>
  onPosticipa: (t: Task, scadenza: string | null) => void
  onNuovo: () => void
  cercando: boolean
}

export function TaskInbox({ righe, filtroRapido, onFiltroRapido, onApri, onToggleCompleta, onPosticipa, onNuovo, cercando }: Props) {
  const [chiusi, setChiusi] = useState<Record<string, boolean>>({})
  /** Righe appena completate: restano al loro posto il tempo dell'animazione di uscita. */
  const [uscenti, setUscenti] = useState<Map<number, Task>>(new Map())
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const t = timers.current
    return () => t.forEach(clearTimeout)
  }, [])

  const gruppi = useMemo(() => {
    const oggi = new Date()
    const per: Record<GruppoScadenza, Task[]> = { ritardo: [], oggi: [], domani: [], settimana: [], avanti: [], senza: [] }
    const tutte = [...righe]
    uscenti.forEach((r, id) => {
      if (!righe.some((x) => x.id === id)) tutte.push(r)
    })
    for (const r of ordina(tutte, { campo: "scadenza", dir: "asc" })) per[gruppoScadenza(r, oggi)].push(r)
    return per
  }, [righe, uscenti])

  const togliUscente = (id: number) => setUscenti((m) => {
    const n = new Map(m)
    n.delete(id)
    return n
  })

  const toggle = async (r: Task, el: HTMLButtonElement) => {
    setUscenti((m) => new Map(m).set(r.id, r))
    const vecchio = timers.current.get(r.id)
    if (vecchio) clearTimeout(vecchio)
    timers.current.set(r.id, setTimeout(() => {
      togliUscente(r.id)
      timers.current.delete(r.id)
    }, USCITA_MS))
    if (!(await onToggleCompleta(r, el))) togliUscente(r.id)
  }

  const visibili = (g: GruppoScadenza) => (inFiltroRapido(filtroRapido, g) ? gruppi[g] : [])
  const totale = GRUPPI_SCADENZA.reduce((n, g) => n + visibili(g.key).length, 0)
  const urgenti = gruppi.ritardo.length + gruppi.oggi.length

  if (totale === 0) {
    if (cercando || filtroRapido) {
      return (
        <div className="tk-inbox">
          <TaskEmpty variante="filtri" />
          {filtroRapido ? <button type="button" className="tk-link tk-link--center" onClick={() => onFiltroRapido(null)}>Mostra tutti i miei task</button> : null}
        </div>
      )
    }
    return <TaskEmpty variante="inbox" onNuovo={onNuovo} />
  }

  return (
    <div className="tk-inbox">
      {urgenti === 0 && !filtroRapido && !cercando ? (
        <div className="tk-giornata" role="status">
          <span className="tk-giornata-icon" aria-hidden><Sparkles /></span>
          <span><b>Giornata chiusa ✨</b> Niente in ritardo, niente in scadenza oggi.</span>
        </div>
      ) : null}

      {GRUPPI_SCADENZA.map((g) => {
        const items = visibili(g.key)
        if (!items.length) return null
        const chiuso = chiusi[g.key] ?? false
        return (
          <section key={g.key} className="tk-gruppo" data-gruppo={g.key}>
            <button type="button" className="tk-gruppo-head" aria-expanded={!chiuso} onClick={() => setChiusi((c) => ({ ...c, [g.key]: !chiuso }))}>
              <ChevronDown className="tk-chevron" data-closed={chiuso ? "" : undefined} aria-hidden />
              <b>{g.label}</b>
              <em>{items.length}</em>
            </button>
            {!chiuso ? (
              <ul className="tk-righe">
                {items.map((r) => (
                  <InboxRiga key={r.id} task={r} uscente={uscenti.has(r.id)} onApri={onApri} onToggle={(el) => void toggle(r, el)}
                    onPosticipa={(s) => onPosticipa(r, s)} />
                ))}
              </ul>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

function InboxRiga({ task, uscente, onApri, onToggle, onPosticipa }: {
  task: Task
  uscente: boolean
  onApri: (t: Task) => void
  onToggle: (el: HTMLButtonElement) => void
  onPosticipa: (scadenza: string | null) => void
}) {
  return (
    <li className="tk-riga-li" data-uscente={uscente ? "" : undefined}>
      <MenuTask task={task}>
        <div role="button" tabIndex={0} data-tk-riga="" className="tk-riga" data-chiuso={eFatto(task) ? "" : undefined} aria-label={task.titolo}
          onClick={() => onApri(task)} onKeyDown={(e) => tastiRiga(e, () => onApri(task))}>
          <TaskRigaCheck task={task} onToggle={onToggle} />
          <span className="tk-riga-main">
            <span className="tk-riga-title"><b>{task.titolo}</b></span>
            <span className="tk-riga-sub">
              <TaskListaDot task={task} />
              <TaskPazienteTag task={task} />
              <TaskAutomaticoTag task={task} />
            </span>
          </span>
          <span className="tk-riga-side">
            {task.priorita !== "MEDIA" ? <TaskPrioritaIcon priorita={task.priorita} /> : null}
            <TaskRigaPosticipa task={task} onPosticipa={onPosticipa} />
            <span className="tk-riga-when"><TaskScadenzaLabel task={task} /></span>
          </span>
        </div>
      </MenuTask>
    </li>
  )
}
