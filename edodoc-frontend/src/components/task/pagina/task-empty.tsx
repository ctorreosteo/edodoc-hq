import { CircleCheckBig, Plus, SearchX, Sparkles, TriangleAlert } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

type Variante = 'inbox' | 'lista' | 'filtri' | 'errore'

const TESTI: Record<Variante, { titolo: string; testo: string; icon: typeof Sparkles }> = {
  inbox: {
    titolo: 'Tutto in ordine',
    testo: 'Non hai task aperti. Quando qualcuno ti assegna un task o ti menziona, lo trovi qui.',
    icon: CircleCheckBig,
  },
  lista: {
    titolo: 'Nessun task in questa lista',
    testo: 'Crea il primo task: assegnalo, dagli una scadenza e segui i commenti in un unico posto.',
    icon: Sparkles,
  },
  filtri: {
    titolo: 'Nessun risultato',
    testo: 'Nessun task aperto corrisponde alla ricerca o ai filtri attivi.',
    icon: SearchX,
  },
  errore: {
    titolo: 'Task non disponibili',
    testo: 'Non siamo riusciti a caricare i task. Riprova tra qualche istante.',
    icon: TriangleAlert,
  },
}

export function TaskEmpty({ variante, onNuovo, onRiprova, testo }: {
  variante: Variante
  onNuovo?: () => void
  onRiprova?: () => void
  testo?: string
}) {
  const t = TESTI[variante]
  const Icon = t.icon
  return (
    <div className="tk-empty" data-variante={variante}>
      <span className="tk-empty-art" aria-hidden>
        <span className="tk-empty-ring" />
        <span className="tk-empty-ring tk-empty-ring--2" />
        <Icon />
      </span>
      <b>{t.titolo}</b>
      <span>{testo ?? t.testo}</span>
      {onNuovo ? (
        <button type="button" className="tk-cta tk-cta--sm" onClick={onNuovo}><Plus aria-hidden /><span>Nuovo task</span></button>
      ) : null}
      {onRiprova ? (
        <button type="button" className="tk-btn tk-btn--ghost" onClick={onRiprova}>Riprova</button>
      ) : null}
    </div>
  )
}

export function TaskSkeletonRighe({ n = 6 }: { n?: number }) {
  return (
    <div className="tk-skeleton" aria-busy="true" aria-label="Caricamento task">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="tk-skeleton-row">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-4 flex-1" style={{ maxWidth: `${60 - (i % 3) * 12}%` }} />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="size-6 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function TaskSkeletonKanban() {
  return (
    <div className="tk-skeleton-kanban" aria-busy="true" aria-label="Caricamento task">
      {Array.from({ length: 4 }, (_, c) => (
        <div key={c} className="tk-skeleton-col">
          <Skeleton className="h-5 w-24" />
          {Array.from({ length: 3 - (c % 2) }, (_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ))}
    </div>
  )
}
