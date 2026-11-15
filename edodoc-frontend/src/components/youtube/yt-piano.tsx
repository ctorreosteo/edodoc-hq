import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarClock, Clapperboard, Eye, FileText, Lightbulb, Loader2, PartyPopper, Plus, Rocket, Scissors, Sparkles, Trash2, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { celebra } from '@/lib/task-festa'
import { toast } from '@/lib/toast'
import { errorMessage } from '@/lib/youtube'
import { cn } from '@/lib/utils'
import {
  youtubeService,
  type YoutubeFormato,
  type YoutubeIdea,
  type YoutubeIdeaInput,
  type YoutubePersona,
  type YoutubePriorita,
  type YoutubeStatoIdea,
  type YoutubeVideo,
} from '@/services/youtube-service'
import { Caricamento, Vuoto } from './yt-shared'
import { fmt } from '@/lib/youtube'

const COLONNE: Array<{ id: YoutubeStatoIdea; label: string; icona: typeof Lightbulb }> = [
  { id: 'IDEA', label: 'Idee', icona: Lightbulb },
  { id: 'SCRIPT', label: 'Script', icona: FileText },
  { id: 'RIPRESE', label: 'Riprese', icona: Clapperboard },
  { id: 'MONTAGGIO', label: 'Montaggio', icona: Scissors },
  { id: 'PRONTO', label: 'Pronto', icona: CalendarClock },
  { id: 'PUBBLICATO', label: 'Pubblicato', icona: Rocket },
]

const FORMATI: Record<YoutubeFormato, string> = { VIDEO: 'Video', SHORT: 'Short', LIVE: 'Live' }
const PRIORITA: Record<YoutubePriorita, string> = { ALTA: 'Alta', MEDIA: 'Media', BASSA: 'Bassa' }

type Colonne = Record<YoutubeStatoIdea, YoutubeIdea[]>

function raggruppa(idee: YoutubeIdea[]): Colonne {
  const out = Object.fromEntries(COLONNE.map((c) => [c.id, [] as YoutubeIdea[]])) as unknown as Colonne
  for (const i of [...idee].sort((a, b) => a.posizione - b.posizione || a.id - b.id)) (out[i.stato] ?? out.IDEA).push(i)
  return out
}

function colonnaDi(col: Colonne, id: string): YoutubeStatoIdea | null {
  if (COLONNE.some((c) => c.id === id)) return id as YoutubeStatoIdea
  for (const c of COLONNE) if (col[c.id].some((i) => String(i.id) === id)) return c.id
  return null
}

export function PianoTab({
  puoGestire,
  video,
  onAi,
}: {
  puoGestire: boolean
  video: YoutubeVideo[] | null
  onAi: (idea: YoutubeIdea) => void
}) {
  const [col, setCol] = useState<Colonne | null>(null)
  const [persone, setPersone] = useState<YoutubePersona[]>([])
  const [errore, setErrore] = useState<string | null>(null)
  const [trascinata, setTrascinata] = useState<YoutubeIdea | null>(null)
  const [modifica, setModifica] = useState<Partial<YoutubeIdea> | null>(null)
  const partenza = useRef<YoutubeStatoIdea | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    youtubeService.idee(ctrl.signal).then((i) => setCol(raggruppa(i))).catch((e) => !ctrl.signal.aborted && setErrore(errorMessage(e)))
    youtubeService.responsabili(ctrl.signal).then(setPersone).catch(() => undefined)
    return () => ctrl.abort()
  }, [])

  const videoPerId = useMemo(() => new Map((video ?? []).map((v) => [v.id, v])), [video])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const prossime = useMemo(() => {
    if (!col) return []
    return COLONNE.filter((c) => c.id !== 'PUBBLICATO')
      .flatMap((c) => col[c.id])
      .filter((i) => i.dataUscita)
      .sort((a, b) => (a.dataUscita! < b.dataUscita! ? -1 : 1))
      .slice(0, 6)
  }, [col])

  if (errore) return <Vuoto>{errore}</Vuoto>
  if (!col) return <Caricamento righe={5} />

  const salvaOrdine = async (nuove: Colonne, stati: YoutubeStatoIdea[]) => {
    const ordine = stati.flatMap((s) => nuove[s].map((i, posizione) => ({ id: i.id, stato: s, posizione })))
    try {
      const aggiornate = await youtubeService.riordinaIdee(ordine)
      setCol(raggruppa(aggiornate))
    } catch (e) {
      toast.error(errorMessage(e, 'Ordine non salvato'))
    }
  }

  const onDragStart = ({ active }: DragStartEvent) => {
    const s = colonnaDi(col, String(active.id))
    partenza.current = s
    setTrascinata(s ? col[s].find((i) => String(i.id) === String(active.id)) ?? null : null)
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    const da = colonnaDi(col, String(active.id))
    const a = colonnaDi(col, String(over.id))
    if (!da || !a || da === a) return
    setCol((c) => {
      if (!c) return c
      const item = c[da].find((i) => String(i.id) === String(active.id))
      if (!item) return c
      const destinazione = [...c[a]]
      const idx = destinazione.findIndex((i) => String(i.id) === String(over.id))
      destinazione.splice(idx < 0 ? destinazione.length : idx, 0, { ...item, stato: a })
      return { ...c, [da]: c[da].filter((i) => i.id !== item.id), [a]: destinazione }
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setTrascinata(null)
    const inizio = partenza.current
    partenza.current = null
    if (!over || !inizio) return
    const s = colonnaDi(col, String(active.id))
    if (!s) return
    let nuove = col
    const vecchio = col[s].findIndex((i) => String(i.id) === String(active.id))
    const nuovo = col[s].findIndex((i) => String(i.id) === String(over.id))
    if (vecchio >= 0 && nuovo >= 0 && vecchio !== nuovo) {
      nuove = { ...col, [s]: arrayMove(col[s], vecchio, nuovo) }
      setCol(nuove)
    }
    if (s === 'PUBBLICATO' && inizio !== 'PUBBLICATO') {
      celebra(boardRef.current?.querySelector('[data-col="PUBBLICATO"]') as HTMLElement | null, 28)
      toast.success('Pubblicato! Collega il video alla scheda per vederne i numeri.')
    }
    void salvaOrdine(nuove, Array.from(new Set([inizio, s])))
  }

  const salva = async (dati: YoutubeIdeaInput, id?: number) => {
    const salvata = id ? await youtubeService.aggiornaIdea(id, dati) : await youtubeService.creaIdea(dati)
    setCol((c) => {
      if (!c) return c
      const tutte = COLONNE.flatMap((x) => c[x.id]).filter((i) => i.id !== salvata.id)
      return raggruppa(id ? [...tutte, salvata] : [salvata, ...tutte])
    })
    toast.success(id ? 'Scheda aggiornata' : 'Scheda creata')
  }

  const elimina = async (id: number) => {
    await youtubeService.eliminaIdea(id)
    setCol((c) => (c ? raggruppa(COLONNE.flatMap((x) => c[x.id]).filter((i) => i.id !== id)) : c))
    toast.success('Scheda eliminata')
  }

  const totale = COLONNE.reduce((s, c) => s + col[c.id].length, 0)
  const inLavorazione = col.SCRIPT.length + col.RIPRESE.length + col.MONTAGGIO.length

  return (
    <div className="yt-stack">
      <div className="yt-plan-head">
        <div className="yt-plan-stats">
          <p><b>{totale}</b> schede</p>
          <p><b>{col.IDEA.length}</b> idee in attesa</p>
          <p><b>{inLavorazione}</b> in lavorazione</p>
          <p><b>{col.PRONTO.length}</b> pronte a uscire</p>
        </div>
        {puoGestire ? (
          <Button className="yt-cta" onClick={() => setModifica({ stato: 'IDEA', formato: 'VIDEO', priorita: 'MEDIA' })}>
            <Plus aria-hidden /> Nuova idea
          </Button>
        ) : null}
      </div>

      {prossime.length ? (
        <div className="yt-upcoming">
          <p className="yt-upcoming-label"><CalendarClock aria-hidden /> Prossime uscite</p>
          <ol>
            {prossime.map((i) => {
              const giorni = Math.round((new Date(`${i.dataUscita}T12:00:00`).getTime() - Date.now()) / 86400_000)
              return (
                <li key={i.id} data-ritardo={giorni < 0 ? '' : undefined}>
                  <button type="button" onClick={() => setModifica(i)}>
                    <b>{fmt.giorno(i.dataUscita!)}</b>
                    <p>{i.titolo}</p>
                    <small>{giorni < 0 ? `in ritardo di ${-giorni} g` : giorni === 0 ? 'oggi' : `tra ${giorni} g`} · {COLONNE.find((c) => c.id === i.stato)?.label}</small>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}
        onDragCancel={() => { setTrascinata(null); partenza.current = null }}>
        <div className="yt-board" ref={boardRef}>
          {COLONNE.map((c) => (
            <Colonna key={c.id} colonna={c} idee={col[c.id]} video={videoPerId} disabilitato={!puoGestire} onApri={setModifica} />
          ))}
        </div>
        <DragOverlay>{trascinata ? <Scheda idea={trascinata} video={videoPerId} sollevata /> : null}</DragOverlay>
      </DndContext>

      <IdeaDialog
        idea={modifica}
        persone={persone}
        puoGestire={puoGestire}
        onChiudi={() => setModifica(null)}
        onSalva={salva}
        onElimina={elimina}
        onAi={(i) => { setModifica(null); onAi(i) }}
      />
    </div>
  )
}

function Colonna({
  colonna,
  idee,
  video,
  disabilitato,
  onApri,
}: {
  colonna: (typeof COLONNE)[number]
  idee: YoutubeIdea[]
  video: Map<string, YoutubeVideo>
  disabilitato: boolean
  onApri: (i: YoutubeIdea) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colonna.id, disabled: disabilitato })
  const Icona = colonna.icona
  return (
    <section className="yt-col" data-col={colonna.id} data-over={isOver ? '' : undefined}>
      <header className="yt-col-head">
        <Icona aria-hidden />
        <p>{colonna.label}</p>
        <em>{idee.length}</em>
      </header>
      <SortableContext items={idee.map((i) => String(i.id))} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="yt-col-body">
          {idee.map((i) => (
            <SchedaOrdinabile key={i.id} idea={i} video={video} disabilitato={disabilitato} onApri={onApri} />
          ))}
          {!idee.length ? <p className="yt-col-empty">Trascina qui</p> : null}
        </div>
      </SortableContext>
    </section>
  )
}

function SchedaOrdinabile({ idea, video, disabilitato, onApri }: { idea: YoutubeIdea; video: Map<string, YoutubeVideo>; disabilitato: boolean; onApri: (i: YoutubeIdea) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(idea.id), disabled: disabilitato })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }} {...attributes} {...listeners}>
      <Scheda idea={idea} video={video} onClick={() => onApri(idea)} />
    </div>
  )
}

function Scheda({ idea, video, onClick, sollevata }: { idea: YoutubeIdea; video: Map<string, YoutubeVideo>; onClick?: () => void; sollevata?: boolean }) {
  const v = idea.videoId ? video.get(idea.videoId) : undefined
  const ritardo = idea.dataUscita && idea.stato !== 'PUBBLICATO' && idea.dataUscita < new Date().toISOString().slice(0, 10)
  return (
    <article className={cn('yt-card', sollevata && 'yt-card--lifted')} data-priorita={idea.priorita} onClick={onClick}>
      {v?.miniatura ? <img src={v.miniatura} alt="" className="yt-card-thumb" referrerPolicy="no-referrer" /> : null}
      <p className="yt-card-title">{idea.titolo}</p>
      <div className="yt-card-meta">
        <em className="yt-chip" data-tono={idea.formato === 'SHORT' ? 'violet' : idea.formato === 'LIVE' ? 'hot' : 'info'}>{FORMATI[idea.formato]}</em>
        {idea.priorita === 'ALTA' ? <em className="yt-chip" data-tono="hot">Priorità alta</em> : null}
        {idea.dataUscita ? (
          <em className="yt-chip" data-tono={ritardo ? 'danger' : 'muted'}><CalendarClock aria-hidden /> {fmt.giorno(idea.dataUscita)}</em>
        ) : null}
      </div>
      <div className="yt-card-foot">
        {/* In EdoDoc lavora solo il dottore: il responsabile compare solo se qualcuno l'ha indicato */}
        {idea.responsabileNome ? <p><User aria-hidden /> {idea.responsabileNome}</p> : <p />}
        {v ? <p><Eye aria-hidden /> {fmt.compact(v.visualizzazioni)}</p> : null}
      </div>
    </article>
  )
}

function IdeaDialog({
  idea,
  persone,
  puoGestire,
  onChiudi,
  onSalva,
  onElimina,
  onAi,
}: {
  idea: Partial<YoutubeIdea> | null
  persone: YoutubePersona[]
  puoGestire: boolean
  onChiudi: () => void
  onSalva: (d: YoutubeIdeaInput, id?: number) => Promise<void>
  onElimina: (id: number) => Promise<void>
  onAi: (i: YoutubeIdea) => void
}) {
  const [f, setF] = useState<Partial<YoutubeIdea>>({})
  const [salvo, setSalvo] = useState(false)
  useEffect(() => setF(idea ?? {}), [idea])
  const set = <K extends keyof YoutubeIdea>(k: K, v: YoutubeIdea[K]) => setF((x) => ({ ...x, [k]: v }))

  const salva = async () => {
    setSalvo(true)
    try {
      await onSalva(
        {
          titolo: f.titolo ?? '',
          note: f.note ?? null,
          stato: f.stato,
          formato: f.formato,
          priorita: f.priorita,
          dataUscita: f.dataUscita || null,
          videoId: f.videoId || null,
          responsabileId: f.responsabileId ?? null,
        },
        f.id,
      )
      if (f.stato === 'PUBBLICATO' && idea?.stato !== 'PUBBLICATO') celebra(null, 30)
      onChiudi()
    } catch (e) {
      toast.error(errorMessage(e, 'Scheda non salvata'))
    } finally {
      setSalvo(false)
    }
  }

  return (
    <Dialog open={idea != null} onOpenChange={(o) => !o && onChiudi()}>
      <DialogContent className="yt-root sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{f.id ? 'Scheda video' : 'Nuova idea'}</DialogTitle>
          <DialogDescription>Dall’idea alla pubblicazione: script, riprese, uscita e video collegato.</DialogDescription>
        </DialogHeader>
        <div className="yt-form">
          <label className="yt-field">
            <div className="yt-field-head"><p>Titolo di lavoro</p></div>
            <Input autoFocus value={f.titolo ?? ''} onChange={(e) => set('titolo', e.target.value)} disabled={!puoGestire} placeholder="es. Fame nervosa la sera: 3 strategie che funzionano davvero" />
          </label>
          <div className="yt-form-row">
            <div className="yt-field">
              <div className="yt-field-head"><p>Fase</p></div>
              <Select value={f.stato ?? 'IDEA'} onValueChange={(v) => set('stato', v as YoutubeStatoIdea)} disabled={!puoGestire}>
                <SelectTrigger className="yt-select"><SelectValue /></SelectTrigger>
                <SelectContent>{COLONNE.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="yt-field">
              <div className="yt-field-head"><p>Formato</p></div>
              <Select value={f.formato ?? 'VIDEO'} onValueChange={(v) => set('formato', v as YoutubeFormato)} disabled={!puoGestire}>
                <SelectTrigger className="yt-select"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(FORMATI).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="yt-field">
              <div className="yt-field-head"><p>Priorità</p></div>
              <Select value={f.priorita ?? 'MEDIA'} onValueChange={(v) => set('priorita', v as YoutubePriorita)} disabled={!puoGestire}>
                <SelectTrigger className="yt-select"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PRIORITA).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="yt-form-row">
            <label className="yt-field">
              <div className="yt-field-head"><p>Uscita prevista</p></div>
              <Input type="date" value={f.dataUscita ?? ''} onChange={(e) => set('dataUscita', e.target.value || null)} disabled={!puoGestire} />
            </label>
            {persone.length > 1 || f.responsabileId ? (
            <div className="yt-field">
              <div className="yt-field-head"><p>Responsabile</p></div>
              <Select value={f.responsabileId ? String(f.responsabileId) : 'nessuno'} onValueChange={(v) => set('responsabileId', v === 'nessuno' ? null : Number(v))} disabled={!puoGestire}>
                <SelectTrigger className="yt-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nessuno">Nessuno</SelectItem>
                  {persone.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            ) : null}
          </div>
          <label className="yt-field">
            <div className="yt-field-head"><p>Video YouTube collegato</p></div>
            <Input value={f.videoId ?? ''} onChange={(e) => set('videoId', e.target.value)} disabled={!puoGestire} placeholder="Incolla il link del video quando esce" />
          </label>
          <label className="yt-field">
            <div className="yt-field-head"><p>Note, scaletta, script</p></div>
            <Textarea value={f.note ?? ''} onChange={(e) => set('note', e.target.value)} rows={7} disabled={!puoGestire} placeholder="Gancio iniziale, punti chiave, call to action…" />
          </label>
        </div>
        <DialogFooter className="yt-dialog-foot">
          {f.id && puoGestire ? (
            <Button variant="ghost" className="yt-danger-btn mr-auto" onClick={() => { if (window.confirm('Eliminare questa scheda?')) void onElimina(f.id!).then(onChiudi) }}>
              <Trash2 aria-hidden /> Elimina
            </Button>
          ) : null}
          {f.id && puoGestire ? (
            <Button variant="outline" onClick={() => onAi(f as YoutubeIdea)}>
              <Sparkles aria-hidden /> Pacchetto AI
            </Button>
          ) : null}
          {puoGestire ? (
            <Button className="yt-cta" disabled={!f.titolo?.trim() || salvo} onClick={salva}>
              {salvo ? <Loader2 className="animate-spin" aria-hidden /> : f.stato === 'PUBBLICATO' ? <PartyPopper aria-hidden /> : null}
              {f.id ? 'Salva' : 'Crea scheda'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
