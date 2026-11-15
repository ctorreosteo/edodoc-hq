import { useState } from 'react'
import { ChevronDown, Folder, Inbox, Layers, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { TaskConfig, TaskRiepilogo } from '@/services/task-service'
import { TaskAlbero, type TaskAlberoAzioni } from './task-albero'
import { TaskListaIcona } from './task-lista-icona'
import { cartellaDaSelezione, listaDaSelezione, type TaskSelezione } from './task-pagina-utils'

interface Props {
  config: TaskConfig
  riepilogo: TaskRiepilogo | null
  selezione: TaskSelezione
  azioni: TaskAlberoAzioni
  utenteId: number | null
  compatta: boolean
  onToggleCompatta: () => void
}

function MieiBadge({ riepilogo }: { riepilogo: TaskRiepilogo | null }) {
  const n = riepilogo ? riepilogo.inRitardo + riepilogo.oggi : 0
  if (!n) return null
  return (
    <em className="tk-rail-count" data-tone={riepilogo && riepilogo.inRitardo > 0 ? 'late' : 'today'}
      title={riepilogo ? `${riepilogo.inRitardo} in ritardo, ${riepilogo.oggi} oggi` : undefined}>
      {n}
    </em>
  )
}

/** Navigazione desktop: "I miei task", "Tutti i task" e la struttura di cartelle e liste. */
export function TaskRail({ config, riepilogo, selezione, azioni, utenteId, compatta, onToggleCompatta }: Props) {
  return (
    <nav className="tk-rail" data-compatta={compatta ? '' : undefined} aria-label="Cartelle e liste dei task">
      <button type="button" className="tk-rail-item tk-rail-item--home" data-active={selezione === 'miei' ? '' : undefined}
        onClick={() => azioni.onSeleziona('miei')} title="I miei task" aria-current={selezione === 'miei' ? 'page' : undefined}>
        <span className="tk-rail-home-icon" aria-hidden><Inbox /></span>
        <span className="tk-rail-label">I miei task</span>
        <MieiBadge riepilogo={riepilogo} />
      </button>

      <button type="button" className="tk-rail-item" data-active={selezione === 'tutti' ? '' : undefined}
        aria-current={selezione === 'tutti' ? 'page' : undefined} onClick={() => azioni.onSeleziona('tutti')} title="Tutti i task">
        <span className="tk-rail-home-icon tk-rail-home-icon--all" aria-hidden><Layers /></span>
        <span className="tk-rail-label">Tutti i task</span>
      </button>

      <TaskAlbero config={config} selezione={selezione} azioni={azioni} utenteId={utenteId}
        trascinabile={!compatta} compatta={compatta} />

      <div className="tk-rail-foot">
        <button type="button" className="tk-rail-toggle" onClick={onToggleCompatta}
          aria-label={compatta ? 'Espandi elenco liste' : 'Riduci elenco liste'} title={compatta ? 'Espandi' : 'Riduci'}>
          {compatta ? <PanelLeftOpen /> : <PanelLeftClose />}
        </button>
      </div>
    </nav>
  )
}

/** Navigazione su telefono: segmenti fissi in alto (I miei · Liste ▾ · Tutti); "Liste" apre l'albero dal basso. */
export function TaskNavMobile({ config, riepilogo, selezione, azioni, utenteId }: Omit<Props, 'compatta' | 'onToggleCompatta'>) {
  const [aperto, setAperto] = useState(false)
  const listaId = listaDaSelezione(selezione)
  const cartellaId = cartellaDaSelezione(selezione)
  const lista = listaId != null ? config.liste.find((l) => l.id === listaId) : undefined
  const cartella = cartellaId != null ? config.cartelle.find((c) => c.id === cartellaId) : undefined
  const corrente = lista ?? cartella
  // Ogni scelta chiude il pannello; creare apre il suo dialog sopra
  const azioniSheet: TaskAlberoAzioni = {
    onSeleziona: (s) => {
      setAperto(false)
      azioni.onSeleziona(s)
    },
    onCrea: azioni.onCrea,
    onImpostazioni: azioni.onImpostazioni,
  }
  return (
    <nav className="tk-navm" aria-label="Cartelle e liste dei task">
      <button type="button" data-active={selezione === 'miei' ? '' : undefined} onClick={() => azioni.onSeleziona('miei')}>
        <Inbox aria-hidden /><span>I miei</span><MieiBadge riepilogo={riepilogo} />
      </button>
      <button type="button" data-active={corrente ? '' : undefined} onClick={() => setAperto(true)}
        aria-haspopup="dialog" style={corrente ? { ['--tk-c' as string]: corrente.colore } : undefined}>
        {lista ? <TaskListaIcona lista={lista} size="sm" /> : cartella ? <Folder aria-hidden style={{ color: cartella.colore }} /> : null}
        <span className="tk-navm-label">{corrente ? corrente.nome : 'Liste'}</span>
        <ChevronDown aria-hidden />
      </button>
      <button type="button" data-active={selezione === 'tutti' ? '' : undefined} onClick={() => azioni.onSeleziona('tutti')}>
        <Layers aria-hidden /><span>Tutti</span>
      </button>

      <Sheet open={aperto} onOpenChange={setAperto}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-[1.5rem] p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
          <div data-vl="scope" data-vl-page="task" className="tk-albero-sheet">
            <SheetHeader className="tk-albero-sheet-head">
              <SheetTitle>Cartelle e liste</SheetTitle>
              <SheetDescription className="sr-only">Scegli una cartella o una lista da aprire</SheetDescription>
            </SheetHeader>
            <div className="tk-albero-sheet-body">
              <TaskAlbero config={config} selezione={selezione} azioni={azioniSheet} utenteId={utenteId} variante="sheet" />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  )
}
