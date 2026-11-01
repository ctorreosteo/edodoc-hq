import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from "@dnd-kit/core"
import {
  Archive, ArchiveRestore, ChevronRight, Folder, FolderInput, FolderOpen, FolderPlus, FolderRoot, ListPlus,
  ListX, Loader2, MoreHorizontal, Pencil, Plus, Trash2,
} from "lucide-react"
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { Campo, Scelta } from "@/components/forms/campo"
import { Finestra } from "@/components/forms/finestra"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useAzioni } from "@/contexts/azioni-context"
import {
  cartellaDaSelezione, cartellaVuota, chiaveContenitore, costruisciAlbero, discendenti, listaDaSelezione, listeDellaCartella,
  opzioniContenitori, percorsoCartella, type NodoCartella,
} from "@/lib/task-struttura"
import { toast, toastErrore } from "@/lib/toast"
import { taskService } from "@/services/gestionale"
import type { Task, TaskCartella, TaskLista, TaskStruttura, TaskTipoStruttura } from "@/types"
import { TaskListaIcona } from "./task-lista-icona"
import { gruppoScadenza, type TaskSelezione } from "./task-utils"

/** Azioni che il contenitore (rail o sheet mobile) gestisce. */
export type TaskAlberoAzioni = {
  onSeleziona: (s: TaskSelezione) => void
  onCrea: (tipo: TaskTipoStruttura, parentId: number | null) => void
}

type Elemento = { tipo: "LISTA"; lista: TaskLista } | { tipo: "CARTELLA"; cartella: TaskCartella }
type Posizione = "prima" | "dentro" | "dopo"

const chiave = (e: Elemento) => (e.tipo === "LISTA" ? `L:${e.lista.id}` : `C:${e.cartella.id}`)
const nomeDi = (e: Elemento) => (e.tipo === "LISTA" ? e.lista.nome : e.cartella.nome)
const contenitoreDi = (e: Elemento) => (e.tipo === "LISTA" ? e.lista.cartellaId : e.cartella.parentId)
const ordineDi = (e: Elemento) => (e.tipo === "LISTA" ? e.lista.ordine : e.cartella.ordine)

// ---------- Cartelle aperte (in localStorage) ----------

const CHIAVE_APERTE = "task-albero-aperte"

function leggiAperte(): Set<number> {
  try {
    const salvate = JSON.parse(localStorage.getItem(CHIAVE_APERTE) ?? "[]") as number[]
    return new Set(Array.isArray(salvate) ? salvate : [])
  } catch {
    return new Set()
  }
}

function useCartelleAperte(struttura: TaskStruttura, selezione: TaskSelezione) {
  const [aperte, setAperte] = useState(leggiAperte)
  // La cartella selezionata (o quella della lista selezionata) e quelle sopra restano aperte
  useEffect(() => {
    const lista = listaDaSelezione(selezione)
    const base = lista != null ? struttura.liste.find((l) => l.id === lista)?.cartellaId ?? null : cartellaDaSelezione(selezione)
    if (base == null) return
    const percorso = percorsoCartella(struttura, base).map((c) => c.id)
    setAperte((prev) => (percorso.every((id) => prev.has(id)) ? prev : new Set([...prev, ...percorso])))
  }, [selezione, struttura])
  useEffect(() => {
    try {
      localStorage.setItem(CHIAVE_APERTE, JSON.stringify([...aperte]))
    } catch {
      /* solo una preferenza */
    }
  }, [aperte])
  const toggle = useCallback((id: number, forza?: boolean) => {
    setAperte((prev) => {
      const next = new Set(prev)
      if (forza ?? !next.has(id)) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  return { aperte, toggle }
}

// ---------- Albero ----------

type Props = {
  /** Solo i task aperti: i conteggi di liste e cartelle */
  aperti: Task[]
  selezione: TaskSelezione
  azioni: TaskAlberoAzioni
  /** Trascinamento per spostare e riordinare (solo desktop) */
  trascinabile?: boolean
  /** Barra ridotta: solo le icone del primo livello */
  compatta?: boolean
  /** Dentro lo sheet mobile: azioni sempre visibili, righe più alte */
  variante?: "rail" | "sheet"
}

type Conteggi = Map<number, { n: number; ritardo: boolean }>

function Conteggio({ dato }: { dato?: { n: number; ritardo: boolean } }) {
  if (!dato?.n) return null
  return <em className="tk-rail-count" data-tone={dato.ritardo ? "late" : undefined}>{dato.n}</em>
}

/** Struttura di cartelle e liste: navigazione, creazione, menu delle azioni, trascinamento. */
export function TaskAlbero({ aperti, selezione, azioni, trascinabile = false, compatta = false, variante = "rail" }: Props) {
  const { struttura, aggiorna, conferma } = useAzioni()
  const albero = useMemo(() => costruisciAlbero(struttura), [struttura])
  const { aperte, toggle } = useCartelleAperte(struttura, selezione)
  const [rinomina, setRinomina] = useState<string | null>(null)
  const [spostando, setSpostando] = useState<Elemento | null>(null)
  const [eliminandoLista, setEliminandoLista] = useState<TaskLista | null>(null)
  const [archiviateAperte, setArchiviateAperte] = useState(false)

  const conteggiListe = useMemo<Conteggi>(() => {
    const m: Conteggi = new Map()
    aperti.forEach((t) => {
      const d = m.get(t.lista.id) ?? { n: 0, ritardo: false }
      m.set(t.lista.id, { n: d.n + 1, ritardo: d.ritardo || gruppoScadenza(t) === "ritardo" })
    })
    return m
  }, [aperti])

  // Task aperti per cartella: somma delle liste che contiene (sottocartelle comprese)
  const conteggiCartelle = useMemo<Conteggi>(() => {
    const m: Conteggi = new Map()
    struttura.cartelle.forEach((c) => {
      const dati = listeDellaCartella(struttura, c.id).map((l) => conteggiListe.get(l.id))
      m.set(c.id, { n: dati.reduce((n, d) => n + (d?.n ?? 0), 0), ritardo: dati.some((d) => d?.ritardo) })
    })
    return m
  }, [struttura, conteggiListe])

  const eliminaCartella = (cartella: TaskCartella) => conferma({
    titolo: `Eliminare «${cartella.nome}»?`,
    descrizione: "La cartella è vuota.",
    etichetta: "Elimina",
    azione: async () => {
      await taskService.eliminaCartella(cartella.id)
      toast.success(`Cartella «${cartella.nome}» eliminata`)
      aggiorna()
    },
  })

  const ctx: ContestoAlbero = {
    struttura, selezione, azioni, aperte, toggle, conteggiListe, conteggiCartelle, variante, compatta,
    rinomina, setRinomina, onSposta: setSpostando, onEliminaCartella: eliminaCartella, onEliminaLista: setEliminandoLista,
    aggiorna,
  }

  const contenuto = (
    <>
      <div className="tk-albero-head">
        <span className="tk-rail-section-title">Liste</span>
        {!compatta ? <MenuCrea parentId={null} azioni={azioni} etichetta="Nuova lista o cartella" /> : null}
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
            <ChevronRight className="tk-albero-chevron" data-open={archiviateAperte ? "" : undefined} aria-hidden />
            <Archive aria-hidden />
            <span>Archiviate</span>
            <em>{albero.archiviateCartelle.length + albero.archiviateListe.length}</em>
          </button>
          {archiviateAperte ? (
            <ul className="tk-albero tk-albero--archiviate">
              {albero.archiviateCartelle.map((c) => (
                <RigaArchiviata key={`C:${c.id}`} elemento={{ tipo: "CARTELLA", cartella: c }} ctx={ctx} />
              ))}
              {albero.archiviateListe.map((l) => (
                <RigaArchiviata key={`L:${l.id}`} elemento={{ tipo: "LISTA", lista: l }} ctx={ctx} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <SpostaDialog elemento={spostando} ctx={ctx} onClose={() => setSpostando(null)} />
      <EliminaListaDialog lista={eliminandoLista} ctx={ctx} onClose={() => setEliminandoLista(null)} />
    </>
  )

  return trascinabile && !compatta
    ? <Trascinamento struttura={struttura} aggiorna={aggiorna}>{contenuto}</Trascinamento>
    : <div className="tk-albero-wrap" data-variante={variante}>{contenuto}</div>
}

type ContestoAlbero = {
  struttura: TaskStruttura
  selezione: TaskSelezione
  azioni: TaskAlberoAzioni
  aperte: Set<number>
  toggle: (id: number, forza?: boolean) => void
  conteggiListe: Conteggi
  conteggiCartelle: Conteggi
  variante: "rail" | "sheet"
  compatta: boolean
  rinomina: string | null
  setRinomina: (k: string | null) => void
  onSposta: (e: Elemento) => void
  onEliminaCartella: (c: TaskCartella) => void
  onEliminaLista: (l: TaskLista) => void
  aggiorna: () => void
}

function RamoCartella({ nodo, profondita, ctx }: { nodo: NodoCartella; profondita: number; ctx: ContestoAlbero }) {
  const c = nodo.cartella
  const aperta = ctx.aperte.has(c.id) && !ctx.compatta
  const attiva = cartellaDaSelezione(ctx.selezione) === c.id
  const vuota = !nodo.figli.length && !nodo.liste.length
  const elemento: Elemento = { tipo: "CARTELLA", cartella: c }
  const k = chiave(elemento)
  return (
    <li role="treeitem" aria-expanded={vuota ? undefined : aperta} aria-selected={attiva}>
      <RigaTrascinabile elemento={elemento}>
        {(drag) => (
          <ConMenuContestuale elemento={elemento} ctx={ctx}>
            <div className="tk-albero-row" data-active={attiva ? "" : undefined} data-drop={drag.drop ?? undefined}
              data-dragging={drag.trascinando ? "" : undefined} style={{ ["--tk-depth" as string]: profondita, ["--tk-c" as string]: c.colore }}>
              {ctx.compatta ? null : (
                <button type="button" className="tk-albero-chevron-btn" onClick={() => ctx.toggle(c.id)}
                  aria-label={aperta ? `Chiudi ${c.nome}` : `Apri ${c.nome}`} disabled={vuota} tabIndex={-1}>
                  <ChevronRight className="tk-albero-chevron" data-open={aperta ? "" : undefined} aria-hidden />
                </button>
              )}
              {ctx.rinomina === k ? (
                <RinominaInput elemento={elemento} ctx={ctx} />
              ) : (
                <button type="button" className="tk-albero-item" title={c.nome} {...drag.attributi}
                  onClick={() => {
                    ctx.azioni.onSeleziona(`cartella:${c.id}`)
                    if (!aperta) ctx.toggle(c.id, true)
                  }}
                  onDoubleClick={() => ctx.setRinomina(k)}>
                  <span className="tk-albero-folder" aria-hidden>{aperta ? <FolderOpen /> : <Folder />}</span>
                  <span className="tk-rail-label">{c.nome}</span>
                  <Conteggio dato={ctx.conteggiCartelle.get(c.id)} />
                </button>
              )}
              {!ctx.compatta && ctx.rinomina !== k ? (
                <span className="tk-albero-actions" data-sempre={ctx.variante === "sheet" ? "" : undefined}>
                  <MenuCrea parentId={c.id} azioni={ctx.azioni} etichetta={`Aggiungi in ${c.nome}`} />
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
  const elemento: Elemento = { tipo: "LISTA", lista }
  const k = chiave(elemento)
  return (
    <li role="treeitem" aria-selected={attiva}>
      <RigaTrascinabile elemento={elemento}>
        {(drag) => (
          <ConMenuContestuale elemento={elemento} ctx={ctx}>
            <div className="tk-albero-row tk-albero-row--lista" data-active={attiva ? "" : undefined} data-drop={drag.drop ?? undefined}
              data-dragging={drag.trascinando ? "" : undefined}
              style={{ ["--tk-depth" as string]: profondita, ["--tk-c" as string]: lista.colore }}>
              {ctx.compatta ? null : <span className="tk-albero-chevron-btn" aria-hidden />}
              {ctx.rinomina === k ? (
                <RinominaInput elemento={elemento} ctx={ctx} />
              ) : (
                <button type="button" className="tk-albero-item" title={lista.nome} aria-current={attiva ? "page" : undefined}
                  {...drag.attributi} onClick={() => ctx.azioni.onSeleziona(`lista:${lista.id}`)}
                  onDoubleClick={() => ctx.setRinomina(k)}>
                  <TaskListaIcona lista={lista} size="sm" />
                  <span className="tk-rail-label">{lista.nome}</span>
                  <Conteggio dato={ctx.conteggiListe.get(lista.id)} />
                </button>
              )}
              {!ctx.compatta && ctx.rinomina !== k ? (
                <span className="tk-albero-actions" data-sempre={ctx.variante === "sheet" ? "" : undefined}>
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

function RigaArchiviata({ elemento, ctx }: { elemento: Elemento; ctx: ContestoAlbero }) {
  const [salvando, setSalvando] = useState(false)
  const percorso = percorsoCartella(ctx.struttura, contenitoreDi(elemento)).map((c) => c.nome).join(" / ")
  return (
    <li className="tk-albero-row tk-albero-row--archiviata">
      <span className="tk-albero-item" title={percorso ? `${percorso} / ${nomeDi(elemento)}` : nomeDi(elemento)}>
        {elemento.tipo === "CARTELLA" ? <span className="tk-albero-folder" aria-hidden><Folder /></span> : <TaskListaIcona lista={elemento.lista} size="sm" />}
        <span className="tk-rail-label">{nomeDi(elemento)}</span>
      </span>
      <button type="button" className="tk-albero-ripristina" disabled={salvando}
        onClick={async () => {
          setSalvando(true)
          if (await archivia(elemento, false, ctx.aggiorna)) toast.success(`«${nomeDi(elemento)}» ripristinata`)
          setSalvando(false)
        }}>
        {salvando ? <Loader2 className="animate-spin" aria-hidden /> : <ArchiveRestore aria-hidden />} Ripristina
      </button>
    </li>
  )
}

// ---------- Menu ----------

function MenuCrea({ parentId, azioni, etichetta }: { parentId: number | null; azioni: TaskAlberoAzioni; etichetta: string }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="tk-albero-btn" aria-label={etichetta} title={etichetta}>
          <Plus aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 tk-menu-solido">
        <DropdownMenuItem onSelect={() => azioni.onCrea("LISTA", parentId)} className="gap-2">
          <ListPlus className="size-4" /> Nuova lista
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => azioni.onCrea("CARTELLA", parentId)} className="gap-2">
          <FolderPlus className="size-4" /> {parentId == null ? "Nuova cartella" : "Nuova sottocartella"}
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
  variant?: "default" | "destructive"
  children: ReactNode
}

/** Voci comuni al menu "⋯" e al menu del tasto destro (stessi componenti, primitive diverse). */
function VociElemento({ elemento, ctx, Voce, Separatore }: {
  elemento: Elemento
  ctx: ContestoAlbero
  Voce: (p: VoceProps) => ReactNode
  Separatore: () => ReactNode
}) {
  const cartella = elemento.tipo === "CARTELLA" ? elemento.cartella : null
  const lista = elemento.tipo === "LISTA" ? elemento.lista : null
  const vuota = cartella ? cartellaVuota(ctx.struttura, cartella.id) : false
  const diSistema = lista?.codice != null
  return (
    <>
      <Voce onSelect={() => ctx.setRinomina(chiave(elemento))} className="gap-2">
        <Pencil className="size-4" /> Rinomina
      </Voce>
      {cartella ? (
        <>
          <Separatore />
          <Voce onSelect={() => ctx.azioni.onCrea("LISTA", cartella.id)} className="gap-2">
            <ListPlus className="size-4" /> Nuova lista qui
          </Voce>
          <Voce onSelect={() => ctx.azioni.onCrea("CARTELLA", cartella.id)} className="gap-2">
            <FolderPlus className="size-4" /> Nuova sottocartella
          </Voce>
        </>
      ) : null}
      <Separatore />
      <Voce onSelect={() => ctx.onSposta(elemento)} className="gap-2">
        <FolderInput className="size-4" /> Sposta in…
      </Voce>
      {!diSistema ? (
        <Voce onSelect={() => void archivia(elemento, true, ctx.aggiorna).then((ok) => {
          if (!ok) return
          if (chiaveSelezione(ctx.selezione) === chiave(elemento)) ctx.azioni.onSeleziona("miei")
          toast.success(`«${nomeDi(elemento)}» archiviata`, {
            description: 'La trovi in fondo, sotto "Archiviate".',
            action: { label: "Annulla", onClick: () => void archivia(elemento, false, ctx.aggiorna) },
          })
        })} className="gap-2">
          <Archive className="size-4" /> Archivia
        </Voce>
      ) : null}
      {cartella ? (
        <Voce disabled={!vuota} onSelect={() => ctx.onEliminaCartella(cartella)} variant="destructive" className="gap-2"
          title={vuota ? undefined : "Si possono eliminare solo le cartelle vuote: sposta o archivia prima il contenuto"}>
          <Trash2 className="size-4" /> Elimina{vuota ? "" : " (solo se vuota)"}
        </Voce>
      ) : null}
      {lista && !diSistema ? (
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
      <DropdownMenuContent align="start" className="w-60 tk-menu-solido">
        <VociElemento elemento={elemento} ctx={ctx} Voce={(p) => <DropdownMenuItem {...p} />} Separatore={() => <DropdownMenuSeparator />} />
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
      <ContextMenuContent className="w-60 tk-menu-solido">
        <VociElemento elemento={elemento} ctx={ctx} Voce={(p) => <ContextMenuItem {...p} />} Separatore={() => <ContextMenuSeparator />} />
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

async function archivia(e: Elemento, archiviata: boolean, aggiorna: () => void): Promise<boolean> {
  try {
    if (e.tipo === "LISTA") await taskService.modificaLista(e.lista.id, { archiviata })
    else await taskService.modificaCartella(e.cartella.id, { archiviata })
    aggiorna()
    return true
  } catch (err) {
    toastErrore(err)
    return false
  }
}

async function sposta(e: Elemento, contenitoreId: number | null, ordine?: number) {
  if (e.tipo === "LISTA") await taskService.spostaLista(e.lista.id, { contenitoreId, ordine })
  else await taskService.spostaCartella(e.cartella.id, { contenitoreId, ordine })
}

/** Sposta con toast "Annulla" (rimette contenitore e posizione di prima). */
async function spostaConAnnulla(e: Elemento, destinazione: number | null, struttura: TaskStruttura, aggiorna: () => void, ordine?: number) {
  const prima = { contenitore: contenitoreDi(e), ordine: ordineDi(e) }
  try {
    await sposta(e, destinazione, ordine)
    aggiorna()
    const dove = destinazione == null ? "Radice" : struttura.cartelle.find((c) => c.id === destinazione)?.nome ?? "cartella"
    toast.success(destinazione === prima.contenitore ? `«${nomeDi(e)}» riordinata` : `«${nomeDi(e)}» spostata in ${dove}`, {
      action: { label: "Annulla", onClick: () => void sposta(e, prima.contenitore, prima.ordine).then(aggiorna).catch(toastErrore) },
    })
  } catch (err) {
    toastErrore(err)
  }
}

function RinominaInput({ elemento, ctx }: { elemento: Elemento; ctx: ContestoAlbero }) {
  const [valore, setValore] = useState(nomeDi(elemento))
  const [salvando, setSalvando] = useState(false)
  const fine = () => ctx.setRinomina(null)
  const salva = async () => {
    const nome = valore.trim()
    if (!nome || nome === nomeDi(elemento)) return fine()
    setSalvando(true)
    try {
      if (elemento.tipo === "LISTA") await taskService.modificaLista(elemento.lista.id, { nome })
      else await taskService.modificaCartella(elemento.cartella.id, { nome })
      ctx.aggiorna()
      fine()
    } catch (err) {
      toastErrore(err)
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
        if (e.key === "Enter") {
          e.preventDefault()
          void salva()
        } else if (e.key === "Escape") {
          e.preventDefault()
          fine()
        }
      }} />
  )
}

function SpostaDialog({ elemento, ctx, onClose }: { elemento: Elemento | null; ctx: ContestoAlbero; onClose: () => void }) {
  const [destinazione, setDestinazione] = useState("radice")
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    if (elemento) setDestinazione(chiaveContenitore(contenitoreDi(elemento)))
  }, [elemento])
  if (!elemento) return null
  const escludiId = elemento.tipo === "CARTELLA" ? elemento.cartella.id : undefined
  return (
    <Finestra open onOpenChange={(o) => !o && onClose()} titolo={`Sposta «${nomeDi(elemento)}»`} etichettaSalva="Sposta" inCorso={salvando}
      descrizione="Scegli la cartella in cui metterla, oppure la radice."
      disabilitaSalva={destinazione === chiaveContenitore(contenitoreDi(elemento))}
      salva={async () => {
        setSalvando(true)
        await spostaConAnnulla(elemento, cartellaDaSelezione(destinazione), ctx.struttura, ctx.aggiorna)
        setSalvando(false)
        onClose()
      }}>
      <Campo etichetta="Dove" id="tk-sposta-dove">
        <Scelta id="tk-sposta-dove" valore={destinazione} onChange={setDestinazione} opzioni={opzioniContenitori(ctx.struttura, escludiId)} />
      </Campo>
    </Finestra>
  )
}

/** Eliminare una lista elimina i suoi task: se ce ne sono, si conferma scrivendone il nome. */
function EliminaListaDialog({ lista, ctx, onClose }: { lista: TaskLista | null; ctx: ContestoAlbero; onClose: () => void }) {
  const [numeroTask, setNumeroTask] = useState<number | null>(null)
  const [conferma, setConferma] = useState("")
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    setConferma("")
    setNumeroTask(null)
    if (lista) taskService.contaTaskLista(lista.id).then(setNumeroTask).catch(toastErrore)
  }, [lista])
  if (!lista) return null
  const conTask = !!numeroTask
  return (
    <Finestra open onOpenChange={(o) => !o && onClose()} titolo={`Eliminare «${lista.nome}»?`} etichettaSalva="Elimina lista" inCorso={salvando}
      descrizione={numeroTask == null ? "Controllo i task della lista…" : conTask ? `Verranno eliminati anche i suoi ${numeroTask} task, completati compresi. Non si può annullare.` : "La lista è vuota."}
      disabilitaSalva={numeroTask == null || (conTask && conferma !== lista.nome)}
      salva={async () => {
        setSalvando(true)
        try {
          await taskService.eliminaLista(lista.id, conferma)
          if (listaDaSelezione(ctx.selezione) === lista.id) ctx.azioni.onSeleziona("miei")
          toast.success(`Lista «${lista.nome}» eliminata`)
          ctx.aggiorna()
          onClose()
        } catch (err) {
          toastErrore(err)
        } finally {
          setSalvando(false)
        }
      }}>
      {conTask ? (
        <Campo etichetta={`Scrivi «${lista.nome}» per confermare`} id="tk-elimina-conferma">
          <Input id="tk-elimina-conferma" value={conferma} autoComplete="off" onChange={(e) => setConferma(e.target.value)} />
        </Campo>
      ) : null}
    </Finestra>
  )
}

// ---------- Trascinamento ----------

type StatoTrascinamento = {
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
  // L"attributo aria-roledescription di dnd-kit non serve: la riga resta un pulsante normale
  delete (attributi as Record<string, unknown>)["aria-roledescription"]
  return (
    <div ref={ref} className="tk-albero-drag">
      {children({ attributi, drop: sopra, trascinando: drag.isDragging })}
    </div>
  )
}

function ZonaRadice() {
  const { stato, abilitato } = useContext(DragCtx)
  const drop = useDroppable({ id: "radice", disabled: !abilitato })
  if (!stato.attivo) return null
  return (
    <div ref={drop.setNodeRef} className="tk-albero-radice" data-over={drop.isOver ? "" : undefined}>
      <FolderRoot aria-hidden /> Sposta alla radice
    </div>
  )
}

/** Dove andrebbe l"elemento trascinato rilasciandolo qui: contenitore e posizione tra i fratelli (o null se vietato). */
function destinazioneDrop(struttura: TaskStruttura, attivo: Elemento, sopraChiave: string, posizione: Posizione):
  { contenitore: number | null; prima: Elemento | null; dopo: Elemento | null } | null {
  const fratelli = (contenitore: number | null, tipo: TaskTipoStruttura): Elemento[] =>
    (tipo === "LISTA"
      ? struttura.liste.filter((l) => !l.archiviata && l.cartellaId === contenitore).map((lista) => ({ tipo: "LISTA", lista }) as Elemento)
      : struttura.cartelle.filter((c) => !c.archiviata && c.parentId === contenitore).map((cartella) => ({ tipo: "CARTELLA", cartella }) as Elemento))
      .filter((e) => chiave(e) !== chiave(attivo))
      .sort((a, b) => ordineDi(a) - ordineDi(b))

  let contenitore: number | null
  let rif: Elemento | null = null
  if (sopraChiave === "radice") contenitore = null
  else {
    const id = Number(sopraChiave.slice(2))
    if (sopraChiave.startsWith("C:")) {
      const c = struttura.cartelle.find((x) => x.id === id)
      if (!c) return null
      if (attivo.tipo === "CARTELLA" && posizione !== "dentro") {
        contenitore = c.parentId
        rif = { tipo: "CARTELLA", cartella: c }
      } else contenitore = c.id
    } else {
      const l = struttura.liste.find((x) => x.id === id)
      if (!l) return null
      contenitore = l.cartellaId
      if (attivo.tipo === "LISTA") rif = { tipo: "LISTA", lista: l }
    }
  }
  // Una cartella non va dentro sé stessa
  if (contenitore != null && attivo.tipo === "CARTELLA" && discendenti(struttura, attivo.cartella.id).has(contenitore)) return null
  const lista = fratelli(contenitore, attivo.tipo)
  if (!rif) return { contenitore, prima: lista[lista.length - 1] ?? null, dopo: null }
  const i = lista.findIndex((e) => chiave(e) === chiave(rif!))
  if (posizione === "prima") return { contenitore, prima: lista[i - 1] ?? null, dopo: lista[i] ?? null }
  return { contenitore, prima: lista[i] ?? null, dopo: lista[i + 1] ?? null }
}

function Trascinamento({ struttura, aggiorna, children }: { struttura: TaskStruttura; aggiorna: () => void; children: ReactNode }) {
  const [stato, setStato] = useState<StatoTrascinamento>({ attivo: null, sopra: null })
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const valore = useMemo(() => ({ stato, abilitato: true }), [stato])

  const posizioneSopra = (e: DragMoveEvent): StatoTrascinamento["sopra"] => {
    const over = e.over
    if (!over) return null
    const k = String(over.id)
    if (k === "radice") return { chiave: k, posizione: "dentro" }
    const attivo = e.active.data.current as Elemento
    const start = (e.activatorEvent as PointerEvent).clientY ?? 0
    const y = start + e.delta.y
    const r = over.rect
    const rel = r.height ? (y - r.top) / r.height : 0.5
    // Su una cartella: bordi = prima/dopo (solo per altre cartelle), centro = dentro. Su una lista: prima/dopo.
    let posizione: Posizione
    if (k.startsWith("C:")) posizione = attivo.tipo === "CARTELLA" && rel < 0.25 ? "prima" : attivo.tipo === "CARTELLA" && rel > 0.75 ? "dopo" : "dentro"
    else posizione = rel < 0.5 ? "prima" : "dopo"
    if (k === chiave(attivo)) return null
    return destinazioneDrop(struttura, attivo, k, posizione) ? { chiave: k, posizione } : null
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
    const dest = destinazioneDrop(struttura, attivo, sopra.chiave, sopra.posizione)
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
      const ordinati = await rinumera(struttura, attivo.tipo, dest.contenitore, attivo)
      const i = dest.prima ? ordinati.indexOf(chiave(dest.prima)) : -1
      ordine = (i + 1) * 10 + 5
    }
    await spostaConAnnulla(attivo, dest.contenitore, struttura, aggiorna, ordine)
  }

  const attivo = stato.attivo
  return (
    <DndContext sensors={sensors} onDragStart={onStart} onDragMove={onMove} onDragEnd={(e) => void onEnd(e)}
      onDragCancel={() => setStato({ attivo: null, sopra: null })}>
      <DragCtx.Provider value={valore}>
        <div className="tk-albero-wrap" data-variante="rail" data-trascinando={attivo ? "" : undefined}>{children}</div>
      </DragCtx.Provider>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
        {attivo ? (
          <div className="tk-albero-overlay" style={{ ["--tk-c" as string]: attivo.tipo === "LISTA" ? attivo.lista.colore : attivo.cartella.colore }}>
            {attivo.tipo === "LISTA" ? <TaskListaIcona lista={attivo.lista} size="sm" /> : <span className="tk-albero-folder" aria-hidden><Folder /></span>}
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
async function rinumera(struttura: TaskStruttura, tipo: TaskTipoStruttura, contenitore: number | null, escludi: Elemento): Promise<string[]> {
  const fratelli = tipo === "LISTA"
    ? struttura.liste.filter((l) => !l.archiviata && l.cartellaId === contenitore && !(escludi.tipo === "LISTA" && escludi.lista.id === l.id))
      .sort((a, b) => a.ordine - b.ordine).map((lista) => ({ tipo: "LISTA", lista }) as Elemento)
    : struttura.cartelle.filter((c) => !c.archiviata && c.parentId === contenitore && !(escludi.tipo === "CARTELLA" && escludi.cartella.id === c.id))
      .sort((a, b) => a.ordine - b.ordine).map((cartella) => ({ tipo: "CARTELLA", cartella }) as Elemento)
  for (let i = 0; i < fratelli.length; i++) {
    const e = fratelli[i]
    if (ordineDi(e) !== (i + 1) * 10) {
      await sposta(e, contenitore, (i + 1) * 10)
    }
  }
  return fratelli.map(chiave)
}
