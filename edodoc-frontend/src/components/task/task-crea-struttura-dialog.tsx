import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, Folder, FolderInput, List, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { SK_FOCUS_RING } from '@/components/ui/sheet-kit'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { percorsoCartella } from '@/lib/task-struttura'
import { invalidateTaskConfig, useTaskConfig } from '@/hooks/use-task-config'
import { emitTaskChanged } from '@/hooks/use-task-cambi'
import { messaggioErroreTask, taskService, type TaskCartella, type TaskLista, type TaskTipoStruttura } from '@/services/task-service'
import { TaskCartellaPicker } from './task-cartella-picker'
import { COLORI_LISTA, ICONE_LISTA } from './pagina/task-lista-icone'

interface Props {
  tipo: TaskTipoStruttura
  /** Cartella in cui crearla (null = radice) */
  parentId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreato?: (creato: { tipo: TaskTipoStruttura; id: number }) => void
  /** Impostazioni di una lista o cartella esistente (nome, descrizione, aspetto): per spostarla c'è «Sposta in…» */
  modifica?: TaskLista | TaskCartella | null
}

/** Nuova lista o cartella (nome, aspetto e posizione), oppure impostazioni di una esistente. */
export function TaskCreaStrutturaDialog({ tipo, parentId, open, onOpenChange, onCreato, modifica }: Props) {
  const { config, reload } = useTaskConfig()
  const inputRef = useRef<HTMLInputElement>(null)
  const cosa = tipo === 'LISTA' ? 'lista' : 'cartella'

  const [nome, setNome] = useState('')
  const [descrizione, setDescrizione] = useState('')
  const [colore, setColore] = useState(COLORI_LISTA[1])
  const [icona, setIcona] = useState(tipo === 'LISTA' ? 'list' : 'folder')
  const [contenitore, setContenitore] = useState<number | null>(parentId)
  const [aspettoAperto, setAspettoAperto] = useState(false)
  const [salvando, setSalvando] = useState(false)

  // Ogni apertura riparte pulita, dalla cartella indicata
  useEffect(() => {
    if (!open) return
    setNome(modifica?.nome ?? '')
    setDescrizione(modifica?.descrizione ?? '')
    setColore(modifica?.colore ?? (tipo === 'LISTA' ? COLORI_LISTA[1] : COLORI_LISTA[8]))
    setIcona(modifica?.icona ?? (tipo === 'LISTA' ? 'list' : 'folder'))
    setContenitore(parentId)
    setAspettoAperto(!!modifica)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open, parentId, tipo, modifica])

  const percorso = useMemo(() => (config ? percorsoCartella(config, contenitore) : []), [config, contenitore])
  const crea = async () => {
    if (!nome.trim() || salvando) {
      if (!nome.trim()) inputRef.current?.focus()
      return
    }
    setSalvando(true)
    try {
      const base = { nome: nome.trim(), descrizione: descrizione.trim() || null, colore, icona }
      if (modifica) {
        if (tipo === 'LISTA') await taskService.aggiornaLista(modifica.id, base)
        else await taskService.aggiornaCartella(modifica.id, base)
      }
      const id = modifica
        ? modifica.id
        : tipo === 'LISTA'
          ? (await taskService.creaLista({ ...base, cartellaId: contenitore })).id
          : (await taskService.creaCartella({ ...base, parentId: contenitore })).id
      await invalidateTaskConfig()
      await reload()
      emitTaskChanged()
      toast.success(modifica ? 'Modifiche salvate' : tipo === 'LISTA' ? 'Lista creata' : 'Cartella creata', { description: nome.trim() })
      onOpenChange(false)
      if (!modifica) onCreato?.({ tipo, id })
    } catch (e) {
      toast.error(messaggioErroreTask(e, modifica ? 'Modifiche non salvate' : `${cosa === 'lista' ? 'Lista' : 'Cartella'} non creata`))
    } finally {
      setSalvando(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void crea()
    }
  }

  const Icona = ICONE_LISTA[icona] ?? (tipo === 'LISTA' ? List : Folder)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-task-crea-struttura
        onKeyDown={onKeyDown}
        className={cn(
          'flex max-h-[min(92vh,640px)] w-[calc(100vw-1.5rem)] max-w-[560px] flex-col gap-0 overflow-hidden rounded-2xl! p-0',
          'max-sm:inset-0 max-sm:h-[100dvh] max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none!',
          '[&>button:last-child]:top-5 [&>button:last-child]:right-5',
        )}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-4">
          <DialogTitle asChild>
            <p role="heading" aria-level={2} className="mb-4 text-[12px] font-semibold tracking-[0.08em] text-slate-500 uppercase dark:text-white/50">
              {modifica ? (tipo === 'LISTA' ? 'Impostazioni della lista' : 'Impostazioni della cartella') : tipo === 'LISTA' ? 'Nuova lista' : 'Nuova cartella'}
            </p>
          </DialogTitle>
          <DialogDescription className="sr-only">{modifica ? `Nome, descrizione e aspetto della ${cosa}` : `Nome e posizione della nuova ${cosa}`}</DialogDescription>

          {/* Nome con icona/colore */}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setAspettoAperto((v) => !v)} aria-expanded={aspettoAperto} aria-label="Colore e icona"
              className={cn(SK_FOCUS_RING, 'flex size-11 shrink-0 items-center justify-center rounded-xl! border-0! text-white shadow-sm transition hover:brightness-110')}
              style={{ background: colore }}>
              <Icona className="size-5" />
            </button>
            <input
              ref={inputRef}
              value={nome}
              maxLength={100}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault()
                  void crea()
                }
              }}
              placeholder={tipo === 'LISTA' ? 'Nome della lista' : 'Nome della cartella'}
              aria-label="Nome"
              className="h-11 min-w-0 flex-1 border-0 bg-transparent text-[20px]! font-semibold text-slate-900 outline-none placeholder:text-slate-300 dark:text-white dark:placeholder:text-white/25"
            />
          </div>
          {aspettoAperto ? (
            <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colore">
                {COLORI_LISTA.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={colore === c} aria-label={`Colore ${c}`} onClick={() => setColore(c)}
                    className={cn(SK_FOCUS_RING, 'size-6 rounded-full! border-2! transition', colore === c ? 'scale-110 border-white! ring-2 ring-slate-900/30 dark:ring-white/70' : 'border-transparent! hover:scale-105')}
                    style={{ background: c }} />
                ))}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1" role="radiogroup" aria-label="Icona">
                {Object.entries(ICONE_LISTA).map(([n, Ic]) => (
                  <button key={n} type="button" role="radio" aria-checked={icona === n} aria-label={n} onClick={() => setIcona(n)}
                    className={cn(SK_FOCUS_RING, 'flex size-8 items-center justify-center rounded-lg! border! transition',
                      icona === n ? 'border-transparent! text-white' : 'border-slate-200! bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10! dark:bg-white/[0.04] dark:text-white/70')}
                    style={icona === n ? { background: colore } : undefined}>
                    <Ic className="size-4" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <label className="mt-5 block">
            <span className="mb-1.5 block text-[13px] font-semibold text-slate-900 dark:text-white">Descrizione</span>
            <textarea value={descrizione} onChange={(e) => setDescrizione(e.target.value)} rows={2} maxLength={500}
              placeholder={`A cosa serve questa ${cosa} (facoltativa): compare sotto il titolo`}
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-300 dark:border-white/12 dark:bg-white/[0.05] dark:text-white/90" />
          </label>

          {/* Posizione */}
          {modifica ? null : <div className="mt-5">
            <span className="mb-1.5 block text-[13px] font-semibold text-slate-900 dark:text-white">Dove</span>
            {config ? (
              <TaskCartellaPicker
                config={config}
                value={contenitore}
                onChange={setContenitore}
                consentiRadice
                trigger={
                  <button type="button" className={cn(SK_FOCUS_RING, 'flex h-10 w-full items-center gap-2 rounded-xl! border! border-slate-200! bg-white px-3 text-left text-[14px]! text-slate-800 hover:bg-slate-50 dark:border-white/12! dark:bg-white/[0.05] dark:text-white/90')}>
                    <FolderInput className="size-4 shrink-0 text-slate-400" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{percorso.length ? percorso.map((c) => c.nome).join(' / ') : 'Radice (nessuna cartella)'}</span>
                    <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
                  </button>
                }
              />
            ) : null}
          </div>}

        </div>

        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3 dark:border-white/10 dark:bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onOpenChange(false)}
              className={cn(SK_FOCUS_RING, 'h-9 rounded-lg! border-0! bg-transparent px-3 text-[13px]! font-medium text-slate-600 hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/[0.08]')}>
              Annulla
            </button>
            <button type="button" disabled={!nome.trim() || salvando} onClick={() => void crea()}
              className={cn(SK_FOCUS_RING, 'inline-flex h-9 items-center gap-1.5 rounded-lg! border-0! bg-[var(--brand-blue)] px-4 text-[13px]! font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-[var(--brand-orange)] dark:text-[#1F3A63]')}>
              {salvando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {modifica ? 'Salva' : tipo === 'LISTA' ? 'Crea lista' : 'Crea cartella'}
            </button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
