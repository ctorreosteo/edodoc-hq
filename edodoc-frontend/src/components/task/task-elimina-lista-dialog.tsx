import { useEffect, useRef, useState } from 'react'
import { Archive, Loader2, Trash2, TriangleAlert } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { SK_FOCUS_RING } from '@/components/ui/sheet-kit'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { invalidateTaskConfig, useTaskConfig } from '@/hooks/use-task-config'
import { emitTaskChanged } from '@/hooks/use-task-cambi'
import { messaggioErroreTask, taskService, type TaskLista } from '@/services/task-service'

interface Props {
  lista: TaskLista | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEliminata?: (id: number) => void
}

/**
 * Eliminazione definitiva di una lista con tutti i suoi task (commenti, allegati, checklist).
 * Mostra quanti task spariranno, propone l'archiviazione come alternativa sicura e, se la lista non è vuota,
 * chiede di scriverne il nome per confermare. Le liste di sistema (con `codice`) non si eliminano né si archiviano.
 */
export function TaskEliminaListaDialog({ lista, open, onOpenChange, onEliminata }: Props) {
  const { reload } = useTaskConfig()
  const [chiusi, setChiusi] = useState<number | null>(null)
  const [conferma, setConferma] = useState('')
  const [lavorando, setLavorando] = useState<'elimina' | 'archivia' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !lista) return
    setConferma('')
    setChiusi(null)
    let annullato = false
    taskService.getChiusi({ listaId: lista.id }, 0, 1)
      .then((p) => { if (!annullato) setChiusi(p.totale) })
      .catch(() => { if (!annullato) setChiusi(0) })
    return () => { annullato = true }
  }, [open, lista])

  if (!lista) return null
  const aperti = lista.aperti
  const totale = chiusi == null ? null : aperti + chiusi
  const serveNome = totale == null || totale > 0
  const nomeOk = conferma.trim().toLowerCase() === lista.nome.trim().toLowerCase()
  const diSistema = !!lista.codice
  const puoEliminare = !diSistema && !lavorando && totale != null && (!serveNome || nomeOk)

  const dopo = async () => {
    await invalidateTaskConfig()
    await reload()
    emitTaskChanged()
  }

  const elimina = async () => {
    if (!puoEliminare) return
    setLavorando('elimina')
    try {
      const res = await taskService.eliminaLista(lista.id, serveNome ? conferma.trim() : undefined)
      toast.success(res.taskEliminati ? `Lista eliminata con ${res.taskEliminati} task` : 'Lista eliminata', { description: res.nome })
      onOpenChange(false)
      await dopo()
      onEliminata?.(lista.id)
    } catch (e) {
      toast.error(messaggioErroreTask(e, 'Lista non eliminata'))
    } finally {
      setLavorando(null)
    }
  }

  const archivia = async () => {
    if (diSistema) return
    setLavorando('archivia')
    try {
      await taskService.aggiornaLista(lista.id, { nome: lista.nome, archiviata: true })
      toast.success('Lista archiviata', {
        description: `${lista.nome}: i task restano consultabili e puoi ripristinarla quando vuoi.`,
        action: {
          label: 'Annulla',
          onClick: () => void taskService.aggiornaLista(lista.id, { nome: lista.nome, archiviata: false }).then(dopo),
        },
      })
      onOpenChange(false)
      await dopo()
    } catch (e) {
      toast.error(messaggioErroreTask(e, 'Lista non archiviata'))
    } finally {
      setLavorando(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
        className={cn(
          'w-[calc(100vw-1.5rem)] max-w-[480px] gap-0 overflow-hidden rounded-2xl! p-0 outline-none! focus-visible:ring-0!',
          '[&>button:last-child]:top-5 [&>button:last-child]:right-5',
        )}
      >
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3 pr-8">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-400/15 dark:text-red-300" aria-hidden>
              <Trash2 className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle asChild>
                <p role="heading" aria-level={2} className="text-[17px] font-semibold text-slate-900 dark:text-white">
                  Eliminare «{lista.nome}»?
                </p>
              </DialogTitle>
              <DialogDescription asChild>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-white/70">
                  {totale == null ? (
                    <span className="inline-flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Conto i task…</span>
                  ) : totale === 0 ? (
                    'La lista è vuota. Non si può annullare.'
                  ) : (
                    <>
                      Eliminerai la lista e i suoi <b className="text-slate-900 dark:text-white">{totale} task</b> ({aperti} apert{aperti === 1 ? 'o' : 'i'}, {chiusi} completat{chiusi === 1 ? 'o' : 'i'}/annullat{chiusi === 1 ? 'o' : 'i'}), con commenti e allegati. <b className="text-red-600 dark:text-red-300">Non si può annullare.</b>
                    </>
                  )}
                </p>
              </DialogDescription>
            </div>
          </div>

          {lista.codice ? (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              È una lista di sistema: i promemoria automatici (rinnovi, esami, scadenze fiscali) finiscono qui, quindi non si elimina né si archivia.
            </p>
          ) : null}

          {!diSistema ? <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-white/10">
            <p className="text-[13px] text-slate-700 dark:text-white/80">
              <b>Meglio archiviarla?</b> Sparisce dalla navigazione, ma i task restano consultabili e si può ripristinare.
            </p>
            <button type="button" disabled={!!lavorando} onClick={() => void archivia()}
              className={cn(SK_FOCUS_RING, 'mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg! border! border-slate-200! bg-white px-3 text-[13px]! font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-white/12! dark:bg-white/[0.05] dark:text-white/85')}>
              {lavorando === 'archivia' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Archive className="size-3.5" aria-hidden />}
              Archivia invece
            </button>
          </div> : null}

          {serveNome && !diSistema ? (
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[13px] text-slate-700 dark:text-white/80">
                Per confermare scrivi il nome della lista: <b className="select-all text-slate-900 dark:text-white">{lista.nome}</b>
              </span>
              <input
                ref={inputRef}
                value={conferma}
                onChange={(e) => setConferma(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void elimina()
                  }
                }}
                autoComplete="off"
                aria-label="Nome della lista per confermare"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px]! outline-none focus:border-red-400 focus:ring-4 focus:ring-red-500/10 dark:border-white/12 dark:bg-white/[0.05] dark:text-white"
              />
            </label>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 dark:border-white/10 dark:bg-white/[0.02]">
          <button type="button" onClick={() => onOpenChange(false)}
            className={cn(SK_FOCUS_RING, 'h-9 rounded-lg! border-0! bg-transparent px-3 text-[13px]! font-medium text-slate-600 hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/[0.08]')}>
            Annulla
          </button>
          <button type="button" disabled={!puoEliminare} onClick={() => void elimina()}
            className={cn(SK_FOCUS_RING, 'inline-flex h-9 items-center gap-1.5 rounded-lg! border-0! bg-red-600 px-4 text-[13px]! font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40')}>
            {lavorando === 'elimina' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
            Elimina definitivamente
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
