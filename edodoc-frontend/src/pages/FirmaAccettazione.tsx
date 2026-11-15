import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import { CheckCircle2, ChevronDown, Download, Eraser, Loader2, Lock, Mail, PenLine, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { dataOra, data } from "@/lib/format"
import { cn } from "@/lib/utils"
import { firmaPubblica, type Persona, type VistaFirma } from "@/services/accettazione-service"

/*
  Pagina pubblica di firma dell'accettazione (/firma/:token), senza login né layout del gestionale.
  Quattro passi: dati, lettura con dichiarazioni e consensi, codice monouso per email, firma tracciata.
  Le spunte restano nel sessionStorage del browser: ricaricando la pagina non si perdono.
*/

type Scelte = { dichiarazioni: string[]; consensi: Record<string, boolean>; rappresentante: boolean; letto: boolean }
const VUOTE: Scelte = { dichiarazioni: [], consensi: {}, rappresentante: false, letto: false }

function messaggio(e: unknown, riserva: string) {
  return e instanceof Error && e.message ? e.message : riserva
}

function leggiScelte(token: string): Scelte {
  try {
    const s = sessionStorage.getItem(`firma-${token}`)
    return s ? { ...VUOTE, ...JSON.parse(s) } : VUOTE
  } catch {
    return VUOTE
  }
}

function salvaScelte(token: string, s: Scelte) {
  try {
    sessionStorage.setItem(`firma-${token}`, JSON.stringify(s))
  } catch {
    /* navigazione privata: pazienza */
  }
}

export default function FirmaAccettazione() {
  const { token = "" } = useParams()
  const [vista, setVista] = useState<VistaFirma | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [scelte, setScelte] = useState<Scelte>(() => leggiScelte(token))
  const [modificaDati, setModificaDati] = useState(false)

  useEffect(() => {
    document.title = "Modulo di accettazione · Dott. Edoardo Bo"
    firmaPubblica.vista(token).then(setVista).catch((e) => setErrore(messaggio(e, "Questo link non è valido.")))
  }, [token])

  const aggiorna = useCallback(
    (s: Scelte) => {
      setScelte(s)
      salvaScelte(token, s)
    },
    [token],
  )

  const passo = !vista?.modulo ? 0 : !vista.datiConfermati || modificaDati ? 1 : !scelte.letto ? 2 : !vista.codiceVerificato ? 3 : 4

  return (
    <div className="min-h-svh bg-muted/40 text-foreground">
      <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
        <header className="mb-6 flex items-center gap-3">
          <img src="/logo.png" alt="" className="h-8 w-auto" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">{vista?.titolare ?? "Dott. Edoardo Bo"}</div>
            <div className="text-xs text-muted-foreground">Biologo nutrizionista</div>
          </div>
        </header>

        {errore ? (
          <Stato icona={<Lock className="size-6" />} titolo="Link non valido">
            {errore} Se hai ricevuto più email, usa il link dell'ultima.
          </Stato>
        ) : !vista ? (
          <div className="flex justify-center py-20 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" aria-label="Caricamento" />
          </div>
        ) : vista.stato === "FIRMATA" && vista.firmata ? (
          <Firmata token={token} vista={vista} />
        ) : vista.stato === "SCADUTA" || vista.stato === "ANNULLATA" ? (
          <Stato icona={<Lock className="size-6" />} titolo={vista.stato === "SCADUTA" ? "Il link è scaduto" : "Richiesta annullata"}>
            {vista.stato === "SCADUTA" ? "Questo link non vale più." : "Questa richiesta di firma è stata sostituita o annullata."} Scrivi a{" "}
            <a className="underline" href={`mailto:${vista.contatto}`}>{vista.contatto}</a> per riceverne uno nuovo.
          </Stato>
        ) : (
          <>
            <div className="mb-5">
              <h1 className="text-2xl font-light tracking-tight sm:text-3xl">{vista.modulo?.titolo}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{vista.modulo?.sottotitolo}</p>
              <p className="mt-1 text-xs text-muted-foreground">Il link vale fino al {data(vista.scadeIl)}.</p>
            </div>
            <Passi attivo={passo} />
            {passo === 1 ? (
              <PassoDati token={token} vista={vista} onFatto={(v) => { setVista(v); setModificaDati(false) }} />
            ) : passo === 2 ? (
              <PassoLettura token={token} vista={vista} scelte={scelte} onCambia={aggiorna} onModificaDati={() => setModificaDati(true)} />
            ) : passo === 3 ? (
              <PassoCodice token={token} vista={vista} onFatto={setVista} onIndietro={() => aggiorna({ ...scelte, letto: false })} />
            ) : (
              <PassoFirma token={token} vista={vista} scelte={scelte} onIndietro={() => aggiorna({ ...scelte, letto: false })}
                onFirmata={() => firmaPubblica.vista(token).then(setVista)} />
            )}
          </>
        )}
        <p className="mt-10 text-center text-xs text-muted-foreground">
          Firma elettronica del gestionale EdoDoc · documento sigillato con marca temporale
        </p>
      </main>
    </div>
  )
}

function Stato({ icona, titolo, children }: { icona: React.ReactNode; titolo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-background p-6 text-center shadow-sm sm:p-10">
      <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">{icona}</span>
      <h1 className="text-lg font-semibold">{titolo}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </section>
  )
}

function Passi({ attivo }: { attivo: number }) {
  const nomi = ["I tuoi dati", "Leggi e conferma", "Codice", "Firma"]
  return (
    <ol className="mb-5 grid grid-cols-4 gap-2" aria-label="Passaggi">
      {nomi.map((n, i) => (
        <li key={n} aria-current={attivo === i + 1 ? "step" : undefined}>
          <div className={cn("h-1.5 rounded-full", i + 1 <= attivo ? "bg-[var(--brand-orange)]" : "bg-border")} />
          <div className={cn("mt-1.5 text-[11px] sm:text-xs", attivo === i + 1 ? "font-semibold" : "text-muted-foreground")}>{n}</div>
        </li>
      ))}
    </ol>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border bg-background p-4 shadow-sm sm:p-6", className)}>{children}</section>
}

function ErroreRiga({ testo }: { testo: string | null }) {
  return testo ? <p className="mt-3 text-sm text-destructive" role="alert">{testo}</p> : null
}

// ------------------------------------------------------------------ passo 1

const VUOTA: Persona = { nome: "", cognome: "", codiceFiscale: "", dataNascita: "", luogoNascita: "", indirizzo: "", cap: "", citta: "", provincia: "", email: "", cellulare: "" }

function PassoDati({ token, vista, onFatto }: { token: string; vista: VistaFirma; onFatto: (v: VistaFirma) => void }) {
  const [paziente, setPaziente] = useState<Persona>({ ...VUOTA, ...vista.paziente })
  const [firmatario, setFirmatario] = useState<Persona | null>(vista.firmatario ? { ...VUOTA, ...vista.firmatario } : null)
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const invia = async (e: React.FormEvent) => {
    e.preventDefault()
    setInCorso(true)
    setErrore(null)
    try {
      onFatto(await firmaPubblica.dati(token, paziente, firmatario))
    } catch (err) {
      setErrore(messaggio(err, "Non sono riuscito a salvare i dati. Riprova."))
    } finally {
      setInCorso(false)
    }
  }

  return (
    <form onSubmit={invia}>
      <Card>
        <h2 className="text-base font-semibold">{firmatario ? "Dati della persona seguita" : "I tuoi dati"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Controlla e completa: finiscono nel modulo e nelle fatture.</p>
        <CampiPersona p={paziente} onCambia={setPaziente} completi />
        {!firmatario ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Email: <b className="text-foreground">{vista.emailMascherata}</b> (qui arriva il codice per firmare)
          </p>
        ) : null}
      </Card>
      {firmatario ? (
        <Card className="mt-4">
          <h2 className="text-base font-semibold">Chi firma ({vista.ruolo === "TUTORE" ? "tutore" : "genitore"})</h2>
          <CampiPersona p={firmatario} onCambia={setFirmatario} />
          <p className="mt-4 text-sm text-muted-foreground">
            Email: <b className="text-foreground">{vista.emailMascherata}</b> (qui arriva il codice per firmare)
          </p>
        </Card>
      ) : null}
      <ErroreRiga testo={errore} />
      <Button type="submit" className="mt-4 w-full sm:w-auto" disabled={inCorso}>
        {inCorso ? <Loader2 className="animate-spin" aria-hidden /> : null}Confermo i dati
      </Button>
    </form>
  )
}

function CampiPersona({ p, onCambia, completi }: { p: Persona; onCambia: (p: Persona) => void; completi?: boolean }) {
  const campo = (chiave: keyof Persona, etichetta: string, opzioni: React.ComponentProps<"input"> = {}, classe = "") => (
    <div className={cn("grid gap-1.5", classe)}>
      <Label htmlFor={`c-${chiave}-${completi ? "p" : "f"}`}>{etichetta}</Label>
      <Input id={`c-${chiave}-${completi ? "p" : "f"}`} value={p[chiave] ?? ""} onChange={(e) => onCambia({ ...p, [chiave]: e.target.value })} {...opzioni} />
    </div>
  )
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-6">
      {campo("nome", "Nome", { required: true, autoComplete: "given-name" }, "sm:col-span-3")}
      {campo("cognome", "Cognome", { required: true, autoComplete: "family-name" }, "sm:col-span-3")}
      {completi ? campo("dataNascita", "Data di nascita", { type: "date", required: true, autoComplete: "bday" }, "sm:col-span-3") : null}
      {campo("codiceFiscale", "Codice fiscale", { maxLength: 16, autoCapitalize: "characters", className: "uppercase" }, "sm:col-span-3")}
      {completi ? (
        <>
          {campo("indirizzo", "Indirizzo di residenza", { required: true, autoComplete: "street-address" }, "sm:col-span-6")}
          {campo("cap", "CAP", { autoComplete: "postal-code", inputMode: "numeric" }, "sm:col-span-2")}
          {campo("citta", "Città", { required: true, autoComplete: "address-level2" }, "sm:col-span-3")}
          {campo("provincia", "Prov.", { maxLength: 4, autoCapitalize: "characters" }, "sm:col-span-1")}
        </>
      ) : null}
      {campo("cellulare", "Cellulare", { type: "tel", autoComplete: "tel" }, "sm:col-span-3")}
    </div>
  )
}

// ------------------------------------------------------------------ passo 2

function PassoLettura({ token, vista, scelte, onCambia, onModificaDati }: {
  token: string
  vista: VistaFirma
  scelte: Scelte
  onCambia: (s: Scelte) => void
  onModificaDati: () => void
}) {
  const modulo = vista.modulo!
  const spuntata = (id: string) => scelte.dichiarazioni.includes(id)
  const spunta = (id: string, si: boolean) =>
    onCambia({ ...scelte, dichiarazioni: si ? [...new Set([...scelte.dichiarazioni, id])] : scelte.dichiarazioni.filter((d) => d !== id) })
  const mancanti = modulo.sezioni.filter((s) => !spuntata(s.id)).length
    + modulo.consensi.filter((c) => scelte.consensi[c.id] === undefined).length
    + (vista.firmatario && !scelte.rappresentante ? 1 : 0)

  return (
    <div className="grid gap-4">
      {modulo.sezioni.map((s) => (
        <Card key={s.id}>
          <h2 className="text-base font-semibold">{s.titolo}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.testo}</p>
          {s.id === "privacy" ? (
            <div className="mt-3 grid gap-2">
              <Documento token={token} tipo="INFORMATIVA" titolo={vista.informativaTitolo ?? "Informativa privacy"} html={vista.informativaHtml ?? ""} />
              <Documento token={token} tipo="FORNITORI" titolo={vista.fornitoriTitolo ?? "Elenco dei fornitori"} html={vista.fornitoriHtml ?? ""} />
            </div>
          ) : null}
          <Dichiarazione id={`d-${s.id}`} testo={s.dichiarazione} spuntata={spuntata(s.id)} onCambia={(v) => spunta(s.id, v)} />
        </Card>
      ))}

      {vista.firmatario ? (
        <Card>
          <Dichiarazione id="d-rappresentante" testo={modulo.dichiarazioneRappresentante} spuntata={scelte.rappresentante}
            onCambia={(v) => onCambia({ ...scelte, rappresentante: v })} />
        </Card>
      ) : null}

      {modulo.consensi.length ? (
        <Card>
          <h2 className="text-base font-semibold">Consensi facoltativi</h2>
          {modulo.consensi.map((c) => (
            <div key={c.id} className="mt-4 border-t pt-4 first-of-type:border-t-0">
              <div className="text-sm font-semibold">{c.titolo}</div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{c.testo}</p>
              <div className="mt-3 flex gap-2" role="radiogroup" aria-label={c.titolo}>
                {[true, false].map((v) => (
                  <Button key={String(v)} type="button" role="radio" aria-checked={scelte.consensi[c.id] === v}
                    variant={scelte.consensi[c.id] === v ? "default" : "outline"} className="min-w-20"
                    onClick={() => onCambia({ ...scelte, consensi: { ...scelte.consensi, [c.id]: v } })}>
                    {v ? "Sì" : "No"}
                  </Button>
                ))}
              </div>
            </div>
          ))}
          {modulo.notaConsensi ? <p className="mt-4 text-xs text-muted-foreground">{modulo.notaConsensi}</p> : null}
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={mancanti > 0} onClick={() => onCambia({ ...scelte, letto: true })}>Continua</Button>
        <Button variant="ghost" onClick={onModificaDati}>Modifica i dati</Button>
        {mancanti > 0 ? <span className="text-sm text-muted-foreground">Mancano {mancanti} {mancanti === 1 ? "scelta" : "scelte"}</span> : null}
      </div>
    </div>
  )
}

function Dichiarazione({ id, testo, spuntata, onCambia }: { id: string; testo: string; spuntata: boolean; onCambia: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className={cn("mt-4 flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm font-medium transition-colors",
      spuntata ? "border-[var(--brand-orange)] bg-[color-mix(in_srgb,var(--brand-orange)_8%,transparent)]" : "hover:bg-muted/60")}>
      <Checkbox id={id} checked={spuntata} onCheckedChange={(v) => onCambia(v === true)} className="mt-0.5" />
      <span>{testo}</span>
    </label>
  )
}

function Documento({ token, tipo, titolo, html }: { token: string; tipo: "INFORMATIVA" | "FORNITORI"; titolo: string; html: string }) {
  const segnalato = useRef(false)
  return (
    <details className="group rounded-xl border" onToggle={(e) => {
      if ((e.currentTarget as HTMLDetailsElement).open && !segnalato.current) {
        segnalato.current = true
        void firmaPubblica.documentoAperto(token, tipo)
      }
    }}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-semibold">
        {titolo}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      {/* HTML prodotto dal backend dal nostro Markdown, con l'HTML grezzo disattivato */}
      <div className="testo-legale max-h-[60vh] overflow-y-auto border-t px-4 py-3 text-sm leading-relaxed text-muted-foreground
        [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-foreground [&_h2]:mt-4 [&_h2]:mb-1 [&_h2]:font-semibold [&_h2]:text-foreground
        [&_li]:mb-1 [&_p]:mb-2 [&_strong]:text-foreground [&_table]:my-2 [&_table]:w-full [&_table]:text-xs [&_td]:border-t [&_td]:p-1.5 [&_td]:align-top
        [&_th]:p-1.5 [&_th]:text-left [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{ __html: html }} />
    </details>
  )
}

// ------------------------------------------------------------------ passo 3

function PassoCodice({ token, vista, onFatto, onIndietro }: { token: string; vista: VistaFirma; onFatto: (v: VistaFirma) => void; onIndietro: () => void }) {
  const [inviato, setInviato] = useState<string | null>(null)
  const [codice, setCodice] = useState("")
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const invia = async () => {
    setInCorso(true)
    setErrore(null)
    try {
      const r = await firmaPubblica.inviaCodice(token)
      setInviato(r.emailMascherata)
    } catch (e) {
      setErrore(messaggio(e, "Non sono riuscito a mandare il codice. Riprova."))
    } finally {
      setInCorso(false)
    }
  }

  const verifica = async (e: React.FormEvent) => {
    e.preventDefault()
    setInCorso(true)
    setErrore(null)
    try {
      onFatto(await firmaPubblica.verificaCodice(token, codice))
    } catch (err) {
      setErrore(messaggio(err, "Codice non corretto."))
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted"><Mail className="size-5" aria-hidden /></span>
        <div>
          <h2 className="text-base font-semibold">Conferma che sei tu</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ti mando un codice di 6 cifre a <b className="text-foreground">{vista.emailMascherata}</b>. Vale 10 minuti.
          </p>
        </div>
      </div>
      {!inviato ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={invia} disabled={inCorso}>{inCorso ? <Loader2 className="animate-spin" aria-hidden /> : null}Inviami il codice</Button>
          <Button variant="ghost" onClick={onIndietro}>Indietro</Button>
        </div>
      ) : (
        <form onSubmit={verifica} className="mt-4 grid gap-3">
          <Label htmlFor="codice">Codice ricevuto a {inviato}</Label>
          <Input id="codice" value={codice} onChange={(e) => setCodice(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className="max-w-40 text-center text-lg tracking-[0.4em]" autoFocus />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={inCorso || codice.length !== 6}>{inCorso ? <Loader2 className="animate-spin" aria-hidden /> : null}Verifica</Button>
            <Button type="button" variant="ghost" onClick={invia} disabled={inCorso}>Mandamene un altro</Button>
          </div>
          <p className="text-xs text-muted-foreground">Non lo trovi? Guarda nello spam o nelle promozioni.</p>
        </form>
      )}
      <ErroreRiga testo={errore} />
    </Card>
  )
}

// ------------------------------------------------------------------ passo 4

function PassoFirma({ token, vista, scelte, onIndietro, onFirmata }: {
  token: string
  vista: VistaFirma
  scelte: Scelte
  onIndietro: () => void
  onFirmata: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const tracciando = useRef(false)
  const lunghezza = useRef(0)
  const [vuota, setVuota] = useState(true)
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const chi = vista.firmatario ?? vista.paziente

  const prepara = useCallback(() => {
    const c = canvas.current
    if (!c) return
    const r = c.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    c.width = Math.round(r.width * dpr)
    c.height = Math.round(r.height * dpr)
    const ctx = c.getContext("2d")!
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.4
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "#1F3A63"
    lunghezza.current = 0
    setVuota(true)
  }, [])

  useEffect(() => {
    prepara()
    window.addEventListener("resize", prepara)
    return () => window.removeEventListener("resize", prepara)
  }, [prepara])

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const ultimo = useRef({ x: 0, y: 0 })

  const giu = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    tracciando.current = true
    ultimo.current = punto(e)
  }
  const muovi = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!tracciando.current) return
    const p = punto(e)
    const ctx = e.currentTarget.getContext("2d")!
    ctx.beginPath()
    ctx.moveTo(ultimo.current.x, ultimo.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lunghezza.current += Math.hypot(p.x - ultimo.current.x, p.y - ultimo.current.y)
    ultimo.current = p
    if (lunghezza.current > 40) setVuota(false)
  }
  const su = () => {
    tracciando.current = false
  }

  const firma = async () => {
    if (!canvas.current) return
    setInCorso(true)
    setErrore(null)
    try {
      await firmaPubblica.firma(token, {
        dichiarazioni: scelte.dichiarazioni,
        consensi: scelte.consensi,
        rappresentante: scelte.rappresentante,
        firmaPng: canvas.current.toDataURL("image/png"),
      })
      try {
        sessionStorage.removeItem(`firma-${token}`)
      } catch {
        /* niente */
      }
      onFirmata()
    } catch (e) {
      setErrore(messaggio(e, "La firma non è andata a buon fine. Riprova."))
      setInCorso(false)
    }
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted"><PenLine className="size-5" aria-hidden /></span>
        <div>
          <h2 className="text-base font-semibold">Traccia la tua firma</h2>
          <p className="mt-1 text-sm text-muted-foreground">Con il dito o con il mouse, nel riquadro. Firma {chi ? `${chi.nome} ${chi.cognome}` : ""}.</p>
        </div>
      </div>
      <div className="relative mt-4">
        <canvas ref={canvas} className="h-44 w-full touch-none rounded-xl border-2 border-dashed bg-white sm:h-52"
          onPointerDown={giu} onPointerMove={muovi} onPointerUp={su} onPointerCancel={su} aria-label="Riquadro per la firma" />
        <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-slate-300" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={firma} disabled={vuota || inCorso}>
          {inCorso ? <Loader2 className="animate-spin" aria-hidden /> : <ShieldCheck aria-hidden />}Firma il modulo
        </Button>
        <Button variant="outline" onClick={prepara} disabled={inCorso}><Eraser aria-hidden />Cancella</Button>
        <Button variant="ghost" onClick={onIndietro} disabled={inCorso}>Rileggi</Button>
      </div>
      {inCorso ? <p className="mt-3 text-sm text-muted-foreground">Sto sigillando il documento, ci vuole qualche secondo…</p> : null}
      <ErroreRiga testo={errore} />
    </Card>
  )
}

// ------------------------------------------------------------------ fatto

function Firmata({ token, vista }: { token: string; vista: VistaFirma }) {
  const f = vista.firmata!
  return (
    <section className="rounded-2xl border bg-background p-6 text-center shadow-sm sm:p-10">
      <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        <CheckCircle2 className="size-6" />
      </span>
      <h1 className="text-lg font-semibold">Modulo firmato, grazie!</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Firmato il {dataOra(f.firmataIl)}. {f.copiaInviata ? `Ti ho mandato la copia a ${vista.emailMascherata}.` : "Scarica la tua copia qui sotto."}
      </p>
      <p className="mt-4 text-xs text-muted-foreground">Codice di verifica</p>
      <p className="font-mono text-base font-semibold tracking-wider">{f.codiceVerifica}</p>
      <Button asChild className="mt-6">
        <a href={firmaPubblica.urlCopia(token)} download><Download aria-hidden />Scarica la copia (PDF)</a>
      </Button>
    </section>
  )
}
