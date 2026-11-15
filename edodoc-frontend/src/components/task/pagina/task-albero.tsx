import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  Archive, ArchiveRestore, ChevronRight, Folder, FolderInput, FolderOpen, FolderPlus, FolderRoot, ListPlus,
  ListX, Loader2, MoreHorizontal, Pencil, Plus, Settings2, Trash2,
} from 'lucide-react'
import { SK_FOCUS_RING } from '@/components/ui/sheet-kit'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { TaskEliminaListaDialog } from '@/components/task/task-elimina-lista-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TaskCartellaPicker } from '@/components/task/task-cartella-picker'
import { TASK_LAYER_Z } from '@/components/task/task-ui'
import { invalidateTaskConfig } from '@/hooks/use-task-config'
import { emitTaskChanged } from '@/hooks/use-task-cambi'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import {
  cartellaVuota, costruisciAlbero, discendenti, listeDellaCartella, percorsoCartella, type NodoCartella,
} from '@/lib/task-struttura'
import {
  taskService,
  type TaskCartella,
  type TaskConfig,
  type TaskLista,
  type TaskTipoStruttura,
} from '@/services/task-service'
import { TaskListaIcona } from './task-lista-icona'
import { cartellaDaSelezione, listaDaSelezione, messaggioErrore, type TaskSelezione } from './task-pagina-utils'

/** Azioni che il contenitore (rail o sheet mobile) gestisce: selezione e dialog. */
export interface TaskAlberoAzioni {
  onSeleziona: (s: TaskSelezione) => void
  onCrea: (tipo: TaskTipoStruttura, parentId: number | null) => void
  /** Nome, descrizione, colore e icona */
  onImpostazioni: (tipo: TaskTipoStruttura, id: number) => void
  /** Dopo l'eliminazione definitiva di una lista (con tutti i suoi task) */
  onListaEliminata?: (listaId: number) => void
}

type Elemento = { tipo: 'LISTA'; lista: TaskLista } | { tipo: 'CARTELLA'; cartella: TaskCartella }
type Posizione = 'prima' | 'dentro' | 'dopo'

const chiave = (e: Elemento) => (e.tipo === 'LISTA' ? `L:${e.lista.id}` : `C:${e.cartella.id}`)
const nomeDi = (e: Elemento) => (e.tipo === 'LISTA' ? e.lista.nome : e.cartella.nome)
const contenitoreDi = (e: Elemento) => (e.tipo === 'LISTA' ? e.lista.cartellaId : e.cartella.parentId)
const ordineDi = (e: Elemento) => (e.tipo === 'LISTA' ? e.lista.ordine : e.cartella.ordine)
/** Le liste di sistema (con codice) ricevono i task dei job: non si archiviano né si eliminano. */
const diSistema = (e: Elemento) => e.tipo === 'LISTA' && !!e.lista.codice

// ---------- Cartelle aperte (per utente, in localStorage) ----------

const CHIAVE_APERTE = 'task-albero-aperte'

function leggiAperte(utenteId: number | null): Set<number> {
  if (utenteId == null) return new Set()
  try {
    const tutto = JSON.parse(localStorage.getItem(CHIAVE_APERTE) ?? '{}') as Record<string, number[]>
    return new Set(Array.isArray(tutto[utenteId]) ? tutto[utenteId] : [])
  } catch {
    return new Set()
  }
}

function salvaAperte(utenteId: number | null, aperte: Set<number>) {
  if (utenteId == null) return
  try {
    const tutto = JSON.parse(localStorage.getItem(CHIAVE_APERTE) ?? '{}') as Record<string, number[]>
    tutto[utenteId] = [...aperte]
    localStorage.setItem(CHIAVE_APERTE, JSON.stringify(tutto))
  } catch {
    // solo una preferenza
  }
}

function useCartelleAperte(utenteId: number | null, config: TaskConfig, selezione: TaskSelezione) {
  const [aperte, setAperte] = useState(() => leggiAperte(utenteId))
  // La cartella selezionata (o quella della lista selezionata) e quelle sopra restano aperte
  useEffect(() => {
    const lista = listaDaSelezione(selezione)
    const cartella = cartellaDaSelezione(selezione)
    const base = lista != null ? config.liste.find((l) => l.id === lista)?.cartellaId ?? null : cartella
    if (base == null) return
    const percorso = percorsoCartella(config, base).map((c) => c.id)
    setAperte((prev) => {
      if (percorso.every((id) => prev.has(id))) return prev
      const next = new Set(prev)
      percorso.forEach((id) => next.add(id))
      return next
    })
  }, [selezione, config])
  useEffect(() => salvaAperte(utenteId, aperte), [utenteId, aperte])
  const toggle = useCallback((id: number, forza?: boolean) => {
    setAperte((prev) => {
      const next = new Set(prev)
      const apri = forza ?? !next.has(id)
      if (apri) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  return { aperte, toggle }
}

// ---------- Albero ----------

interface Props {
  config: TaskConfig
  selezione: TaskSelezione
  azioni: TaskAlberoAzioni
  utenteId: number | null
  /** Trascinamento per spostare e riordinare (solo desktop) */
  trascinabile?: boolean
  /** Barra ridotta: solo le icone del primo livello */
  compatta?: boolean
  /** Dentro lo sheet mobile: azioni sempre visibili, righe più alte */
  variante?: 'rail' | 'sheet'
}

/** Struttura di cartelle e liste: navigazione, creazione, menu delle azioni, trascinamento. */
export function TaskAlbero({ config, selezione, azioni, utenteId, trascinabile = false, compatta = false, variante = 'rail' }: Props) {
  const albero = useMemo(() => costruisciAlbero(config), [config])
  const { aperte, toggle } = useCartelleAperte(utenteId, config, selezione)
  const [rinomina, setRinomina] = useState<string | null>(null)
  const [spostando, setSpostando] = useState<Elemento | null>(null)
  const [eliminando, setEliminando] = useState<TaskCartella | null>(null)
  const [eliminandoLista, setEliminandoLista] = useState<TaskLista | null>(null)
  const [archiviateAperte, setArchiviateAperte] = useState(false)

  // Task aperti per cartella: somma delle liste visibili che contiene (sottocartelle comprese)
  const apertiCartella = useMemo(() => {
    const m = new Map<number, number>()
    config.cartelle.forEach((c) => m.set(c.id, listeDellaCartella(config, c.id).reduce((n, l) => n + l.aperti, 0)))
    return m
  }, [config])

  const ctx: ContestoAlbero = {
    config, selezione, azioni, aperte, toggle, apertiCartella, variante, compatta,
    rinomina, setRinomina, onSposta: setSpostando, onElimina: setEliminando, onEliminaLista: setEliminandoLista,
  }

  const contenuto = (
    <>
      <div className="tk-albero-head">
        <span className="tk-rail-section-title">Liste</span>
        {!compatta ? (
          <MenuCrea parentId={null} azioni={azioni} etichetta="Nuova lista o cartella" suggerimento={variante !== 'sheet'} />
        ) : null}
      </div>

      {trascinabile ? <ZonaRadice /> : null}

      <ul className="tk-albero" role="tree" aria-label="Cartelle e liste">
        {albero.radiceCartelle.map((n) => <RamoCartella key={n.cartella.id} nodo={n} profondita={0} ctx={ctx} />)}
        {albero.radiceListe.map((l) => <RigaLista key={l.id} lista={l} profondita={0} ctx={ctx} />)}
      </ul>
      {!albero.radiceCartelle.length && !albero.radiceListe.length && !compatta ? (
        <p className="tk-rail-empty">Nessuna lista. Creane una con il +.</p>
      ) : null}

      {!compatta && (albero.archiviateCartelle.length || albero.archiviateListe.length) ? (
        <div className="tk-albero-archivio">
          <button type="button" className="tk-albero-archivio-toggle" aria-expanded={archiviateAperte}
            onClick={() => setArchiviateAperte((a) => !a)}>
            <ChevronRight className="tk-albero-chevron" data-open={archiviateAperte ? '' : undefined} aria-hidden />
            <Archive aria-hidden />
            <span>Archiviate</span>
            <em>{albero.archiviateCartelle.length + albero.archiviateListe.length}</em>
          </button>
          {archiviateAperte ? (
            <ul className="tk-albero tk-albero--archiviate">
              {albero.archiviateCartelle.map((c) => (
                <RigaArchiviata key={`C:${c.id}`} elemento={{ tipo: 'CARTELLA', cartella: c }} config={config} />
              ))}
              {albero.archiviateListe.map((l) => (
                <RigaArchiviata key={`L:${l.id}`} elemento={{ tipo: 'LISTA', lista: l }} config={config} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <SpostaDialog elemento={spostando} config={config} onClose={() => setSpostando(null)} />
      <EliminaDialog cartella={eliminando} onClose={() => setEliminando(null)} onEliminata={(id) => {
        if (cartellaDaSelezione(selezione) === id) azioni.onSeleziona('miei')
      }} />
      {eliminandoLista ? (
        <TaskEliminaListaDialog lista={eliminandoLista} open onOpenChange={(o: boolean) => !o && setEliminandoLista(null)}
          onEliminata={() => {
            const id = eliminandoLista.id
            setEliminandoLista(null)
            void dopoModifica()
            azioni.onListaEliminata?.(id)
          }} />
      ) : null}
    </>
  )

  return trascinabile && !compatta
    ? <Trascinamento config={config}>{contenuto}</Trascinamento>
    : <div className="tk-albero-wrap" data-variante={variante}>{contenuto}</div>
}

interface ContestoAlbero {
  config: TaskConfig
  selezione: TaskSelezione
  azioni: TaskAlberoAzioni
  aperte: Set<number>
  toggle: (id: number, forza?: boolean) => void
  apertiCartella: Map<number, number>
  variante: 'rail' | 'sheet'
  compatta: boolean
  rinomina: string | null
  setRinomina: (k: string | null) => void
  onSposta: (e: Elemento) => void
  onElimina: (c: TaskCartella) => void
  onEliminaLista: (l: TaskLista) => void
}

function RamoCartella({ nodo, profondita, ctx }: { nodo: NodoCartella; profondita: number; ctx: ContestoAlbero }) {
  const c = nodo.cartella
  const aperta = ctx.aperte.has(c.id) && !ctx.compatta
  const attiva = cartellaDaSelezione(ctx.selezione) === c.id
  const vuota = !nodo.figli.length && !nodo.liste.length
  const elemento: Elemento = { tipo: 'CARTELLA', cartella: c }
  const k = chiave(elemento)
  return (
    <li role="treeitem" aria-expanded={vuota ? undefined : aperta} aria-selected={attiva}>
      <RigaTrascinabile elemento={elemento}>
        {(drag) => (
          <ConMenuContestuale elemento={elemento} ctx={ctx}>
          <div className="tk-albero-row" data-active={attiva ? '' : undefined} data-drop={drag.drop ?? undefined}
            data-dragging={drag.trascinando ? '' : undefined} style={{ ['--tk-depth' as string]: profondita, ['--tk-c' as string]: c.colore }}>
            {ctx.compatta ? null : (
              <button type="button" className="tk-albero-chevron-btn" onClick={() => ctx.toggle(c.id)}
                aria-label={aperta ? `Chiudi ${c.nome}` : `Apri ${c.nome}`} disabled={vuota} tabIndex={-1}>
                <ChevronRight className="tk-albero-chevron" data-open={aperta ? '' : undefined} aria-hidden />
              </button>
            )}
            {ctx.rinomina === k ? (
              <RinominaInput elemento={elemento} onFine={() => ctx.setRinomina(null)} />
            ) : (
              <button type="button" className="tk-albero-item" title={c.nome} {...drag.attributi}
                onClick={() => {
                  ctx.azioni.onSeleziona(`cartella:${c.id}`)
                  if (!aperta) ctx.toggle(c.id, true)
                }}
                onDoubleClick={() => ctx.setRinomina(k)}>
                <span className="tk-albero-folder" aria-hidden>{aperta ? <FolderOpen /> : <Folder />}</span>
                <span className="tk-rail-label">{c.nome}</span>
                {ctx.apertiCartella.get(c.id) ? <em className="tk-rail-count">{ctx.apertiCartella.get(c.id)}</em> : null}
              </button>
            )}
            {!ctx.compatta && ctx.rinomina !== k ? (
              <span className="tk-albero-actions" data-sempre={ctx.variante === 'sheet' ? '' : undefined}>
                <MenuCrea parentId={c.id} azioni={ctx.azioni} etichetta={`Aggiungi in ${c.nome}`} suggerimento={ctx.variante !== 'sheet'} />
                <MenuElemento elemento={elemento} ctx={ctx} />
              </span>
            ) : null}
          </div>
          </ConMenuContestuale>
        )}
      </RigaTrascinabile>
      {aperta && !vuota ? (
        <ul role="group" className="tk-albero">
          {nodo.figli.map((f) => <RamoCartella key={f.cartella.id} nodo={f} profondita={profondita + 1} ctx={ctx} />)}
          {nodo.liste.map((l) => <RigaLista key={l.id} lista={l} profondita={profondita + 1} ctx={ctx} />)}
        </ul>
      ) : null}
    </li>
  )
}

function RigaLista({ lista, profondita, ctx }: { lista: TaskLista; profondita: number; ctx: ContestoAlbero }) {
  const attiva = listaDaSelezione(ctx.selezione) === lista.id
  const elemento: Elemento = { tipo: 'LISTA', lista }
  const k = chiave(elemento)
  return (
    <li role="treeitem" aria-selected={attiva}>
      <RigaTrascinabile elemento={elemento}>
        {(drag) => (
          <ConMenuContestuale elemento={elemento} ctx={ctx}>
          <div className="tk-albero-row tk-albero-row--lista" data-active={attiva ? '' : undefined} data-drop={drag.drop ?? undefined}
            data-dragging={drag.trascinando ? '' : undefined}
            style={{ ['--tk-depth' as string]: profondita, ['--tk-c' as string]: lista.colore }}>
            {ctx.compatta ? null : <span className="tk-albero-chevron-btn" aria-hidden />}
            {ctx.rinomina === k ? (
              <RinominaInput elemento={elemento} onFine={() => ctx.setRinomina(null)} />
            ) : (
              <button type="button" className="tk-albero-item" title={lista.nome} aria-current={attiva ? 'page' : undefined}
                {...drag.attributi} onClick={() => ctx.azioni.onSeleziona(lista.id)}
                onDoubleClick={() => ctx.setRinomina(k)}>
                <TaskListaIcona lista={lista} size="sm" />
                <span className="tk-rail-label">{lista.nome}</span>
                {lista.aperti ? <em className="tk-rail-count">{lista.aperti}</em> : null}
              </button>
            )}
            {!ctx.compatta && ctx.rinomina !== k ? (
              <span className="tk-albero-actions" data-sempre={ctx.variante === 'sheet' ? '' : undefined}>
                <MenuElemento elemento={elemento} ctx={ctx} />
              </span>
            ) : null}
          </div>
          </ConMenuContestuale>
        )}
      </RigaTrascinabile>
    </li>
  )
}

function RigaArchiviata({ elemento, config }: { elemento: Elemento; config: TaskConfig }) {
  const [salvando, setSalvando] = useState(false)
  const percorso = percorsoCartella(config, contenitoreDi(elemento)).map((c) => c.nome).join(' / ')
  return (
    <li className="tk-albero-row tk-albero-row--archiviata">
      <span className="tk-albero-item" title={percorso ? `${percorso} / ${nomeDi(elemento)}` : nomeDi(elemento)}>
        {elemento.tipo === 'CARTELLA' ? <span className="tk-albero-folder" aria-hidden><Folder /></span> : <TaskListaIcona lista={elemento.lista} size="sm" />}
        <span className="tk-rail-label">{nomeDi(elemento)}</span>
      </span>
      <button type="button" className="tk-albero-ripristina" disabled={salvando}
          onClick={async () => {
            setSalvando(true)
            if (await archivia(elemento, false)) toast.success(`«${nomeDi(elemento)}» ripristinata`)
            setSalvando(false)
          }}>
          {salvando ? <Loader2 className="animate-spin" aria-hidden /> : <ArchiveRestore aria-hidden />} Ripristina
        </button>
    </li>
  )
}

// ---------- Menu ----------

function MenuCrea({ parentId, azioni, etichetta, suggerimento = true }: {
  parentId: number | null
  azioni: TaskAlberoAzioni
  etichetta: string
  /** Tooltip al passaggio (non su touch) */
  suggerimento?: boolean
}) {
  const pulsante = (
    <DropdownMenuTrigger asChild>
      <button type="button" className="tk-albero-btn" aria-label={etichetta}>
        <Plus aria-hidden />
      </button>
    </DropdownMenuTrigger>
  )
  return (
    <DropdownMenu modal={false}>
      {suggerimento ? (
        <Tooltip>
          <TooltipTrigger asChild>{pulsante}</TooltipTrigger>
          <TooltipContent side="right" className={TASK_LAYER_Z}>{etichetta}</TooltipContent>
        </Tooltip>
      ) : pulsante}
      <DropdownMenuContent align="start" className={cn('w-52 tk-menu-solido', TASK_LAYER_Z)}>
        <DropdownMenuItem onSelect={() => azioni.onCrea('LISTA', parentId)} className="gap-2">
          <ListPlus className="size-4" /> Nuova lista
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => azioni.onCrea('CARTELLA', parentId)} className="gap-2">
          <FolderPlus className="size-4" /> {parentId == null ? 'Nuova cartella' : 'Nuova sottocartella'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type VoceProps = {
  onSelect?: (e: Event) => void
  className?: string
  disabled?: boolean
  title?: string
  variant?: 'default' | 'destructive'
  children: ReactNode
}

// Pulsanti dei dialog: come nel dialog di struttura
const BTN_SECONDARIO = cn(SK_FOCUS_RING, 'h-9 rounded-lg! border-0! bg-transparent px-3 text-[13px]! font-medium text-slate-600 hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/[0.08]')
const BTN_PRIMARIO = cn(SK_FOCUS_RING, 'inline-flex h-9 items-center gap-1.5 rounded-lg! border-0! bg-[var(--brand-blue)] px-4 text-[13px]! font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-[var(--brand-orange)] dark:text-[#1F3A63]')
const BTN_PERICOLO = cn(SK_FOCUS_RING, 'inline-flex h-9 items-center gap-1.5 rounded-lg! border-0! bg-rose-600 px-4 text-[13px]! font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-45')

/** Voci comuni al menu "⋯" e al menu del tasto destro (stessi componenti, primitive diverse). */
function VociElemento({ elemento, ctx, Voce, Separatore }: {
  elemento: Elemento
  ctx: ContestoAlbero
  Voce: (p: VoceProps) => ReactNode
  Separatore: () => ReactNode
}) {
  const sistema = diSistema(elemento)
  const cartella = elemento.tipo === 'CARTELLA' ? elemento.cartella : null
  const lista = elemento.tipo === 'LISTA' ? elemento.lista : null
  const vuota = cartella ? cartellaVuota(ctx.config, cartella.id) : false
  return (
    <>
      <Voce onSelect={() => ctx.azioni.onImpostazioni(elemento.tipo, lista ? lista.id : cartella!.id)} className="gap-2">
        <Settings2 className="size-4" /> Impostazioni
      </Voce>
      <Voce onSelect={() => ctx.setRinomina(chiave(elemento))} className="gap-2">
        <Pencil className="size-4" /> Rinomina
      </Voce>
      {cartella ? (
        <>
          <Separatore />
          <Voce onSelect={() => ctx.azioni.onCrea('LISTA', cartella.id)} className="gap-2">
            <ListPlus className="size-4" /> Nuova lista qui
          </Voce>
          <Voce onSelect={() => ctx.azioni.onCrea('CARTELLA', cartella.id)} className="gap-2">
            <FolderPlus className="size-4" /> Nuova sottocartella
          </Voce>
        </>
      ) : null}
      <Separatore />
      <Voce onSelect={() => ctx.onSposta(elemento)} className="gap-2">
        <FolderInput className="size-4" /> Sposta in…
      </Voce>
      {!sistema ? (
        <>
          <Voce onSelect={() => void archivia(elemento, true).then((ok) => {
            if (!ok) return
            if (chiaveSelezione(ctx.selezione) === chiave(elemento)) ctx.azioni.onSeleziona('miei')
            toast.success(`«${nomeDi(elemento)}» archiviata`, {
              description: 'La trovi in fondo, sotto "Archiviate".',
              action: { label: 'Annulla', onClick: () => void archivia(elemento, false) },
            })
          })} className="gap-2">
            <Archive className="size-4" /> Archivia
          </Voce>
          {cartella ? (
            <Voce disabled={!vuota} onSelect={() => ctx.onElimina(cartella)} variant="destructive"
              className="gap-2"
              title={vuota ? undefined : 'Si possono eliminare solo le cartelle vuote: sposta o archivia prima il contenuto'}>
              <Trash2 className="size-4" /> Elimina{vuota ? '' : ' (solo se vuota)'}
            </Voce>
          ) : null}
        </>
      ) : null}
      {/* Una lista si elimina con tutti i suoi task; quelle di sistema restano */}
      {lista && !sistema ? (
        <>
          <Separatore />
          <Voce onSelect={() => ctx.onEliminaLista(lista)} variant="destructive" className="gap-2">
            <ListX className="size-4" /> Elimina lista…
          </Voce>
        </>
      ) : null}
    </>
  )
}

function MenuElemento({ elemento, ctx }: { elemento: Elemento; ctx: ContestoAlbero }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="tk-albero-btn" aria-label={`Azioni per ${nomeDi(elemento)}`}>
          <MoreHorizontal aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={cn('w-60 tk-menu-solido', TASK_LAYER_Z)}>
        <VociElemento elemento={elemento} ctx={ctx} Voce={(p) => <DropdownMenuItem {...p} />}
          Separatore={() => <DropdownMenuSeparator />} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Tasto destro su una riga: stesse azioni del menu "⋯" (su touch resta il pulsante ⋯). */
function ConMenuContestuale({ elemento, ctx, children }: { elemento: Elemento; ctx: ContestoAlbero; children: ReactNode }) {
  if (ctx.compatta || ctx.rinomina === chiave(elemento)) return <>{children}</>
  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className={cn('w-60 tk-menu-solido', TASK_LAYER_Z)}>
        <VociElemento elemento={elemento} ctx={ctx} Voce={(p) => <ContextMenuItem {...p} />}
          Separatore={() => <ContextMenuSeparator />} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

const chiaveSelezione = (s: TaskSelezione) => {
  const l = listaDaSelezione(s)
  if (l != null) return `L:${l}`
  const c = cartellaDaSelezione(s)
  return c != null ? `C:${c}` : null
}

// ---------- Operazioni ----------

async function dopoModifica() {
  await invalidateTaskConfig()
  emitTaskChanged()
}

async function archivia(e: Elemento, archiviata: boolean): Promise<boolean> {
  try {
    if (e.tipo === 'LISTA') await taskService.aggiornaLista(e.lista.id, { nome: e.lista.nome, archiviata })
    else await taskService.aggiornaCartella(e.cartella.id, { nome: e.cartella.nome, archiviata })
    await dopoModifica()
    return true
  } catch (err) {
    toast.error(messaggioErrore(err, archiviata ? 'Non archiviata' : 'Non ripristinata'))
    return false
  }
}

async function sposta(e: Elemento, destinazione: number | null, ordine?: number) {
  if (e.tipo === 'LISTA') await taskService.spostaLista(e.lista.id, destinazione, ordine)
  else await taskService.spostaCartella(e.cartella.id, destinazione, ordine)
}

/** Sposta con toast "Annulla" (rimette contenitore e posizione di prima). */
async function spostaConAnnulla(e: Elemento, destinazione: number | null, config: TaskConfig, ordine?: number) {
  const prima = { contenitore: contenitoreDi(e), ordine: ordineDi(e) }
  try {
    await sposta(e, destinazione, ordine)
    await dopoModifica()
    const dove = destinazione == null ? 'Radice' : config.cartelle.find((c) => c.id === destinazione)?.nome ?? 'cartella'
    const stessoPosto = destinazione === prima.contenitore
    toast.success(stessoPosto ? `«${nomeDi(e)}» riordinata` : `«${nomeDi(e)}» spostata in ${dove}`, {
      action: {
        label: 'Annulla',
        onClick: () => void sposta(e, prima.contenitore, prima.ordine).then(dopoModifica)
          .catch((err) => toast.error(messaggioErrore(err, 'Non annullato'))),
      },
    })
  } catch (err) {
    toast.error(messaggioErrore(err, 'Spostamento non riuscito'))
  }
}

function RinominaInput({ elemento, onFine }: { elemento: Elemento; onFine: () => void }) {
  const [valore, setValore] = useState(nomeDi(elemento))
  const [salvando, setSalvando] = useState(false)
  const salva = async () => {
    const nome = valore.trim()
    if (!nome || nome === nomeDi(elemento)) return onFine()
    setSalvando(true)
    try {
      if (elemento.tipo === 'LISTA') await taskService.aggiornaLista(elemento.lista.id, { nome })
      else await taskService.aggiornaCartella(elemento.cartella.id, { nome })
      await dopoModifica()
      onFine()
    } catch (err) {
      toast.error(messaggioErrore(err, 'Nome non salvato'))
      setSalvando(false)
    }
  }
  return (
    <input className="tk-albero-input" value={valore} autoFocus disabled={salvando} maxLength={100}
      aria-label={`Nuovo nome per ${nomeDi(elemento)}`}
      onChange={(e) => setValore(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => void salva()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          void salva()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onFine()
        }
      }} />
  )
}

function SpostaDialog({ elemento, config, onClose }: { elemento: Elemento | null; config: TaskConfig; onClose: () => void }) {
  const [destinazione, setDestinazione] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    if (elemento) setDestinazione(contenitoreDi(elemento))
  }, [elemento])
  if (!elemento) return null
  const invariata = destinazione === contenitoreDi(elemento)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn('sm:max-w-md', TASK_LAYER_Z)} data-vl="scope">
        <DialogHeader>
          <DialogTitle>Sposta «{nomeDi(elemento)}»</DialogTitle>
          <DialogDescription>Scegli la cartella in cui metterla, oppure la radice.</DialogDescription>
        </DialogHeader>
        <TaskCartellaPicker config={config} value={destinazione} onChange={setDestinazione}
          escludiId={elemento.tipo === 'CARTELLA' ? elemento.cartella.id : undefined} className="w-full justify-start" />
        <DialogFooter>
          <button type="button" className={BTN_SECONDARIO} onClick={onClose}>Annulla</button>
          <button type="button" className={BTN_PRIMARIO} disabled={invariata || salvando} onClick={async () => {
            setSalvando(true)
            await spostaConAnnulla(elemento, destinazione, config)
            setSalvando(false)
            onClose()
          }}>
            {salvando ? <Loader2 className="size-4 animate-spin" /> : null} Sposta
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EliminaDialog({ cartella, onClose, onEliminata }: {
  cartella: TaskCartella | null
  onClose: () => void
  onEliminata: (id: number) => void
}) {
  const [salvando, setSalvando] = useState(false)
  if (!cartella) return null
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn('sm:max-w-sm', TASK_LAYER_Z)} data-vl="scope">
        <DialogHeader>
          <DialogTitle>Eliminare «{cartella.nome}»?</DialogTitle>
          <DialogDescription>La cartella è vuota: verrà eliminata insieme alle sue autorizzazioni.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button type="button" className={BTN_SECONDARIO} onClick={onClose}>Annulla</button>
          <button type="button" className={BTN_PERICOLO} disabled={salvando} onClick={async () => {
            setSalvando(true)
            try {
              await taskService.eliminaCartella(cartella.id)
              await dopoModifica()
              onEliminata(cartella.id)
              toast.success(`Cartella «${cartella.nome}» eliminata`)
              onClose()
            } catch (err) {
              toast.error(messaggioErrore(err, 'Cartella non eliminata'))
            } finally {
              setSalvando(false)
            }
          }}>
            {salvando ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Elimina
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Trascinamento ----------

interface StatoTrascinamento {
  attivo: Elemento | null
  sopra: { chiave: string; posizione: Posizione } | null
}

/** Stato del trascinamento letto dalle righe: senza provider (sheet mobile, barra ridotta) non si trascina. */
const DragCtx = createContext<{ stato: StatoTrascinamento; abilitato: boolean }>({
  stato: { attivo: null, sopra: null },
  abilitato: false,
})

function RigaTrascinabile({ elemento, children }: {
  elemento: Elemento
  children: (d: { attributi: Record<string, unknown>; drop: Posizione | null; trascinando: boolean }) => ReactNode
}) {
  const k = chiave(elemento)
  const { stato, abilitato } = useContext(DragCtx)
  const drag = useDraggable({ id: k, data: elemento, disabled: !abilitato })
  const drop = useDroppable({ id: k, data: elemento, disabled: !abilitato })
  const sopra = stato.sopra?.chiave === k ? stato.sopra.posizione : null
  const ref = (el: HTMLElement | null) => {
    drag.setNodeRef(el)
    drop.setNodeRef(el)
  }
  const attributi = abilitato ? { ...drag.attributes, ...drag.listeners } : {}
  // L'attributo aria-roledescription di dnd-kit non serve: la riga resta un pulsante normale
  delete (attributi as Record<string, unknown>)['aria-roledescription']
  return (
    <div ref={ref} className="tk-albero-drag">
      {children({ attributi, drop: sopra, trascinando: drag.isDragging })}
    </div>
  )
}

function ZonaRadice() {
  const { stato, abilitato } = useContext(DragCtx)
  const drop = useDroppable({ id: 'radice', disabled: !abilitato })
  if (!stato.attivo) return null
  return (
    <div ref={drop.setNodeRef} className="tk-albero-radice" data-over={drop.isOver ? '' : undefined}>
      <FolderRoot aria-hidden /> Sposta alla radice
    </div>
  )
}

/** Dove andrebbe l'elemento trascinato rilasciandolo qui: contenitore e posizione tra i fratelli (o null se vietato). */
function destinazioneDrop(config: TaskConfig, attivo: Elemento, sopraChiave: string, posizione: Posizione):
  { contenitore: number | null; prima: Elemento | null; dopo: Elemento | null } | null {
  const fratelli = (contenitore: number | null, tipo: TaskTipoStruttura): Elemento[] =>
    (tipo === 'LISTA'
      ? config.liste.filter((l) => !l.archiviata && l.cartellaId === contenitore).map((lista) => ({ tipo: 'LISTA', lista }) as Elemento)
      : config.cartelle.filter((c) => !c.archiviata && c.parentId === contenitore).map((cartella) => ({ tipo: 'CARTELLA', cartella }) as Elemento))
      .filter((e) => chiave(e) !== chiave(attivo))
      .sort((a, b) => ordineDi(a) - ordineDi(b))

  let contenitore: number | null
  let rif: Elemento | null = null
  if (sopraChiave === 'radice') contenitore = null
  else {
    const id = Number(sopraChiave.slice(2))
    if (sopraChiave.startsWith('C:')) {
      const c = config.cartelle.find((x) => x.id === id)
      if (!c) return null
      if (attivo.tipo === 'CARTELLA' && posizione !== 'dentro') {
        contenitore = c.parentId
        rif = { tipo: 'CARTELLA', cartella: c }
      } else contenitore = c.id
    } else {
      const l = config.liste.find((x) => x.id === id)
      if (!l) return null
      contenitore = l.cartellaId
      if (attivo.tipo === 'LISTA') rif = { tipo: 'LISTA', lista: l }
    }
  }
  // Una cartella non va dentro sé stessa
  if (contenitore != null) {
    const dest = config.cartelle.find((c) => c.id === contenitore)
    if (!dest) return null
    if (attivo.tipo === 'CARTELLA' && discendenti(config, attivo.cartella.id).has(contenitore)) return null
  }
  const lista = fratelli(contenitore, attivo.tipo)
  if (!rif) return { contenitore, prima: lista[lista.length - 1] ?? null, dopo: null }
  const i = lista.findIndex((e) => chiave(e) === chiave(rif!))
  if (posizione === 'prima') return { contenitore, prima: lista[i - 1] ?? null, dopo: lista[i] ?? null }
  return { contenitore, prima: lista[i] ?? null, dopo: lista[i + 1] ?? null }
}

function Trascinamento({ config, children }: { config: TaskConfig; children: ReactNode }) {
  const [stato, setStato] = useState<StatoTrascinamento>({ attivo: null, sopra: null })
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const valore = useMemo(() => ({ stato, abilitato: true }), [stato])

  const posizioneSopra = (e: DragMoveEvent): StatoTrascinamento['sopra'] => {
    const over = e.over
    if (!over) return null
    const k = String(over.id)
    if (k === 'radice') return { chiave: k, posizione: 'dentro' }
    const attivo = e.active.data.current as Elemento
    const start = (e.activatorEvent as PointerEvent).clientY ?? 0
    const y = start + e.delta.y
    const r = over.rect
    const rel = r.height ? (y - r.top) / r.height : 0.5
    // Su una cartella: bordi = prima/dopo (solo per altre cartelle), centro = dentro. Su una lista: prima/dopo.
    let posizione: Posizione
    if (k.startsWith('C:')) posizione = attivo.tipo === 'CARTELLA' && rel < 0.25 ? 'prima' : attivo.tipo === 'CARTELLA' && rel > 0.75 ? 'dopo' : 'dentro'
    else posizione = rel < 0.5 ? 'prima' : 'dopo'
    if (k === chiave(attivo)) return null
    return destinazioneDrop(config, attivo, k, posizione) ? { chiave: k, posizione } : null
  }

  const onStart = (e: DragStartEvent) => setStato({ attivo: e.active.data.current as Elemento, sopra: null })
  const onMove = (e: DragMoveEvent) => {
    const sopra = posizioneSopra(e)
    setStato((s) => (s.sopra?.chiave === sopra?.chiave && s.sopra?.posizione === sopra?.posizione ? s : { ...s, sopra }))
  }
  const onEnd = async (e: DragEndEvent) => {
    const attivo = stato.attivo
    const sopra = stato.sopra
    setStato({ attivo: null, sopra: null })
    if (!attivo || !sopra || !e.over) return
    const dest = destinazioneDrop(config, attivo, sopra.chiave, sopra.posizione)
    if (!dest) return
    const a = dest.prima ? ordineDi(dest.prima) : null
    const b = dest.dopo ? ordineDi(dest.dopo) : null
    let ordine: number | undefined
    if (a == null && b == null) ordine = undefined
    else if (a == null) ordine = (b as number) - 10
    else if (b == null) ordine = a + 10
    else if (b - a >= 2) ordine = Math.floor((a + b) / 2)
    else {
      // Nessuno spazio tra i due: si rinumerano i fratelli di 10 in 10 e si inserisce subito dopo "prima"
      const ordinati = await rinumera(config, attivo.tipo, dest.contenitore, attivo)
      const i = dest.prima ? ordinati.indexOf(chiave(dest.prima)) : -1
      ordine = (i + 1) * 10 + 5
    }
    await spostaConAnnulla(attivo, dest.contenitore, config, ordine)
  }

  const attivo = stato.attivo
  return (
    <DndContext sensors={sensors} onDragStart={onStart} onDragMove={onMove} onDragEnd={(e) => void onEnd(e)}
      onDragCancel={() => setStato({ attivo: null, sopra: null })}>
      <DragCtx.Provider value={valore}>
        <div className="tk-albero-wrap" data-variante="rail" data-trascinando={attivo ? '' : undefined}>{children}</div>
      </DragCtx.Provider>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
        {attivo ? (
          <div className="tk-albero-overlay" style={{ ['--tk-c' as string]: attivo.tipo === 'LISTA' ? attivo.lista.colore : attivo.cartella.colore }}>
            {attivo.tipo === 'LISTA' ? <TaskListaIcona lista={attivo.lista} size="sm" /> : <span className="tk-albero-folder" aria-hidden><Folder /></span>}
            <span>{nomeDi(attivo)}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

/**
 * Rinumera di 10 in 10 i fratelli (stesso tipo, stesso contenitore) per fare spazio a un inserimento.
 * Restituisce le loro chiavi nel nuovo ordine.
 */
async function rinumera(config: TaskConfig, tipo: TaskTipoStruttura, contenitore: number | null, escludi: Elemento): Promise<string[]> {
  const fratelli = tipo === 'LISTA'
    ? config.liste.filter((l) => !l.archiviata && l.cartellaId === contenitore && !(escludi.tipo === 'LISTA' && escludi.lista.id === l.id))
      .sort((a, b) => a.ordine - b.ordine).map((lista) => ({ tipo: 'LISTA', lista }) as Elemento)
    : config.cartelle.filter((c) => !c.archiviata && c.parentId === contenitore && !(escludi.tipo === 'CARTELLA' && escludi.cartella.id === c.id))
      .sort((a, b) => a.ordine - b.ordine).map((cartella) => ({ tipo: 'CARTELLA', cartella }) as Elemento)
  for (let i = 0; i < fratelli.length; i++) {
    const e = fratelli[i]
    if (ordineDi(e) !== (i + 1) * 10) {
      try {
        await sposta(e, contenitore, (i + 1) * 10)
      } catch {
        // un fratello che non si sposta resta dov'è
      }
    }
  }
  return fratelli.map(chiave)
}
