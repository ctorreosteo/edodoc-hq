import { format, isThisYear, parseISO } from "date-fns"
import { it } from "date-fns/locale"
import { ChevronDown, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { MenuTask } from "@/components/menu-contestuali"
import type { Task } from "@/types"
import { TaskPazienteTag, TaskRigaCheck, TaskListaDot } from "./task-riga-meta"
import { tastiRiga } from "./task-utils"

const PAGINA = 20
const CHIAVE_APERTO = "task-archivio-aperto"

const leggiAperto = () => {
  try {
    return localStorage.getItem(CHIAVE_APERTO) === "1"
  } catch {
    return false
  }
}

const quandoChiuso = (t: Task) => {
  if (!t.completatoIl) return ""
  const d = parseISO(t.completatoIl)
  return `Completato il ${format(d, isThisYear(d) ? "d MMM" : "d MMM yyyy", { locale: it })}`
}

/** Completati in un riquadro sotto l'elenco, dal più recente: da qui un task si riapre togliendo la spunta. */
export function TaskArchivio({ righe, cercando, onApri, onRiapri }: {
  /** Task completati già filtrati (il server manda gli ultimi 100) */
  righe: Task[]
  /** Ricerca in corso: l'archivio si apre da solo per mostrare i risultati */
  cercando: boolean
  onApri: (t: Task) => void
  onRiapri: (t: Task, el: HTMLButtonElement) => void
}) {
  const [apertoUtente, setApertoUtente] = useState(leggiAperto)
  const [mostrati, setMostrati] = useState(PAGINA)
  const aperto = apertoUtente || cercando
  const ordinate = useMemo(() => [...righe].sort((a, b) => (b.completatoIl ?? "").localeCompare(a.completatoIl ?? "")), [righe])

  const toggleAperto = () => {
    setApertoUtente(!aperto)
    try {
      localStorage.setItem(CHIAVE_APERTO, aperto ? "0" : "1")
    } catch {
      /* solo una preferenza */
    }
  }

  // Senza completati e senza ricerca il riquadro non serve
  if (!righe.length && !cercando) return null

  return (
    <section className="tk-archivio" data-stato="COMPLETATO" aria-label="Completati">
      <button type="button" className="tk-archivio-head" aria-expanded={aperto} onClick={toggleAperto}>
        <ChevronDown className="tk-chevron" data-closed={aperto ? undefined : ""} aria-hidden />
        <span className="tk-group-dot" aria-hidden />
        <b>Completati</b>
        <em>{righe.length}</em>
        {cercando
          ? <small className="tk-archivio-hint"><Search aria-hidden /> risultati della ricerca, tra gli ultimi 100</small>
          : <small className="tk-archivio-hint">gli ultimi 100, dal più recente</small>}
      </button>

      {aperto ? (
        <>
          {!righe.length ? <p className="tk-archivio-vuoto">Nessun task tra i completati corrisponde alla ricerca.</p> : null}
          <ul className="tk-righe">
            {ordinate.slice(0, mostrati).map((t) => (
              <li key={t.id} className="tk-riga-li">
                <MenuTask task={t}>
                  <div role="button" tabIndex={0} data-tk-riga="" className="tk-riga" data-chiuso="" aria-label={t.titolo}
                    onClick={() => onApri(t)} onKeyDown={(e) => tastiRiga(e, () => onApri(t))}>
                    <TaskRigaCheck task={t} onToggle={(el) => onRiapri(t, el)} />
                    <span className="tk-riga-main">
                      <span className="tk-riga-title"><b>{t.titolo}</b></span>
                      <span className="tk-riga-sub">
                        <TaskListaDot task={t} />
                        <TaskPazienteTag task={t} />
                      </span>
                    </span>
                    <span className="tk-riga-side">
                      <span className="tk-riga-when tk-archivio-quando">{quandoChiuso(t)}</span>
                    </span>
                  </div>
                </MenuTask>
              </li>
            ))}
          </ul>
          {ordinate.length > mostrati ? (
            <button type="button" className="tk-archivio-altri" onClick={() => setMostrati((n) => n + PAGINA)}>
              Mostra altri ({ordinate.length - mostrati} rimanenti)
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
