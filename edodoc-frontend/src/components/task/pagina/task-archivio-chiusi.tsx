import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format, isThisYear, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronDown, Loader2, Search } from 'lucide-react'
import { toast } from '@/lib/toast'
import { TaskAvatarStack, TaskListaDot } from '@/components/task/task-ui'
import { emitTaskChanged, useTaskChanged } from '@/hooks/use-task-cambi'
import { taskService, type TaskConfig, type TaskFiltri, type TaskRiga, type TaskStato } from '@/services/task-service'
import { tastiRiga } from './task-pagina-utils'
import { TaskIdBadge, TaskPazienteTag, TaskRigaCheck } from './task-riga-meta'

const PAGINA = 20
const CHIAVE_APERTO = 'task-archivio-aperto'

export type TaskStatoArchivio = Extract<TaskStato, 'COMPLETATO' | 'ANNULLATO'>

const TITOLI: Record<TaskStatoArchivio, string> = { COMPLETATO: 'Completati', ANNULLATO: 'Annullati' }

interface Props {
  config: TaskConfig
  /** Lo stato di questo riquadro: ogni stato chiuso ha il suo */
  stato: TaskStatoArchivio
  /** Stessi filtri dell'elenco (ambito, persona, ricerca…): l'archivio li applica a tutti i chiusi, senza limiti di tempo */
  filtri: TaskFiltri | null
  /** Ricerca in corso: l'archivio si apre da solo per mostrare i risultati */
  cercando: boolean
  mostraLista: boolean
  selezionatoId: number | null
  onApri: (id: number) => void
}

const leggiAperto = (stato: TaskStatoArchivio) => {
  try {
    return localStorage.getItem(`${CHIAVE_APERTO}-${stato}`) === '1'
  } catch {
    return false
  }
}

const quandoChiuso = (r: TaskRiga) => {
  const iso = r.completatoIl ?? r.aggiornatoIl
  if (!iso) return ''
  const d = parseISO(iso)
  const giorno = format(d, isThisYear(d) ? 'd MMM' : 'd MMM yyyy', { locale: it })
  return r.stato === 'ANNULLATO' ? `Annullato il ${giorno}` : `Completato il ${giorno}`
}

/**
 * Archivio di uno stato chiuso (completati o annullati), in un riquadro a parte sotto l'elenco: tutti, dal più
 * recente, a pagine da 20, ritrovabili con la ricerca della pagina. Da qui un task si riapre togliendo la spunta.
 */
export function TaskArchivioChiusi({ config, stato, filtri, cercando, mostraLista, selezionatoId, onApri }: Props) {
  const titolo = TITOLI[stato]
  const [apertoUtente, setApertoUtente] = useState(() => leggiAperto(stato))
  const aperto = apertoUtente || cercando
  const [righe, setRighe] = useState<TaskRiga[]>([])
  const [totale, setTotale] = useState<number | null>(null)
  const [altre, setAltre] = useState(false)
  const [caricando, setCaricando] = useState(false)
  const listaDi = useMemo(() => new Map(config.liste.map((l) => [l.id, l])), [config.liste])
  const chiave = filtri ? JSON.stringify({ ...filtri, stati: [stato] }) : null
  const abort = useRef<AbortController | null>(null)
  const caricate = useRef(0)
  caricate.current = righe.length

  /** Ricarica le prime `quante` righe (almeno una pagina): dopo una modifica non si perde quello che si stava guardando. */
  const carica = useCallback(async (quante = PAGINA) => {
    if (!chiave) return
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setCaricando(true)
    try {
      const dim = Math.min(100, Math.max(PAGINA, quante))
      const res = await taskService.getChiusi(JSON.parse(chiave) as TaskFiltri, 0, dim)
      if (ctrl.signal.aborted) return
      setRighe(res.righe)
      setTotale(res.totale)
      setAltre(res.altre)
    } catch {
      if (!ctrl.signal.aborted) setTotale((t) => t ?? 0)
    } finally {
      if (!ctrl.signal.aborted) setCaricando(false)
    }
  }, [chiave])

  // Il conteggio serve anche a riquadro chiuso
  useEffect(() => {
    setRighe([])
    void carica()
    return () => abort.current?.abort()
  }, [carica])

  const altrePagine = async () => {
    if (!chiave || caricando) return
    setCaricando(true)
    try {
      const pagina = Math.floor(righe.length / PAGINA)
      const res = await taskService.getChiusi(JSON.parse(chiave) as TaskFiltri, pagina, PAGINA)
      setRighe((prev) => [...prev, ...res.righe.filter((r) => !prev.some((x) => x.id === r.id))])
      setTotale(res.totale)
      setAltre(res.altre)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Impossibile caricare altri task')
    } finally {
      setCaricando(false)
    }
  }

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ricaricaPresto = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void carica(caricate.current), 500)
  }, [carica])
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  useTaskChanged(ricaricaPresto)

  const toggleAperto = () => {
    const prossimo = !aperto
    setApertoUtente(prossimo)
    try {
      localStorage.setItem(`${CHIAVE_APERTO}-${stato}`, prossimo ? '1' : '0')
    } catch {
      /* solo una preferenza */
    }
  }

  const riapri = async (r: TaskRiga) => {
    setRighe((prev) => prev.filter((x) => x.id !== r.id))
    setTotale((t) => (t != null ? Math.max(0, t - 1) : t))
    try {
      await taskService.aggiorna(r.id, { stato: 'DA_FARE' })
      emitTaskChanged(r.id)
      toast.success('Task riaperto', {
        description: r.titolo,
        action: {
          label: 'Annulla',
          onClick: () => void taskService.aggiorna(r.id, { stato: r.stato }).then(() => emitTaskChanged(r.id)),
        },
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Task non riaperto')
      void carica(caricate.current)
    }
  }

  if (!filtri) return null
  // Senza task in questo stato e senza ricerca il riquadro non serve
  if (totale === 0 && !cercando) return null

  return (
    <section className="tk-archivio" data-stato={stato} aria-label={titolo}>
      <button type="button" className="tk-archivio-head" aria-expanded={aperto} onClick={toggleAperto}>
        <ChevronDown className="tk-chevron" data-closed={aperto ? undefined : ''} aria-hidden />
        <span className="tk-group-dot" aria-hidden />
        <b>{titolo}</b>
        {totale != null ? <em>{totale.toLocaleString('it-IT')}</em> : <Loader2 className="tk-spin" aria-hidden />}
        {cercando ? (
          <small className="tk-archivio-hint"><Search aria-hidden /> risultati della ricerca, da tutto lo storico</small>
        ) : (
          <small className="tk-archivio-hint">tutto lo storico, dal più recente</small>
        )}
      </button>

      {aperto ? (
        <>
          {righe.length === 0 && !caricando ? (
            <p className="tk-archivio-vuoto">{cercando ? `Nessun task tra i ${titolo.toLowerCase()} corrisponde alla ricerca.` : `Nessun task tra i ${titolo.toLowerCase()}.`}</p>
          ) : null}
          <ul className="tk-righe">
            {righe.map((r) => {
              const lista = mostraLista ? listaDi.get(r.listaId) : undefined
              return (
                <li key={r.id} className="tk-riga-li">
                  <div role="button" tabIndex={0} data-tk-riga="" className="tk-riga" data-chiuso=""
                    data-active={r.id === selezionatoId ? '' : undefined} aria-label={r.titolo}
                    onClick={() => onApri(r.id)} onKeyDown={(e) => tastiRiga(e, () => onApri(r.id))}>
                    <TaskRigaCheck riga={r} onToggle={() => void riapri(r)} />
                    <span className="tk-riga-main">
                      <span className="tk-riga-title"><b>{r.titolo}</b><TaskIdBadge riga={r} /></span>
                      {lista || r.paziente ? (
                        <span className="tk-riga-sub">
                          <TaskListaDot lista={lista} />
                          <TaskPazienteTag riga={r} />
                        </span>
                      ) : null}
                    </span>
                    <span className="tk-riga-side">
                      <span className="tk-riga-when tk-archivio-quando">{quandoChiuso(r)}</span>
                      <TaskAvatarStack persone={r.assegnatari} max={2} size="xs" />
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
          {altre || (caricando && righe.length > 0) ? (
            <button type="button" className="tk-archivio-altri" onClick={() => void altrePagine()} disabled={caricando}>
              {caricando ? <Loader2 className="tk-spin" aria-hidden /> : null}
              Mostra altri{totale != null ? ` (${(totale - righe.length).toLocaleString('it-IT')} rimanenti)` : ''}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
