import { addMinutes, format, parseISO } from "date-fns"
import { it } from "date-fns/locale"
import {
  CalendarClock, CalendarX2, Check, CircleAlert, CircleCheck, Clock, History, Mail, MessageSquareQuote, Pencil, RotateCcw, Save, Target,
  UserRound, UserX, Video, X,
} from "lucide-react"
import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Chip } from "@/components/chip"
import { Campo } from "@/components/forms/campo"
import { Finestra } from "@/components/forms/finestra"
import { Caricamento } from "@/components/stati"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { SheetHero, SheetHeroChip, SheetKV, SheetKVGrid, SheetNotice, SheetSection, SK_HERO_ACTION } from "@/components/ui/sheet-kit"
import { Textarea } from "@/components/ui/textarea"
import { useAzioni } from "@/contexts/azioni-context"
import { STATO_PAZIENTE } from "@/lib/etichette"
import { linkWhatsapp } from "@/lib/format"
import { ESITO, quandoRelativo, RISPOSTA_INVITO, STATO_PRENOTAZIONE } from "@/lib/prenotazioni"
import { toast, toastErrore } from "@/lib/toast"
import { prenotazioniService } from "@/services/gestionale"
import type { DettaglioPrenotazione, EsitoPrenotazione, StatoPrenotazione } from "@/types"

const giornoLungo = (iso: string) => format(parseISO(iso), "EEEE d MMMM yyyy", { locale: it })
const oraBreve = (iso: string) => format(parseISO(iso), "HH:mm")
const quando = (iso: string) => format(parseISO(iso), "d MMM yyyy, HH:mm", { locale: it })

const ORARI = Array.from({ length: 30 }, (_, i) => {
  const minuti = 7 * 60 + i * 30
  return `${String(Math.floor(minuti / 60)).padStart(2, "0")}:${String(minuti % 60).padStart(2, "0")}`
})

const ICONA_EVENTO: Record<string, ReactNode> = {
  CREATA: <CalendarClock aria-hidden />, SPOSTATA: <Clock aria-hidden />, STATO: <CircleCheck aria-hidden />, DISDETTA: <CalendarX2 aria-hidden />,
  INVITO: <Mail aria-hidden />, ESITO: <Target aria-hidden />, CONTATTO: <UserRound aria-hidden />, NOTA: <MessageSquareQuote aria-hidden />,
}

type Motivo = { stato: "DISDETTA" | "ANNULLATA" } | null

/** Disdetta e annullamento chiedono un motivo facoltativo: finisce in cronologia. */
function FinestraMotivo({ motivo, onClose, onConferma }: { motivo: Motivo; onClose: () => void; onConferma: (testo: string) => Promise<void> }) {
  const [testo, setTesto] = useState("")
  const [inCorso, setInCorso] = useState(false)
  const disdetta = motivo?.stato === "DISDETTA"
  return (
    <Finestra open={motivo != null} onOpenChange={(a) => !a && onClose()} inCorso={inCorso}
      titolo={disdetta ? "Segnare come disdetta?" : "Annullare la chiamata?"}
      descrizione={disdetta
        ? "La persona ha rinunciato. L'evento sparisce da Google Calendar e l'orario torna prenotabile dal sito."
        : "La annulli tu: Google avvisa la persona e l'orario torna prenotabile dal sito."}
      etichettaSalva={disdetta ? "Segna disdetta" : "Annulla chiamata"}
      salva={async () => {
        setInCorso(true)
        try {
          await onConferma(testo)
          setTesto("")
        } finally {
          setInCorso(false)
        }
      }}>
      <Campo etichetta="Motivo (facoltativo)" id="motivo-prenotazione">
        <Textarea id="motivo-prenotazione" value={testo} onChange={(e) => setTesto(e.target.value)} maxLength={255}
          placeholder={disdetta ? "Es. Ha scritto che non riesce più a liberarsi" : "Es. Imprevisto in studio, da ricontattare"} />
      </Campo>
    </Finestra>
  )
}

export function PrenotazioneSheet({ prenotazioneId, onClose }: { prenotazioneId: number | null; onClose: () => void }) {
  const azioni = useAzioni()
  const [dettaglio, setDettaglio] = useState<DettaglioPrenotazione | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [sposta, setSposta] = useState<{ giorno: string; ora: string } | null>(null)
  const [modifica, setModifica] = useState<{ nome: string; cognome: string; email: string; cellulare: string } | null>(null)
  const [note, setNote] = useState("")
  const [motivo, setMotivo] = useState<Motivo>(null)

  const applica = useCallback((d: DettaglioPrenotazione) => {
    setDettaglio(d)
    setNote(d.riga.noteDottore ?? "")
  }, [])

  useEffect(() => {
    setSposta(null)
    setModifica(null)
    if (prenotazioneId == null) {
      setDettaglio(null)
      return
    }
    prenotazioniService.dettaglio(prenotazioneId).then(applica).catch((e) => {
      toastErrore(e)
      onClose()
    })
  }, [prenotazioneId, applica, onClose, azioni.versione])

  const esegui = async (lavoro: () => Promise<DettaglioPrenotazione>, messaggio?: string) => {
    setInCorso(true)
    try {
      applica(await lavoro())
      if (messaggio) toast.success(messaggio)
      azioni.aggiorna()
      return true
    } catch (e) {
      toastErrore(e)
      return false
    } finally {
      setInCorso(false)
    }
  }

  const p = dettaglio?.riga
  const stato = (s: StatoPrenotazione, messaggio: string) => p && void esegui(() => prenotazioniService.stato(p.id, s), messaggio)
  const whatsapp = linkWhatsapp(p?.cellulare)
  // Le prenotazioni arrivate con il questionario del sito hanno almeno una di queste risposte
  const questionario = !!p && [p.professione, p.conosciutoDa, p.percorsiPrecedenti, p.investimento, p.priorita, p.percheOra].some(Boolean)
  const relativo = p ? quandoRelativo(p.inizio) : null
  const annullata = p?.stato === "DISDETTA" || p?.stato === "ANNULLATA"
  const futura = p ? parseISO(p.inizio) > new Date() : false
  const iniziata = !futura

  return (
    <Sheet open={prenotazioneId != null} onOpenChange={(a) => !a && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto gap-4 p-4 sm:p-6" data-vl="scope">
        {!p || !dettaglio ? <Caricamento /> : (
          <>
            <SheetHero
              initials={`${p.nome.charAt(0)}${p.cognome.charAt(0)}`}
              eyebrow="Chiamata conoscitiva · dal sito"
              title={`${p.nome} ${p.cognome}`}
              description={`${giornoLungo(p.inizio)}, ${oraBreve(p.inizio)}–${oraBreve(p.fine)}${relativo ? ` · ${relativo.toLowerCase()}` : ""}`}
              chips={
                <>
                  <SheetHeroChip>{STATO_PRENOTAZIONE[p.stato].testo}</SheetHeroChip>
                  <SheetHeroChip>Invito {RISPOSTA_INVITO[p.rispostaInvito].testo.toLowerCase()}</SheetHeroChip>
                  {p.esito ? <SheetHeroChip>{ESITO[p.esito].testo}</SheetHeroChip> : null}
                </>
              }
              actions={!annullata ? (
                <Button size="sm" className={SK_HERO_ACTION} onClick={() => setSposta({ giorno: p.inizio.slice(0, 10), ora: oraBreve(p.inizio) })}>
                  <CalendarClock aria-hidden />Sposta
                </Button>
              ) : null}
            />

            <div className="flex flex-wrap gap-2">
              {p.meetUrl && !annullata ? (
                <Button size="sm" asChild><a href={p.meetUrl} target="_blank" rel="noopener noreferrer"><Video aria-hidden />Entra in Meet</a></Button>
              ) : null}
              {p.stato === "IN_PROGRAMMA" || p.stato === "DA_CHIUDERE" ? (
                <>
                  {iniziata ? (
                    <>
                      <Button size="sm" variant="outline" disabled={inCorso} onClick={() => stato("SVOLTA", "Chiamata svolta")}><Check aria-hidden />Svolta</Button>
                      <Button size="sm" variant="outline" disabled={inCorso} onClick={() => stato("NON_PRESENTATO", "Segnata come non presentato")}><UserX aria-hidden />Non presentato</Button>
                    </>
                  ) : null}
                  <Button size="sm" variant="outline" disabled={inCorso} onClick={() => setMotivo({ stato: "DISDETTA" })}><CalendarX2 aria-hidden />Disdetta</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={inCorso} onClick={() => setMotivo({ stato: "ANNULLATA" })}><X aria-hidden />Annulla</Button>
                </>
              ) : null}
              {p.stato === "SVOLTA" || p.stato === "NON_PRESENTATO" ? (
                <Button size="sm" variant="outline" disabled={inCorso} onClick={() => stato("IN_PROGRAMMA", "Riportata in programma")}><RotateCcw aria-hidden />Riporta in programma</Button>
              ) : null}
              {annullata ? (
                futura ? (
                  <Button size="sm" variant="outline" disabled={inCorso} onClick={() => stato("IN_PROGRAMMA", "Chiamata riaperta: l'invito riparte")}><RotateCcw aria-hidden />Riapri</Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={inCorso} onClick={() => setSposta({ giorno: format(new Date(), "yyyy-MM-dd"), ora: "10:00" })}><CalendarClock aria-hidden />Fissa un nuovo orario</Button>
                )
              ) : null}
              <Button size="sm" variant="outline" onClick={() => {
                onClose()
                azioni.apriPaziente(p.pazienteId)
              }}><UserRound aria-hidden />Scheda paziente</Button>
            </div>

            {sposta ? (
              <div className="pr-sposta">
                <p className="pr-sposta-titolo"><CalendarClock aria-hidden />{annullata ? "Nuovo orario: la chiamata si riapre" : "Sposta la chiamata"}</p>
                <div className="pr-sposta-campi">
                  <Input type="date" aria-label="Giorno" value={sposta.giorno} onChange={(e) => setSposta({ ...sposta, giorno: e.target.value })} />
                  <select className="pr-sposta-ora" aria-label="Ora" value={sposta.ora} onChange={(e) => setSposta({ ...sposta, ora: e.target.value })}>
                    {(ORARI.includes(sposta.ora) ? ORARI : [sposta.ora, ...ORARI]).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <span className="pr-sposta-fine">fino alle {format(addMinutes(parseISO(`${sposta.giorno}T${sposta.ora}`), 30), "HH:mm")}</span>
                </div>
                <p className="pr-sposta-nota">Google Calendar aggiorna l'evento e manda alla persona il nuovo orario con lo stesso link Meet.</p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={inCorso || !sposta.giorno} onClick={async () => {
                    const ok = await esegui(async () => {
                      const d = await prenotazioniService.sposta(p.id, `${sposta.giorno}T${sposta.ora}`)
                      return annullata ? prenotazioniService.stato(d.riga.id, "IN_PROGRAMMA") : d
                    }, annullata ? "Chiamata riaperta al nuovo orario" : "Chiamata spostata")
                    if (ok) setSposta(null)
                  }}><Save aria-hidden />{annullata ? "Riapri a quest'ora" : "Sposta"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSposta(null)}>Lascia com'è</Button>
                </div>
              </div>
            ) : null}

            {p.googleSyncStato === "ERRORE" ? (
              <SheetNotice tone="danger" icon={<CircleAlert aria-hidden />} title="Google Calendar non ha accettato l'ultima modifica">
                {p.googleSyncErrore ?? "Riprovo da solo ogni 5 minuti."}
              </SheetNotice>
            ) : p.googleSyncStato === "DA_SINCRONIZZARE" && !annullata && futura ? (
              <SheetNotice tone="warn" icon={<History aria-hidden />} title="In attesa di Google Calendar">
                La modifica parte appena il calendario è collegato e la sincronizzazione accesa: l'invito arriva alla persona in quel momento.
              </SheetNotice>
            ) : null}
            {p.stato === "DA_CHIUDERE" ? (
              <SheetNotice tone="warn" icon={<CircleAlert aria-hidden />} title="La chiamata è passata">
                Segna com'è andata: svolta, non presentato o disdetta. Poi scegli l'esito qui sotto.
              </SheetNotice>
            ) : null}
            {p.stato === "DISDETTA" ? (
              <SheetNotice tone="info" icon={<CalendarX2 aria-hidden />} title={p.disdettaDa === "INVITO" ? "Ha rifiutato l'invito su Google" : "Disdetta dalla persona"}>
                {p.disdettaMotivo ? `«${p.disdettaMotivo.replace(/[.\s]+$/, "")}». ` : ""}
                {p.disdettaIl ? `Il ${quando(p.disdettaIl)}. ` : ""}L'orario è tornato prenotabile dal sito.
              </SheetNotice>
            ) : null}

            <SheetSection title="Chiamata" icon={<Video aria-hidden />}>
              <SheetKVGrid cols={2}>
                <SheetKV label="Quando">{giornoLungo(p.inizio)}</SheetKV>
                <SheetKV label="Orario">{oraBreve(p.inizio)}–{oraBreve(p.fine)} · 30 min</SheetKV>
                <SheetKV label="Prenotata il">{quando(p.createdAt)}</SheetKV>
                <SheetKV label="Invito">
                  <Chip tono={RISPOSTA_INVITO[p.rispostaInvito].tono}>{RISPOSTA_INVITO[p.rispostaInvito].testo}</Chip>
                </SheetKV>
                <SheetKV label="Google Calendar">
                  {p.googleSyncStato === "SINCRONIZZATA" ? "Sincronizzata" : p.googleSyncStato === "ERRORE" ? "Errore" : "In attesa"}
                </SheetKV>
                <SheetKV label="Google Meet">
                  {p.meetUrl ? <a className="underline break-all" href={p.meetUrl} target="_blank" rel="noopener noreferrer">{p.meetUrl.replace("https://", "")}</a> : "Arriva con la sincronizzazione"}
                </SheetKV>
              </SheetKVGrid>
            </SheetSection>

            <SheetSection title="Persona" icon={<UserRound aria-hidden />} actions={!modifica ? (
              <Button size="sm" variant="ghost" onClick={() => setModifica({ nome: p.nome, cognome: p.cognome, email: p.email ?? "", cellulare: p.cellulare ?? "" })}>
                <Pencil aria-hidden />Modifica
              </Button>
            ) : null}>
              {modifica ? (
                <form className="grid gap-3" onSubmit={async (e) => {
                  e.preventDefault()
                  const ok = await esegui(() => prenotazioniService.contatto(p.id, { ...modifica, cellulare: modifica.cellulare.trim() || null }), "Contatto aggiornato")
                  if (ok) setModifica(null)
                }}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Campo etichetta="Nome" id="pr-nome"><Input id="pr-nome" value={modifica.nome} onChange={(e) => setModifica({ ...modifica, nome: e.target.value })} /></Campo>
                    <Campo etichetta="Cognome" id="pr-cognome"><Input id="pr-cognome" value={modifica.cognome} onChange={(e) => setModifica({ ...modifica, cognome: e.target.value })} /></Campo>
                    <Campo etichetta="Email" id="pr-email"><Input id="pr-email" type="email" value={modifica.email} onChange={(e) => setModifica({ ...modifica, email: e.target.value })} /></Campo>
                    <Campo etichetta="Cellulare" id="pr-cell"><Input id="pr-cell" type="tel" value={modifica.cellulare} onChange={(e) => setModifica({ ...modifica, cellulare: e.target.value })} /></Campo>
                  </div>
                  {modifica.email.trim().toLowerCase() !== (p.email ?? "").toLowerCase() && !annullata ? (
                    <p className="text-xs text-muted-foreground">Cambiando l'email l'invito di Google parte verso il nuovo indirizzo.</p>
                  ) : null}
                  <div className="flex gap-2">
                    <Button size="sm" type="submit" disabled={inCorso}><Save aria-hidden />Salva</Button>
                    <Button size="sm" type="button" variant="ghost" onClick={() => setModifica(null)}>Annulla</Button>
                  </div>
                </form>
              ) : (
                <>
                  <SheetKVGrid cols={2}>
                    <SheetKV label="Email">{p.email ? <a className="underline" href={`mailto:${p.email}`}>{p.email}</a> : "—"}</SheetKV>
                    <SheetKV label="Cellulare">{p.cellulare ? <a className="underline" href={`tel:${p.cellulare}`}>{p.cellulare}</a> : "—"}</SheetKV>
                    <SheetKV label="In anagrafica">{STATO_PAZIENTE[p.statoPaziente]?.testo ?? p.statoPaziente}{p.nuovoContatto ? " · nuovo contatto dal sito" : " · c'era già"}</SheetKV>
                    <SheetKV label="Altre visite">{dettaglio.altreChiamate === 0 ? "Nessuna" : dettaglio.altreChiamate}</SheetKV>
                  </SheetKVGrid>
                  {whatsapp ? <Button size="sm" variant="outline" className="mt-3" asChild><a href={whatsapp} target="_blank" rel="noreferrer">Scrivi su WhatsApp</a></Button> : null}
                </>
              )}
            </SheetSection>

            {questionario ? (
              <SheetSection title="Questionario" icon={<MessageSquareQuote aria-hidden />} description="Le risposte date prenotando dal sito">
                <SheetKVGrid cols={2}>
                  <SheetKV label="Professione">{p.professione ?? "—"}</SheetKV>
                  <SheetKV label="Ci ha conosciuto da">{p.conosciutoDa ?? "—"}</SheetKV>
                  <SheetKV label="Investimento previsto">{p.investimento ?? "—"}</SheetKV>
                  <SheetKV label="Priorità">{p.priorita ?? "—"}</SheetKV>
                </SheetKVGrid>
                <div className="pr-risposte">
                  {([
                    ["Obiettivo principale", p.obiettivo],
                    ["Percorsi già provati, cosa non ha funzionato", p.percorsiPrecedenti],
                    ["Perché candidarsi proprio ora", p.percheOra],
                    ["Messaggio", p.messaggio],
                  ] as const).filter(([, testo]) => testo).map(([domanda, testo]) => (
                    <div key={domanda}>
                      <p className="pr-risposte__domanda">{domanda}</p>
                      <blockquote className="pr-messaggio">{testo}</blockquote>
                    </div>
                  ))}
                </div>
              </SheetSection>
            ) : (
              <SheetSection title="Cosa ha scritto" icon={<MessageSquareQuote aria-hidden />} description="Dal modulo di prenotazione del sito">
                {p.obiettivo ? <p className="pr-obiettivo"><Target aria-hidden />{p.obiettivo}</p> : null}
                {p.messaggio ? <blockquote className="pr-messaggio">{p.messaggio}</blockquote> : <p className="text-sm text-muted-foreground">{p.obiettivo ? "Nessun messaggio." : "Non ha scritto obiettivo né messaggio."}</p>}
              </SheetSection>
            )}

            <SheetSection title="Esito della chiamata" icon={<Target aria-hidden />} description="Com'è andata, per sapere quante chiamate diventano percorsi">
              <div className="pr-esiti" role="group" aria-label="Esito">
                {(Object.keys(ESITO) as EsitoPrenotazione[]).map((k) => (
                  <button key={k} type="button" className="pr-esito" data-tono={ESITO[k].tono} aria-pressed={p.esito === k} disabled={inCorso}
                    onClick={() => void esegui(() => prenotazioniService.esito(p.id, p.esito === k && !p.esitoAutomatico ? null : k, note.trim() || null), "Esito salvato")}>
                    {p.esito === k ? <Check aria-hidden /> : null}{ESITO[k].testo}
                  </button>
                ))}
              </div>
              {p.esitoAutomatico ? <p className="text-xs text-muted-foreground mt-2">Ha comprato un percorso dopo la prenotazione: l'esito è stato messo da solo.</p> : null}
              <Textarea className="mt-3" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note dopo la chiamata: cosa è emerso, quando ricontattare…" />
              {note.trim() !== (p.noteDottore ?? "") ? (
                <Button size="sm" className="mt-2" disabled={inCorso} onClick={() => void esegui(() => prenotazioniService.esito(p.id, p.esitoAutomatico ? null : p.esito, note.trim() || null), "Note salvate")}>
                  <Save aria-hidden />Salva note
                </Button>
              ) : null}
            </SheetSection>

            <SheetSection title="Cronologia" icon={<History aria-hidden />}>
              <ol className="pr-cronologia">
                {dettaglio.cronologia.map((e, i) => (
                  <li key={i} data-tipo={e.tipo}>
                    <span className="pr-cronologia-icona">{ICONA_EVENTO[e.tipo] ?? <History aria-hidden />}</span>
                    <div>
                      <p>{e.testo}</p>
                      <time dateTime={e.quando}>{quando(e.quando)}</time>
                    </div>
                  </li>
                ))}
              </ol>
            </SheetSection>

            <FinestraMotivo motivo={motivo} onClose={() => setMotivo(null)} onConferma={async (testo) => {
              const s = motivo?.stato
              if (!s) return
              const ok = await esegui(() => prenotazioniService.stato(p.id, s, testo.trim() || null), s === "DISDETTA" ? "Segnata come disdetta" : "Chiamata annullata")
              if (ok) setMotivo(null)
            }} />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
