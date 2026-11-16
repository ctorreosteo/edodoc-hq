import { format, formatDistanceToNowStrict, parseISO } from "date-fns"
import { it } from "date-fns/locale"
import { CalendarCheck2, CalendarClock, ChevronDown, ChevronsUpDown, ChevronUp, CircleAlert, CircleCheck, Clock3, ExternalLink, Globe, MessageSquareText, Percent, UserCheck } from "lucide-react"
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { Chip } from "@/components/chip"
import { LuxAvatar, LuxHero, LuxKpi } from "@/components/lux"
import { Pagina, Riquadro, Tabella } from "@/components/pagina"
import { FiltriPrenotazioni } from "@/components/prenotazioni/filtri"
import { PrenotazioneSheet } from "@/components/prenotazioni/prenotazione-sheet"
import { Caricamento, Errore, Vuoto } from "@/components/stati"
import { useDati } from "@/hooks/use-dati"
import { corrisponde, ESITO, filtriIniziali, nelPeriodo, ORDINE_STATI, quandoRelativo, RISPOSTA_INVITO, STATO_PRENOTAZIONE, type Filtri } from "@/lib/prenotazioni"
import { prenotazioniService } from "@/services/gestionale"
import type { Prenotazione, StatoPrenotazione } from "@/types"
import "@/style/pagamenti.css"
import "@/style/prenotazioni.css"

type Colonna = "chiamata" | "persona" | "obiettivo" | "stato" | "invito" | "esito" | "prenotata" | "google"
type Ordine = { colonna: Colonna; verso: "asc" | "desc" }

const CHIAVE_FILTRI = "edodoc-prenotazioni-filtri"
const PESO_INVITO = { ACCETTATO: 0, FORSE: 1, IN_ATTESA: 2, RIFIUTATO: 3 }
const PESO_ESITO = { ACQUISTATO: 0, INTERESSATO: 1, CI_PENSA: 2, NON_ADATTO: 3 }
const PESO_GOOGLE: Record<string, number> = { ERRORE: 0, DA_SINCRONIZZARE: 1, SINCRONIZZATA: 2 }

function confronta(a: Prenotazione, b: Prenotazione, c: Colonna): number {
  switch (c) {
    case "chiamata": return a.inizio.localeCompare(b.inizio)
    case "persona": return `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, "it")
    case "obiettivo": return (a.obiettivo ?? "￿").localeCompare(b.obiettivo ?? "￿", "it")
    case "stato": return ORDINE_STATI.indexOf(a.stato) - ORDINE_STATI.indexOf(b.stato)
    case "invito": return PESO_INVITO[a.rispostaInvito] - PESO_INVITO[b.rispostaInvito]
    case "esito": return (a.esito ? PESO_ESITO[a.esito] : 9) - (b.esito ? PESO_ESITO[b.esito] : 9)
    case "prenotata": return a.createdAt.localeCompare(b.createdAt)
    case "google": return (PESO_GOOGLE[a.googleSyncStato] ?? 9) - (PESO_GOOGLE[b.googleSyncStato] ?? 9)
  }
}

function leggiFiltri(): Filtri {
  const base = filtriIniziali()
  try {
    const salvati = JSON.parse(localStorage.getItem(CHIAVE_FILTRI) ?? "null") as Partial<Filtri> | null
    return salvati ? { ...base, ...salvati, ricerca: "" } : base
  } catch {
    return base
  }
}

function Intestazione({ colonna, ordine, onOrdina, children, className }: { colonna: Colonna; ordine: Ordine; onOrdina: (c: Colonna) => void; children: ReactNode; className?: string }) {
  const attiva = ordine.colonna === colonna
  const Icona = !attiva ? ChevronsUpDown : ordine.verso === "asc" ? ChevronUp : ChevronDown
  return (
    <th className={className} aria-sort={attiva ? (ordine.verso === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="pr-th" data-attiva={attiva ? "" : undefined} onClick={() => onOrdina(colonna)}>
        {children}<Icona aria-hidden />
      </button>
    </th>
  )
}

function IconaGoogle({ stato }: { stato: string }) {
  if (stato === "SINCRONIZZATA") return <span className="pr-google" data-stato="ok" title="Su Google Calendar"><CircleCheck aria-hidden /><span className="sr-only">Su Google Calendar</span></span>
  if (stato === "ERRORE") return <span className="pr-google" data-stato="errore" title="Google ha rifiutato l'ultima modifica"><CircleAlert aria-hidden /><span className="sr-only">Errore Google</span></span>
  return <span className="pr-google" data-stato="attesa" title="In attesa di Google Calendar"><Clock3 aria-hidden /><span className="sr-only">In attesa di Google</span></span>
}

export default function Prenotazioni() {
  const { dati, errore, riprova } = useDati(() => prenotazioniService.tutte(), [])
  const [filtri, setFiltri] = useState<Filtri>(leggiFiltri)
  const [ordine, setOrdine] = useState<Ordine>({ colonna: "chiamata", verso: "asc" })
  const [aperta, setAperta] = useState<number | null>(null)
  const chiudi = useCallback(() => setAperta(null), [])

  useEffect(() => {
    try {
      localStorage.setItem(CHIAVE_FILTRI, JSON.stringify({ ...filtri, ricerca: "" }))
    } catch {
      // solo comodità: se il browser non salva, i filtri ripartono dal mese corrente
    }
  }, [filtri])

  const calcolo = useMemo(() => {
    const tutte = dati ?? []
    const adesso = new Date()
    // Prima periodo, esito, invito e ricerca; gli stati per ultimi, così i conteggi dei bottoni dicono cosa si troverebbe
    const base = tutte.filter((p) => nelPeriodo(p, filtri, adesso) && corrisponde(p, filtri.ricerca)
      && (filtri.esito === "TUTTI" || (filtri.esito === "NESSUNO" ? !p.esito : p.esito === filtri.esito))
      && (filtri.invito === "TUTTI" || p.rispostaInvito === filtri.invito))
    const conteggi = Object.fromEntries(ORDINE_STATI.map((s) => [s, base.filter((p) => p.stato === s).length])) as Record<StatoPrenotazione, number>
    const righe = base.filter((p) => filtri.stati.length === 0 || filtri.stati.includes(p.stato))
    const segno = ordine.verso === "asc" ? 1 : -1
    righe.sort((a, b) => segno * confronta(a, b, ordine.colonna) || a.inizio.localeCompare(b.inizio))

    const future = tutte.filter((p) => p.stato === "IN_PROGRAMMA").sort((a, b) => a.inizio.localeCompare(b.inizio))
    const daChiudere = tutte.filter((p) => p.stato === "DA_CHIUDERE").length
    const svolte = tutte.filter((p) => p.stato === "SVOLTA").length
    const assenti = tutte.filter((p) => p.stato === "NON_PRESENTATO").length
    const acquisti = tutte.filter((p) => p.esito === "ACQUISTATO").length
    const settimana = tutte.filter((p) => adesso.getTime() - parseISO(p.createdAt).getTime() < 7 * 86_400_000).length
    return { tutte, righe, conteggi, future, daChiudere, svolte, assenti, acquisti, settimana }
  }, [dati, filtri, ordine])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const { tutte, righe, conteggi, future, daChiudere, svolte, assenti, acquisti, settimana } = calcolo
  const prossima = future[0]
  const presenza = svolte + assenti > 0 ? Math.round((svolte * 100) / (svolte + assenti)) : null
  const conversione = svolte > 0 ? Math.round((acquisti * 100) / svolte) : null
  const ordina = (colonna: Colonna) => setOrdine((o) => ({ colonna, verso: o.colonna === colonna && o.verso === "asc" ? "desc" : "asc" }))

  return (
    <Pagina>
      <div className="pr-pagina">
        <LuxHero ariaLabel="Discovery" eyebrow="Dal sito edodoc.it" title="Discovery"
          subtitle={tutte.length === 0 ? "Le discovery call prenotate dal sito arrivano qui, già sincronizzate con Google Calendar"
            : daChiudere > 0 ? `${daChiudere} ${daChiudere === 1 ? "chiamata è passata e aspetta" : "chiamate sono passate e aspettano"} il tuo esito`
              : `${settimana} ${settimana === 1 ? "nuova discovery call" : "nuove discovery call"} negli ultimi 7 giorni`}
          actions={(
            <a className="vl-cta" href="https://www.edodoc.it/prenota" target="_blank" rel="noopener noreferrer">
              <span className="vl-cta-icon" aria-hidden><Globe className="size-4" /></span>
              <span className="vl-cta-label">Pagina del sito</span>
            </a>
          )}>
          <div className="vl-kpis">
            <LuxKpi icon={<CalendarClock className="size-4" />} label="In programma" value={future.length}
              foot={prossima ? `Prossima: ${quandoRelativo(prossima.inizio) ?? format(parseISO(prossima.inizio), "EEE d MMM", { locale: it })} alle ${format(parseISO(prossima.inizio), "HH:mm")} · ${prossima.nome}` : "Nessuna chiamata in arrivo"} />
            <LuxKpi icon={<CircleAlert className="size-4" />} label="Da chiudere" value={daChiudere} highlight={daChiudere > 0}
              foot={daChiudere > 0 ? "Chiamate passate senza esito" : "Tutto chiuso"} />
            <LuxKpi icon={<UserCheck className="size-4" />} label="Presenze" value={presenza ?? "—"} unit={presenza != null ? "%" : undefined}
              progress={presenza ?? 0} title="Svolte su svolte più non presentati" />
            <LuxKpi icon={<Percent className="size-4" />} label="Diventate percorsi" value={conversione ?? "—"} unit={conversione != null ? "%" : undefined}
              foot={`${acquisti} ${acquisti === 1 ? "acquisto" : "acquisti"} su ${svolte} ${svolte === 1 ? "chiamata svolta" : "chiamate svolte"}`} />
          </div>
        </LuxHero>

        <FiltriPrenotazioni filtri={filtri} onFiltri={setFiltri} conteggi={conteggi} risultati={righe.length} />

        <Riquadro titolo="Chiamate conoscitive" conteggio={righe.length} descrizione="Clicca una riga per la scheda completa: ogni modifica va su Google Calendar.">
          {tutte.length === 0 ? (
            <Vuoto icona={<CalendarCheck2 aria-hidden />} titolo="Ancora nessuna discovery call" descrizione="Appena qualcuno prenota da edodoc.it/prenota, la chiamata compare qui." />
          ) : righe.length === 0 ? (
            <Vuoto titolo="Nessuna discovery call con questi filtri" descrizione="Allarga il periodo o togli qualche filtro." />
          ) : (
            <Tabella>
              <thead>
                <tr>
                  <Intestazione colonna="prenotata" ordine={ordine} onOrdina={ordina}>Richiesta</Intestazione>
                  <Intestazione colonna="chiamata" ordine={ordine} onOrdina={ordina}>Chiamata</Intestazione>
                  <Intestazione colonna="persona" ordine={ordine} onOrdina={ordina}>Persona</Intestazione>
                  <Intestazione colonna="obiettivo" ordine={ordine} onOrdina={ordina} className="pr-col-obiettivo">Obiettivo</Intestazione>
                  <Intestazione colonna="stato" ordine={ordine} onOrdina={ordina}>Stato</Intestazione>
                  <Intestazione colonna="invito" ordine={ordine} onOrdina={ordina}>Invito</Intestazione>
                  <Intestazione colonna="esito" ordine={ordine} onOrdina={ordina}>Esito</Intestazione>
                  <Intestazione colonna="google" ordine={ordine} onOrdina={ordina} className="pr-col-google">Google</Intestazione>
                </tr>
              </thead>
              <tbody>
                {righe.map((p) => {
                  const relativo = quandoRelativo(p.inizio)
                  return (
                    <tr key={p.id} className="pr-tr" data-stato={p.stato} tabIndex={0} onClick={() => setAperta(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          setAperta(p.id)
                        }
                      }}>
                      <td>
                        <span className="pr-quando pr-richiesta" title={format(parseISO(p.createdAt), "EEEE d MMMM yyyy, HH:mm", { locale: it })}>
                          <span className="pr-quando-giorno">{format(parseISO(p.createdAt), "EEE d MMM", { locale: it })}</span>
                          <span className="pr-quando-ora">
                            {format(parseISO(p.createdAt), "HH:mm")}
                            <span className="pr-richiesta-fa">{formatDistanceToNowStrict(parseISO(p.createdAt), { locale: it, addSuffix: true })}</span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="pr-quando">
                          <span className="pr-quando-giorno">{format(parseISO(p.inizio), "EEE d MMM", { locale: it })}</span>
                          <span className="pr-quando-ora">{format(parseISO(p.inizio), "HH:mm")}{relativo ? <em data-oggi={relativo === "Oggi" ? "" : undefined}>{relativo}</em> : null}</span>
                        </span>
                      </td>
                      <td>
                        <span className="pr-persona">
                          <LuxAvatar first={p.nome} second={p.cognome} />
                          <span className="min-w-0">
                            <strong>{p.nome} {p.cognome}{p.nuovoContatto ? <i className="pr-nuovo">Nuovo</i> : null}</strong>
                            <small>{p.email ?? p.cellulare ?? "—"}</small>
                          </span>
                        </span>
                      </td>
                      <td className="pr-col-obiettivo">
                        <span className="pr-obiettivo-cella">
                          {p.obiettivo ? <span className="pr-obiettivo-testo" title={p.obiettivo}>{p.obiettivo}</span> : <span className="text-muted-foreground">—</span>}
                          {p.messaggio ? <MessageSquareText aria-label="Ha lasciato un messaggio" className="pr-ha-messaggio" /> : null}
                        </span>
                      </td>
                      <td><Chip tono={STATO_PRENOTAZIONE[p.stato].tono}>{STATO_PRENOTAZIONE[p.stato].testo}</Chip></td>
                      <td><span className="pr-invito" data-tono={RISPOSTA_INVITO[p.rispostaInvito].tono}><i aria-hidden />{RISPOSTA_INVITO[p.rispostaInvito].testo}</span></td>
                      <td>{p.esito ? <Chip tono={ESITO[p.esito].tono}>{ESITO[p.esito].testo}</Chip> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="pr-col-google">
                        {p.meetUrl && (p.stato === "IN_PROGRAMMA" || p.stato === "DA_CHIUDERE") ? (
                          <a className="pr-meet" href={p.meetUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="Apri Google Meet">
                            Meet<ExternalLink aria-hidden />
                          </a>
                        ) : null}
                        <IconaGoogle stato={p.googleSyncStato} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Tabella>
          )}
        </Riquadro>
      </div>

      <PrenotazioneSheet prenotazioneId={aperta} onClose={chiudi} />
    </Pagina>
  )
}
