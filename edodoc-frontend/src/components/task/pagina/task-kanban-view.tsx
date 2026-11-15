import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  defaultDropAnimationSideEffects,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CornerDownRight, ListTree, MessageSquare, Paperclip, Plus, User } from 'lucide-react'
import { nomeCompleto } from '@/lib/task-nomi'
import { TaskAvatarStack, formatScadenza, isInScadenzaOggi, isScaduto } from '@/components/task/task-ui'
import { useAuth } from '@/contexts/auth-context'
import { TaskStimaLabel } from '@/components/task/task-stima'
import { TaskCheck } from '@/components/task/task-check'
import { TaskPosticipaMenu } from '@/components/task/task-posticipa'
import { TaskQuickAddInput } from '@/components/task/task-quick-add'
import { parseQuickAdd, type QuickAddContesto, type QuickAddRisultato } from '@/lib/task-quick-add'
import { celebra } from '@/lib/task-festa'
import { toast } from '@/lib/toast'
import {
  TASK_STATI,
  isStatoChiuso,
  type AggiornaTaskValori,
  type CreaTaskRequest,
  type TaskConfig,
  type TaskLista,
  type TaskRiga,
  type TaskStato,
} from '@/services/task-service'
import { confrontaOrdine, ordineTra } from './task-pagina-utils'
import { TaskSkeletonKanban } from './task-empty'
import { TaskIdBadge } from './task-riga-meta'
import { TaskMenuRiga } from './task-menu-contestuale'
import '@/style/lux-task-board.css'

type Colonne = Record<TaskStato, number[]>

/** Quanti completati mostrare prima di "Mostra tutti". */
const MAX_COMPLETATI = 30

/** Campi in più riconosciuti dall'aggiunta rapida (scadenza, priorità, …), da passare alla creazione. */
export type TaskCreaRapidoExtra = Partial<Omit<CreaTaskRequest, 'titolo' | 'stato'>>

interface Props {
  config: TaskConfig
  righe: TaskRiga[]
  loading: boolean
  /** "Mostra completati" della pagina: mostra anche gli annullati e tutti i completati */
  mostraChiusi: boolean
  mostraLista: boolean
  aggiornaRiga: (id: number, v: AggiornaTaskValori) => Promise<TaskRiga | null>
  onApri: (id: number) => void
  selezionatoId: number | null
  /** null = niente aggiunta rapida (es. vista "Tutti i task") */
  onCreaRapido: ((titolo: string, stato: TaskStato, extra?: TaskCreaRapidoExtra) => Promise<boolean>) | null
}

function costruisciColonne(righe: TaskRiga[], tuttiCompletati: boolean): Colonne {
  const out = { DA_FARE: [], IN_CORSO: [], IN_ATTESA: [], COMPLETATO: [], ANNULLATO: [] } as Colonne
  for (const r of [...righe].sort(confrontaOrdine)) out[r.stato].push(r.id)
  if (!tuttiCompletati) {
    // I completati più recenti in cima: gli altri con "Mostra tutti"
    out.COMPLETATO = righe
      .filter((r) => r.stato === 'COMPLETATO')
      .sort((a, b) => (b.completatoIl ?? b.aggiornatoIl).localeCompare(a.completatoIl ?? a.aggiornatoIl))
      .slice(0, MAX_COMPLETATI)
      .map((r) => r.id)
  }
  return out
}

const dropAnimation: DropAnimation = {
  duration: 220,
  easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)',
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.35' } } }),
}

export function TaskKanbanView({
  config, righe, loading, mostraChiusi, mostraLista, aggiornaRiga, onApri, selezionatoId, onCreaRapido,
}: Props) {
  const { utente } = useAuth()
  const [tuttiCompletati, setTuttiCompletati] = useState(false)
  const perId = useMemo(() => new Map(righe.map((r) => [r.id, r])), [righe])
  const listaDi = useMemo(() => new Map(config.liste.map((l) => [l.id, l])), [config.liste])
  // Un sottotask sta nella card del suo task (contatore); da solo solo se il principale non è sulla bacheca
  const righeCard = useMemo(() => {
    const ids = new Set(righe.map((r) => r.id))
    return righe.filter((r) => r.parentId == null || !ids.has(r.parentId))
  }, [righe])
  const base = useMemo(() => costruisciColonne(righeCard, tuttiCompletati || mostraChiusi), [righeCard, tuttiCompletati, mostraChiusi])
  const [colonne, setColonne] = useState<Colonne>(base)
  const [attivoId, setAttivoId] = useState<number | null>(null)
  const [appenaChiusi, setAppenaChiusi] = useState<Set<number>>(new Set())

  // Fuori dal trascinamento le colonne seguono i dati
  useEffect(() => {
    if (attivoId == null) setColonne(base)
  }, [base, attivoId])

  const stati: TaskStato[] = ['DA_FARE', 'IN_CORSO', 'IN_ATTESA', 'COMPLETATO', ...(mostraChiusi ? ['ANNULLATO' as const] : [])]

  const contesto: QuickAddContesto = useMemo(() => ({
    operatori: config.operatori,
    etichette: config.etichette,
    liste: config.liste.filter((l) => !l.archiviata),
    meId: utente?.id,
  }), [config, utente?.id])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const colonnaDi = (id: number | string, cols: Colonne): TaskStato | null => {
    if (typeof id === 'string' && id.startsWith('col:')) return id.slice(4) as TaskStato
    const n = Number(id)
    return (Object.keys(cols) as TaskStato[]).find((s) => cols[s].includes(n)) ?? null
  }

  const onDragStart = (e: DragStartEvent) => {
    setAttivoId(Number(e.active.id))
    try {
      navigator.vibrate?.(8)
    } catch {
      /* non supportato */
    }
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    setColonne((cols) => {
      const da = colonnaDi(active.id, cols)
      const a = colonnaDi(over.id, cols)
      if (!da || !a || da === a) return cols
      const id = Number(active.id)
      const dest = cols[a].filter((x) => x !== id)
      const overIdx = typeof over.id === 'string' ? 0 : dest.indexOf(Number(over.id))
      dest.splice(overIdx < 0 ? dest.length : overIdx, 0, id)
      return { ...cols, [da]: cols[da].filter((x) => x !== id), [a]: dest }
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = Number(active.id)
    setAttivoId(null)
    if (!over) {
      setColonne(base)
      return
    }
    const stato = colonnaDi(active.id, colonne)
    if (!stato) return
    let ids = colonne[stato]
    const overId = typeof over.id === 'string' ? null : Number(over.id)
    if (overId != null && overId !== id && ids.includes(overId)) {
      ids = arrayMove(ids, ids.indexOf(id), ids.indexOf(overId))
    }
    setColonne({ ...colonne, [stato]: ids })
    void salvaPosizione(id, stato, ids)
  }

  const salvaPosizione = async (id: number, stato: TaskStato, ids: number[]) => {
    const riga = perId.get(id)
    if (!riga) return
    const idx = ids.indexOf(id)
    const prima = idx > 0 ? perId.get(ids[idx - 1])?.ordine ?? null : null
    const dopo = idx < ids.length - 1 ? perId.get(ids[idx + 1])?.ordine ?? null : null
    const ordine = ordineTra(prima, dopo)
    const cambiaStato = riga.stato !== stato
    if (cambiaStato && stato === 'COMPLETATO') segnaAppenaChiuso(id)
    if (ordine != null) {
      if (!cambiaStato && ordine === riga.ordine) return
      await aggiornaRiga(id, cambiaStato ? { stato, ordine } : { ordine })
      return
    }
    // Nessuno spazio tra i vicini (ordini uguali): si rinumera la colonna a passi di 1000
    await Promise.all(ids.map((x, i) => {
      const r = perId.get(x)
      const nuovo = (i + 1) * 1000
      if (x === id) return aggiornaRiga(x, cambiaStato ? { stato, ordine: nuovo } : { ordine: nuovo })
      return r && r.ordine !== nuovo ? aggiornaRiga(x, { ordine: nuovo }) : Promise.resolve(null)
    }))
  }

  const segnaAppenaChiuso = (id: number) => {
    setAppenaChiusi((s) => new Set(s).add(id))
    window.setTimeout(() => setAppenaChiusi((s) => {
      const n = new Set(s)
      n.delete(id)
      return n
    }), 600)
  }

  const completa = async (riga: TaskRiga, el: HTMLElement) => {
    const fatto = riga.stato === 'COMPLETATO'
    const nuovo: TaskStato = fatto ? 'DA_FARE' : 'COMPLETATO'
    if (!fatto) {
      celebra(el)
      segnaAppenaChiuso(riga.id)
    }
    const r = await aggiornaRiga(riga.id, { stato: nuovo })
    if (r && !fatto) {
      toast.success('Completato', {
        description: riga.titolo,
        duration: 5000,
        action: { label: 'Annulla', onClick: () => void aggiornaRiga(riga.id, { stato: riga.stato }) },
      })
    }
  }

  const posticipa = async (riga: TaskRiga, scadenza: string | null, scadenzaOra: string | null) => {
    const r = await aggiornaRiga(riga.id, { scadenza, scadenzaOra })
    if (!r) return
    toast.success(scadenza ? `Spostato a ${formatScadenza(scadenza, scadenzaOra).toLowerCase()}` : 'Scadenza rimossa', {
      description: riga.titolo,
      duration: 5000,
      action: {
        label: 'Annulla',
        onClick: () => void aggiornaRiga(riga.id, { scadenza: riga.scadenza, scadenzaOra: riga.scadenzaOra }),
      },
    })
  }

  if (loading) return <TaskSkeletonKanban />

  const attivo = attivoId != null ? perId.get(attivoId) : undefined

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver}
      onDragEnd={onDragEnd} onDragCancel={() => {
        setAttivoId(null)
        setColonne(base)
      }}>
      <div className="tkb-board" style={{ ['--tkb-ncol' as string]: stati.length }}>
        {stati.map((s) => {
          const label = TASK_STATI.find((x) => x.value === s)!.label
          const ids = colonne[s]
          const totale = righeCard.filter((r) => r.stato === s).length
          const nascosti = s === 'COMPLETATO' ? totale - ids.length : 0
          return (
            <Colonna key={s} stato={s} label={label} ids={ids} totale={totale}
              aggiunta={onCreaRapido && !isStatoChiuso(s)
                ? <AggiuntaRapida stato={s} contesto={contesto} onCrea={onCreaRapido} />
                : null}>
              {ids.map((id) => {
                const r = perId.get(id)
                return r ? (
                  <Card key={id} riga={r} lista={mostraLista ? listaDi.get(r.listaId) : undefined}
                    attivo={id === selezionatoId} appenaChiuso={appenaChiusi.has(id)} onApri={onApri}
                    onCompleta={(el) => void completa(r, el)}
                    onPosticipa={(sc, ora) => void posticipa(r, sc, ora)} />
                ) : null
              })}
              {!ids.length ? (
                <div className="tkb-col-empty">{isStatoChiuso(s) ? 'Trascina qui per chiudere' : 'Nessun task'}</div>
              ) : null}
              {nascosti > 0 ? (
                <button type="button" className="tkb-col-more" onClick={() => setTuttiCompletati(true)}>
                  Mostra tutti ({totale})
                </button>
              ) : null}
              {s === 'COMPLETATO' && tuttiCompletati && !mostraChiusi && totale > MAX_COMPLETATI ? (
                <button type="button" className="tkb-col-more" onClick={() => setTuttiCompletati(false)}>
                  Mostra solo i più recenti
                </button>
              ) : null}
            </Colonna>
          )
        })}
      </div>
      <DragOverlay dropAnimation={dropAnimation}>
        {attivo ? <CardBody riga={attivo} lista={mostraLista ? listaDi.get(attivo.listaId) : undefined} overlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function Colonna({ stato, label, ids, totale, aggiunta, children }: {
  stato: TaskStato
  label: string
  ids: number[]
  totale: number
  aggiunta: React.ReactNode
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${stato}` })
  return (
    <section className="tkb-col" data-stato={stato} data-over={isOver ? '' : undefined} aria-label={`${label}, ${totale} task`}>
      <header className="tkb-col-head">
        <i aria-hidden />
        <b>{label}</b>
        <em>{totale}</em>
      </header>
      {aggiunta}
      <SortableContext id={`col:${stato}`} items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="tkb-col-body">{children}</div>
      </SortableContext>
    </section>
  )
}

/** "+ Aggiungi" in cima alla colonna: scrivi e premi Invio, con data, @persona, !priorità, #etichetta riconosciuti. */
function AggiuntaRapida({ stato, contesto, onCrea }: {
  stato: TaskStato
  contesto: QuickAddContesto
  onCrea: (titolo: string, stato: TaskStato, extra?: TaskCreaRapidoExtra) => Promise<boolean>
}) {
  const [aperta, setAperta] = useState(false)
  const [testo, setTesto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const contenitore = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement | null>(null)
  // Focus subito all'apertura: chi scrive di getto non deve finire nelle scorciatoie della pagina
  useLayoutEffect(() => {
    if (aperta) input.current?.focus()
  }, [aperta])

  const invia = async (r?: QuickAddRisultato) => {
    const p = r ?? parseQuickAdd(testo, contesto)
    if (!p.titolo.trim() || salvando) return
    setSalvando(true)
    const extra: TaskCreaRapidoExtra = {}
    if (p.scadenza) extra.scadenza = p.scadenza
    if (p.scadenzaOra) extra.scadenzaOra = p.scadenzaOra
    if (p.assegnatariIds.length) extra.assegnatariIds = p.assegnatariIds
    if (p.priorita) extra.priorita = p.priorita
    if (p.stimaMinuti) extra.stimaMinuti = p.stimaMinuti
    if (p.etichettaIds.length) extra.etichettaIds = p.etichettaIds
    if (p.listaId) extra.listaId = p.listaId
    const ok = await onCrea(p.titolo.trim(), stato, Object.keys(extra).length ? extra : undefined)
    setSalvando(false)
    if (ok) setTesto('')
  }

  if (!aperta) {
    return (
      <div className="tkb-quick">
        <button type="button" className="tkb-quick-add" onClick={() => setAperta(true)}>
          <Plus className="size-4" aria-hidden /> Aggiungi task
        </button>
      </div>
    )
  }

  return (
    <div className="tkb-quick" ref={contenitore}
      onBlur={(e) => {
        if (!testo.trim() && !contenitore.current?.contains(e.relatedTarget as Node | null)) setAperta(false)
      }}>
      <div className="tkb-quick-box">
        <TaskQuickAddInput value={testo} onChange={setTesto} contesto={contesto} size="sm" autoFocus inputRef={input}
          placeholder="Es. Richiamare Rossi domani 15 @Silvia"
          onSubmit={(r) => void invia(r)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setTesto('')
              setAperta(false)
            }
          }} />
        <div className="tkb-quick-hint">
          <span><kbd>Invio</kbd> crea · <kbd>Esc</kbd> chiude</span>
          {salvando ? <span>Salvo…</span> : null}
        </div>
      </div>
    </div>
  )
}

function Card({ riga, lista, attivo, appenaChiuso, onApri, onCompleta, onPosticipa }: {
  riga: TaskRiga
  lista: TaskLista | undefined
  attivo: boolean
  appenaChiuso: boolean
  onApri: (id: number) => void
  onCompleta?: (el: HTMLElement) => void
  onPosticipa?: (scadenza: string | null, scadenzaOra: string | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: riga.id })
  return (
    <TaskMenuRiga riga={riga}>
      <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
        className="tkb-card-wrap" data-dragging={isDragging ? '' : undefined} {...attributes} {...listeners}
        aria-label={riga.titolo}
        onClick={() => onApri(riga.id)}
        onKeyDown={(e) => {
          listeners?.onKeyDown?.(e)
          if (e.key === 'Enter' && !e.defaultPrevented) onApri(riga.id)
        }}>
        <CardBody riga={riga} lista={lista} attivo={attivo} appenaChiuso={appenaChiuso}
          onCompleta={onCompleta} onPosticipa={onPosticipa} />
      </div>
    </TaskMenuRiga>
  )
}

function CardBody({ riga, lista, attivo, overlay, appenaChiuso, onCompleta, onPosticipa }: {
  riga: TaskRiga
  lista: TaskLista | undefined
  attivo?: boolean
  overlay?: boolean
  appenaChiuso?: boolean
  onCompleta?: (el: HTMLElement) => void
  onPosticipa?: (scadenza: string | null, scadenzaOra: string | null) => void
}) {
  const chiuso = isStatoChiuso(riga.stato)
  const progresso = riga.checklistTotale ? Math.round((riga.checklistCompletati / riga.checklistTotale) * 100) : null
  const tono = isScaduto(riga) ? 'late' : isInScadenzaOggi(riga) ? 'today' : undefined
  const paziente = riga.paziente ? nomeCompleto(riga.paziente) : ''
  return (
    <article className="tkb-card" data-active={attivo ? '' : undefined} data-overlay={overlay ? '' : undefined}
      data-chiuso={chiuso ? '' : undefined} data-priorita={riga.priorita ?? undefined}
      data-giusto-chiuso={appenaChiuso ? '' : undefined}>
      <div className="tkb-card-top">
        <TaskCheck size="sm" completato={riga.stato === 'COMPLETATO'} disabled={!onCompleta || riga.stato === 'ANNULLATO'}
          onToggle={(el) => onCompleta?.(el)} />
        <p className="tkb-titolo">{riga.titolo}</p>
        {onPosticipa && !chiuso ? (
          <div className="tkb-card-actions" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}>
            <TaskPosticipaMenu scadenza={riga.scadenza} scadenzaOra={riga.scadenzaOra} onPosticipa={onPosticipa} />
          </div>
        ) : null}
      </div>
      <div className="tkb-card-meta">
        <span className="tkb-card-meta-info">
          <TaskIdBadge riga={riga} />
          {riga.scadenza ? (
            <span className="tkb-scad" data-tono={chiuso ? undefined : tono}>{formatScadenza(riga.scadenza, riga.scadenzaOra)}</span>
          ) : null}
          {riga.stimaMinuti ? <TaskStimaLabel minuti={riga.stimaMinuti} className="text-[12px]" /> : null}
          {riga.sottotaskTotale ? (
            <span className="tkb-sotto" data-done={riga.sottotaskCompletati === riga.sottotaskTotale ? '' : undefined}
              title={`${riga.sottotaskCompletati} di ${riga.sottotaskTotale} sottotask fatti`}>
              <ListTree aria-hidden />{riga.sottotaskCompletati}/{riga.sottotaskTotale}
            </span>
          ) : null}
          {riga.parentId != null ? (
            <span className="tkb-sotto" title={`Sottotask di «${riga.parentTitolo ?? ''}»`}><CornerDownRight aria-hidden /></span>
          ) : null}
          {paziente ? <span className="tkb-paz" title={paziente}><User aria-hidden />{paziente}</span> : null}
          {lista ? (
            <span className="tkb-lista" style={{ ['--tk-c' as string]: lista.colore }} title={lista.nome}>
              <i aria-hidden />{lista.nome}
            </span>
          ) : null}
          {riga.etichette.length ? (
            <span className="tkb-dots" title={riga.etichette.map((e) => e.nome).join(', ')}
              aria-label={`Etichette: ${riga.etichette.map((e) => e.nome).join(', ')}`}>
              {riga.etichette.map((e) => <i key={e.id} style={{ ['--tkb-dot' as string]: e.colore }} />)}
            </span>
          ) : null}
          {riga.commenti ? <span title={`${riga.commenti} commenti`}><MessageSquare aria-hidden />{riga.commenti}</span> : null}
          {riga.allegati ? <span title={`${riga.allegati} allegati`}><Paperclip aria-hidden />{riga.allegati}</span> : null}
        </span>
        {riga.assegnatari.length ? <TaskAvatarStack persone={riga.assegnatari} max={3} size="xs" /> : null}
      </div>
      {progresso != null ? (
        <div className="tkb-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso}
          aria-label={`Checklist ${riga.checklistCompletati} di ${riga.checklistTotale}`}
          title={`Checklist ${riga.checklistCompletati}/${riga.checklistTotale}`}>
          <span style={{ width: `${progresso}%` }} />
        </div>
      ) : null}
    </article>
  )
}
