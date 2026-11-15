import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronRight, Columns3Cog, Keyboard, Loader2, X } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { LuxHero } from '@/components/lux'
import { TaskCreaDialog, type TaskCreaPrefill } from '@/components/task/task-crea-dialog'
import { TaskDettaglioSheet } from '@/components/task/task-dettaglio-sheet'
import { formatScadenza } from '@/components/task/task-ui'
import { TaskCreaStrutturaDialog } from '@/components/task/task-crea-struttura-dialog'
import { listeDellaCartella, percorsoCartella } from '@/lib/task-struttura'
import { useTaskConfig } from '@/hooks/use-task-config'
import { useTaskFilters } from '@/hooks/use-task-filters'
import { useTaskRiepilogo } from '@/hooks/use-task-riepilogo'
import { emitTaskChanged } from '@/hooks/use-task-cambi'
import { celebra } from '@/lib/task-festa'
import { toast } from '@/lib/toast'
import {
  isStatoChiuso,
  taskService,
  type TaskCartella,
  type TaskFiltri,
  type TaskTipoStruttura,
  type TaskRiepilogo,
  type TaskRiga,
  type TaskStato,
} from '@/services/task-service'
import { TaskNavMobile, TaskRail } from './task-rail'
import {
  TaskFiltriPopover, TaskNuovoButton, TaskNuovoFab, TaskSearch, TaskVistaSwitch,
} from './task-toolbar'
import { TaskInbox } from './task-inbox'
import { TaskListaView } from './task-lista-view'
import { TaskColonnePannello } from './task-colonne-pannello'
import { useTaskColonne } from '@/hooks/use-task-colonne'
import { TaskKanbanView } from './task-kanban-view'
import { TaskCalendarioView } from './task-calendario-view'
import { TaskGanttView } from './task-gantt-view'
import { TaskBulkBar } from './task-bulk-bar'
import { TaskMenuProvider } from './task-menu-contestuale'
import { TaskArchivioChiusi, type TaskStatoArchivio } from './task-archivio-chiusi'
import { TaskEmpty } from './task-empty'
import { TaskScorciatoie } from './task-scorciatoie'
import { useTaskRighe } from './use-task-righe'
import {
  cartellaDaSelezione,
  gruppoScadenza,
  intervalloCalendario,
  isoGiorno,
  listaDaSelezione,
  messaggioErrore,
  parseSelezione,
  selezioneValida,
  spostaFuocoRiga,
  staScrivendo,
  type TaskCalendarioModo,
  type TaskCreaRapido,
  type TaskCreaSottotask,
  type TaskFiltroKpi,
  type TaskSelezione,
  type TaskVistaPagina,
} from './task-pagina-utils'
import '@/style/lux-task.css'
import '@/style/lux-task-colonne.css'

const VISTE_VALIDE = new Set<TaskVistaPagina>(['lista', 'kanban', 'calendario', 'gantt'])
/** Completati mostrati in kanban/lista: quelli chiusi di recente (gli aperti arrivano sempre tutti). */
const CHIUSI_RECENTI_GIORNI = 30
const CHIUSI_STORICO_GIORNI = 365
const STATI_ARCHIVIO: TaskStatoArchivio[] = ['COMPLETATO', 'ANNULLATO']

const eUrgente = (r: TaskRiga, oggi: Date) => {
  const g = gruppoScadenza(r, oggi)
  return g === 'ritardo' || g === 'oggi'
}

export function TaskPagina() {
  const { utente } = useAuth()
  const meId = utente?.id ?? null
  const { config, loading: configLoading, error: configError, reload: reloadConfig } = useTaskConfig()
  const { pref, aggiorna, aggiornaFiltri, resetFiltri } = useTaskFilters(meId)
  const { riepilogo } = useTaskRiepilogo()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchRef = useRef<HTMLInputElement>(null)

  // ---------- Stato dall'URL (con preferenze salvate come default) ----------
  const richiesta = parseSelezione(searchParams.get('lista')) ?? parseSelezione(pref.lista) ?? 'miei'
  // Una lista o cartella che non c'è più (archiviata, eliminata) riporta alla giornata
  const selezione: TaskSelezione = !config ? richiesta : selezioneValida(config, richiesta) ? richiesta : 'miei'
  const vistaParam = searchParams.get('vista') as TaskVistaPagina | null
  const vista: TaskVistaPagina = vistaParam && VISTE_VALIDE.has(vistaParam) ? vistaParam : pref.vista
  const taskAperto = Number(searchParams.get('task')) || null
  const listaId = listaDaSelezione(selezione)
  const cartellaId = cartellaDaSelezione(selezione)
  const lista = listaId != null ? config?.liste.find((l) => l.id === listaId) ?? null : null
  const colonne = useTaskColonne(listaId)
  const cartella = cartellaId != null ? config?.cartelle.find((c) => c.id === cartellaId) ?? null : null
  // Liste della cartella selezionata (sottocartelle comprese): servono per creare task e per sapere cosa è "qui"
  const listeCartella = useMemo(
    () => (config && cartellaId != null ? listeDellaCartella(config, cartellaId) : []),
    [config, cartellaId],
  )
  /** Ambito API della selezione (lista, cartella o tutto) */
  const ambito: TaskFiltri = listaId != null ? { listaId } : cartellaId != null ? { cartellaId } : { vista: 'TUTTI' }
  const ambitoChiave = JSON.stringify(ambito)

  const setParams = useCallback((patch: Record<string, string | null>, replace = false) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      Object.entries(patch).forEach(([k, v]) => (v == null ? next.delete(k) : next.set(k, v)))
      return next
    }, { replace })
  }, [setSearchParams])

  const [filtroKpi, setFiltroKpi] = useState<TaskFiltroKpi>(null)
  const [selezionati, setSelezionati] = useState<Set<number>>(new Set())

  const seleziona = (s: TaskSelezione) => {
    aggiorna({ lista: String(s) })
    setParams({ lista: String(s) })
    setSelezionati(new Set())
    setFiltroKpi(null)
  }
  const cambiaVista = (v: TaskVistaPagina) => {
    aggiorna({ vista: v })
    setParams({ vista: v })
    setSelezionati(new Set())
  }
  const apri = useCallback((id: number) => setParams({ task: String(id) }), [setParams])
  // Chiudere il dettaglio non aggiunge una voce di cronologia: "Indietro" non lo riapre
  const chiudiTask = useCallback(() => setParams({ task: null }, true), [setParams])

  // ---------- Ricerca (debounce) ----------
  const [qLive, setQLive] = useState(pref.filtri.q)
  const [q, setQ] = useState(pref.filtri.q)
  useEffect(() => {
    const t = setTimeout(() => setQ(qLive.trim()), 300)
    return () => clearTimeout(t)
  }, [qLive])

  // ---------- Calendario ----------
  const [riferimento, setRiferimento] = useState(() => new Date())
  const [modoCal, setModoCal] = useState<TaskCalendarioModo>('mese')
  const range = intervalloCalendario(riferimento, modoCal)
  const daIso = isoGiorno(range.da)
  const aIso = isoGiorno(range.a)

  // ---------- Caricamento ----------
  const f = pref.filtri
  const filtriApi: TaskFiltri | null = useMemo(() => {
    if (!config) return null
    const comuni: TaskFiltri = {
      q: q || undefined,
      priorita: f.priorita ?? undefined,
      etichettaId: f.etichettaId ?? undefined,
    }
    if (selezione === 'miei') {
      return { ...comuni, vista: 'MIEI', includiChiusi: false }
    }
    const base: TaskFiltri = {
      ...(JSON.parse(ambitoChiave) as TaskFiltri),
      ...comuni,
      assegnatoA: f.assegnatoA ?? undefined,
      stati: f.stati.length ? f.stati : undefined,
    }
    if (vista === 'kanban' || vista === 'gantt') {
      // Cercando, il kanban guarda tutto lo storico: un completato si ritrova anche se è vecchio
      const chiusiGiorni = q ? 0 : f.mostraCompletati ? CHIUSI_STORICO_GIORNI : CHIUSI_RECENTI_GIORNI
      return { ...base, includiChiusi: true, chiusiGiorni }
    }
    if (vista === 'calendario') return { ...base, includiChiusi: true, chiusiGiorni: 0, scadenzaDa: daIso, scadenzaA: aIso }
    // Lista: solo gli aperti; completati e annullati stanno nei riquadri dell'archivio, sotto
    return { ...base, includiChiusi: false }
  }, [config, selezione, ambitoChiave, vista, q, f.priorita, f.etichettaId, f.assegnatoA, f.stati, f.mostraCompletati, daIso, aIso])

  // Vassoio "senza scadenza" del calendario: stessi filtri, solo task aperti senza data
  const filtriVassoio: TaskFiltri | null = useMemo(() => {
    if (!filtriApi || selezione === 'miei' || vista !== 'calendario') return null
    return { ...filtriApi, scadenzaDa: undefined, scadenzaA: undefined, includiChiusi: false, chiusiGiorni: undefined, senzaScadenza: true }
  }, [filtriApi, selezione, vista])

  // Archivio di completati e annullati (tutto lo storico, a pagine) sotto "I miei task" e sotto la lista
  const filtriArchivio: TaskFiltri | null = useMemo(() => {
    if (!config) return null
    if (selezione === 'miei') return { vista: 'MIEI', q: q || undefined }
    if (vista !== 'lista') return null
    return {
      ...(JSON.parse(ambitoChiave) as TaskFiltri),
      q: q || undefined,
      priorita: f.priorita ?? undefined,
      etichettaId: f.etichettaId ?? undefined,
      assegnatoA: f.assegnatoA ?? undefined,
    }
  }, [config, selezione, ambitoChiave, vista, q, f.priorita, f.etichettaId, f.assegnatoA])

  // Un riquadro per stato chiuso; se il filtro stati ne nomina qualcuno, solo quelli
  const statiArchivio: TaskStatoArchivio[] = selezione !== 'miei' && f.stati.some(isStatoChiuso)
    ? STATI_ARCHIVIO.filter((s) => f.stati.includes(s))
    : STATI_ARCHIVIO

  const dati = useTaskRighe(filtriApi, config)
  const vassoio = useTaskRighe(filtriVassoio, config)

  const idsSelezionati = useMemo(
    () => dati.righe.filter((r) => selezionati.has(r.id)).map((r) => r.id),
    [dati.righe, selezionati],
  )

  // ---------- Dialog ----------
  const [creaAperto, setCreaAperto] = useState(false)
  const [prefill, setPrefill] = useState<TaskCreaPrefill | undefined>(undefined)
  const [tastiAperto, setTastiAperto] = useState(false)
  const [railCompatta, setRailCompatta] = useState(false)
  const [creaStruttura, setCreaStruttura] = useState<{ tipo: TaskTipoStruttura; parentId: number | null; id?: number } | null>(null)

  // Lista in cui creare: quella selezionata se non è archiviata; in una cartella la prima; altrimenti Generale
  const listaPredefinita: number | null = useMemo(() => {
    if (!config) return null
    const attiva = (l: { archiviata: boolean }) => !l.archiviata
    if (lista) return attiva(lista) ? lista.id : null
    if (cartellaId != null) return listeCartella.find(attiva)?.id ?? null
    return (config.liste.find((l) => l.codice === 'GENERALE' && attiva(l)) ?? config.liste.find(attiva))?.id ?? null
  }, [config, lista, cartellaId, listeCartella])

  const nuovo = useCallback((extra: TaskCreaPrefill = {}) => {
    setPrefill({ ...((listaId != null || cartellaId != null) && listaPredefinita != null ? { listaId: listaPredefinita } : {}), ...extra })
    setCreaAperto(true)
  }, [listaId, cartellaId, listaPredefinita])

  // ---------- Azioni ----------
  const { aggiornaRiga, aggiungiRiga } = dati
  const righeRef = useRef(dati.righe)
  righeRef.current = dati.righe

  const toggleCompleta = useCallback(async (riga: TaskRiga, el?: HTMLElement | null) => {
    const prima = riga.stato
    const nuovoStato: TaskStato = prima === 'COMPLETATO' ? 'DA_FARE' : 'COMPLETATO'
    const oggi = new Date()
    // Era l'ultimo task urgente (in ritardo o di oggi)? Allora festeggiamo
    const ultimoUrgente = nuovoStato === 'COMPLETATO' && eUrgente(riga, oggi)
      && !righeRef.current.some((r) => r.id !== riga.id && !isStatoChiuso(r.stato) && eUrgente(r, oggi))
    const salvata = await aggiornaRiga(riga.id, { stato: nuovoStato })
    if (salvata && nuovoStato === 'COMPLETATO') {
      if (ultimoUrgente) celebra(el)
      toast.success(ultimoUrgente ? 'Giornata chiusa ✨' : 'Completato', {
        description: riga.titolo,
        action: { label: 'Annulla', onClick: () => void aggiornaRiga(riga.id, { stato: prima }) },
      })
    }
    return salvata
  }, [aggiornaRiga])

  const posticipa = useCallback(async (riga: TaskRiga, scadenza: string | null, scadenzaOra: string | null) => {
    const prima = { scadenza: riga.scadenza, scadenzaOra: riga.scadenzaOra }
    const ora = scadenza ? (scadenzaOra ?? riga.scadenzaOra) : null
    const salvata = await aggiornaRiga(riga.id, { scadenza, scadenzaOra: ora })
    if (salvata) {
      toast.success(scadenza ? `Spostato a ${formatScadenza(scadenza, ora).toLowerCase()}` : 'Scadenza rimossa', {
        description: riga.titolo,
        action: { label: 'Annulla', onClick: () => void aggiornaRiga(riga.id, prima) },
      })
    }
  }, [aggiornaRiga])

  const creaRapido: TaskCreaRapido | null = useMemo(() => {
    if (listaPredefinita == null) return null
    return async (titolo, stato, extra) => {
      try {
        const creato = await taskService.crea({
          listaId: extra?.listaId ?? listaPredefinita,
          titolo,
          stato,
          scadenza: extra?.scadenza ?? null,
          scadenzaOra: extra?.scadenza ? extra.scadenzaOra : null,
          priorita: extra?.priorita ?? null,
          stimaMinuti: extra?.stimaMinuti ?? null,
          assegnatariIds: extra?.assegnatariIds ?? [],
          etichettaIds: extra?.etichettaIds ?? [],
        })
        const mio = !creato.assegnatari.length || creato.assegnatari.some((p) => p.id === meId)
        const qui = selezione === 'tutti' || (selezione === 'miei' && mio) || creato.listaId === listaId
          || (cartellaId != null && listeCartella.some((l) => l.id === creato.listaId))
        if (qui) aggiungiRiga(creato)
        else {
          const dove = config?.liste.find((l) => l.id === creato.listaId)?.nome
          toast.success('Task creato', { description: dove ? `In ${dove}` : undefined, action: { label: 'Apri', onClick: () => apri(creato.id) } })
        }
        emitTaskChanged(creato.id)
        return true
      } catch (e) {
        toast.error(messaggioErrore(e, 'Task non creato'))
        return false
      }
    }
  }, [listaPredefinita, selezione, listaId, cartellaId, listeCartella, aggiungiRiga, config, apri, meId])

  // Sottotask dalla riga del principale: nella sua lista, e il contatore del principale si aggiorna subito
  const { sostituisciRiga } = dati
  const creaSottotask: TaskCreaSottotask = useCallback(async (principale, titolo, extra) => {
    try {
      const creato = await taskService.crea({
        listaId: principale.listaId,
        parentId: principale.id,
        titolo,
        stato: 'DA_FARE',
        scadenza: extra?.scadenza ?? null,
        scadenzaOra: extra?.scadenza ? extra.scadenzaOra : null,
        priorita: extra?.priorita ?? null,
        stimaMinuti: extra?.stimaMinuti ?? null,
        assegnatariIds: extra?.assegnatariIds ?? [],
        etichettaIds: extra?.etichettaIds ?? [],
      })
      aggiungiRiga(creato)
      const attuale = righeRef.current.find((r) => r.id === principale.id) ?? principale
      sostituisciRiga({ ...attuale, sottotaskTotale: (attuale.sottotaskTotale ?? 0) + 1 })
      emitTaskChanged(creato.id)
      return true
    } catch (e) {
      toast.error(messaggioErrore(e, 'Sottotask non creato'))
      return false
    }
  }, [aggiungiRiga, sostituisciRiga])

  // ---------- Scorciatoie ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || staScrivendo(e.target)) return
      if (document.querySelector('[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]')) return
      const k = e.key
      if (k === 'n' || k === 'N') {
        e.preventDefault()
        nuovo()
      } else if (k === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (k === 'j' || (k === 'ArrowDown' && (e.target as HTMLElement)?.dataset?.tkRiga !== undefined)) {
        e.preventDefault()
        spostaFuocoRiga(1)
      } else if (k === 'k' || (k === 'ArrowUp' && (e.target as HTMLElement)?.dataset?.tkRiga !== undefined)) {
        e.preventDefault()
        spostaFuocoRiga(-1)
      } else if (k === '?') {
        e.preventDefault()
        setTastiAperto(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nuovo])

  // ---------- Render ----------
  if (configLoading && !config) {
    return (
      <div data-vl="" data-vl-page="task" className="tk-page tk-page--loading">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Caricamento" />
      </div>
    )
  }
  if (!config) {
    return (
      <div data-vl="" data-vl-page="task" className="tk-page">
        <TaskEmpty variante="errore" testo={configError ?? undefined} onRiprova={() => void reloadConfig()} />
      </div>
    )
  }

  const cercando = !!q
  const nome = utente?.nome?.trim()
  const oggiTesto = format(new Date(), 'EEEE d MMMM', { locale: it })
  const titolo = lista ? lista.nome : cartella ? cartella.nome : selezione === 'tutti' ? 'Tutti i task' : 'I miei task'
  // Percorso di cartelle sopra la lista o la cartella selezionata (cliccabile)
  const percorso: TaskCartella[] = lista
    ? percorsoCartella(config, lista.cartellaId)
    : cartella
      ? percorsoCartella(config, cartella.parentId)
      : []
  const elementoCorrente = lista ?? cartella
  const eyebrow = selezione === 'miei'
    ? `${nome ? `Ciao ${nome}` : 'La tua giornata'} · ${oggiTesto}`
    : selezione === 'tutti'
      ? `Tutte le liste · ${oggiTesto}`
      : (
        <span className="tk-crumbs">
          <span className="tk-crumbs-tipo">{lista ? 'Lista' : 'Cartella'}</span>
          {percorso.map((c) => (
            <span key={c.id} className="tk-crumb">
              <ChevronRight aria-hidden />
              <button type="button" onClick={() => seleziona(`cartella:${c.id}`)}>{c.nome}</button>
            </span>
          ))}
        </span>
      )
  const azioniAlbero = {
    onSeleziona: seleziona,
    onCrea: (tipo: TaskTipoStruttura, parentId: number | null) => setCreaStruttura({ tipo, parentId }),
    onImpostazioni: (tipo: TaskTipoStruttura, id: number) => setCreaStruttura({ tipo, parentId: null, id }),
    onListaEliminata: (id: number) => {
      // La lista eliminata (o la cartella che la conteneva) era aperta: si torna a "I miei task"
      if (listaId === id || (cartellaId != null && listeCartella.some((l) => l.id === id))) seleziona('miei')
      const aperto = taskAperto != null ? dati.righe.find((r) => r.id === taskAperto) : undefined
      if (aperto?.listaId === id) chiudiTask()
      void dati.ricarica()
    },
  }
  const mostraColonnaLista = selezione === 'tutti' || cartellaId != null
  // La selezione resta dopo un'azione multipla: si toglie solo con «Deseleziona» (o cambiando lista)
  const dopoBulk = () => {
    void dati.ricarica()
  }

  return (
    <div data-vl="" data-vl-page="task" className="tk-page" data-rail-compatta={railCompatta ? '' : undefined}
      style={elementoCorrente ? { ['--tk-c' as string]: elementoCorrente.colore } : undefined}>
      <TaskRail config={config} riepilogo={riepilogo} selezione={selezione} azioni={azioniAlbero} utenteId={meId}
        compatta={railCompatta} onToggleCompatta={() => setRailCompatta((c) => !c)} />

      <main className="tk-main">
        <TaskNavMobile config={config} riepilogo={riepilogo} selezione={selezione} azioni={azioniAlbero} utenteId={meId} />

        <div className="tk-hero" data-ambito={lista ? 'lista' : cartella ? 'cartella' : selezione}>
          <LuxHero ariaLabel={titolo} eyebrow={eyebrow} title={titolo}
            subtitle={selezione === 'miei'
              ? <FraseRiepilogo riepilogo={riepilogo} filtro={filtroKpi} onFiltro={setFiltroKpi} />
              : <FraseAmbito righe={dati.righe} loading={dati.loading} descrizione={elementoCorrente?.descrizione ?? null}
                tutti={selezione === 'tutti'} cartella={!!cartella} />}
            actions={<TaskNuovoButton onClick={() => nuovo()} />} />
        </div>

        <div className="tk-toolbar">
          <TaskSearch ref={searchRef} value={qLive} onApriId={apri} onChange={(v) => {
            setQLive(v)
            aggiornaFiltri({ q: v })
          }} />
          <div className="tk-toolbar-right">
            <TaskFiltriPopover config={config} filtri={f} onChange={aggiornaFiltri} onReset={resetFiltri} meId={meId}
              ridotti={selezione === 'miei'} storicoKanban={selezione !== 'miei' && (vista === 'kanban' || vista === 'gantt')} />
            {selezione !== 'miei' && vista === 'lista' ? (
              <TaskColonnePannello stato={colonne} mostraLista={mostraColonnaLista}>
                <button type="button" className="tk-btn tk-btn--ghost tk-colonne-btn" title="Scegli le colonne della lista"
                  data-active={colonne.originali ? undefined : ''}>
                  <Columns3Cog aria-hidden /> <span>Colonne</span>
                </button>
              </TaskColonnePannello>
            ) : null}
            {selezione !== 'miei' ? <TaskVistaSwitch value={vista} onChange={cambiaVista} /> : null}
            <button type="button" className="tk-icon-btn tk-keys-btn" onClick={() => setTastiAperto(true)}
              aria-label="Scorciatoie da tastiera" title="Scorciatoie (?)">
              <Keyboard aria-hidden />
            </button>
          </div>
        </div>

        {filtroKpi && selezione === 'miei' ? (
          <div className="tk-filtro-attivo">
            <span>Stai vedendo: <b>{ETICHETTE_KPI[filtroKpi]}</b></span>
            <button type="button" className="tk-link" onClick={() => setFiltroKpi(null)}><X aria-hidden /> Mostra tutto</button>
          </div>
        ) : null}

        <TaskMenuProvider config={config} righe={dati.righe} aggiornaRiga={dati.aggiornaRiga} onApri={apri}
          selezionati={selezione !== 'miei' && vista === 'lista' ? selezionati : undefined} onBulkFatto={dopoBulk}>
          {dati.error && !dati.righe.length ? (
            <TaskEmpty variante="errore" testo={dati.error} onRiprova={() => void dati.ricarica()} />
          ) : selezione === 'miei' ? (
            <TaskInbox config={config} righe={dati.righe} loading={dati.loading}
              filtroKpi={filtroKpi} onFiltroKpi={setFiltroKpi} selezionatoId={taskAperto} onApri={apri}
              onToggleCompleta={toggleCompleta} onPosticipa={(r, s, o) => void posticipa(r, s, o)}
              onNuovo={() => nuovo()} cercando={cercando} />
          ) : vista === 'kanban' ? (
            <TaskKanbanView config={config} righe={dati.righe} loading={dati.loading} mostraChiusi={f.mostraCompletati}
              mostraLista={mostraColonnaLista} aggiornaRiga={dati.aggiornaRiga} onApri={apri} selezionatoId={taskAperto}
              onCreaRapido={creaRapido} />
          ) : vista === 'gantt' ? (
            <TaskGanttView key={String(selezione)} config={config} righe={dati.righe} loading={dati.loading}
              mostraLista={mostraColonnaLista} sostituisciRiga={dati.sostituisciRiga} onApri={apri}
              selezionatoId={taskAperto} onNuovo={() => nuovo()} />
          ) : vista === 'calendario' ? (
            <TaskCalendarioView config={config} righe={dati.righe} senzaScadenza={vassoio.righe} loading={dati.loading}
              riferimento={riferimento} onRiferimento={setRiferimento} modo={modoCal} onModo={setModoCal}
              aggiornaRiga={async (id, v) => {
                const r = await dati.aggiornaRiga(id, v)
                void vassoio.ricarica()
                if (!r) return null
                if (r.scadenza && !dati.righe.some((x) => x.id === id)) dati.aggiungiRiga(r)
                return r
              }}
              onApri={apri} onNuovoIl={(giorno) => nuovo({ scadenza: giorno })} />
          ) : (
            <TaskListaView config={config} righe={dati.righe} loading={dati.loading} mostraLista={mostraColonnaLista}
              ordinamento={pref.ordinamento} onOrdinamento={(o) => aggiorna({ ordinamento: o })} aggiornaRiga={dati.aggiornaRiga}
              onToggleCompleta={toggleCompleta} onApri={apri} selezionatoId={taskAperto} selezionati={selezionati}
              onSelezionati={setSelezionati} onCreaRapido={creaRapido} onCreaSottotask={creaSottotask} onNuovo={() => nuovo()}
              cercando={cercando} colonne={colonne} />
          )}
        </TaskMenuProvider>

        {filtriArchivio && !dati.error ? statiArchivio.map((stato) => (
          <TaskArchivioChiusi key={stato} config={config} stato={stato} filtri={filtriArchivio} cercando={cercando}
            mostraLista={selezione === 'miei' || mostraColonnaLista} selezionatoId={taskAperto} onApri={apri} />
        )) : null}
      </main>

      <TaskNuovoFab onClick={() => nuovo()} />

      {selezione !== 'miei' && vista === 'lista' ? (
        <TaskBulkBar config={config} ids={idsSelezionati} righe={dati.righe} onClear={() => setSelezionati(new Set())}
          onDone={dopoBulk} />
      ) : null}

      <TaskCreaDialog open={creaAperto} onOpenChange={setCreaAperto} prefill={prefill} />

      <TaskDettaglioSheet taskId={taskAperto} onApriTask={apri}
        onOpenChange={(open) => {
          if (!open) chiudiTask()
        }}
        onChanged={(riga) => {
          dati.sostituisciRiga(riga)
          vassoio.sostituisciRiga(riga)
        }}
        onDeleted={(id) => {
          dati.rimuoviRiga(id)
          vassoio.rimuoviRiga(id)
          chiudiTask()
        }} />

      <TaskCreaStrutturaDialog tipo={creaStruttura?.tipo ?? 'LISTA'} parentId={creaStruttura?.parentId ?? null}
        open={!!creaStruttura} onOpenChange={(o) => !o && setCreaStruttura(null)}
        modifica={creaStruttura?.id == null ? null : creaStruttura.tipo === 'LISTA'
          ? config.liste.find((l) => l.id === creaStruttura.id) ?? null
          : config.cartelle.find((c) => c.id === creaStruttura.id) ?? null}
        onCreato={(creato) => seleziona(creato.tipo === 'LISTA' ? creato.id : `cartella:${creato.id}`)} />

      <TaskScorciatoie open={tastiAperto} onOpenChange={setTastiAperto} />
    </div>
  )
}

const ETICHETTE_KPI: Record<Exclude<TaskFiltroKpi, null>, string> = {
  ritardo: 'in ritardo',
  oggi: 'in scadenza oggi',
  settimana: 'prossimi 7 giorni',
  senza: 'senza scadenza',
}

/** Riepilogo di "I miei task" come frase: ogni numero è un filtro. */
function FraseRiepilogo({ riepilogo, filtro, onFiltro }: {
  riepilogo: TaskRiepilogo | null
  filtro: TaskFiltroKpi
  onFiltro: (f: TaskFiltroKpi) => void
}) {
  if (!riepilogo) return <span className="tk-frase tk-frase--loading">Un attimo, guardo la tua giornata…</span>
  const parti: { key: Exclude<TaskFiltroKpi, null>; n: number; testo: string; tono?: string }[] = [
    { key: 'ritardo', n: riepilogo.inRitardo, testo: 'in ritardo', tono: 'late' },
    { key: 'oggi', n: riepilogo.oggi, testo: 'oggi', tono: 'today' },
    { key: 'settimana', n: riepilogo.prossimi7Giorni, testo: 'nei prossimi 7 giorni' },
    { key: 'senza', n: riepilogo.senzaScadenza, testo: 'senza scadenza' },
  ]
  const presenti = parti.filter((p) => p.n > 0)
  if (!presenti.length) return <span className="tk-frase">Niente in sospeso. Goditi il caffè ☕</span>
  const tranquillo = riepilogo.inRitardo === 0 && riepilogo.oggi === 0
  return (
    <span className="tk-frase">
      {tranquillo ? <span className="tk-frase-calma">Niente di urgente · </span> : null}
      {presenti.map((p, i) => (
        <span key={p.key}>
          {i > 0 ? <span className="tk-frase-sep" aria-hidden> · </span> : null}
          <button type="button" className="tk-frase-num" data-tono={p.tono} aria-pressed={filtro === p.key}
            data-active={filtro === p.key ? '' : undefined} onClick={() => onFiltro(filtro === p.key ? null : p.key)}>
            <b>{p.n}</b> {p.testo}
          </button>
        </span>
      ))}
    </span>
  )
}

function FraseAmbito({ righe, loading, descrizione, tutti, cartella }: {
  righe: TaskRiga[]
  loading: boolean
  descrizione: string | null
  tutti: boolean
  cartella: boolean
}) {
  if (descrizione) return <span className="tk-frase">{descrizione}</span>
  if (loading) return <span className="tk-frase tk-frase--loading">Carico i task…</span>
  const oggi = new Date()
  const aperti = righe.filter((r) => !isStatoChiuso(r.stato))
  const ritardo = aperti.filter((r) => gruppoScadenza(r, oggi) === 'ritardo').length
  if (!aperti.length) {
    return <span className="tk-frase">Nessun task aperto{tutti ? ' in nessuna lista' : cartella ? ' in questa cartella' : ''}. Tutto in ordine.</span>
  }
  return (
    <span className="tk-frase">
      <b>{aperti.length}</b> {aperti.length === 1 ? 'task aperto' : 'task aperti'}{tutti ? ' in tutte le liste' : cartella ? ' nelle liste della cartella' : ''}
      {ritardo ? <> · <b className="tk-frase-late">{ritardo}</b> in ritardo</> : null}
    </span>
  )
}
