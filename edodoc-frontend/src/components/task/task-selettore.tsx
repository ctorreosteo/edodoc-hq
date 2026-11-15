import type { MouseEvent } from 'react'
import { cn } from '@/lib/utils'

/**
 * Casella di selezione dei task (selezione multipla): quadratino arrotondato che si riempie del colore d'accento,
 * con la spunta che si disegna. `parziale` = una parte del gruppo selezionata. `onCambia` riceve l'evento del clic:
 * con Shift chi la usa seleziona un intervallo.
 */
export function TaskSelettore({ selezionato, parziale, onCambia, etichetta, className }: {
  selezionato: boolean
  parziale?: boolean
  onCambia: (e: MouseEvent<HTMLButtonElement>) => void
  etichetta: string
  className?: string
}) {
  const stato = selezionato ? 'si' : parziale ? 'parziale' : 'no'
  return (
    <button type="button" role="checkbox" aria-checked={selezionato ? true : parziale ? 'mixed' : false}
      aria-label={etichetta} title={selezionato ? 'Deseleziona (Shift+clic: un intervallo)' : 'Seleziona (Shift+clic: un intervallo)'}
      data-stato={stato} className={cn('tk-sel', className)}
      // Shift+clic non deve selezionare il testo della pagina
      onMouseDown={(e) => { if (e.shiftKey) e.preventDefault() }}
      onClick={(e) => {
        e.stopPropagation()
        onCambia(e)
      }}>
      <span className="tk-sel-box" aria-hidden>
        <svg viewBox="0 0 16 16">
          {parziale && !selezionato
            ? <path className="tk-sel-segno" d="M4.5 8h7" />
            : <path className="tk-sel-segno" d="M4 8.4l2.7 2.6L12 5.4" />}
        </svg>
      </span>
    </button>
  )
}
