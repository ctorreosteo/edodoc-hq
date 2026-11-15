import { useState, type ReactNode } from 'react'
import { addDays, addWeeks, format, nextMonday } from 'date-fns'
import { it } from 'date-fns/locale'
import { AlarmClock, CalendarCheck, CalendarDays, CalendarX2, Clock, Sun, Sunrise, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { TASK_LAYER_Z, parseDataLocale, toIsoData } from '@/components/task/task-ui'
import '@/style/lux-task-board.css'

export interface PosticipaOpzione {
  id: 'tardi' | 'domani' | 'lunedi' | 'settimana'
  label: string
  /** Quando, in breve: "18:15", "ven", "3 nov" */
  hint: string
  scadenza: string
  /** null = mantiene l'ora attuale del task (la decide chi applica) */
  scadenzaOra: string | null
}

const quartoSuccessivo = (d: Date) => {
  const r = new Date(d)
  r.setSeconds(0, 0)
  const m = r.getMinutes()
  r.setMinutes(m + ((15 - (m % 15)) % 15))
  return r
}

const hhmmss = (d: Date) => `${format(d, 'HH:mm')}:00`

/**
 * Opzioni rapide per spostare una scadenza.
 * "Più tardi oggi" (+3 ore, al quarto d'ora) compare solo se cade prima delle 19.
 */
export function posticipaOpzioni(oggi: Date = new Date()): PosticipaOpzione[] {
  const out: PosticipaOpzione[] = []
  const tardi = quartoSuccessivo(new Date(oggi.getTime() + 3 * 3600_000))
  if (tardi.getHours() < 19 && tardi.getDate() === oggi.getDate()) {
    out.push({ id: 'tardi', label: 'Più tardi oggi', hint: format(tardi, 'HH:mm'), scadenza: toIsoData(oggi), scadenzaOra: hhmmss(tardi) })
  }
  const domani = addDays(oggi, 1)
  out.push({ id: 'domani', label: 'Domani', hint: format(domani, 'EEE', { locale: it }), scadenza: toIsoData(domani), scadenzaOra: null })
  const lunedi = nextMonday(oggi)
  out.push({ id: 'lunedi', label: 'Lunedì prossimo', hint: format(lunedi, 'd MMM', { locale: it }), scadenza: toIsoData(lunedi), scadenzaOra: null })
  const settimana = addWeeks(oggi, 1)
  out.push({ id: 'settimana', label: 'Tra una settimana', hint: format(settimana, 'EEE d MMM', { locale: it }), scadenza: toIsoData(settimana), scadenzaOra: null })
  return out
}

const ICONE: Record<PosticipaOpzione['id'], typeof Clock> = {
  tardi: Sun,
  domani: Sunrise,
  lunedi: CalendarClock,
  settimana: CalendarDays,
}

const ORARI = (() => {
  const out: string[] = []
  for (let h = 7; h <= 21; h++) for (const m of [0, 15, 30, 45]) if (!(h === 21 && m > 0)) out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  return out
})()

/**
 * Scadenza e "Posticipa" in una vista sola: a sinistra le scorciatoie (oggi, più tardi, domani, lunedì,
 * settimana) e la rimozione, a destra il calendario con l'orario. Niente secondo passaggio per scegliere una data.
 * Le scorciatoie mantengono l'ora del task se ne ha una (tranne "Più tardi oggi"); il giorno dal calendario
 * prende l'orario scelto sotto. Ogni scelta si salva al primo clic.
 */
export function TaskPosticipaMenu({
  scadenza,
  scadenzaOra,
  onPosticipa,
  trigger,
  align = 'end',
  titolo = 'Posticipa',
}: {
  scadenza: string | null
  scadenzaOra: string | null
  onPosticipa: (scadenza: string | null, scadenzaOra: string | null) => void
  trigger?: ReactNode
  align?: 'start' | 'center' | 'end'
  /** Intestazione del menu (es. "Sposta a…" dal calendario) */
  titolo?: string
}) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Date | undefined>(undefined)
  const [ora, setOra] = useState('')

  const apri = (o: boolean) => {
    setOpen(o)
    if (o) {
      setData(parseDataLocale(scadenza) ?? undefined)
      setOra(scadenzaOra ? scadenzaOra.slice(0, 5) : '')
    }
  }

  const applica = (s: string | null, o: string | null) => {
    onPosticipa(s, o)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={apri}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button type="button" className="tkb-icon-btn" aria-label={titolo} title={titolo}
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <AlarmClock className="size-4" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} sideOffset={6} className={cn('tkb-posticipa w-auto max-w-[calc(100vw-1rem)] p-1.5', TASK_LAYER_Z)}
        data-vl="scope" data-vl-page="task" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="tkb-posticipa-griglia">
          <div role="menu" aria-label={titolo} className="tkb-posticipa-rapide">
            <div className="tkb-posticipa-head">{titolo}</div>
            <button type="button" role="menuitem" className="tkb-posticipa-item"
              data-attivo={scadenza === toIsoData(new Date()) ? '' : undefined}
              onClick={() => applica(toIsoData(new Date()), scadenzaOra)}>
              <CalendarCheck className="size-4" />
              <span>Oggi</span>
              <em>{format(new Date(), 'EEE', { locale: it })}</em>
            </button>
            {posticipaOpzioni().map((o) => {
              const Icona = ICONE[o.id]
              return (
                <button key={o.id} type="button" role="menuitem" className="tkb-posticipa-item"
                  data-attivo={o.id !== 'tardi' && scadenza === o.scadenza ? '' : undefined}
                  onClick={() => applica(o.scadenza, o.id === 'tardi' ? o.scadenzaOra : scadenzaOra)}>
                  <Icona className="size-4" />
                  <span>{o.label}</span>
                  <em>{o.hint}</em>
                </button>
              )
            })}
            {scadenza ? (
              <>
                <div className="tkb-posticipa-sep" />
                <button type="button" role="menuitem" className="tkb-posticipa-item" data-tono="muto"
                  onClick={() => applica(null, null)}>
                  <CalendarX2 className="size-4" />
                  <span>Rimuovi scadenza</span>
                </button>
              </>
            ) : null}
          </div>

          <div className="tkb-posticipa-cal">
            <Calendar mode="single" weekStartsOn={1} locale={it} selected={data} defaultMonth={data}
              onSelect={(d) => d && applica(toIsoData(d), ora ? `${ora}:00` : null)} />
            {/* L'orario vale per il giorno scelto qui sopra */}
            <label className="tkb-posticipa-foot">
              <Clock className="size-4" />
              <select value={ora} onChange={(e) => setOra(e.target.value)} aria-label="Ora">
                <option value="">Senza orario</option>
                {ORARI.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
