import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { it } from 'date-fns/locale'
import {
  ArrowRightLeft, CalendarDays, CalendarX2, CircleDot, ExternalLink, Flag, FolderOpen, Loader2, Trash2, UserPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  ContextMenu, ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioGroup,
  ContextMenuRadioItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { posticipaOpzioni } from '@/components/task/task-posticipa'
import { TaskAvatar, TaskListaDot, nomeCompleto, TaskPrioritaIcon, TaskStatoBadge, TASK_LAYER_Z, parseDataLocale, toIsoData } from '@/components/task/task-ui'
import { gruppiListe } from '@/lib/task-liste'
import {
  TASK_PRIORITA, TASK_STATI, type AggiornaTaskValori, type TaskConfig, type TaskRiga,
} from '@/services/task-service'
import { eseguiBulk } from './task-pagina-utils'

interface Azioni {
  config: TaskConfig
  /** Selezione multipla (solo vista lista): il menu su una riga selezionata agisce su tutte */
  selezionati?: Set<number>
  righe: TaskRiga[]
  aggiornaRiga: (id: number, v: AggiornaTaskValori) => Promise<TaskRiga | null>
  onApri: (id: number) => void
  /** Dopo una modifica multipla o un'eliminazione (svuota la selezione e ricarica) */
  onBulkFatto: () => void
}

const Ctx = createContext<{ azioni: Azioni; chiediElimina: (ids: number[]) => void } | null>(null)

/**
 * Fornisce alle righe della pagina task le azioni del menu contestuale (tasto destro),
 * le stesse della barra di selezione multipla, e la conferma di eliminazione.
 */
export function TaskMenuProvider({ children, ...azioni }: Azioni & { children: ReactNode }) {
  const [daEliminare, setDaEliminare] = useState<number[] | null>(null)
  const [lavoro, setLavoro] = useState(false)

  const elimina = async () => {
    if (!daEliminare) return
    setLavoro(true)
    const ok = await eseguiBulk(daEliminare, null, true)
    setLavoro(false)
    setDaEliminare(null)
    if (ok) azioni.onBulkFatto()
  }

  const n = daEliminare?.length ?? 0
  return (
    <Ctx.Provider value={{ azioni, chiediElimina: setDaEliminare }}>
      {children}
      <Dialog open={!!daEliminare} onOpenChange={(o) => !o && !lavoro && setDaEliminare(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{n === 1 ? 'Eliminare il task?' : `Eliminare ${n} task?`}</DialogTitle>
            <DialogDescription>
              Verranno eliminati anche commenti, allegati e checklist. L'operazione non si può annullare.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDaEliminare(null)} disabled={lavoro}>Annulla</Button>
            <Button variant="destructive" onClick={() => void elimina()} disabled={lavoro}>
              {lavoro ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  )
}

/** Avvolge una riga/card: tasto destro (o pressione lunga) apre il menu. Senza provider non fa nulla. */
export function TaskMenuRiga({ riga, children }: { riga: TaskRiga; children: ReactNode }) {
  const ctx = useContext(Ctx)
  if (!ctx) return <>{children}</>
  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <MenuContenuto riga={riga} azioni={ctx.azioni} chiediElimina={ctx.chiediElimina} />
    </ContextMenu>
  )
}

function MenuContenuto({ riga, azioni, chiediElimina }: { riga: TaskRiga; azioni: Azioni; chiediElimina: (ids: number[]) => void }) {
  const { config, selezionati, righe, aggiornaRiga, onApri, onBulkFatto } = azioni
  // Clic destro su una riga selezionata (con altre): si agisce su tutta la selezione, come nella barra
  const multi = !!selezionati && selezionati.size > 1 && selezionati.has(riga.id)
  const bersagli = useMemo(
    () => (multi ? righe.filter((r) => selezionati!.has(r.id)) : [riga]),
    [multi, righe, selezionati, riga],
  )
  const gruppi = useMemo(() => gruppiListe(config), [config])

  const modifica = async (valori: AggiornaTaskValori) => {
    if (!multi) {
      await aggiornaRiga(riga.id, valori)
      return
    }
    if (await eseguiBulk(bersagli.map((r) => r.id), valori, false, bersagli)) onBulkFatto()
  }

  // Assegnatari: la spunta aggiunge o toglie la persona (a tutti i selezionati), senza toccare gli altri
  const haPersona = (r: TaskRiga, id: number) => r.assegnatari.some((p) => p.id === id)
  const togglePersona = (id: number) => {
    const tutti = bersagli.every((r) => haPersona(r, id))
    bersagli.forEach((r) => {
      const ids = r.assegnatari.map((p) => p.id)
      void aggiornaRiga(r.id, { assegnatariIds: tutti ? ids.filter((x) => x !== id) : [...new Set([...ids, id])] })
    })
  }

  // Valori "comuni" per spuntare la voce attuale (con più task, solo se uguale per tutti)
  const comune = <T,>(f: (r: TaskRiga) => T): T | undefined => {
    const v = f(bersagli[0])
    return bersagli.every((r) => f(r) === v) ? v : undefined
  }
  const statoComune = comune((r) => r.stato)
  const prioritaComune = comune((r) => r.priorita ?? 'NESSUNA')
  const listaComune = comune((r) => r.listaId)
  const scadenzaComune = comune((r) => r.scadenza)

  return (
    <ContextMenuContent className={`${TASK_LAYER_Z} w-60`} data-vl="scope" data-vl-page="task">
      <ContextMenuLabel className="truncate">
        {multi ? `${bersagli.length} task selezionati` : riga.titolo}
      </ContextMenuLabel>
      {!multi ? (
        <ContextMenuItem onSelect={() => onApri(riga.id)}>
          <ExternalLink /> Apri
        </ContextMenuItem>
      ) : null}
      <ContextMenuSeparator />

      <ContextMenuSub>
        <ContextMenuSubTrigger><CircleDot /> Stato</ContextMenuSubTrigger>
        <ContextMenuSubContent className={TASK_LAYER_Z}>
          <ContextMenuRadioGroup value={statoComune ?? ''}
            onValueChange={(v) => void modifica({ stato: v as TaskRiga['stato'] })}>
            {TASK_STATI.map((s) => (
              <ContextMenuRadioItem key={s.value} value={s.value}><TaskStatoBadge stato={s.value} /></ContextMenuRadioItem>
            ))}
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger><Flag /> Priorità</ContextMenuSubTrigger>
        <ContextMenuSubContent className={TASK_LAYER_Z}>
          <ContextMenuRadioGroup value={prioritaComune ?? ''}
            onValueChange={(v) => void modifica({ priorita: v === 'NESSUNA' ? null : (v as TaskRiga['priorita']) })}>
            {TASK_PRIORITA.map((p) => (
              <ContextMenuRadioItem key={p.value} value={p.value}><TaskPrioritaIcon priorita={p.value} showLabel /></ContextMenuRadioItem>
            ))}
            <ContextMenuRadioItem value="NESSUNA"><TaskPrioritaIcon priorita={null} showLabel /></ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger><CalendarDays /> Scadenza</ContextMenuSubTrigger>
        <ContextMenuSubContent className={TASK_LAYER_Z}>
          <ContextMenuItem onSelect={() => void modifica({ scadenza: toIsoData(new Date()) })}>
            <CalendarDays /> Oggi
          </ContextMenuItem>
          {posticipaOpzioni().map((o) => (
            // Senza "scadenzaOra" il server mantiene l'ora di ciascun task (tranne "Più tardi oggi")
            <ContextMenuItem key={o.id}
              onSelect={() => void modifica(o.scadenzaOra ? { scadenza: o.scadenza, scadenzaOra: o.scadenzaOra } : { scadenza: o.scadenza })}>
              <CalendarDays /> {o.label}
              <span className="ml-auto text-xs text-muted-foreground">{o.hint}</span>
            </ContextMenuItem>
          ))}
          <ContextMenuSub>
            <ContextMenuSubTrigger><CalendarDays /> Scegli data…</ContextMenuSubTrigger>
            <ContextMenuSubContent className={`${TASK_LAYER_Z} w-auto`}>
              <Calendar mode="single" weekStartsOn={1} locale={it}
                selected={parseDataLocale(scadenzaComune) ?? undefined} defaultMonth={parseDataLocale(scadenzaComune) ?? undefined}
                onSelect={(d) => {
                  if (!d) return
                  void modifica({ scadenza: toIsoData(d) })
                  // Il calendario non è una voce di menu: chiudiamo il menu a mano
                  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
                }} />
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem disabled={bersagli.every((r) => !r.scadenza)}
            onSelect={() => void modifica({ scadenza: null, scadenzaOra: null })}>
            <CalendarX2 /> Rimuovi scadenza
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger><ArrowRightLeft /> Sposta</ContextMenuSubTrigger>
        <ContextMenuSubContent className={`${TASK_LAYER_Z} max-h-96 w-64`}>
          {gruppi.length === 0 ? (
            <ContextMenuLabel className="text-xs font-normal text-muted-foreground">Nessuna lista disponibile</ContextMenuLabel>
          ) : gruppi.map((g, i) => (
            <div key={g.titolo || '__radice'}>
              {i > 0 ? <ContextMenuSeparator /> : null}
              {g.titolo ? (
                <ContextMenuLabel className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <FolderOpen className="size-3" />
                  <span className="truncate">{g.titolo}</span>
                </ContextMenuLabel>
              ) : null}
              <ContextMenuRadioGroup value={listaComune != null ? String(listaComune) : ''}
                onValueChange={(v) => void modifica({ listaId: Number(v) })}>
                {g.liste.map((l) => (
                  <ContextMenuRadioItem key={l.id} value={String(l.id)}><TaskListaDot lista={l} /></ContextMenuRadioItem>
                ))}
              </ContextMenuRadioGroup>
            </div>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger><UserPlus /> Assegna</ContextMenuSubTrigger>
        <ContextMenuSubContent className={`${TASK_LAYER_Z} max-h-96 w-64`}>
          {config.operatori.map((o) => (
            <ContextMenuCheckboxItem key={o.id} checked={bersagli.every((r) => haPersona(r, o.id))}
              onSelect={(e) => e.preventDefault()} onCheckedChange={() => togglePersona(o.id)}>
              <TaskAvatar persona={o} size="xs" noTooltip />
              <span className="truncate">{nomeCompleto(o)}</span>
            </ContextMenuCheckboxItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={() => chiediElimina(bersagli.map((r) => r.id))}>
        <Trash2 /> {multi ? `Elimina ${bersagli.length} task` : 'Elimina'}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
