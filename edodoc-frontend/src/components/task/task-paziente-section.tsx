import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2, MessageSquare, Paperclip, Plus, SquareCheckBig } from "lucide-react"
import { SheetEmpty, SheetSection, SK_BTN_SECONDARY_SM } from "@/components/ui/sheet-kit"
import { cn } from "@/lib/utils"
import { isStatoChiuso, taskService, type TaskRiga } from "@/services/task-service"
import { TaskCreaDialog } from "@/components/task/task-crea-dialog"
import { TaskAvatarStack, TaskPrioritaIcon, TaskScadenzaLabel, TaskStatoBadge } from "@/components/task/task-ui"
import { useTaskChanged } from "@/hooks/use-task-cambi"

interface TaskPazienteSectionProps {
  pazienteId?: number | null
  pazienteNomeCognome?: string
  className?: string
}

/** Task collegati a un paziente, da inserire negli sheet di dettaglio. */
export function TaskPazienteSection({ pazienteId, pazienteNomeCognome, className }: TaskPazienteSectionProps) {
  const navigate = useNavigate()
  const abilitato = Boolean(pazienteId)
  const [task, setTask] = useState<TaskRiga[]>([])
  const [loading, setLoading] = useState(false)
  const [mostraChiusi, setMostraChiusi] = useState(false)
  const [creaOpen, setCreaOpen] = useState(false)
  const caricato = useRef(false)
  const timerRicarica = useRef<ReturnType<typeof setTimeout> | null>(null)

  const carica = useCallback(async (signal?: AbortSignal) => {
    if (!abilitato) return
    // Lo spinner solo al primo caricamento: gli aggiornamenti successivi non fanno sfarfallare la sezione
    if (!caricato.current) setLoading(true)
    try {
      const righe = await taskService.getTask({ pazienteId: pazienteId ?? undefined, includiChiusi: true, chiusiGiorni: 0 })
      if (signal?.aborted) return
      setTask(righe)
      caricato.current = true
    } catch {
      if (!signal?.aborted) setTask([])
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [abilitato, pazienteId])

  useEffect(() => {
    caricato.current = false
    const controller = new AbortController()
    carica(controller.signal)
    return () => controller.abort()
  }, [carica])

  useEffect(() => () => {
    if (timerRicarica.current) clearTimeout(timerRicarica.current)
  }, [])

  // Task modificati altrove (scheda del task, pagina Task): riallinea l'elenco, raggruppando le raffiche
  const ricarica = () => {
    if (!abilitato) return
    if (timerRicarica.current) clearTimeout(timerRicarica.current)
    timerRicarica.current = setTimeout(() => void carica(), 400)
  }
  useTaskChanged(ricarica)

  const { aperti, chiusi } = useMemo(() => {
    const perScadenza = (a: TaskRiga, b: TaskRiga) =>
      (a.scadenza ?? "9999-12-31").localeCompare(b.scadenza ?? "9999-12-31")
    return {
      aperti: task.filter((t) => !isStatoChiuso(t.stato)).sort(perScadenza),
      chiusi: task.filter((t) => isStatoChiuso(t.stato)).sort((a, b) => (b.completatoIl ?? b.aggiornatoIl).localeCompare(a.completatoIl ?? a.aggiornatoIl)),
    }
  }, [task])

  if (!abilitato) return null

  const riga = (t: TaskRiga) => (
    <li key={t.id}>
      <button
        type="button"
        onClick={() => navigate(`/task?task=${t.id}`)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-100 dark:hover:bg-white/10",
          isStatoChiuso(t.stato) && "opacity-60",
        )}
      >
        <TaskStatoBadge stato={t.stato} />
        <span className="min-w-0 flex-1">
          <span className={cn("flex items-center gap-1.5 truncate text-sm font-medium", t.stato === "COMPLETATO" && "line-through")}>
            {t.priorita && <TaskPrioritaIcon priorita={t.priorita} />}
            <span className="truncate">{t.titolo}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
            {t.scadenza && <TaskScadenzaLabel scadenza={t.scadenza} scadenzaOra={t.scadenzaOra} chiuso={isStatoChiuso(t.stato)} />}
            {t.commenti > 0 && (
              <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{t.commenti}</span>
            )}
            {t.allegati > 0 && (
              <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />{t.allegati}</span>
            )}
          </span>
        </span>
        {t.assegnatari.length > 0 && <TaskAvatarStack persone={t.assegnatari} />}
      </button>
    </li>
  )

  return (
    <>
      <SheetSection
        icon={<SquareCheckBig />}
        tone="accent"
        title="Task"
        description="Task collegati al paziente"
        className={className}
        actions={
          <button type="button" className={SK_BTN_SECONDARY_SM} onClick={() => setCreaOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nuovo task
          </button>
        }
      >
        {loading && task.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : task.length === 0 ? (
          <SheetEmpty icon={<SquareCheckBig />} title="Nessun task" description="Crea un task per ricordare cosa fare per questo paziente." />
        ) : (
          <div className="space-y-2">
            {aperti.length > 0 ? (
              <ul className="-mx-1 space-y-0.5">{aperti.map(riga)}</ul>
            ) : (
              <p className="px-2 text-sm text-muted-foreground">Nessun task aperto.</p>
            )}
            {chiusi.length > 0 && (
              <>
                <button
                  type="button"
                  className="px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setMostraChiusi((v) => !v)}
                >
                  {mostraChiusi ? "Nascondi" : "Mostra"} {chiusi.length} {chiusi.length === 1 ? "task chiuso" : "task chiusi"}
                </button>
                {mostraChiusi && <ul className="-mx-1 space-y-0.5">{chiusi.map(riga)}</ul>}
              </>
            )}
          </div>
        )}
      </SheetSection>
      <TaskCreaDialog
        open={creaOpen}
        onOpenChange={setCreaOpen}
        prefill={{
          pazienteId: pazienteId ?? undefined,
          pazienteNomeCognome,
        }}
        onCreated={() => carica()}
      />
    </>
  )
}
