import { addDays, addWeeks, format, isSameDay, parseISO, startOfWeek } from "date-fns"
import { it } from "date-fns/locale"
import { CalendarCheck, CalendarPlus, CalendarX, ChevronLeft, ChevronRight, Video } from "lucide-react"
import { useMemo, useState } from "react"
import { Chip } from "@/components/chip"
import { LuxHero, LuxKpi } from "@/components/lux"
import { MenuVisita } from "@/components/menu-contestuali"
import { Cta, Pagina, Riquadro } from "@/components/pagina"
import { Caricamento, Errore } from "@/components/stati"
import { Button } from "@/components/ui/button"
import { useAzioni } from "@/contexts/azioni-context"
import { useDati } from "@/hooks/use-dati"
import { ora } from "@/lib/format"
import { MODALITA_VISITA, STATO_VISITA, SYNC_GOOGLE, TIPO_VISITA } from "@/lib/etichette"
import { cn, formatDateOnlyLocal } from "@/lib/utils"
import { visiteService } from "@/services/gestionale"

export default function Visite() {
  const azioni = useAzioni()
  const [lunedi, setLunedi] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const giorni = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(lunedi, i)), [lunedi])
  const da = formatDateOnlyLocal(giorni[0])
  const a = formatDateOnlyLocal(giorni[6])
  const { dati, errore, riprova } = useDati(() => visiteService.periodo(da, a), [da, a])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />

  const visite = dati ?? []
  const valide = visite.filter((v) => v.stato !== "ANNULLATA")
  const conMeet = valide.filter((v) => v.conMeet).length
  const inAttesaGoogle = valide.filter((v) => v.googleSyncStato !== "SINCRONIZZATA").length

  return (
    <Pagina>
      <LuxHero ariaLabel="Visite" eyebrow="Agenda" title="Visite" subtitle={`Settimana del ${format(lunedi, "d MMMM", { locale: it })}`}
        actions={<Cta icona={CalendarPlus} onClick={() => azioni.nuovaVisita()}>Nuova visita</Cta>}>
        <div className="vl-kpis vl-kpis--3">
          <LuxKpi icon={<CalendarCheck className="size-4" />} label="Visite della settimana" value={valide.length} />
          <LuxKpi icon={<Video className="size-4" />} label="Con Google Meet" value={conMeet} />
          <LuxKpi icon={<CalendarX className="size-4" />} label="In attesa di Google" value={inAttesaGoogle} foot="Si pubblicano quando colleghi il calendario" />
        </div>
      </LuxHero>

      <Riquadro titolo="Settimana" conteggio={valide.length} descrizione="Clic su un giorno per fissare una visita, tasto destro su una visita per le azioni"
        azioni={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label="Settimana precedente" onClick={() => setLunedi((l) => addWeeks(l, -1))}><ChevronLeft /></Button>
            <Button variant="outline" onClick={() => setLunedi(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Oggi</Button>
            <Button variant="outline" size="icon" aria-label="Settimana successiva" onClick={() => setLunedi((l) => addWeeks(l, 1))}><ChevronRight /></Button>
          </div>
        }>
        {!dati ? <Caricamento /> : (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
            {giorni.map((giorno) => {
              const delGiorno = visite.filter((v) => isSameDay(parseISO(v.inizio), giorno))
              const oggi = isSameDay(giorno, new Date())
              return (
                <section key={giorno.toISOString()} aria-label={format(giorno, "EEEE d MMMM", { locale: it })} className={cn("min-w-0 rounded-xl border p-2 flex flex-col gap-2 md:min-h-64", oggi && "border-[var(--brand-orange)]")}>
                  <button type="button" className="text-left" title="Fissa una visita" onClick={() => azioni.nuovaVisita({ inizio: `${formatDateOnlyLocal(giorno)}T09:00` })}>
                    <span className="block text-xs capitalize text-muted-foreground">{format(giorno, "EEE", { locale: it })}</span>
                    <span className="block text-lg font-bold tabular-nums">{format(giorno, "d")}</span>
                  </button>
                  {delGiorno.map((v) => (
                    <MenuVisita key={v.id} visita={v}>
                      <button type="button" onClick={() => azioni.modificaVisita(v)} disabled={v.stato === "ANNULLATA"}
                        className={cn("w-full rounded-lg border bg-card p-2 text-left", v.stato === "ANNULLATA" && "opacity-50 line-through")}>
                        <span className="flex items-center gap-1 text-xs font-bold tabular-nums">
                          {ora(v.inizio)}
                          {v.conMeet ? <Video className="size-3" aria-label="Con Google Meet" /> : null}
                        </span>
                        <span className="block truncate text-xs font-semibold">{v.pazienteNome}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {v.numeroVisita ? `${v.numeroVisita} su ${v.visiteTotali}` : TIPO_VISITA[v.tipo]} · {MODALITA_VISITA[v.modalita]}
                        </span>
                      </button>
                    </MenuVisita>
                  ))}
                </section>
              )
            })}
          </div>
        )}
      </Riquadro>

      <Riquadro titolo="Stato delle visite" descrizione="Sincronizzazione con Google Calendar visita per visita">
        <ul className="grid gap-2">
          {visite.map((v) => (
            <MenuVisita key={v.id} visita={v}>
              <li className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{v.titoloCalendario}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{format(parseISO(v.inizio), "EEE d, HH:mm", { locale: it })}</span>
                <Chip tono={STATO_VISITA[v.stato].tono}>{STATO_VISITA[v.stato].testo}</Chip>
                <Chip tono={SYNC_GOOGLE[v.googleSyncStato].tono}>{SYNC_GOOGLE[v.googleSyncStato].testo}</Chip>
              </li>
            </MenuVisita>
          ))}
          {visite.length === 0 ? <li className="py-6 text-center text-sm text-muted-foreground">Nessuna visita in questa settimana</li> : null}
        </ul>
      </Riquadro>
    </Pagina>
  )
}
