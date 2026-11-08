import { CalendarClock, FileText, History, LayoutTemplate, Plus, Salad, Users } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { quandoBreve } from "@/components/diete/parti-editor"
import { LuxAvatar, LuxHero, LuxKpi } from "@/components/lux"
import { Cerca } from "@/components/pagamenti/comuni"
import { Cta, Pagina, Riquadro, Tabella } from "@/components/pagina"
import { Caricamento, Errore, Vuoto } from "@/components/stati"
import { Chip } from "@/components/chip"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAzioni } from "@/contexts/azioni-context"
import { useDati } from "@/hooks/use-dati"
import { toastErrore } from "@/lib/toast"
import { dieteService } from "@/services/gestionale"
import type { RigaDieta } from "@/types"
import "@/style/pagamenti.css"
import "@/style/diete.css"

/** Per ogni paziente è "in uso" la dieta creata per ultima; le altre sono il suo storico. */
function inUso(righe: RigaDieta[]) {
  const ultime = new Map<number, RigaDieta>()
  for (const r of righe) {
    if (r.pazienteId == null) continue
    const attuale = ultime.get(r.pazienteId)
    if (!attuale || r.createdAt > attuale.createdAt) ultime.set(r.pazienteId, r)
  }
  return new Set([...ultime.values()].map((r) => r.id))
}

export default function Diete() {
  const navigate = useNavigate()
  const azioni = useAzioni()
  const [ricerca, setRicerca] = useState("")
  const [soloInUso, setSoloInUso] = useState(true)
  const { dati, errore, riprova } = useDati(() => dieteService.tutte(), [])

  const calcolo = useMemo(() => {
    const righe = dati ?? []
    const modelli = righe.filter((r) => r.pazienteId == null)
    const diete = righe.filter((r) => r.pazienteId != null)
    const attive = inUso(diete)
    const pazienti = new Set(diete.map((d) => d.pazienteId)).size
    const settimana = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const recenti = diete.filter((d) => d.updatedAt >= settimana).length
    const daConsegnare = diete.filter((d) => attive.has(d.id) && !d.consegnataIl).length
    return { modelli, diete, attive, pazienti, recenti, daConsegnare }
  }, [dati])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const { modelli, diete, attive, pazienti, recenti, daConsegnare } = calcolo
  const testo = ricerca.trim().toLowerCase()
  const mostrate = diete
    .filter((d) => !soloInUso || attive.has(d.id))
    .filter((d) => !testo || `${d.pazienteNome} ${d.titolo} ${d.obiettivo ?? ""}`.toLowerCase().includes(testo))

  return (
    <Pagina>
      <div className="dt-elenco">
        <LuxHero ariaLabel="Diete" eyebrow="Nutrizione" title="Diete"
          subtitle={diete.length === 0 ? "Scrivi il primo piano alimentare: il PDF si impagina da solo" : `${diete.length} ${diete.length === 1 ? "dieta" : "diete"} per ${pazienti} ${pazienti === 1 ? "paziente" : "pazienti"}, ognuna con il suo storico`}
          actions={<Cta icona={Plus} onClick={() => azioni.nuovaDieta()}>Nuova dieta</Cta>}>
          <div className="vl-kpis vl-kpis--3">
            <LuxKpi icon={<Users className="size-4" />} label="Pazienti con una dieta" value={pazienti} foot={`${diete.length} diete in tutto, storico compreso`} />
            <LuxKpi icon={<CalendarClock className="size-4" />} label="Aggiornate negli ultimi 7 giorni" value={recenti}
              foot={daConsegnare > 0 ? `${daConsegnare} in uso ancora da consegnare` : "Tutte le diete in uso sono consegnate"} />
            <LuxKpi icon={<LayoutTemplate className="size-4" />} label="Modelli" value={modelli.length} foot="Punti di partenza riutilizzabili" />
          </div>
        </LuxHero>

        <Riquadro titolo="Diete dei pazienti" conteggio={mostrate.length}
          descrizione={soloInUso ? "L'ultima dieta di ogni paziente. Le precedenti restano nello storico." : "Tutte le diete, anche quelle sostituite da una più recente."}
          azioni={
            <div className="dt-filtri">
              <div className="dt-interruttori" role="group" aria-label="Quali diete">
                <button type="button" aria-pressed={soloInUso} onClick={() => setSoloInUso(true)}>In uso</button>
                <button type="button" aria-pressed={!soloInUso} onClick={() => setSoloInUso(false)}><History aria-hidden />Tutto lo storico</button>
              </div>
              <Cerca valore={ricerca} onValore={setRicerca} etichetta="Cerca diete" segnaposto="Paziente, titolo, obiettivo" />
            </div>
          }>
          {mostrate.length === 0 ? (
            <Vuoto icona={<Salad aria-hidden />} titolo={diete.length === 0 ? "Ancora nessuna dieta" : "Nessuna dieta trovata"}
              descrizione={diete.length === 0 ? "Crea la prima dal pulsante Nuova dieta o dalla scheda di un paziente." : "Prova a cambiare la ricerca."} />
          ) : (
            <Tabella>
              <TableHeader>
                <TableRow>
                  <TableHead>Paziente</TableHead>
                  <TableHead>Dieta</TableHead>
                  <TableHead className="text-right">Energia</TableHead>
                  <TableHead>Creata</TableHead>
                  <TableHead>Ultima modifica</TableHead>
                  <TableHead className="text-right">Versioni</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead><span className="sr-only">Azioni</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mostrate.map((d) => {
                  const [nome, ...cognome] = (d.pazienteNome ?? "").split(" ")
                  const usata = attive.has(d.id)
                  return (
                    <TableRow key={d.id} className="dt-riga" tabIndex={0} onClick={() => navigate(`/diete/${d.id}`)} onKeyDown={(e) => e.key === "Enter" && navigate(`/diete/${d.id}`)}>
                      <TableCell>
                        <button type="button" className="dt-riga-paziente" onClick={(e) => {
                          e.stopPropagation()
                          if (d.pazienteId) azioni.apriPaziente(d.pazienteId)
                        }}>
                          <LuxAvatar first={nome} second={cognome.join(" ")} />
                          <span>{d.pazienteNome}</span>
                        </button>
                      </TableCell>
                      <TableCell>
                        <strong className="dt-riga-titolo">{d.titolo}</strong>
                        <small className="dt-riga-sotto">{d.obiettivo ?? `${d.giornate} ${d.giornate === 1 ? "giornata" : "giornate"} · ${d.pasti} pasti`}</small>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{d.kcal ? `${d.kcal.toLocaleString("it-IT")} kcal` : "—"}</TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">{quandoBreve(d.createdAt)}</TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">{quandoBreve(d.updatedAt)}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.versioni}</TableCell>
                      <TableCell>
                        {!usata ? <Chip tono="muted">Precedente</Chip> : d.consegnataIl ? <Chip tono="ok">In uso · consegnata</Chip> : <Chip tono="warn">In uso · da consegnare</Chip>}
                      </TableCell>
                      <TableCell className="text-right">
                        <button type="button" className="dt-icona" title="Apri il PDF" aria-label={`PDF della dieta di ${d.pazienteNome}`} onClick={(e) => {
                          e.stopPropagation()
                          dieteService.apriPdf(d.id).catch(toastErrore)
                        }}><FileText aria-hidden /></button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Tabella>
          )}
        </Riquadro>

        <Riquadro titolo="Modelli" conteggio={modelli.length} descrizione="Diete senza paziente: le usi come punto di partenza e le ritocchi.">
          <div className="dt-modelli">
            {modelli.map((m) => (
              <article key={m.id} className="dt-modello">
                <button type="button" className="dt-modello-apri" onClick={() => navigate(`/diete/${m.id}`)}>
                  <span className="dt-modello-icona" aria-hidden><LayoutTemplate /></span>
                  <strong>{m.titolo}</strong>
                  <small>{[m.kcal ? `${m.kcal.toLocaleString("it-IT")} kcal` : null, `${m.pasti} pasti`, m.obiettivo].filter(Boolean).join(" · ")}</small>
                  <small className="dt-modello-data">Modificato {quandoBreve(m.updatedAt)}</small>
                </button>
                <button type="button" className="dt-pillola" onClick={() => azioni.nuovaDieta({ daDietaId: m.id })}><Users aria-hidden />Usa per un paziente</button>
              </article>
            ))}
            <button type="button" className="dt-modello dt-modello-nuovo" onClick={() => azioni.nuovaDieta({ modello: true })}>
              <Plus aria-hidden />
              <strong>Nuovo modello</strong>
              <small>Es. 1.600 kcal vegetariana, mantenimento, giorni di allenamento</small>
            </button>
          </div>
        </Riquadro>
      </div>
    </Pagina>
  )
}
