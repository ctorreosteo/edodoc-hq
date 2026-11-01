import { format } from "date-fns"
import { it } from "date-fns/locale"
import { Keyboard, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { LuxHero } from "@/components/lux"
import { Caricamento, Errore } from "@/components/stati"
import { TaskArchivio } from "@/components/task/task-archivio"
import { TaskBulkBar } from "@/components/task/task-bulk-bar"
import { TaskCalendarioView } from "@/components/task/task-calendario-view"
import { TaskEmpty } from "@/components/task/task-empty"
import { TaskInbox } from "@/components/task/task-inbox"
import { TaskKanbanView } from "@/components/task/task-kanban-view"
import { TaskListaView } from "@/components/task/task-lista-view"
import { TaskNavMobile, TaskRail } from "@/components/task/task-rail"
import { TaskScorciatoie } from "@/components/task/task-scorciatoie"
import { TaskFiltriPopover, TaskNuovoButton, TaskNuovoFab, TaskSearch, TaskVistaSwitch } from "@/components/task/task-toolbar"
import {
  coloreTipo, corpoTask, eFatto, formatScadenza, gruppoScadenza, spostaFuocoRiga, staScrivendo,
  type TaskCreaRapido, type TaskFiltri, type TaskFiltroRapido, type TaskModifica, type TaskOrdinamento, type TaskVista,
} from "@/components/task/task-utils"
import { useAzioni } from "@/contexts/azioni-context"
import { useDati } from "@/hooks/use-dati"
import { celebra } from "@/lib/task-festa"
import { toast, toastErrore } from "@/lib/toast"
import { taskService } from "@/services/gestionale"
import type { Task as TaskT } from "@/types"
import "@/style/lux-task.css"
import "@/style/lux-task-board.css"

const CHIAVE_PREFERENZE = "task-preferenze"
const VISTE: TaskVista[] = ["lista", "kanban", "calendario"]

type Preferenze = { lista: string; vista: TaskVista; ordinamento: TaskOrdinamento; filtri: TaskFiltri }

const PREFERENZE: Preferenze = {
  lista: "miei", vista: "lista", ordinamento: { campo: "scadenza", dir: "asc" }, filtri: { priorita: null, soloAutomatici: false },
}

function leggiPreferenze(): Preferenze {
  try {
    return { ...PREFERENZE, ...JSON.parse(localStorage.getItem(CHIAVE_PREFERENZE) ?? "{}") }
  } catch {
    return PREFERENZE
  }
}

const ETICHETTE_FILTRO: Record<Exclude<TaskFiltroRapido, null>, string> = {
  ritardo: "in ritardo", oggi: "in scadenza oggi", settimana: "prossimi 7 giorni", senza: "senza scadenza",
}

export default function Task() {
  const azioni = useAzioni()
  const { tipiTask } = azioni
  const { dati, errore, riprova } = useDati(() => taskService.lista(true), [])
  const [righe, setRighe] = useState<TaskT[]>([])
  const [searchParams, setSearchParams] = useSearchParams()
  const [pref, setPref] = useState(leggiPreferenze)
  const [ricerca, setRicerca] = useState("")
  const [filtroRapido, setFiltroRapido] = useState<TaskFiltroRapido>(null)
  const [selezionati, setSelezionati] = useState<Set<number>>(new Set())
  const [railCompatta, setRailCompatta] = useState(false)
  const [tastiAperto, setTastiAperto] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Le modifiche sono ottimistiche: il server riallinea a ogni ricarica
  useEffect(() => {
    if (dati) setRighe(dati)
  }, [dati])

  const aggiornaPref = (patch: Partial<Preferenze>) => {
    const prossime = { ...pref, ...patch }
    setPref(prossime)
    try {
      localStorage.setItem(CHIAVE_PREFERENZE, JSON.stringify(prossime))
    } catch {
      /* solo una preferenza */
    }
  }

  // ---------- Stato dall'URL (con le preferenze salvate come default) ----------
  const richiesta = searchParams.get("lista") ?? pref.lista
  const fissa = richiesta === "miei" || richiesta === "tutti"
  const selezione = fissa || !tipiTask.length || tipiTask.some((t) => t.codice === richiesta) ? richiesta : "miei"
  const tipo = tipiTask.find((t) => t.codice === selezione)
  const vistaParam = searchParams.get("vista") as TaskVista | null
  const vista = vistaParam && VISTE.includes(vistaParam) ? vistaParam : pref.vista
  const miei = selezione === "miei"
  const mostraTipo = selezione === "tutti"

  const setParam = (chiave: string, valore: string) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev)
    next.set(chiave, valore)
    return next
  })

  const seleziona = (s: string) => {
    aggiornaPref({ lista: s })
    setParam("lista", s)
    setSelezionati(new Set())
    setFiltroRapido(null)
  }

  const cambiaVista = (v: TaskVista) => {
    aggiornaPref({ vista: v })
    setParam("vista", v)
    setSelezionati(new Set())
  }

  // ---------- Dati visibili ----------
  const aperti = useMemo(() => righe.filter((t) => !eFatto(t)), [righe])
  const q = ricerca.trim().toLowerCase()
  const { priorita, soloAutomatici } = pref.filtri
  const visibili = useMemo(() => righe.filter((t) => {
    if (selezione !== "miei" && selezione !== "tutti" && tipiTask.length && t.tipo.codice !== selezione) return false
    if (priorita && t.priorita !== priorita) return false
    if (soloAutomatici && !t.automatico) return false
    return !q || [t.titolo, t.descrizione, t.pazienteNome, t.tipo.etichetta].some((v) => v?.toLowerCase().includes(q))
  }), [righe, selezione, tipiTask.length, priorita, soloAutomatici, q])
  const visibiliAperti = useMemo(() => visibili.filter((t) => !eFatto(t)), [visibili])
  const visibiliFatti = useMemo(() => visibili.filter(eFatto), [visibili])
  const righeSelezionate = useMemo(() => visibiliAperti.filter((t) => selezionati.has(t.id)), [visibiliAperti, selezionati])

  // ---------- Azioni ----------
  const sostituisci = (t: TaskT) => setRighe((lista) => lista.map((x) => (x.id === t.id ? t : x)))

  const salva = useCallback(async (task: TaskT, modifica: TaskModifica) => {
    const prossimo = { ...task, ...modifica }
    sostituisci(prossimo)
    try {
      const salvato = await taskService.aggiorna(task.id, corpoTask(prossimo))
      sostituisci(salvato)
      return salvato
    } catch (e) {
      sostituisci(task)
      toastErrore(e)
      return null
    }
  }, [])

  const segna = useCallback(async (task: TaskT, fatto: boolean) => {
    sostituisci({ ...task, stato: fatto ? "FATTO" : "DA_FARE", completatoIl: fatto ? new Date().toISOString() : null })
    try {
      const salvato = await taskService.cambiaStato(task.id, fatto)
      sostituisci(salvato)
      return salvato
    } catch (e) {
      sostituisci(task)
      toastErrore(e)
      return null
    }
  }, [])

  const urgente = (t: TaskT) => {
    const g = gruppoScadenza(t)
    return g === "ritardo" || g === "oggi"
  }

  const toggleCompleta = async (task: TaskT, el: HTMLElement | null) => {
    const fatto = !eFatto(task)
    // Era l'ultimo task urgente (in ritardo o di oggi)? Allora festeggiamo
    const ultimoUrgente = fatto && urgente(task) && !aperti.some((t) => t.id !== task.id && urgente(t))
    const salvato = await segna(task, fatto)
    if (salvato) {
      if (ultimoUrgente) celebra(el)
      toast.success(!fatto ? "Task riaperto" : ultimoUrgente ? "Giornata chiusa ✨" : "Completato", {
        description: task.titolo,
        action: { label: "Annulla", onClick: () => void segna(salvato, !fatto) },
      })
    }
    return salvato
  }

  const posticipa = async (task: TaskT, scadenza: string | null) => {
    const salvato = await salva(task, { scadenza })
    if (salvato) {
      toast.success(scadenza ? `Spostato a ${formatScadenza(scadenza).toLowerCase()}` : "Scadenza rimossa", {
        description: task.titolo,
        action: { label: "Annulla", onClick: () => void salva(salvato, { scadenza: task.scadenza }) },
      })
    }
  }

  const creaRapido: TaskCreaRapido = async (titolo, extra) => {
    try {
      const creato = await taskService.crea({ tipoCodice: tipo?.codice ?? "ALTRO", titolo, ...extra })
      setRighe((lista) => [creato, ...lista])
      return true
    } catch (e) {
      toastErrore(e)
      return false
    }
  }

  const { nuovoTask, modificaTask } = azioni
  const nuovo = useCallback((scadenza?: string) => nuovoTask({ tipoCodice: tipo?.codice, scadenza }), [nuovoTask, tipo?.codice])

  // ---------- Scorciatoie ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || staScrivendo(e.target)) return
      if (document.querySelector('[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]')) return
      const k = e.key
      const suRiga = (e.target as HTMLElement)?.dataset?.tkRiga !== undefined
      if (k === "n" || k === "N") {
        e.preventDefault()
        nuovo()
      } else if (k === "/") {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (k === "j" || (k === "ArrowDown" && suRiga)) {
        e.preventDefault()
        spostaFuocoRiga(1)
      } else if (k === "k" || (k === "ArrowUp" && suRiga)) {
        e.preventDefault()
        spostaFuocoRiga(-1)
      } else if (k === "?") {
        e.preventDefault()
        setTastiAperto(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [nuovo])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const cercando = !!q
  const titolo = tipo ? tipo.etichetta : selezione === "tutti" ? "Tutti i task" : "I miei task"
  const oggiTesto = format(new Date(), "EEEE d MMMM", { locale: it })
  const navigazione = { tipi: tipiTask, aperti, selezione, onSeleziona: seleziona }

  return (
    <div data-vl="" data-vl-page="task" className="tk-page" data-rail-compatta={railCompatta ? "" : undefined}
      style={tipo ? { ["--tk-c" as string]: coloreTipo(tipo) } : undefined}>
      <TaskRail {...navigazione} compatta={railCompatta} onToggleCompatta={() => setRailCompatta((c) => !c)} />

      <main className="tk-main">
        <TaskNavMobile {...navigazione} />

        <div className="tk-hero" data-ambito={tipo ? "lista" : selezione}>
          <LuxHero ariaLabel={titolo} title={titolo} eyebrow={miei ? `La tua giornata · ${oggiTesto}` : tipo ? `Tipo · ${oggiTesto}` : `Tutti i tipi · ${oggiTesto}`}
            subtitle={miei ? <FraseRiepilogo aperti={aperti} filtro={filtroRapido} onFiltro={setFiltroRapido} /> : <FraseAmbito aperti={visibiliAperti} />}
            actions={<TaskNuovoButton onClick={() => nuovo()} />} />
        </div>

        <div className="tk-toolbar">
          <TaskSearch ref={searchRef} value={ricerca} onChange={setRicerca} />
          <div className="tk-toolbar-right">
            <TaskFiltriPopover filtri={pref.filtri} onChange={(patch) => aggiornaPref({ filtri: { ...pref.filtri, ...patch } })} />
            {!miei ? <TaskVistaSwitch value={vista} onChange={cambiaVista} /> : null}
            <button type="button" className="tk-icon-btn tk-keys-btn" onClick={() => setTastiAperto(true)} aria-label="Scorciatoie da tastiera" title="Scorciatoie (?)">
              <Keyboard aria-hidden />
            </button>
          </div>
        </div>

        {filtroRapido && miei ? (
          <div className="tk-filtro-attivo">
            <span>Stai vedendo: <b>{ETICHETTE_FILTRO[filtroRapido]}</b></span>
            <button type="button" className="tk-link" onClick={() => setFiltroRapido(null)}><X aria-hidden /> Mostra tutto</button>
          </div>
        ) : null}

        {miei ? (
          <TaskInbox righe={visibiliAperti} filtroRapido={filtroRapido} onFiltroRapido={setFiltroRapido} onApri={modificaTask}
            onToggleCompleta={toggleCompleta} onPosticipa={(t, s) => void posticipa(t, s)} onNuovo={() => nuovo()} cercando={cercando} />
        ) : !visibili.length && !cercando && vista !== "calendario" ? (
          <TaskEmpty variante="lista" onNuovo={() => nuovo()} />
        ) : vista === "kanban" ? (
          <TaskKanbanView righe={visibili} mostraTipo={mostraTipo} salva={salva} onToggleCompleta={toggleCompleta} onApri={modificaTask} onCreaRapido={creaRapido} />
        ) : vista === "calendario" ? (
          <TaskCalendarioView righe={visibili} onApri={modificaTask} onNuovoIl={nuovo} onSposta={(t, s) => void salva(t, { scadenza: s })} />
        ) : (
          <TaskListaView righe={visibiliAperti} mostraTipo={mostraTipo} ordinamento={pref.ordinamento} onOrdinamento={(o) => aggiornaPref({ ordinamento: o })}
            salva={salva} onToggleCompleta={toggleCompleta} onApri={modificaTask} selezionati={selezionati} onSelezionati={setSelezionati}
            onCreaRapido={creaRapido} cercando={cercando} />
        )}

        {miei || vista === "lista" ? (
          <TaskArchivio righe={visibiliFatti} cercando={cercando} onApri={modificaTask} onRiapri={(t, el) => void toggleCompleta(t, el)} />
        ) : null}
      </main>

      <TaskNuovoFab onClick={() => nuovo()} />
      {!miei && vista === "lista" ? <TaskBulkBar righe={righeSelezionate} onClear={() => setSelezionati(new Set())} /> : null}
      <TaskScorciatoie open={tastiAperto} onOpenChange={setTastiAperto} />
    </div>
  )
}

/** Riepilogo di "I miei task" come frase: ogni numero è un filtro. */
function FraseRiepilogo({ aperti, filtro, onFiltro }: { aperti: TaskT[]; filtro: TaskFiltroRapido; onFiltro: (f: TaskFiltroRapido) => void }) {
  const conta = (...gruppi: string[]) => aperti.filter((t) => gruppi.includes(gruppoScadenza(t))).length
  const parti: { key: Exclude<TaskFiltroRapido, null>; n: number; testo: string; tono?: string }[] = [
    { key: "ritardo", n: conta("ritardo"), testo: "in ritardo", tono: "late" },
    { key: "oggi", n: conta("oggi"), testo: "oggi", tono: "today" },
    { key: "settimana", n: conta("domani", "settimana"), testo: "nei prossimi 7 giorni" },
    { key: "senza", n: conta("senza"), testo: "senza scadenza" },
  ]
  const presenti = parti.filter((p) => p.n > 0)
  if (!aperti.length) return <span className="tk-frase">Niente in sospeso. Goditi il caffè ☕</span>
  const tranquillo = parti[0].n === 0 && parti[1].n === 0
  return (
    <span className="tk-frase">
      {tranquillo ? <span className="tk-frase-calma">Niente di urgente · </span> : null}
      {presenti.map((p, i) => (
        <span key={p.key}>
          {i > 0 ? <span className="tk-frase-sep" aria-hidden> · </span> : null}
          <button type="button" className="tk-frase-num" data-tono={p.tono} aria-pressed={filtro === p.key} data-active={filtro === p.key ? "" : undefined}
            onClick={() => onFiltro(filtro === p.key ? null : p.key)}>
            <b>{p.n}</b> {p.testo}
          </button>
        </span>
      ))}
    </span>
  )
}

function FraseAmbito({ aperti }: { aperti: TaskT[] }) {
  const ritardo = aperti.filter((t) => gruppoScadenza(t) === "ritardo").length
  if (!aperti.length) return <span className="tk-frase">Nessun task aperto. Tutto in ordine.</span>
  return (
    <span className="tk-frase">
      <b>{aperti.length}</b> {aperti.length === 1 ? "task aperto" : "task aperti"}
      {ritardo ? <> · <b className="tk-frase-late">{ritardo}</b> in ritardo</> : null}
    </span>
  )
}
