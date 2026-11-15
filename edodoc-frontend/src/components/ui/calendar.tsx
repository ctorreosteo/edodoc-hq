import * as React from "react"
import { format, isSameMonth, startOfMonth, type Locale } from "date-fns"
import { it } from "date-fns/locale"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"

/*
  Calendario di tutti i date picker del gestionale.
  - Oggi sempre riconoscibile (colore e puntino), anche quando è selezionato un altro giorno.
  - Clic sul mese in alto: griglia dei mesi; clic sull'anno: griglia degli anni. Così si salta lontano in due clic.
  - "Oggi" in fondo riporta al mese corrente.
  Italiano e settimana dal lunedì se il chiamante non dice altro.
*/

type Vista = "giorni" | "mesi" | "anni"

const ANNI_PER_PAGINA = 12

/** Primo mese da mostrare: quello del giorno selezionato (singolo, intervallo o multiplo), altrimenti oggi. */
function meseDellaSelezione(selected: unknown): Date | undefined {
  if (selected instanceof Date) return selected
  if (Array.isArray(selected) && selected[0] instanceof Date) return selected[0]
  if (selected && typeof selected === "object" && "from" in selected) {
    const from = (selected as { from?: unknown }).from
    if (from instanceof Date) return from
  }
  return undefined
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  locale = it,
  weekStartsOn = 1,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()
  const oggi = props.today ?? new Date()
  // DayPicker accetta un locale parziale; per i nomi dei mesi serve quello completo di date-fns
  const localeMesi = { ...it, ...locale } as Locale

  // Mese mostrato: del chiamante se lo controlla, altrimenti qui
  const meseRichiesto = props.defaultMonth ?? meseDellaSelezione((props as { selected?: unknown }).selected)
  const [meseInterno, setMeseInterno] = React.useState<Date>(() => meseRichiesto ?? oggi)
  // La data può arrivare dopo l'apertura (scheda ancora in caricamento) o cambiare da fuori:
  // il calendario va sul suo mese invece di restare su quello di oggi
  const chiaveMeseRichiesto = meseRichiesto ? meseRichiesto.getFullYear() * 12 + meseRichiesto.getMonth() : null
  const [chiaveMesePrecedente, setChiaveMesePrecedente] = React.useState(chiaveMeseRichiesto)
  if (chiaveMeseRichiesto !== chiaveMesePrecedente) {
    setChiaveMesePrecedente(chiaveMeseRichiesto)
    if (meseRichiesto && props.month === undefined) setMeseInterno(startOfMonth(meseRichiesto))
  }
  const mese = props.month ?? meseInterno
  const cambiaMese = (d: Date) => {
    const inizio = startOfMonth(d)
    if (props.month === undefined) setMeseInterno(inizio)
    props.onMonthChange?.(inizio)
  }

  const [vista, setVista] = React.useState<Vista>("giorni")
  const navigabile = !props.hideNavigation && !props.disableNavigation && captionLayout === "label"

  const fuoriLimiti = (inizio: Date, fine: Date) =>
    (props.startMonth != null && fine < startOfMonth(props.startMonth)) ||
    (props.endMonth != null && inizio > startOfMonth(props.endMonth))

  if (vista !== "giorni") {
    return (
      <CalendarioMesiAnni
        className={className}
        vista={vista}
        mese={mese}
        oggi={oggi}
        locale={localeMesi}
        fuoriLimiti={fuoriLimiti}
        onVista={setVista}
        onMese={(d) => {
          cambiaMese(d)
          setVista("giorni")
        }}
      />
    )
  }

  const footerOggi = navigabile ? (
    <div className="flex justify-center border-t border-border/60 pt-2">
      <button
        type="button"
        disabled={isSameMonth(mese, oggi)}
        onClick={() => cambiaMese(oggi)}
        className="rounded-full px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-40 dark:text-sky-300 dark:hover:bg-sky-400/10 silvia:text-white silvia:hover:bg-white/10"
      >
        Oggi · {format(oggi, "d MMM", { locale: localeMesi })}
      </button>
    </div>
  ) : undefined

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={locale}
      weekStartsOn={weekStartsOn}
      className={cn(
        "bg-background group/calendar p-3 [--cell-size:--spacing(8.5)] max-sm:[--cell-size:2.5rem] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "flex gap-4 flex-col md:flex-row relative",
          defaultClassNames.months
        ),
        month: cn("flex flex-col w-full gap-3", defaultClassNames.month),
        nav: cn(
          "flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) rounded-full text-muted-foreground hover:text-foreground aria-disabled:opacity-40 p-0 select-none",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) rounded-full text-muted-foreground hover:text-foreground aria-disabled:opacity-40 p-0 select-none",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex items-center justify-center h-(--cell-size) w-full px-(--cell-size)",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "w-full flex items-center text-sm font-medium justify-center h-(--cell-size) gap-1.5",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative has-focus:border-ring border border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] rounded-md",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "absolute bg-popover inset-0 opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "select-none font-semibold capitalize",
          captionLayout === "label"
            ? "text-sm"
            : "rounded-md pl-2 pr-1 flex items-center gap-1 text-sm h-8 [&>svg]:text-muted-foreground [&>svg]:size-3.5",
          defaultClassNames.caption_label
        ),
        table: "w-full border-collapse",
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "text-muted-foreground/80 rounded-md flex-1 font-medium text-[0.68rem] uppercase tracking-wide select-none",
          defaultClassNames.weekday
        ),
        week: cn("flex w-full mt-1", defaultClassNames.week),
        week_number_header: cn(
          "select-none w-(--cell-size)",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "text-[0.8rem] select-none text-muted-foreground",
          defaultClassNames.week_number
        ),
        day: cn(
          "relative w-full h-full p-0 text-center [&:first-child[data-selected=true]_button]:rounded-l-lg [&:last-child[data-selected=true]_button]:rounded-r-lg group/day aspect-square select-none",
          defaultClassNames.day
        ),
        range_start: cn(
          "rounded-l-lg bg-accent",
          defaultClassNames.range_start
        ),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn("rounded-r-lg bg-accent", defaultClassNames.range_end),
        // Oggi è evidenziato sul pulsante (CalendarDayButton), non sulla cella
        today: defaultClassNames.today,
        outside: cn(
          "text-muted-foreground/50 aria-selected:text-muted-foreground",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-muted-foreground opacity-40",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        footer: cn("mt-2", defaultClassNames.footer),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-4", className)}
                {...props}
              />
            )
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          )
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        ...(navigabile
          ? {
              // Il mese in alto apre la griglia dei mesi (sopra le frecce, che restano ai lati)
              CaptionLabel: ({ children, className }: React.HTMLAttributes<HTMLSpanElement>) => (
                <button
                  type="button"
                  onClick={() => setVista("mesi")}
                  title="Scegli mese e anno"
                  className={cn(
                    className,
                    "relative z-10 inline-flex h-7 items-center gap-1 rounded-full px-2.5 transition-colors hover:bg-accent [&>svg]:size-3.5 [&>svg]:text-muted-foreground"
                  )}
                >
                  {children}
                  <ChevronDownIcon />
                </button>
              ),
            }
          : {}),
        ...components,
      }}
      {...props}
      month={mese}
      onMonthChange={cambiaMese}
      footer={props.footer ?? footerOggi}
    />
  )
}

/** Griglia dei mesi di un anno o degli anni di una dozzina: sostituisce i giorni finché non si sceglie. */
function CalendarioMesiAnni({
  className,
  vista,
  mese,
  oggi,
  locale,
  fuoriLimiti,
  onVista,
  onMese,
}: {
  className?: string
  vista: Exclude<Vista, "giorni">
  mese: Date
  oggi: Date
  locale: Locale
  fuoriLimiti: (inizio: Date, fine: Date) => boolean
  onVista: (v: Vista) => void
  onMese: (d: Date) => void
}) {
  const [anno, setAnno] = React.useState(mese.getFullYear())
  const primoAnno = Math.floor(anno / ANNI_PER_PAGINA) * ANNI_PER_PAGINA

  const cella =
    "h-10 rounded-lg text-sm capitalize transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-35"
  const corrente = "font-semibold text-primary ring-1 ring-inset ring-primary/40 dark:text-sky-300 dark:ring-sky-400/50 silvia:text-white silvia:ring-white/40"
  const scelto = "bg-(--calendario-scelto)! text-(--calendario-scelto-foreground)! font-semibold shadow-sm ring-0! hover:opacity-90"

  const freccia = (verso: -1 | 1) => (
    <button
      type="button"
      aria-label={verso < 0 ? "Indietro" : "Avanti"}
      onClick={() => setAnno((a) => a + verso * (vista === "mesi" ? 1 : ANNI_PER_PAGINA))}
      className={cn(buttonVariants({ variant: "ghost" }), "size-8 rounded-full p-0 text-muted-foreground hover:text-foreground")}
    >
      {verso < 0 ? <ChevronLeftIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
    </button>
  )

  return (
    <div data-slot="calendar" className={cn("bg-background w-[17.5rem] p-3 [[data-slot=popover-content]_&]:bg-transparent", className)}>
      <div className="mb-3 flex items-center justify-between">
        {freccia(-1)}
        <button
          type="button"
          onClick={() => onVista(vista === "mesi" ? "anni" : "mesi")}
          title={vista === "mesi" ? "Scegli l'anno" : "Torna ai mesi"}
          className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-sm font-semibold transition-colors hover:bg-accent"
        >
          {vista === "mesi" ? anno : `${primoAnno} – ${primoAnno + ANNI_PER_PAGINA - 1}`}
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </button>
        {freccia(1)}
      </div>

      {vista === "mesi" ? (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 12 }, (_, i) => {
            const d = new Date(anno, i, 1)
            return (
              <button
                key={i}
                type="button"
                disabled={fuoriLimiti(d, d)}
                onClick={() => onMese(d)}
                className={cn(cella, isSameMonth(d, oggi) && corrente, isSameMonth(d, mese) && scelto)}
              >
                {format(d, "LLL", { locale })}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: ANNI_PER_PAGINA }, (_, i) => {
            const a = primoAnno + i
            return (
              <button
                key={a}
                type="button"
                disabled={fuoriLimiti(new Date(a, 0, 1), new Date(a, 11, 1))}
                onClick={() => {
                  setAnno(a)
                  onVista("mesi")
                }}
                className={cn(cella, a === oggi.getFullYear() && corrente, a === mese.getFullYear() && scelto)}
              >
                {a}
              </button>
            )
          })}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2">
        <button
          type="button"
          onClick={() => onVista("giorni")}
          className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Annulla
        </button>
        <button
          type="button"
          onClick={() => onMese(oggi)}
          className="rounded-full px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 dark:text-sky-300 dark:hover:bg-sky-400/10 silvia:text-white silvia:hover:bg-white/10"
        >
          Oggi
        </button>
      </div>
    </div>
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-today={modifiers.today}
      data-today-libero={modifiers.today && !modifiers.selected}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "rounded-lg transition-colors hover:bg-accent data-[selected-single=true]:bg-(--calendario-scelto)! data-[selected-single=true]:text-(--calendario-scelto-foreground)! data-[selected-single=true]:font-semibold data-[selected-single=true]:shadow-sm data-[selected-single=true]:hover:opacity-90 data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:bg-(--calendario-scelto)! data-[range-start=true]:text-(--calendario-scelto-foreground)! data-[range-end=true]:bg-(--calendario-scelto)! data-[range-end=true]:text-(--calendario-scelto-foreground)! group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50 dark:hover:text-accent-foreground flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] data-[range-end=true]:rounded-lg data-[range-end=true]:rounded-r-lg data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-lg data-[range-start=true]:rounded-l-lg [&>span]:text-xs [&>span]:opacity-70",
        // Oggi: colore del brand e puntino sotto il numero; sul giorno selezionato il puntino prende il colore del testo
        "relative data-[today=true]:font-semibold data-[today=true]:after:absolute data-[today=true]:after:bottom-1 data-[today=true]:after:left-1/2 data-[today=true]:after:size-1 data-[today=true]:after:-translate-x-1/2 data-[today=true]:after:rounded-full data-[today=true]:after:bg-current",
        // Oggi non selezionato: solo testo colorato e pallino, mai lo sfondo della selezione
        "data-[today-libero=true]:text-primary dark:data-[today-libero=true]:text-sky-300 silvia:data-[today-libero=true]:text-white",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
