import { addDays, addWeeks, format, nextMonday } from "date-fns"
import { it } from "date-fns/locale"
import { AlarmClock, CalendarCheck, CalendarClock, CalendarDays, CalendarX2, ChevronLeft, Sunrise } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { isoGiorno } from "./task-utils"

/** Menu "Posticipa": oggi, scorciatoie, data a scelta, rimozione. Ogni scelta si salva al primo clic. */
export function TaskPosticipaMenu({ scadenza, onPosticipa, trigger, align = "end", titolo = "Posticipa" }: {
  scadenza: string | null
  onPosticipa: (scadenza: string | null) => void
  trigger?: ReactNode
  align?: "start" | "center" | "end"
  /** Intestazione del menu (es. "Sposta a…" dal calendario) */
  titolo?: string
}) {
  const [open, setOpen] = useState(false)
  const [scegli, setScegli] = useState(false)
  const [data, setData] = useState("")

  const apri = (o: boolean) => {
    setOpen(o)
    if (o) {
      setScegli(false)
      setData(scadenza ?? "")
    }
  }

  const applica = (s: string | null) => {
    onPosticipa(s)
    setOpen(false)
  }

  const oggi = new Date()
  const opzioni = [
    { label: "Domani", hint: format(addDays(oggi, 1), "EEE", { locale: it }), data: addDays(oggi, 1), Icona: Sunrise },
    { label: "Lunedì prossimo", hint: format(nextMonday(oggi), "d MMM", { locale: it }), data: nextMonday(oggi), Icona: CalendarClock },
    { label: "Tra una settimana", hint: format(addWeeks(oggi, 1), "EEE d MMM", { locale: it }), data: addWeeks(oggi, 1), Icona: CalendarDays },
  ]

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
      <PopoverContent align={align} sideOffset={6} className="tkb-posticipa w-72 p-1.5" data-vl="scope" data-vl-page="task"
        onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        {!scegli ? (
          <div role="menu" aria-label={titolo}>
            <div className="tkb-posticipa-head">{titolo}</div>
            {scadenza !== isoGiorno(oggi) ? (
              <button type="button" role="menuitem" className="tkb-posticipa-item" onClick={() => applica(isoGiorno(oggi))}>
                <CalendarCheck className="size-4" />
                <span>Oggi</span>
                <em>{format(oggi, "EEE", { locale: it })}</em>
              </button>
            ) : null}
            {opzioni.map(({ label, hint, data: giorno, Icona }) => (
              <button key={label} type="button" role="menuitem" className="tkb-posticipa-item" onClick={() => applica(isoGiorno(giorno))}>
                <Icona className="size-4" />
                <span>{label}</span>
                <em>{hint}</em>
              </button>
            ))}
            <div className="tkb-posticipa-sep" />
            <button type="button" role="menuitem" className="tkb-posticipa-item" onClick={() => setScegli(true)}>
              <CalendarDays className="size-4" />
              <span>Scegli data…</span>
            </button>
            {scadenza ? (
              <button type="button" role="menuitem" className="tkb-posticipa-item" data-tono="muto" onClick={() => applica(null)}>
                <CalendarX2 className="size-4" />
                <span>Rimuovi scadenza</span>
              </button>
            ) : null}
          </div>
        ) : (
          <div>
            <button type="button" className="tkb-posticipa-back" onClick={() => setScegli(false)}>
              <ChevronLeft className="size-4" /> Indietro
            </button>
            <div className="tkb-posticipa-foot">
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} aria-label="Data" autoFocus />
              <button type="button" className="tkb-btn-primario" disabled={!data} onClick={() => applica(data)}>Imposta</button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
