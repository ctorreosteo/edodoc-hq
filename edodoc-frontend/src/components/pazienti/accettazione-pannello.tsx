import { useCallback, useEffect, useState } from "react"
import { Copy, FileSignature, FileText, History, Link2, Loader2, Send, XCircle } from "lucide-react"
import { Chip } from "@/components/chip"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SheetSection, type SheetTone } from "@/components/ui/sheet-kit"
import { Switch } from "@/components/ui/switch"
import { data, dataOra } from "@/lib/format"
import { toast, toastErrore } from "@/lib/toast"
import {
  accettazioneService,
  type AccettazioneInviata,
  type EventoRegistro,
  type PanoramicaAccettazione,
  type RigaAccettazione,
} from "@/services/accettazione-service"

/*
  Riquadro "Accettazione" della scheda paziente: stato del modulo firmato online, invio del link personale (per email
  dal gestionale o da copiare), nuovo link, annullamento, PDF firmato con registro delle prove e consensi facoltativi.
*/

const STATO: Record<RigaAccettazione["stato"], { testo: string; tono: SheetTone }> = {
  FIRMATA: { testo: "Firmata", tono: "ok" },
  INVIATA: { testo: "Da aprire", tono: "warn" },
  APERTA: { testo: "Aperta, da firmare", tono: "info" },
  SCADUTA: { testo: "Link scaduto", tono: "danger" },
  ANNULLATA: { testo: "Annullata", tono: "muted" },
}

const EVENTI: Record<string, string> = {
  CREATA: "Richiesta creata", EMAIL_INVIATA: "Link inviato per email", EMAIL_NON_INVIATA: "Email con il link non partita",
  LINK_RIGENERATO: "Nuovo link", APERTA: "Link aperto", DATI_CONFERMATI: "Dati confermati", DOCUMENTO_APERTO: "Documento aperto",
  CODICE_INVIATO: "Codice inviato", CODICE_ERRATO: "Codice errato", CODICE_VERIFICATO: "Codice verificato", FIRMATA: "Firma",
  PDF_SIGILLATO: "PDF sigillato", MARCA_NON_DISPONIBILE: "Marca temporale non disponibile", COPIA_INVIATA: "Copia inviata",
  COPIA_NON_INVIATA: "Copia non inviata", COPIA_SCARICATA: "Copia scaricata", ANNULLATA: "Annullata",
}

export function AccettazionePannello({ pazienteId, email }: { pazienteId: number; email?: string | null }) {
  const [p, setP] = useState<PanoramicaAccettazione | null>(null)
  const [dialogo, setDialogo] = useState<"nuova" | { reinvia: RigaAccettazione } | null>(null)
  const [inviata, setInviata] = useState<AccettazioneInviata | null>(null)
  const [registro, setRegistro] = useState<{ riga: RigaAccettazione; eventi: EventoRegistro[]; integro: boolean } | null>(null)
  const [storico, setStorico] = useState(false)

  const carica = useCallback(() => {
    accettazioneService.panoramica(pazienteId).then(setP).catch(toastErrore)
  }, [pazienteId])

  useEffect(() => {
    setP(null)
    carica()
  }, [carica])

  const ultima = p?.richieste[0]
  const aperta = ultima && (ultima.stato === "INVIATA" || ultima.stato === "APERTA") ? ultima : null

  const annulla = async (r: RigaAccettazione) => {
    if (!window.confirm("Annullare la richiesta? Il link smette di funzionare.")) return
    try {
      await accettazioneService.annulla(r.id)
      toast.success("Richiesta annullata")
      carica()
    } catch (e) {
      toastErrore(e)
    }
  }

  const apriRegistro = async (r: RigaAccettazione) => {
    try {
      const reg = await accettazioneService.registro(r.id)
      setRegistro({ riga: r, ...reg })
    } catch (e) {
      toastErrore(e)
    }
  }

  const cambiaConsenso = async (tipo: string, titolo: string, concesso: boolean) => {
    const nota = window.prompt(`${concesso ? "Registrare il consenso" : "Registrare la revoca"} per «${titolo}»? Scrivi come te l'ha comunicato (es. email del 15/11).`)
    if (nota === null) return
    try {
      const consensi = await accettazioneService.consenso(pazienteId, tipo, concesso, nota)
      setP((x) => (x ? { ...x, consensi } : x))
      toast.success("Scelta registrata")
    } catch (e) {
      toastErrore(e)
    }
  }

  return (
    <SheetSection
      icon={<FileSignature />}
      title="Accettazione"
      description="Consenso informato e privacy, firmati online"
      actions={ultima ? <Chip tono={STATO[ultima.stato].tono}>{STATO[ultima.stato].testo}</Chip> : null}
    >
      {!p ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Caricamento" />
      ) : (
        <div className="grid gap-3 text-sm">
          {p.datiTitolareMancanti.length ? (
            <p className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Prima del primo invio compila in Impostazioni i tuoi dati per l'informativa: {p.datiTitolareMancanti.join(", ")}.
            </p>
          ) : null}

          {!ultima ? (
            <p className="text-muted-foreground">Nessun modulo inviato.</p>
          ) : ultima.stato === "FIRMATA" ? (
            <p>
              Firmata da <b>{ultima.firmatario}</b> il {dataOra(ultima.firmataIl)} · modulo v. {ultima.versioneModulo} · codice{" "}
              <span className="font-mono">{ultima.codiceVerifica}</span>
              {!ultima.marcaTemporale ? <span className="text-muted-foreground"> · senza marca temporale</span> : null}
            </p>
          ) : (
            <p className="text-muted-foreground">
              {aperta
                ? `Inviata il ${dataOra(aperta.creataIl)} a ${aperta.email}${aperta.apertaIl ? `, aperta il ${dataOra(aperta.apertaIl)}` : ", non ancora aperta"}. Il link vale fino al ${data(aperta.scadeIl)}.`
                : ultima.stato === "SCADUTA" ? `Il link mandato a ${ultima.email} è scaduto il ${data(ultima.scadeIl)}.`
                  : `Ultima richiesta annullata${ultima.motivoAnnullamento ? `: ${ultima.motivoAnnullamento}` : ""}.`}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {ultima?.stato === "FIRMATA" ? (
              <>
                <Button size="sm" variant="outline" onClick={() => accettazioneService.apriPdf(ultima.id).catch(toastErrore)}><FileText aria-hidden />PDF firmato</Button>
                <Button size="sm" variant="outline" onClick={() => apriRegistro(ultima)}><History aria-hidden />Prove</Button>
              </>
            ) : aperta || ultima?.stato === "SCADUTA" ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setDialogo({ reinvia: ultima! })}><Link2 aria-hidden />Nuovo link</Button>
                {aperta ? <Button size="sm" variant="ghost" onClick={() => annulla(aperta)}><XCircle aria-hidden />Annulla</Button> : null}
              </>
            ) : null}
            {!aperta ? (
              <Button size="sm" variant={ultima?.stato === "FIRMATA" ? "ghost" : "default"} disabled={p.datiTitolareMancanti.length > 0}
                onClick={() => setDialogo("nuova")}>
                <Send aria-hidden />{ultima?.stato === "FIRMATA" ? "Nuova firma" : "Invia da firmare"}
              </Button>
            ) : null}
          </div>

          {p.consensi.length ? (
            <div className="border-t pt-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Consensi facoltativi</div>
              {p.consensi.map((c) => (
                <div key={c.tipo} className="flex flex-wrap items-center gap-2 py-1">
                  <span className="flex-1">{c.titolo}</span>
                  <Chip tono={c.concesso ? "ok" : "muted"}>{c.concesso ? "Sì" : "No"}</Chip>
                  <span className="text-xs text-muted-foreground">{data(c.il)}{c.fonte === "MANUALE" ? " · a mano" : ""}</span>
                  <Button size="sm" variant="ghost" onClick={() => cambiaConsenso(c.tipo, c.titolo, !c.concesso)}>
                    {c.concesso ? "Revoca" : "Ha acconsentito"}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {p.richieste.length > 1 ? (
            <div className="border-t pt-2">
              <Button size="sm" variant="ghost" className="-ml-2" onClick={() => setStorico((s) => !s)}>
                {storico ? "Nascondi" : "Mostra"} le richieste precedenti ({p.richieste.length - 1})
              </Button>
              {storico ? (
                <ul className="mt-1 grid gap-1">
                  {p.richieste.slice(1).map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Chip tono={STATO[r.stato].tono}>{STATO[r.stato].testo}</Chip>
                      {dataOra(r.creataIl)} · {r.email}
                      {r.stato === "FIRMATA" ? (
                        <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => accettazioneService.apriPdf(r.id).catch(toastErrore)}>PDF</Button>
                      ) : null}
                      <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => apriRegistro(r)}>prove</Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {dialogo && p ? (
        <DialogoInvio
          pazienteId={pazienteId}
          reinvia={dialogo === "nuova" ? null : dialogo.reinvia}
          email={dialogo === "nuova" ? email ?? "" : dialogo.reinvia.email}
          minorenne={p.minorenne}
          emailAttiva={p.emailAttiva}
          onChiudi={() => setDialogo(null)}
          onInviata={(i) => {
            setDialogo(null)
            setInviata(i)
            carica()
          }}
        />
      ) : null}

      <Dialog open={inviata != null} onOpenChange={(o) => !o && setInviata(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{inviata?.avviso ? "Link pronto" : "Accettazione inviata"}</DialogTitle>
            <DialogDescription>
              {inviata?.avviso ?? `Email partita per ${inviata?.riga.email}. Puoi anche copiare il link e mandarlo in chat.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={inviata?.link ?? ""} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <Button variant="outline" onClick={() => inviata && navigator.clipboard.writeText(inviata.link).then(() => toast.success("Link copiato"))}>
              <Copy aria-hidden />Copia
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Il link è personale: dopo questa finestra non si può più rivedere, solo rigenerare.</p>
        </DialogContent>
      </Dialog>

      <Dialog open={registro != null} onOpenChange={(o) => !o && setRegistro(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prove della firma</DialogTitle>
            <DialogDescription>
              Codice {registro?.riga.codiceVerifica} · registro {registro?.integro ? "integro: la catena di impronte torna" : "NON integro: la catena è stata alterata"}
            </DialogDescription>
          </DialogHeader>
          <ol className="max-h-[60vh] overflow-y-auto text-sm">
            {registro?.eventi.map((e) => (
              <li key={e.seq} className="border-b py-2 last:border-b-0">
                <div className="flex flex-wrap gap-x-3">
                  <span className="font-semibold">{EVENTI[e.tipo] ?? e.tipo}</span>
                  <span className="text-muted-foreground">{dataOra(e.il)}</span>
                  {e.ip ? <span className="text-muted-foreground">IP {e.ip}</span> : null}
                </div>
                {e.dettagli ? <div className="text-xs text-muted-foreground break-words">{e.dettagli}</div> : null}
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </SheetSection>
  )
}

function DialogoInvio({ pazienteId, reinvia, email: emailIniziale, minorenne, emailAttiva, onChiudi, onInviata }: {
  pazienteId: number
  reinvia: RigaAccettazione | null
  email: string
  minorenne: boolean
  emailAttiva: boolean
  onChiudi: () => void
  onInviata: (i: AccettazioneInviata) => void
}) {
  const [email, setEmail] = useState(emailIniziale)
  const [inviaEmail, setInviaEmail] = useState(emailAttiva)
  const [genitore, setGenitore] = useState({ nome: "", cognome: "", codiceFiscale: "", ruolo: "GENITORE" as "GENITORE" | "TUTORE" })
  const [inCorso, setInCorso] = useState(false)

  const invia = async (e: React.FormEvent) => {
    e.preventDefault()
    setInCorso(true)
    try {
      onInviata(reinvia
        ? await accettazioneService.reinvia(reinvia.id, { email, inviaEmail })
        : await accettazioneService.crea(pazienteId, { email, inviaEmail, genitore: minorenne ? genitore : null }))
    } catch (err) {
      toastErrore(err)
      setInCorso(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onChiudi()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={invia} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{reinvia ? "Nuovo link di firma" : "Invia l'accettazione da firmare"}</DialogTitle>
            <DialogDescription>
              {reinvia
                ? "Il link precedente smette di funzionare. Testi e dati restano quelli della richiesta."
                : "Consenso informato alla consulenza a distanza, condizioni e informativa privacy. La persona controlla i dati, legge, conferma con un codice via email e firma."}
            </DialogDescription>
          </DialogHeader>
          {minorenne && !reinvia ? (
            <div className="grid gap-3 rounded-lg border p-3">
              <p className="text-sm font-medium">Il paziente è minorenne: firma il genitore o il tutore.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label htmlFor="g-nome">Nome</Label><Input id="g-nome" required value={genitore.nome} onChange={(e) => setGenitore({ ...genitore, nome: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label htmlFor="g-cognome">Cognome</Label><Input id="g-cognome" required value={genitore.cognome} onChange={(e) => setGenitore({ ...genitore, cognome: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label htmlFor="g-cf">Codice fiscale</Label><Input id="g-cf" maxLength={16} className="uppercase" value={genitore.codiceFiscale} onChange={(e) => setGenitore({ ...genitore, codiceFiscale: e.target.value })} /></div>
                <div className="grid gap-1.5">
                  <Label htmlFor="g-ruolo">Firma come</Label>
                  <select id="g-ruolo" className="h-9 rounded-md border bg-background px-2 text-sm" value={genitore.ruolo}
                    onChange={(e) => setGenitore({ ...genitore, ruolo: e.target.value as "GENITORE" | "TUTORE" })}>
                    <option value="GENITORE">Genitore</option>
                    <option value="TUTORE">Tutore</option>
                  </select>
                </div>
              </div>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="acc-email">Email di chi firma</Label>
            <Input id="acc-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="text-xs text-muted-foreground">Qui arrivano il codice per firmare e la copia firmata.</p>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              Invia il link per email
              {!emailAttiva ? <span className="block text-xs text-muted-foreground">L'invio email non è attivo: copierai il link.</span> : null}
            </span>
            <Switch checked={inviaEmail} onCheckedChange={setInviaEmail} disabled={!emailAttiva} />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onChiudi}>Annulla</Button>
            <Button type="submit" disabled={inCorso}>{inCorso ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}{inviaEmail ? "Invia" : "Crea il link"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
