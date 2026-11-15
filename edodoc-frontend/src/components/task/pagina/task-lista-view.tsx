import { Fragment, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, CornerDownLeft, ListTree, Loader2, Plus } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { TaskSelettore } from '@/components/task/task-selettore'
import { TaskQuickAddInput } from '@/components/task/task-quick-add'
import { parseQuickAdd, type QuickAddRisultato } from '@/lib/task-quick-add'
import { TaskEtichettaChip } from '@/components/task/task-ui'
import { useTaskConfig } from '@/hooks/use-task-config'
import type { TaskColonneStato } from '@/hooks/use-task-colonne'
import { COLONNA_DI, larghezzaColonna, totaleColonna, varLarghezza, type TaskColonnaId } from '@/lib/task-colonne'
import {
  TASK_STATI,
  isStatoChiuso,
  type AggiornaTaskValori,
  type TaskColonnaScelta,
  type TaskConfig,
  type TaskRiga,
  type TaskStato,
} from '@/services/task-service'
import {
  extraDaQuickAdd, ordina, tastiRiga, type TaskCreaRapido, type TaskCreaRapidoExtra, type TaskCreaSottotask, type TaskOrdinamento,
  type TaskOrdinamentoCampo,
} from './task-pagina-utils'
import { TaskContatori, TaskIdBadge, TaskPazienteTag, TaskPrincipaleTag, TaskRigaCheck, TaskRigaPosticipa } from './task-riga-meta'
import { TaskEmpty, TaskSkeletonRighe } from './task-empty'
import { TaskMenuRiga } from './task-menu-contestuale'
import { CellaColonna, type ContestoCella } from './task-colonne-celle'
import { TaskAggiungiColonna, TaskIntestazioniColonne } from './task-colonne-intestazione'
import { TaskColonnePannello } from './task-colonne-pannello'

interface Props {
  config: TaskConfig
  righe: TaskRiga[]
  loading: boolean
  mostraLista: boolean
  ordinamento: TaskOrdinamento
  onOrdinamento: (o: TaskOrdinamento) => void
  aggiornaRiga: (id: number, v: AggiornaTaskValori) => Promise<TaskRiga | null>
  onToggleCompleta: (riga: TaskRiga, el: HTMLButtonElement) => Promise<TaskRiga | null>
  onApri: (id: number) => void
  selezionatoId: number | null
  selezionati: Set<number>
  onSelezionati: (s: Set<number>) => void
  /** null = aggiunta rapida non disponibile */
  onCreaRapido: TaskCreaRapido | null
  /** «+» accanto al titolo di un task principale: sottotask senza aprirlo */
  onCreaSottotask?: TaskCreaSottotask
  onNuovo: () => void
  cercando: boolean
  /** Colonne scelte dall'utente (useTaskColonne) */
  colonne: TaskColonneStato
}

/** Colonne con un controllo dentro: il clic non apre il dettaglio e il valore vuoto compare al passaggio. */
const MODIFICABILI = new Set<TaskColonnaId>(['assegnatari', 'scadenza', 'stima', 'priorita', 'stato', 'inizio', 'etichette', 'paziente'])
const QUIETE_SE_VUOTE: Partial<Record<TaskColonnaId, (r: TaskRiga) => boolean>> = {
  stima: (r) => !r.stimaMinuti,
  priorita: (r) => !r.priorita,
}
/** Larghezze fisse ai lati: selezione, titolo minimo, «+» finale; più rientri e spazi fra colonne (rem → px). */
const SEL_PX = 32
const TITOLO_MIN_PX = 288
const PIU_PX = 36
const LATI_PX = 24
const SPAZIO_PX = 8

export function TaskListaView({
  config, righe, loading, mostraLista, ordinamento, onOrdinamento, aggiornaRiga, onToggleCompleta, onApri,
  selezionatoId, selezionati, onSelezionati, onCreaRapido, onCreaSottotask, onNuovo, cercando, colonne,
}: Props) {
  const [chiusi, setChiusi] = useState<Partial<Record<TaskStato, boolean>>>({})
  const listaDi = useMemo(() => new Map(config.liste.map((l) => [l.id, l])), [config.liste])
  const selezione = selezionati.size > 0

  // La colonna Lista ha senso solo dove si vedono più liste
  const scelte = useMemo(() => colonne.colonne.filter((c) => c.id !== 'lista' || mostraLista), [colonne.colonne, mostraLista])
  const inVista = useMemo(() => new Set(scelte.map((c) => c.id)), [scelte])
  const stileColonne = useMemo(() => {
    const st: Record<string, string> = {
      '--tk-cols-scelte': `${SEL_PX}px minmax(${TITOLO_MIN_PX}px, 1fr) ${scelte.map((c) => `var(${varLarghezza(c.id)})`).join(' ')} ${PIU_PX}px`,
    }
    scelte.forEach((c) => { st[varLarghezza(c.id)] = `${larghezzaColonna(c)}px` })
    return st as CSSProperties
  }, [scelte])
  // Troppe colonne per lo schermo: la tabella scorre di lato (e il titolo resta fermo a sinistra)
  const contenitore = useRef<HTMLDivElement | null>(null)
  const [larga, setLarga] = useState(false)
  const larghezzaMinima = SEL_PX + TITOLO_MIN_PX + PIU_PX + LATI_PX + SPAZIO_PX * (scelte.length + 2)
    + scelte.reduce((s, c) => s + larghezzaColonna(c), 0)
  useLayoutEffect(() => {
    const el = contenitore.current
    if (!el) return
    const misura = () => setLarga(el.clientWidth > 0 && larghezzaMinima > el.clientWidth)
    misura()
    const ro = new ResizeObserver(misura)
    ro.observe(el)
    return () => ro.disconnect()
  }, [larghezzaMinima, loading])
  const ctxOrdina = useMemo(() => ({
    nomeLista: (id: number) => listaDi.get(id)?.nome,
  }), [listaDi])

  // Sottotask sotto il loro task, come su ClickUp: se il principale è nell'elenco stanno lì (in ordine), altrimenti
  // (es. una ricerca che trova solo il sottotask) compaiono da soli, col titolo del principale
  const sottotaskDi = useMemo(() => {
    const ids = new Set(righe.map((r) => r.id))
    const m = new Map<number, TaskRiga[]>()
    for (const r of righe) {
      if (r.parentId != null && ids.has(r.parentId)) m.set(r.parentId, [...(m.get(r.parentId) ?? []), r])
    }
    m.forEach((figli) => figli.sort((a, b) => a.ordine - b.ordine || a.id - b.id))
    return m
  }, [righe])
  const [aperti, setAperti] = useState<Set<number>>(new Set())
  const toggleAperto = (id: number) => setAperti((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  // Task sotto cui si sta scrivendo un sottotask nuovo: i suoi sottotask si aprono e il campo sta in fondo
  const [nuovoSottoDi, setNuovoSottoDi] = useState<number | null>(null)
  const apriNuovoSotto = (id: number) => {
    setNuovoSottoDi(id)
    setAperti((prev) => new Set(prev).add(id))
  }

  const gruppi = useMemo(() => {
    const annidati = new Set([...sottotaskDi.values()].flat().map((r) => r.id))
    const ordinate = ordina(righe.filter((r) => !annidati.has(r.id)), ordinamento, ctxOrdina)
    // Solo gli stati aperti, ciascuno nel suo riquadro: completati e annullati hanno i loro (archivio) sotto
    return TASK_STATI.filter((s) => !s.chiuso).map((s) => ({ ...s, righe: ordinate.filter((r) => r.stato === s.value) }))
  }, [righe, ordinamento, sottotaskDi, ctxOrdina])

  const ordinaPer = (campo: TaskOrdinamentoCampo) =>
    onOrdinamento(ordinamento.campo === campo
      ? { campo, dir: ordinamento.dir === 'asc' ? 'desc' : 'asc' }
      : { campo, dir: campo === 'aggiornato' ? 'desc' : 'asc' })

  // Shift+clic seleziona (o deseleziona) tutte le righe visibili fra l'ultima toccata e questa, come in Gmail
  const ultimaToccata = useRef<number | null>(null)
  const ordineVisibile = useRef<number[]>([])
  const toggleSel = (id: number, intervallo = false) => {
    const next = new Set(selezionati)
    const seleziona = !next.has(id)
    const ordine = ordineVisibile.current
    const da = ultimaToccata.current != null ? ordine.indexOf(ultimaToccata.current) : -1
    const a = ordine.indexOf(id)
    if (intervallo && da >= 0 && a >= 0) {
      for (const x of ordine.slice(Math.min(da, a), Math.max(da, a) + 1)) {
        if (seleziona) next.add(x)
        else next.delete(x)
      }
    } else if (seleziona) next.add(id)
    else next.delete(id)
    ultimaToccata.current = id
    onSelezionati(next)
  }

  const toggleGruppo = (ids: number[]) => {
    const tutti = ids.every((id) => selezionati.has(id))
    const next = new Set(selezionati)
    ids.forEach((id) => (tutti ? next.delete(id) : next.add(id)))
    onSelezionati(next)
  }

  ordineVisibile.current = gruppi.flatMap((g) => (chiusi[g.value] ? [] : g.righe.flatMap((r) =>
    [r.id, ...(aperti.has(r.id) ? (sottotaskDi.get(r.id) ?? []).map((x) => x.id) : [])])))

  if (loading) return <TaskSkeletonRighe n={8} />
  if (!righe.length && cercando) return <TaskEmpty variante="filtri" />
  if (!righe.length && !onCreaRapido) return <TaskEmpty variante="lista" onNuovo={onNuovo} />

  const bottoneOrdinaTitolo = (
    <button type="button" className="tk-sort" data-active={ordinamento.campo === 'titolo' ? '' : undefined}
      onClick={(e) => {
        e.stopPropagation()
        ordinaPer('titolo')
      }}>
      Task
      {ordinamento.campo === 'titolo' ? (ordinamento.dir === 'asc' ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />) : null}
    </button>
  )
  const ariaSort = (campo: TaskOrdinamentoCampo | null) =>
    campo && ordinamento.campo === campo ? (ordinamento.dir === 'asc' ? 'ascending' : 'descending') : undefined
  const ctxCella = (r: TaskRiga): ContestoCella => ({
    config, lista: listaDi.get(r.listaId), aggiornaRiga, onToggleCompleta,
  })

  return (
    <div className="tk-tabelle" data-colonne="" data-larga={larga ? '' : undefined} ref={contenitore} style={stileColonne}>
      {gruppi.map((g) => {
        const vuoto = g.righe.length === 0
        // I gruppi chiusi vuoti non servono; quelli aperti vuoti mostrano solo l'aggiunta rapida (solo "Da fare")
        if (vuoto && (g.chiuso || !onCreaRapido || g.value !== 'DA_FARE')) return null
        const chiuso = chiusi[g.value] ?? false
        const ids = g.righe.map((r) => r.id)
        const tuttiSel = ids.length > 0 && ids.every((id) => selezionati.has(id))
        return (
          <div key={g.value} className="tk-table" data-con-lista={mostraLista ? '' : undefined} data-selezione={selezione ? '' : undefined}
            role="table" aria-label={`Task: ${g.label}`}>
            <section className="tk-group" data-stato={g.value} role="rowgroup">
              {/* L'header è lo stato del riquadro: un clic ovunque lo chiude o lo riapre */}
              <div className="tk-thead" role="row" data-chiuso={chiuso ? '' : undefined}
                onClick={() => setChiusi((c) => ({ ...c, [g.value]: !chiuso }))}>
                <span className="tk-c-sel" role="columnheader" aria-label="Selezione" onClick={(e) => e.stopPropagation()}>
                  {ids.length ? (
                    <TaskSelettore selezionato={tuttiSel} parziale={!tuttiSel && ids.some((id) => selezionati.has(id))}
                      onCambia={() => toggleGruppo(ids)} etichetta={tuttiSel ? `Deseleziona ${g.label}` : `Seleziona tutti: ${g.label}`}
                      className="tk-group-check" />
                  ) : null}
                </span>
                <span className="tk-c-titolo" role="columnheader" aria-sort={ariaSort('titolo')}>
                  <button type="button" className="tk-group-toggle" aria-expanded={!chiuso}>
                    <ChevronDown className="tk-chevron" data-closed={chiuso ? '' : undefined} aria-hidden />
                    <span className="tk-group-dot" aria-hidden />
                    <b>{g.label}</b>
                    <em>{g.righe.length}</em>
                  </button>
                  {!chiuso ? bottoneOrdinaTitolo : null}
                </span>
                {!chiuso ? (
                  <>
                    <TaskIntestazioniColonne colonne={scelte} stato={colonne} ordinamento={ordinamento} onOrdina={onOrdinamento}
                      totale={(id) => totaleColonna(id, g.righe)} contenitore={() => contenitore.current} />
                    <TaskAggiungiColonna>
                      <TaskColonnePannello stato={colonne} mostraLista={mostraLista}>
                        <button type="button" className="tk-hc-piu-btn" aria-label="Scegli le colonne" title="Scegli le colonne">
                          <Plus aria-hidden />
                        </button>
                      </TaskColonnePannello>
                    </TaskAggiungiColonna>
                  </>
                ) : null}
              </div>
              {!chiuso ? (
                <>
                  {g.righe.map((r) => {
                    const figli = sottotaskDi.get(r.id) ?? []
                    const aperto = aperti.has(r.id)
                    return (
                      <Fragment key={r.id}>
                        <Riga riga={r} scelte={scelte} inVista={inVista} ctx={ctxCella(r)}
                          attivo={r.id === selezionatoId} selezionato={selezionati.has(r.id)} onSel={(shift) => toggleSel(r.id, shift)}
                          onApri={onApri} onToggleCompleta={onToggleCompleta}
                          sottotask={figli.length ? { aperto, onToggle: () => toggleAperto(r.id) } : undefined}
                          onNuovoSottotask={onCreaSottotask && r.parentId == null ? () => apriNuovoSotto(r.id) : undefined} />
                        {aperto ? figli.map((s) => (
                          <Riga key={s.id} riga={s} scelte={scelte} inVista={inVista} ctx={ctxCella(s)}
                            attivo={s.id === selezionatoId} selezionato={selezionati.has(s.id)} onSel={(shift) => toggleSel(s.id, shift)}
                            onApri={onApri} onToggleCompleta={onToggleCompleta} annidato />
                        )) : null}
                        {nuovoSottoDi === r.id && onCreaSottotask ? (
                          <NuovoSottotask principale={r.titolo} onCrea={(titolo, extra) => onCreaSottotask(r, titolo, extra)}
                            onChiudi={() => setNuovoSottoDi(null)} />
                        ) : null}
                      </Fragment>
                    )
                  })}
                  {onCreaRapido && !g.chiuso ? <AggiuntaRapida stato={g.value} onCrea={onCreaRapido} /> : null}
                </>
              ) : null}
            </section>
          </div>
        )
      })}
    </div>
  )
}

function Riga({ riga, scelte, inVista, ctx, attivo, selezionato, onSel, onApri, onToggleCompleta, sottotask, annidato, onNuovoSottotask }: {
  /** Ha sottotask nell'elenco: freccia per mostrarli sotto */
  sottotask?: { aperto: boolean; onToggle: () => void }
  /** «+» accanto al titolo: scrive un sottotask sotto la riga senza aprire il task */
  onNuovoSottotask?: () => void
  /** È un sottotask mostrato sotto il suo task */
  annidato?: boolean
  riga: TaskRiga
  scelte: TaskColonnaScelta[]
  /** Colonne in vista: quello che mostrano non si ripete sotto il titolo */
  inVista: Set<string>
  ctx: ContestoCella
  attivo: boolean
  selezionato: boolean
  /** true con Shift: seleziona l'intervallo dall'ultima riga toccata */
  onSel: (shift: boolean) => void
  onApri: (id: number) => void
  onToggleCompleta: Props['onToggleCompleta']
}) {
  const chiuso = isStatoChiuso(riga.stato)
  // I controlli inline non devono aprire il dettaglio
  const ferma = (e: React.SyntheticEvent) => e.stopPropagation()
  // Sottotask da solo (principale non nell'elenco): mostra di chi è
  const principaleFuori = riga.parentId != null && !annidato
  const nascondi = { commenti: inVista.has('commenti'), allegati: inVista.has('allegati'), checklist: inVista.has('checklist') }
  const etichette = inVista.has('etichette') ? [] : riga.etichette
  const paziente = !inVista.has('paziente') && riga.paziente
  const sub = paziente || etichette.length || (riga.commenti && !nascondi.commenti) || (riga.allegati && !nascondi.allegati)
    || (riga.checklistTotale && !nascondi.checklist) || riga.sottotaskTotale || principaleFuori
  return (
    <TaskMenuRiga riga={riga}>
      <div role="row" tabIndex={0} data-tk-riga="" className="tk-row" data-active={attivo ? '' : undefined}
        data-selected={selezionato ? '' : undefined} data-chiuso={chiuso ? '' : undefined}
        data-sottotask={annidato ? '' : undefined}
        aria-label={riga.titolo} onClick={() => onApri(riga.id)} onKeyDown={(e) => tastiRiga(e, () => onApri(riga.id))}>
        <span className="tk-c-sel" role="cell" onClick={ferma}>
          <TaskSelettore selezionato={selezionato} onCambia={(e) => onSel(e.shiftKey)}
            etichetta={selezionato ? `Deseleziona ${riga.titolo}` : `Seleziona ${riga.titolo}`} />
        </span>
        <span className="tk-c-titolo" role="cell">
          {sottotask ? (
            <button type="button" className="tk-sotto-toggle" aria-expanded={sottotask.aperto}
              aria-label={sottotask.aperto ? 'Nascondi i sottotask' : 'Mostra i sottotask'}
              onClick={(e) => { e.stopPropagation(); sottotask.onToggle() }}>
              <ChevronDown className="tk-chevron" data-closed={sottotask.aperto ? undefined : ''} aria-hidden />
            </button>
          ) : <span className="tk-sotto-spazio" aria-hidden />}
          <TaskRigaCheck riga={riga} onToggle={(el) => void onToggleCompleta(riga, el)} />
          <span className="tk-riga-main">
            <span className="tk-riga-title">
              <b>{riga.titolo}</b>
              <TaskIdBadge riga={riga} />
              {onNuovoSottotask ? (
                <button type="button" className="tk-sotto-add" title="Aggiungi un sottotask" aria-label={`Aggiungi un sottotask a ${riga.titolo}`}
                  onClick={(e) => { e.stopPropagation(); onNuovoSottotask() }} onKeyDown={(e) => e.stopPropagation()}>
                  <Plus aria-hidden />
                </button>
              ) : null}
            </span>
            {sub ? (
              <span className="tk-riga-sub">
                {principaleFuori ? <TaskPrincipaleTag riga={riga} /> : null}
                {riga.sottotaskTotale ? (
                  <button type="button" className="tk-sotto-count" data-done={riga.sottotaskCompletati === riga.sottotaskTotale ? '' : undefined}
                    title={sottotask ? (sottotask.aperto ? 'Nascondi i sottotask' : 'Mostra i sottotask') : `${riga.sottotaskTotale} sottotask`}
                    onClick={(e) => { if (sottotask) { e.stopPropagation(); sottotask.onToggle() } }}>
                    <ListTree aria-hidden />{riga.sottotaskCompletati}/{riga.sottotaskTotale}
                  </button>
                ) : null}
                {paziente ? <TaskPazienteTag riga={riga} /> : null}
                {etichette.map((e) => <TaskEtichettaChip key={e.id} etichetta={e} />)}
                <TaskContatori riga={riga} senzaSottotask nascondi={nascondi} />
              </span>
            ) : null}
          </span>
          <TaskRigaPosticipa riga={riga}
            onPosticipa={(s, o) => void ctx.aggiornaRiga(riga.id, { scadenza: s, scadenzaOra: o })} />
        </span>
        {scelte.map((c) => {
          const id = c.id as TaskColonnaId
          const controllo = MODIFICABILI.has(id)
          return (
            <span key={id} role="cell" className={`tk-cc tk-c-${id}${controllo ? ' tk-cell-quiet' : ''}`} data-col={id}
              data-allinea={COLONNA_DI.get(id)?.allinea} data-vuota={QUIETE_SE_VUOTE[id]?.(riga) ? '' : undefined}
              onClick={controllo || id === 'codice' ? ferma : undefined}>
              <CellaColonna id={id} riga={riga} ctx={ctx} />
            </span>
          )
        })}
        <span className="tk-cc-piu" aria-hidden />
      </div>
    </TaskMenuRiga>
  )
}

/**
 * "+ Aggiungi task" in fondo a un gruppo o a una colonna: si scrive in linguaggio naturale
 * ("Chiamare Rossi domani 15 @Carlos !alta") e Invio crea il task con quanto riconosciuto.
 */
export function AggiuntaRapida({ stato, onCrea }: { stato: TaskStato; onCrea: TaskCreaRapido }) {
  const { config } = useTaskConfig()
  const { utente } = useAuth()
  const [attivo, setAttivo] = useState(false)
  const [testo, setTesto] = useState('')
  const [salvando, setSalvando] = useState(false)

  const contesto = useMemo(() => ({
    operatori: config?.operatori ?? [],
    etichette: config?.etichette ?? [],
    liste: (config?.liste ?? []).filter((l) => !l.archiviata),
    meId: utente?.id,
  }), [config, utente?.id])

  const invia = async (r?: QuickAddRisultato) => {
    const risultato = r ?? parseQuickAdd(testo, contesto)
    const titolo = risultato.titolo.trim()
    if (!titolo || salvando) return
    setSalvando(true)
    const ok = await onCrea(titolo, stato, extraDaQuickAdd(risultato))
    setSalvando(false)
    if (ok) setTesto('')
  }

  if (!attivo) {
    return (
      <button type="button" className="tk-quick-add" onClick={() => setAttivo(true)}>
        <Plus aria-hidden /> Aggiungi task
      </button>
    )
  }
  return (
    <div className="tk-quick-add tk-quick-add--open"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !testo.trim()) setAttivo(false)
      }}>
      <span className="tk-quick-add-icon" aria-hidden>{salvando ? <Loader2 className="animate-spin" /> : <Plus />}</span>
      <TaskQuickAddInput value={testo} onChange={setTesto} contesto={contesto} size="sm" autoFocus
        className="tk-quick-add-input" placeholder="Es. Richiamare Rossi domani 15 @Carlos !alta"
        onSubmit={(r) => void invia(r)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setTesto('')
            setAttivo(false)
          }
        }} />
      <span className="tk-quick-add-hint" aria-hidden><CornerDownLeft /> Invio</span>
    </div>
  )
}

/**
 * Sottotask nuovo scritto sotto il suo task, come su ClickUp: Invio lo crea e il campo resta aperto per il prossimo,
 * Esc (o uscire col campo vuoto) chiude. Si scrive come nell'aggiunta rapida: «domani 15 @Carlos !alta».
 */
function NuovoSottotask({ principale, onCrea, onChiudi }: {
  principale: string
  onCrea: (titolo: string, extra?: TaskCreaRapidoExtra) => Promise<boolean>
  onChiudi: () => void
}) {
  const { config } = useTaskConfig()
  const { utente } = useAuth()
  const [testo, setTesto] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Il sottotask sta nella lista del principale: niente «/lista» nei suggerimenti
  const contesto = useMemo(() => ({
    operatori: config?.operatori ?? [],
    etichette: config?.etichette ?? [],
    liste: [],
    meId: utente?.id,
  }), [config, utente?.id])

  const invia = async (r?: QuickAddRisultato) => {
    const risultato = r ?? parseQuickAdd(testo, contesto)
    const titolo = risultato.titolo.trim()
    if (!titolo || salvando) return
    setSalvando(true)
    const ok = await onCrea(titolo, extraDaQuickAdd(risultato))
    setSalvando(false)
    if (ok) setTesto('')
  }

  return (
    <div className="tk-quick-add tk-quick-add--open tk-sotto-nuovo"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !testo.trim() && !salvando) onChiudi()
      }}>
      <span className="tk-quick-add-icon" aria-hidden>{salvando ? <Loader2 className="animate-spin" /> : <ListTree />}</span>
      <TaskQuickAddInput value={testo} onChange={setTesto} contesto={contesto} size="sm" autoFocus
        className="tk-quick-add-input" placeholder={`Sottotask di «${principale}»`} aria-label={`Nuovo sottotask di ${principale}`}
        onSubmit={(r) => void invia(r)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setTesto('')
            onChiudi()
          }
        }} />
      <span className="tk-quick-add-hint" aria-hidden><CornerDownLeft /> Invio</span>
    </div>
  )
}
