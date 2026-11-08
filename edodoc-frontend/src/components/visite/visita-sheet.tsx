import { addDays, differenceInMinutes, parseISO } from "date-fns"
import { CalendarPlus, Check, CircleAlert, Pencil, Trash2, Undo2, UserRound, Video, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { SheetHero, SheetHeroChip, SheetKV, SheetKVGrid, SheetNotice, SheetSection, SK_HERO_ACTION } from "@/components/ui/sheet-kit"
import { useAzioni } from "@/contexts/azioni-context"
import { dataLunga, linkWhatsapp, ora } from "@/lib/format"
import { MODALITA_VISITA, STATO_VISITA, SYNC_GOOGLE, TIPO_PERCORSO, TIPO_VISITA } from "@/lib/etichette"
import { toast, toastErrore } from "@/lib/toast"
import { formatDateOnlyLocal } from "@/lib/utils"
import { visiteService } from "@/services/gestionale"
import type { Visita } from "@/types"

/** La visita si rilegge dal suo giorno; se è stata spostata, dalle settimane intorno. */
async function rileggi(visita: Visita): Promise<Visita | null> {
  const giorno = parseISO(visita.inizio)
  const stessoGiorno = await visiteService.periodo(formatDateOnlyLocal(giorno), formatDateOnlyLocal(giorno))
  const trovata = stessoGiorno.find((v) => v.id === visita.id)
  if (trovata) return trovata
  const intorno = await visiteService.periodo(formatDateOnlyLocal(addDays(giorno, -120)), formatDateOnlyLocal(addDays(giorno, 120)))
  return intorno.find((v) => v.id === visita.id) ?? null
}

function iniziali(nome: string) {
  const parti = nome.trim().split(/\s+/)
  return `${parti[0]?.charAt(0) ?? ""}${parti.length > 1 ? parti[parti.length - 1].charAt(0) : ""}`.toUpperCase()
}

export function VisitaSheet({ visita, onClose }: { visita: Visita | null; onClose: () => void }) {
  const azioni = useAzioni()
  const [attuale, setAttuale] = useState<Visita | null>(visita)
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => setAttuale(visita), [visita])

  // Dopo un salvataggio altrove (modifica, spostamento, menu) la scheda mostra la versione nuova
  useEffect(() => {
    if (!visita || azioni.versione === 0) return
    let annullato = false
    rileggi(visita).then((v) => {
      if (!annullato && v) setAttuale(v)
    }).catch(() => undefined)
    return () => {
      annullato = true
    }
  }, [azioni.versione, visita])

  const v = attuale
  const cambiaStato = async (nuovo: string, messaggio: string) => {
    if (!v) return
    setInCorso(true)
    try {
      setAttuale(await visiteService.cambiaStato(v.id, nuovo))
      toast.success(messaggio)
      azioni.aggiorna()
    } catch (e) {
      toastErrore(e)
    } finally {
      setInCorso(false)
    }
  }

  const apriPaziente = () => {
    if (!v) return
    onClose()
    azioni.apriPaziente(v.pazienteId)
  }

  const annullata = v?.stato === "ANNULLATA"
  const whatsapp = linkWhatsapp(v?.pazienteCellulare)
  const minuti = v ? differenceInMinutes(parseISO(v.fine), parseISO(v.inizio)) : 0
  const google = v ? SYNC_GOOGLE[v.googleSyncStato] : undefined

  return (
    <Sheet open={visita != null} onOpenChange={(aperto) => !aperto && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto gap-4 p-4 sm:p-6" data-vl="scope">
        {v ? (
          <>
            <SheetHero
              initials={iniziali(v.pazienteNome)}
              eyebrow={TIPO_VISITA[v.tipo] ?? "Visita"}
              title={v.pazienteNome}
              description={`${dataLunga(v.inizio.slice(0, 10))}, ${ora(v.inizio)}–${ora(v.fine)}`}
              chips={
                <>
                  <SheetHeroChip>{STATO_VISITA[v.stato]?.testo}</SheetHeroChip>
                  {v.numeroVisita ? <SheetHeroChip>Visita {v.numeroVisita} su {v.visiteTotali}</SheetHeroChip> : null}
                  <SheetHeroChip>{MODALITA_VISITA[v.modalita]}</SheetHeroChip>
                </>
              }
              actions={!annullata ? <Button size="sm" className={SK_HERO_ACTION} onClick={() => azioni.modificaVisita(v)}><Pencil aria-hidden />Modifica o sposta</Button> : null}
            />

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={inCorso || annullata || v.stato === "EFFETTUATA"} onClick={() => void cambiaStato("EFFETTUATA", "Visita effettuata")}><Check aria-hidden />Effettuata</Button>
              <Button size="sm" variant="outline" disabled={inCorso || annullata || v.stato === "NON_PRESENTATO"} onClick={() => void cambiaStato("NON_PRESENTATO", "Segnata come non presentato")}><X aria-hidden />Non presentato</Button>
              {v.stato !== "PROGRAMMATA" ? (
                <Button size="sm" variant="outline" disabled={inCorso} onClick={() => void cambiaStato("PROGRAMMATA", "Visita riaperta")}><Undo2 aria-hidden />Riporta a programmata</Button>
              ) : null}
              {v.meetUrl && !annullata ? (
                <Button size="sm" variant="outline" asChild><a href={v.meetUrl} target="_blank" rel="noopener noreferrer"><Video aria-hidden />Google Meet</a></Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={apriPaziente}><UserRound aria-hidden />Paziente</Button>
              <Button size="sm" variant="outline" onClick={() => azioni.nuovaVisita({ pazienteId: v.pazienteId })}><CalendarPlus aria-hidden />Fissa la successiva</Button>
            </div>

            {v.googleSyncStato === "ERRORE" ? (
              <SheetNotice tone="danger" icon={<CircleAlert aria-hidden />} title="Google Calendar non ha accettato la visita">
                {v.googleSyncErrore ?? "Nessun dettaglio dall'errore."}
              </SheetNotice>
            ) : null}

            <SheetSection title="Dettagli">
              <SheetKVGrid cols={2}>
                <SheetKV label="Data">{dataLunga(v.inizio.slice(0, 10))}</SheetKV>
                <SheetKV label="Orario">{ora(v.inizio)}–{ora(v.fine)} · {minuti} min</SheetKV>
                <SheetKV label="Tipo">{TIPO_VISITA[v.tipo] ?? v.tipo}</SheetKV>
                <SheetKV label="Modalità">{MODALITA_VISITA[v.modalita] ?? v.modalita}</SheetKV>
                <SheetKV label="Percorso">{v.percorsoTipo ? `${TIPO_PERCORSO[v.percorsoTipo] ?? v.percorsoTipo}${v.numeroVisita ? ` · ${v.numeroVisita} su ${v.visiteTotali}` : ""}` : "Fuori percorso"}</SheetKV>
                <SheetKV label="Stato">{STATO_VISITA[v.stato]?.testo ?? v.stato}</SheetKV>
                <SheetKV label="Google Calendar">{google?.testo ?? v.googleSyncStato}</SheetKV>
                <SheetKV label="Invito al paziente">{v.invitaPaziente ? "Sì" : "No"}{v.conMeet ? " · con Meet" : ""}</SheetKV>
              </SheetKVGrid>
            </SheetSection>

            <SheetSection title="Note">
              <p className="text-sm whitespace-pre-line">{v.note?.trim() || "Nessuna nota."}</p>
            </SheetSection>

            <SheetSection title="Contatti">
              <SheetKVGrid cols={2}>
                <SheetKV label="Email">{v.pazienteEmail ? <a className="underline" href={`mailto:${v.pazienteEmail}`}>{v.pazienteEmail}</a> : "—"}</SheetKV>
                <SheetKV label="Cellulare">{v.pazienteCellulare ? <a className="underline" href={`tel:${v.pazienteCellulare}`}>{v.pazienteCellulare}</a> : "—"}</SheetKV>
              </SheetKVGrid>
              {whatsapp ? <Button size="sm" variant="outline" className="mt-3" asChild><a href={whatsapp} target="_blank" rel="noreferrer">Scrivi su WhatsApp</a></Button> : null}
            </SheetSection>

            {!annullata ? (
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" className="text-destructive" disabled={inCorso} onClick={() => azioni.conferma({
                  titolo: "Annullare la visita?",
                  descrizione: "Sparisce dal calendario e il paziente riceve la notifica. Le visite successive vengono rinumerate.",
                  etichetta: "Annulla visita",
                  azione: () => cambiaStato("ANNULLATA", "Visita annullata"),
                })}><Trash2 aria-hidden />Annulla visita</Button>
              </div>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
