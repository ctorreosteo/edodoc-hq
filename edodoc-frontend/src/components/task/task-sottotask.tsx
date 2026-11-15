import { useMemo, useRef, useState } from 'react'
import { CalendarClock, CornerDownRight, Hourglass, Link2, Loader2, Plus, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { useAuth } from '@/contexts/auth-context'
import { useTaskConfig } from '@/hooks/use-task-config'
import { emitTaskChanged } from '@/hooks/use-task-cambi'
import { nomeCompleto } from '@/lib/task-nomi'
import { parseQuickAdd, rimuoviToken, type QuickAddContesto, type QuickAddTokenTipo } from '@/lib/task-quick-add'
import { formatStima } from '@/lib/task-stima'
import { taskService, type AggiornaTaskValori, type TaskPriorita, type TaskRiga } from '@/services/task-service'
import { TaskCheck } from './task-check'
import { TaskOperatoriPicker, TaskScadenzaPicker } from './task-pickers'
import { TaskQuickAddInput } from './task-quick-add'
import { TaskStimaLabel, TaskStimaPicker } from './task-stima'
import {
  TASK_CHIP,
  TASK_CHIP_VUOTA,
  TaskAvatarStack,
  TaskPrioritaSelect,
  TaskScadenzaLabel,
  formatScadenza,
} from './task-ui'

/** Chip più bassa di quella del dettaglio: sta sotto il campo del sottotask. */
const CHIP = cn(TASK_CHIP, 'h-7 px-2.5 text-[12px]!')
/** Valore di una riga, cliccabile per cambiarlo. */
const VALORE_RIGA = 'rounded-md! border-0! bg-transparent px-1 py-0.5 transition hover:bg-slate-100 dark:hover:bg-white/10'
/** Campo vuoto di una riga: compare passando sopra, per impostarlo senza aprire il sottotask. */
const VUOTO_RIGA = 'inline-flex size-6 items-center justify-center rounded-md! border-0! bg-transparent p-0 text-muted-foreground/70 opacity-0 transition hover:bg-slate-100 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 dark:hover:bg-white/10'

interface Scelte {
  assegnatariIds: number[]
  scadenza: string | null
  scadenzaOra: string | null
  priorita: TaskPriorita | null
  stimaMinuti: number | null
}
const NESSUNA_SCELTA: Scelte = { assegnatariIds: [], scadenza: null, scadenzaOra: null, priorita: null, stimaMinuti: null }

/**
 * Sottotask di un task, come su ClickUp: ognuno è un task vero (assegnatari, scadenza, stima, commenti), sta nella
 * lista del principale e si apre con un clic. Nascono già completi: sotto il titolo ci sono assegnatari, scadenza,
 * priorità e stima, e valgono anche i comandi dell'aggiunta rapida (@persona, domani, !alta, ~1h). Sulle righe gli
 * stessi campi si cambiano al volo.
 */
export function TaskSottotaskElenco({ task, sottotask, onApri, onCambiati }: {
  task: TaskRiga
  sottotask: TaskRiga[]
  /** Apre un sottotask nel dettaglio; senza, le righe non si aprono */
  onApri?: (id: number) => void
  /** Dopo una modifica: il dettaglio si ricarica */
  onCambiati: () => void
}) {
  const { utente } = useAuth()
  const { config } = useTaskConfig()
  const operatori = useMemo(() => config?.operatori ?? [], [config])
  const [inCorso, setInCorso] = useState<number | null>(null)
  const fatti = sottotask.filter((s) => s.stato === 'COMPLETATO').length

  const aggiorna = async (s: TaskRiga, valori: AggiornaTaskValori) => {
    setInCorso(s.id)
    try {
      await taskService.aggiorna(s.id, valori)
      emitTaskChanged(s.id)
      onCambiati()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sottotask non aggiornato')
    } finally {
      setInCorso(null)
    }
  }

  const contesto = useMemo<QuickAddContesto>(() => ({
    operatori,
    etichette: config?.etichette ?? [],
    // Il sottotask sta per forza nella lista del principale: "/lista" non serve
    liste: [],
    meId: utente?.id,
  }), [operatori, config, utente?.id])

  return (
    <div className="space-y-2">
      {sottotask.length > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10" aria-hidden>
          <div className="h-full rounded-full bg-violet-500 transition-all duration-500" style={{ width: `${(fatti / sottotask.length) * 100}%` }} />
        </div>
      )}
      <ul className="space-y-0.5">
        {sottotask.map((s) => {
          const chiuso = s.stato === 'COMPLETATO' || s.stato === 'ANNULLATO'
          return (
            <li key={s.id} className="group -mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1 transition hover:bg-slate-50 dark:hover:bg-white/[0.04]">
              {inCorso === s.id ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
              ) : (
                <TaskCheck size="sm" completato={s.stato === 'COMPLETATO'}
                  onToggle={() => void aggiorna(s, { stato: s.stato === 'COMPLETATO' ? 'DA_FARE' : 'COMPLETATO' })} />
              )}
              <button type="button" disabled={!onApri} onClick={() => onApri?.(s.id)}
                className={cn('min-w-0 flex-1 truncate border-0! bg-transparent p-0 text-left text-[14px] transition',
                  onApri && 'hover:text-[var(--brand-blue)] dark:hover:text-white', chiuso && 'text-muted-foreground line-through')}
                title={onApri ? 'Apri il sottotask' : undefined}>
                {s.titolo}
              </button>
              <span className="flex shrink-0 items-center gap-1">
                {s.inAttesaDi > 0 && !chiuso ? (
                  <span className="inline-flex text-amber-600 dark:text-amber-300"
                    title={s.inAttesaDi === 1 ? 'Aspetta un altro task' : `Aspetta ${s.inAttesaDi} task`}>
                    <Link2 className="size-3.5" aria-hidden />
                  </span>
                ) : null}
                    <span className={cn('contents', !s.priorita && '[&>button]:opacity-0 group-hover:[&>button]:opacity-100 [&>button[data-state=open]]:opacity-100')}>
                      <TaskPrioritaSelect value={s.priorita} title="Priorità" onChange={(priorita) => void aggiorna(s, { priorita })} />
                    </span>
                    <TaskStimaPicker value={s.stimaMinuti} onChange={(stimaMinuti) => void aggiorna(s, { stimaMinuti })}
                      trigger={s.stimaMinuti ? (
                        <button type="button" className={VALORE_RIGA} title="Stima"><TaskStimaLabel minuti={s.stimaMinuti} className="text-[12px]" /></button>
                      ) : (
                        <button type="button" className={VUOTO_RIGA} title="Stima" aria-label="Stima"><Hourglass className="size-3.5" /></button>
                      )} />
                    <TaskScadenzaPicker scadenza={s.scadenza} scadenzaOra={s.scadenzaOra} onChange={(v) => void aggiorna(s, v)}
                      trigger={s.scadenza ? (
                        <button type="button" className={VALORE_RIGA} title="Scadenza">
                          <TaskScadenzaLabel scadenza={s.scadenza} scadenzaOra={s.scadenzaOra} chiuso={chiuso} className="text-[12px]" />
                        </button>
                      ) : (
                        <button type="button" className={VUOTO_RIGA} title="Scadenza" aria-label="Scadenza"><CalendarClock className="size-3.5" /></button>
                      )} />
                    <TaskOperatoriPicker operatori={operatori} value={s.assegnatari.map((a) => a.id)}
                      onChange={(assegnatariIds) => void aggiorna(s, { assegnatariIds })}
                      trigger={s.assegnatari.length ? (
                        <button type="button" className="rounded-full! border-0! bg-transparent p-0.5 transition hover:bg-slate-100 dark:hover:bg-white/10" title="Assegnatari">
                          <TaskAvatarStack persone={s.assegnatari} max={2} size="sm" />
                        </button>
                      ) : (
                        <button type="button" className={VUOTO_RIGA} title="Assegna" aria-label="Assegna"><UserPlus className="size-3.5" /></button>
                      )} />
              </span>
            </li>
          )
        })}
      </ul>
      <NuovoSottotask task={task} contesto={contesto} onCreato={onCambiati} />
    </div>
  )
}

/** Campo del nuovo sottotask con le sue proprietà: i comandi scritti nel titolo e le chip si sommano. */
function NuovoSottotask({ task, contesto, onCreato }: { task: TaskRiga; contesto: QuickAddContesto; onCreato: () => void }) {
  const [testo, setTesto] = useState('')
  const [scelte, setScelte] = useState<Scelte>(NESSUNA_SCELTA)
  const [salvando, setSalvando] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)

  const letto = useMemo(() => parseQuickAdd(testo, contesto), [testo, contesto])
  const valori: Scelte = {
    assegnatariIds: [...new Set([...letto.assegnatariIds, ...scelte.assegnatariIds])],
    scadenza: letto.scadenza ?? scelte.scadenza,
    scadenzaOra: letto.scadenza ? letto.scadenzaOra : scelte.scadenzaOra,
    priorita: letto.priorita ?? scelte.priorita,
    stimaMinuti: letto.stimaMinuti ?? scelte.stimaMinuti,
  }
  const assegnati = contesto.operatori.filter((o) => valori.assegnatariIds.includes(o.id))

  /** Scegliendo da una chip, il comando corrispondente esce dal titolo: il valore resta uno solo. */
  const scegli = (patch: Partial<Scelte>, ...tipi: QuickAddTokenTipo[]) => {
    const daTogliere = letto.tokens.filter((t) => tipi.includes(t.tipo)).sort((a, b) => b.start - a.start)
    if (daTogliere.length) setTesto(daTogliere.reduce((acc, t) => rimuoviToken(acc, t), testo))
    setScelte((s) => ({ ...s, ...patch }))
  }

  const aggiungi = async () => {
    const titolo = letto.titolo.trim()
    if (!titolo || salvando) return
    setSalvando(true)
    try {
      const creato = await taskService.crea({
        listaId: task.listaId,
        titolo,
        parentId: task.id,
        assegnatariIds: valori.assegnatariIds,
        scadenza: valori.scadenza,
        scadenzaOra: valori.scadenza ? valori.scadenzaOra : null,
        priorita: valori.priorita,
        stimaMinuti: valori.stimaMinuti,
        etichettaIds: letto.etichettaIds,
      })
      setTesto('')
      setScelte(NESSUNA_SCELTA)
      emitTaskChanged(creato.id)
      onCreato()
      requestAnimationFrame(() => input.current?.focus())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sottotask non aggiunto')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-200 px-2.5 pb-2 pt-1.5 transition focus-within:border-solid focus-within:border-[var(--brand-blue)]/35 focus-within:bg-white focus-within:shadow-[0_2px_10px_-4px_rgba(0,37,82,0.18)] dark:border-white/12 dark:focus-within:border-[var(--brand-orange)]/40 dark:focus-within:bg-white/[0.04]">
      <div className="flex items-start gap-2">
        <CornerDownRight className="mt-[3px] size-4 shrink-0 text-muted-foreground" aria-hidden />
        <TaskQuickAddInput value={testo} onChange={setTesto} contesto={contesto} size="sm" inputRef={input} nascondiChip
          className="min-w-0 flex-1" placeholder="Aggiungi un sottotask" suggerimento={null}
          onSubmit={() => void aggiungi()} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-6">
        <TaskOperatoriPicker operatori={contesto.operatori} value={valori.assegnatariIds}
          onChange={(assegnatariIds) => scegli({ assegnatariIds }, 'assegnatario')}
          trigger={
            <button type="button" className={cn(CHIP, !assegnati.length && TASK_CHIP_VUOTA, assegnati.length > 0 && 'pl-1')} title="Assegnatari">
              {assegnati.length ? <TaskAvatarStack persone={assegnati} size="xs" max={3} /> : <UserPlus className="size-3.5" />}
              <span className="truncate">
                {assegnati.length === 1 ? nomeCompleto(assegnati[0]) : assegnati.length ? `${assegnati.length} persone` : 'Assegna'}
              </span>
            </button>
          } />
        <TaskScadenzaPicker scadenza={valori.scadenza} scadenzaOra={valori.scadenzaOra}
          onChange={(v) => scegli(v, 'scadenza', 'ora')}
          trigger={
            <button type="button" className={cn(CHIP, !valori.scadenza && TASK_CHIP_VUOTA)} title="Scadenza">
              <CalendarClock className="size-3.5" />
              {valori.scadenza ? formatScadenza(valori.scadenza, valori.scadenzaOra) : 'Scadenza'}
            </button>
          } />
        <span className="contents [&>button]:h-7 [&>button]:px-2.5 [&>button]:text-[12px]!">
          <TaskPrioritaSelect chip value={valori.priorita} onChange={(priorita) => scegli({ priorita }, 'priorita')} title="Priorità" />
        </span>
        <TaskStimaPicker value={valori.stimaMinuti} onChange={(stimaMinuti) => scegli({ stimaMinuti }, 'stima')}
          trigger={
            <button type="button" className={cn(CHIP, !valori.stimaMinuti && TASK_CHIP_VUOTA)} title="Stima di durata">
              <Hourglass className="size-3.5 text-indigo-500 dark:text-indigo-300" />
              <span className="tabular-nums">{valori.stimaMinuti ? formatStima(valori.stimaMinuti) : 'Stima'}</span>
            </button>
          } />
        <span className="flex-1" />
        <button type="button" onClick={() => void aggiungi()} disabled={!letto.titolo.trim() || salvando}
          className="inline-flex h-7 items-center gap-1 rounded-full! border-0! bg-[var(--brand-blue)] px-3 text-[12px]! font-semibold text-white transition disabled:opacity-40 dark:bg-[var(--brand-orange)] dark:text-[#04121f]">
          {salvando ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Aggiungi
        </button>
      </div>
    </div>
  )
}
