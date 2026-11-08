import { addDays, addWeeks, format, isSameDay, startOfWeek } from "date-fns"
import { it } from "date-fns/locale"
import { Ban, CalendarPlus, Check, ChevronLeft, ChevronRight, ClipboardCheck, Info, TriangleAlert, X } from "lucide-react"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Pagina, Riquadro } from "@/components/pagina"
import { Caricamento, Errore } from "@/components/stati"
import { Button } from "@/components/ui/button"
import { AgendaGiorno } from "@/components/visite/agenda-giorno"
import { AgendaSettimana } from "@/components/visite/agenda-settimana"
import { TabelleVisite } from "@/components/visite/tabelle-visite"
import { useAdesso, useVistaGiorno } from "@/components/visite/use-agenda"
import { VisiteHero } from "@/components/visite/visite-hero"
import { useAzioni } from "@/contexts/azioni-context"
import { useDati } from "@/hooks/use-dati"
import { TIPO_VISITA } from "@/lib/etichette"
import { formatDateOnlyLocal } from "@/lib/utils"
import {
  attiva, conta, daSegnare, delGiorno, densita, durataMinuti, filtriUtili, fraseDiOggi, prossimaVisita, rispettaFiltro, sovrapposte as trovaSovrapposte, type FiltroAgenda,
} from "@/lib/visite"
import { impostazioniService, visiteService } from "@/services/gestionale"
import "@/style/visite.css"

const GIORNI_ORIZZONTE = 60
const CODICE_CALENDARIO = "GOOGLE_CALENDAR_SYNC_ENABLED"

const lunediDi = (data: Date) => startOfWeek(data, { weekStartsOn: 1 })

export default function Visite() {
  const azioni = useAzioni()
  const adesso = useAdesso()
  const vistaGiorno = useVistaGiorno()
  const [lunedi, setLunedi] = useState(() => lunediDi(new Date()))
  const [scelto, setScelto] = useState<number | null>(null)
  const [filtro, setFiltro] = useState<FiltroAgenda>("tutte")
  const [conAnnullate, setConAnnullate] = useState(false)

  const giorni = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(lunedi, i)), [lunedi])
  const da = formatDateOnlyLocal(giorni[0])
  const a = formatDateOnlyLocal(giorni[6])
  const oggi = formatDateOnlyLocal(adesso)
  const { dati, errore, riprova } = useDati(async () => ({ da, visite: await visiteService.periodo(da, a) }), [da, a])
  // La prossima visita non dipende dalla settimana guardata; se manca, l'agenda resta comunque utilizzabile
  const { dati: future } = useDati(() => visiteService.periodo(oggi, formatDateOnlyLocal(addDays(adesso, GIORNI_ORIZZONTE))).catch(() => null), [oggi])
  const { dati: impostazioni } = useDati(() => impostazioniService.carica().catch(() => null), [])

  const inCaricamento = dati?.da !== da
  const visite = useMemo(() => (dati && dati.da === da ? dati.visite : []), [dati, da])
  const riepilogo = useMemo(() => densita(giorni, visite), [giorni, visite])
  const sovrapposte = useMemo(() => trovaSovrapposte(visite), [visite])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const valide = visite.filter(attiva)
  const annullate = visite.length - valide.length
  const finiteDaSegnare = valide.filter((v) => daSegnare(v, adesso)).length
  const filtri = filtriUtili(visite, adesso)
  const filtroAttivo = filtri.some((f) => f.valore === filtro) ? filtro : "tutte"
  const mostrate = visite.filter((v) => (attiva(v) || conAnnullate) && rispettaFiltro(v, filtroAttivo, adesso))

  const indiceOggi = giorni.findIndex((g) => isSameDay(g, adesso))
  const primoConVisite = riepilogo.findIndex((g) => g.visite > 0)
  const giornoAperto = scelto ?? (indiceOggi >= 0 ? indiceOggi : Math.max(primoConVisite, 0))
  const settimanaCorrente = indiceOggi >= 0
  const calendarioSpento = impostazioni?.integrazioni.find((i) => i.codice === CODICE_CALENDARIO)?.attiva === false

  const vaiA = (nuovo: Date) => {
    setLunedi(nuovo)
    setScelto(null)
  }
  const scegliGiorno = (indice: number) => setScelto((attuale) => (!vistaGiorno && attuale === indice ? null : indice))
  const fissa = (inizio: string) => azioni.nuovaVisita({ inizio })

  return (
    <Pagina>
      <div className="vs-pagina">
        <VisiteHero frase={fraseDiOggi(future ?? visite, adesso)} prossima={prossimaVisita(future ?? [], adesso)} adesso={adesso} densita={riepilogo}
          scelto={vistaGiorno ? giornoAperto : scelto} onScelto={scegliGiorno} minutiTotali={valide.reduce((s, v) => s + durataMinuti(v), 0)}
          visiteTotali={valide.length} daSegnare={finiteDaSegnare} inCaricamento={inCaricamento} onNuova={() => azioni.nuovaVisita()}
          periodo={`${format(giorni[0], "d MMMM", { locale: it })} – ${format(giorni[6], "d MMMM", { locale: it })}`} />

        <Riquadro titolo={settimanaCorrente ? "Questa settimana" : `Settimana del ${format(lunedi, "d MMMM", { locale: it })}`} conteggio={valide.length}
          descrizione={vistaGiorno ? "Tocca uno spazio libero per fissare una visita, tieni premuta una visita per le azioni" : "Clic su uno spazio vuoto per fissare una visita, tasto destro su una visita per le azioni"}
          azioni={
            <div className="vs-comandi">
              <Button variant="outline" size="icon" aria-label="Settimana precedente" onClick={() => vaiA(addWeeks(lunedi, -1))}><ChevronLeft /></Button>
              <Button variant="outline" disabled={settimanaCorrente} onClick={() => vaiA(lunediDi(new Date()))}>Oggi</Button>
              <Button variant="outline" size="icon" aria-label="Settimana successiva" onClick={() => vaiA(addWeeks(lunedi, 1))}><ChevronRight /></Button>
            </div>
          }>
          {filtri.length > 0 || annullate > 0 ? (
            <div className="vs-filtri" role="group" aria-label="Filtra le visite">
              {filtri.length > 0 ? <button type="button" className="vs-filtro" aria-pressed={filtroAttivo === "tutte"} onClick={() => setFiltro("tutte")}>Tutte</button> : null}
              {filtri.map((f) => (
                <button key={f.valore} type="button" className="vs-filtro" aria-pressed={filtroAttivo === f.valore} onClick={() => setFiltro(filtroAttivo === f.valore ? "tutte" : f.valore)}>
                  {f.testo} <b>{f.quante}</b>
                </button>
              ))}
              {annullate > 0 ? (
                <button type="button" className="vs-filtro" aria-pressed={conAnnullate} onClick={() => setConAnnullate((c) => !c)}><Ban aria-hidden />Annullate <b>{annullate}</b></button>
              ) : null}
            </div>
          ) : null}

          {vistaGiorno ? (
            <AgendaGiorno giorno={giorni[giornoAperto]} visite={delGiorno(mostrate, giorni[giornoAperto])} adesso={adesso} sovrapposte={sovrapposte} inCaricamento={inCaricamento} onSlot={fissa} />
          ) : (
            <AgendaSettimana giorni={giorni} visite={mostrate} adesso={adesso} inCaricamento={inCaricamento} sceltoIndice={scelto} sovrapposte={sovrapposte} onSlot={fissa}
              vuoto={!inCaricamento && mostrate.length === 0 ? (
                <div className="vs-vuoto">
                  <div>
                    <CalendarPlus aria-hidden />
                    <strong>Settimana libera</strong>
                    <span>Clicca un orario per fissare la prima visita</span>
                  </div>
                </div>
              ) : null} />
          )}

          {sovrapposte.size > 0 ? (
            <p className="vs-nota" data-tono="warn"><TriangleAlert aria-hidden />{conta(sovrapposte.size, "visita si sovrappone", "visite si sovrappongono")} ad altre in questa settimana: sono segnate col triangolo.</p>
          ) : null}

          {!vistaGiorno ? (
            <div className="vs-piede">
              <div className="vs-legenda" aria-label="Legenda">
                {Object.entries(TIPO_VISITA).map(([codice, testo]) => <span key={codice} data-tipo={codice}><i aria-hidden />{testo}</span>)}
              </div>
              <div className="vs-legenda" aria-hidden>
                <span><Check />Effettuata</span>
                <span><ClipboardCheck />Da segnare</span>
                <span><X />Non presentato</span>
              </div>
            </div>
          ) : null}

          {calendarioSpento ? (
            <p className="vs-nota">
              <Info aria-hidden />
              <span>Google Calendar è spento: per ora niente link Meet né inviti ai pazienti. Le visite future si pubblicano da sole quando lo colleghi. <Link to="/impostazioni">Vai alle Impostazioni</Link></span>
            </p>
          ) : null}
        </Riquadro>

        <TabelleVisite />
      </div>
    </Pagina>
  )
}
