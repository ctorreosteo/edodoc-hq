import { Building2, Calculator, CalendarDays, Check, CircleAlert, Landmark, Loader2, Mail, Plug, ReceiptText, ShieldCheck, Tags, Video, type LucideIcon } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { useSearchParams } from "react-router-dom"
import { Chip } from "@/components/chip"
import { LuxHero } from "@/components/lux"
import { Pagina } from "@/components/pagina"
import { Caricamento, Errore } from "@/components/stati"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useAzioni } from "@/contexts/azioni-context"
import { useDati } from "@/hooks/use-dati"
import { euroTondi } from "@/lib/format"
import { toast, toastErrore } from "@/lib/toast"
import { authService, impostazioniService } from "@/services/gestionale"
import type { Impostazioni as DatiImpostazioni } from "@/types"
import "@/style/impostazioni.css"

type Voce = DatiImpostazioni["voci"][number]
type Integrazione = DatiImpostazioni["integrazioni"][number]
type Tipo = "testo" | "email" | "area" | "euro" | "percento" | "intero" | "interruttore"

type DefCampo = {
  chiave: string
  etichetta: string
  aiuto?: string
  tipo?: Tipo
  /** Serve a FatturaService per emettere: se manca compare l'avviso in cima alla pagina. */
  obbligatorio?: boolean
  segnaposto?: string[]
  rate?: { numero: number; cadenza: string }
}
type Gruppo = { titolo: string; descrizione?: string; campi: DefCampo[] }
type Sezione = { id: string; titolo: string; riassunto: string; descrizione: string; icona: LucideIcon; gruppi: Gruppo[] }

const SEZIONI: Sezione[] = [
  {
    id: "studio", titolo: "Studio", riassunto: "I tuoi dati in fattura", icona: Building2,
    descrizione: "Compaiono nell'intestazione di ogni fattura.",
    gruppi: [
      { titolo: "Professionista", campi: [
        { chiave: "EMITTENTE_NOME", etichetta: "Nome" },
        { chiave: "EMITTENTE_TITOLI", etichetta: "Titoli professionali" },
        { chiave: "EMITTENTE_ALBO", etichetta: "Iscrizione all'ordine" },
      ] },
      { titolo: "Dati fiscali", campi: [
        { chiave: "EMITTENTE_PARTITA_IVA", etichetta: "Partita IVA", obbligatorio: true },
        { chiave: "EMITTENTE_CODICE_FISCALE", etichetta: "Codice fiscale", obbligatorio: true },
        { chiave: "EMITTENTE_INDIRIZZO", etichetta: "Indirizzo", obbligatorio: true },
        { chiave: "EMITTENTE_IBAN", etichetta: "IBAN", aiuto: "Finisce nei solleciti di pagamento" },
      ] },
    ],
  },
  {
    id: "listino", titolo: "Listino", riassunto: "Prezzi e rate", icona: Tags,
    descrizione: "Valgono per i nuovi percorsi: quelli già aperti mantengono le loro rate.",
    gruppi: [
      { titolo: "Percorso 6 mesi", campi: [
        { chiave: "LISTINO_PAGAMENTO_UNICO", etichetta: "Pagamento in anticipo", tipo: "euro" },
        { chiave: "LISTINO_RATA_PERCORSO", etichetta: "Importo di una rata", tipo: "euro", rate: { numero: 3, cadenza: "ogni due mesi" } },
      ] },
      { titolo: "Mantenimento", descrizione: "4 visite nell'anno", campi: [
        { chiave: "LISTINO_MANTENIMENTO", etichetta: "Pagamento in anticipo", tipo: "euro" },
        { chiave: "LISTINO_RATA_MANTENIMENTO", etichetta: "Importo di una rata", tipo: "euro", rate: { numero: 2, cadenza: "semestrali" } },
      ] },
      { titolo: "Lista d'attesa", campi: [
        { chiave: "LISTINO_ACCONTO_ATTESA", etichetta: "Acconto", tipo: "euro" },
      ] },
    ],
  },
  {
    id: "fatture", titolo: "Fatture", riassunto: "Numerazione, bollo e note", icona: ReceiptText,
    descrizione: "Come viene compilata ogni nuova fattura.",
    gruppi: [
      { titolo: "Compilazione", campi: [
        { chiave: "FATTURA_PROSSIMO_NUMERO", etichetta: "Prossimo numero", tipo: "intero", aiuto: "Avanza da solo e non riparte a inizio anno. Cambialo solo per allinearti alla numerazione esistente" },
        { chiave: "FATTURA_DESCRIZIONE", etichetta: "Descrizione della prestazione" },
        { chiave: "FATTURA_LUOGO", etichetta: "Luogo accanto alla data" },
        { chiave: "FATTURA_ALIQUOTA_CONTRIBUTO", etichetta: "Contributo integrativo ENPAB", tipo: "percento" },
      ] },
      { titolo: "Marca da bollo", campi: [
        { chiave: "FATTURA_BOLLO_SOGLIA", etichetta: "Si applica sopra", tipo: "euro" },
        { chiave: "FATTURA_BOLLO_IMPORTO", etichetta: "Importo del bollo", tipo: "euro" },
        { chiave: "FATTURA_BOLLO_DENTRO_IL_PREZZO", etichetta: "Bollo compreso nel prezzo", tipo: "interruttore", aiuto: "Spento, il bollo si aggiunge al totale della fattura" },
      ] },
      { titolo: "Note in calce", campi: [
        { chiave: "FATTURA_NOTA_IVA", etichetta: "Nota IVA", tipo: "area" },
        { chiave: "FATTURA_NOTA_RITENUTA", etichetta: "Nota ritenuta", tipo: "area" },
      ] },
    ],
  },
  {
    id: "email", titolo: "Email", riassunto: "Modelli per i pazienti", icona: Mail,
    descrizione: "Testi proposti nel popup di invio: lì puoi sempre ritoccarli prima di spedire.",
    gruppi: [
      { titolo: "Fattura", descrizione: "Accompagna il PDF della fattura", campi: [
        { chiave: "FATTURA_EMAIL_OGGETTO", etichetta: "Oggetto", aiuto: "{numero} diventa il numero della fattura" },
        { chiave: "FATTURA_EMAIL_TESTO", etichetta: "Testo", tipo: "area", segnaposto: ["{nome}", "{numero}"] },
      ] },
      { titolo: "Sollecito pagamento", descrizione: "Per le rate scadute", campi: [
        { chiave: "EMAIL_SOLLECITO_OGGETTO", etichetta: "Oggetto" },
        { chiave: "EMAIL_SOLLECITO_TESTO", etichetta: "Testo", tipo: "area", segnaposto: ["{nome}", "{dettaglio}", "{totale}", "{iban}"] },
      ] },
      { titolo: "Richiesta dati fatturazione", descrizione: "Quando mancano i dati del paziente", campi: [
        { chiave: "EMAIL_DATI_OGGETTO", etichetta: "Oggetto" },
        { chiave: "EMAIL_DATI_TESTO", etichetta: "Testo", tipo: "area", segnaposto: ["{nome}"] },
      ] },
    ],
  },
  {
    id: "fisco", titolo: "Fisco", riassunto: "Regime forfettario", icona: Calculator,
    descrizione: "Alimentano le stime di imposte e margini nella pagina Finance.",
    gruppi: [
      { titolo: "Aliquote", campi: [
        { chiave: "FISCO_COEFFICIENTE_REDDITIVITA", etichetta: "Coefficiente di redditività", tipo: "percento" },
        { chiave: "FISCO_ALIQUOTA_SOSTITUTIVA", etichetta: "Imposta sostitutiva", tipo: "percento" },
        { chiave: "FISCO_ALIQUOTA_CASSA", etichetta: "Cassa previdenziale", tipo: "percento" },
      ] },
      { titolo: "Fatturato", campi: [
        { chiave: "FISCO_SOGLIA_FORFETTARIO", etichetta: "Soglia del forfettario", tipo: "euro" },
        { chiave: "FISCO_OBIETTIVO_ANNUO", etichetta: "Obiettivo personale", tipo: "euro" },
      ] },
    ],
  },
  {
    id: "agenda", titolo: "Agenda e check", riassunto: "Visite e segnali", icona: CalendarDays,
    descrizione: "Regole per le visite e per i segnali del check settimanale.",
    gruppi: [
      { titolo: "Regole", campi: [
        { chiave: "VISITA_LUOGO_PRESENZA", etichetta: "Luogo delle visite dal vivo", aiuto: "Compare nell'invito del calendario" },
        { chiave: "CHECK_SOGLIA_ENERGIA_BASSA", etichetta: "Soglia di energia bassa", tipo: "intero", aiuto: "Da questo valore in giù il check segnala energia bassa" },
      ] },
    ],
  },
  {
    id: "integrazioni", titolo: "Integrazioni", riassunto: "Google, Tessera, video", icona: Plug,
    descrizione: "Si accendono quando gli accessi sono pronti, senza nuovi rilasci.",
    gruppi: [
      { titolo: "Account Google", campi: [
        { chiave: "GOOGLE_ACCOUNT_EMAIL", etichetta: "Account del dottore", tipo: "email", aiuto: "L'account Google Workspace usato per calendario ed email" },
        { chiave: "GOOGLE_CALENDAR_ID", etichetta: "Calendario delle visite" },
      ] },
    ],
  },
  {
    id: "sicurezza", titolo: "Sicurezza", riassunto: "Password di accesso", icona: ShieldCheck,
    descrizione: "Accesso al gestionale.",
    gruppi: [],
  },
]

const ICONE_INTEGRAZIONI: Record<string, LucideIcon> = {
  GOOGLE_CALENDAR_SYNC_ENABLED: CalendarDays,
  GOOGLE_GMAIL_INVIO_ENABLED: Mail,
  TESSERA_SANITARIA_ENABLED: Landmark,
  CLOUDFLARE_STREAM_ENABLED: Video,
}

const CAMPI = SEZIONI.flatMap((s) => s.gruppi.flatMap((g) => g.campi))
const UNITA: Partial<Record<Tipo, string>> = { euro: "€", percento: "%" }

const arrotonda = (n: number) => Number(n.toFixed(6))

/** Numero scritto all'italiana ("1.500", "77,47") o alla Java ("77.47"). In config deve finire il secondo. */
function leggiNumero(testo: string) {
  let t = testo.replace(/[\s€%]/g, "")
  if (/^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "")
  t = t.replace(",", ".")
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null
}

function perSchermo(tipo: Tipo, valore: string) {
  const testo = tipo === "percento" && valore !== "" ? String(arrotonda(Number(valore) * 100)) : valore
  return tipo === "euro" || tipo === "percento" ? testo.replace(".", ",") : testo
}

/** Valore da salvare, oppure null se non è un numero: ConfigService.getDecimale non lo reggerebbe. */
function perConfig(tipo: Tipo, testo: string) {
  if (tipo !== "euro" && tipo !== "percento" && tipo !== "intero") return testo
  const n = leggiNumero(testo)
  if (n === null) return null
  if (tipo === "intero") return Number.isInteger(n) ? String(n) : null
  if (tipo === "percento") return n <= 100 ? String(arrotonda(n / 100)) : null
  return String(n)
}

function useSalvaVoce(chiave: string) {
  const { aggiorna } = useAzioni()
  const [stato, setStato] = useState<"fermo" | "salvataggio" | "salvato">("fermo")
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const salva = async (valore: string) => {
    window.clearTimeout(timer.current)
    setStato("salvataggio")
    try {
      await impostazioniService.aggiorna(chiave, valore)
      setStato("salvato")
      timer.current = window.setTimeout(() => setStato("fermo"), 2000)
      aggiorna()
      return true
    } catch (e) {
      setStato("fermo")
      toastErrore(e)
      return false
    }
  }
  return { stato, salva }
}

function StatoCampo({ stato }: { stato: ReturnType<typeof useSalvaVoce>["stato"] }) {
  return (
    <span aria-live="polite">
      {stato === "salvataggio" ? <span className="vl-imp-stato"><Loader2 className="size-3 animate-spin" aria-hidden />Salvo…</span> : null}
      {stato === "salvato" ? <span className="vl-imp-stato" data-tone="ok"><Check className="size-3" aria-hidden />Salvato</span> : null}
    </span>
  )
}

function CampoVoce({ campo, voce }: { campo: DefCampo; voce: Voce }) {
  const tipo = campo.tipo ?? "testo"
  const originale = voce.valore ?? ""
  const [testo, setTesto] = useState(perSchermo(tipo, originale))
  const [invalido, setInvalido] = useState(false)
  const { stato, salva } = useSalvaVoce(voce.chiave)
  const area = useRef<HTMLTextAreaElement>(null)

  const conferma = () => {
    const valore = perConfig(tipo, testo)
    if (valore === null) {
      setInvalido(true)
      toast.error(tipo === "intero" ? "Inserisci un numero intero" : "Inserisci un numero valido")
      return
    }
    setInvalido(false)
    if (valore === originale) return
    setTesto(perSchermo(tipo, valore))
    void salva(valore)
  }

  const inserisci = (segnaposto: string) => {
    const el = area.current
    if (!el) return
    const inizio = el.selectionStart
    setTesto(testo.slice(0, inizio) + segnaposto + testo.slice(el.selectionEnd))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(inizio + segnaposto.length, inizio + segnaposto.length)
    })
  }

  const id = `voce-${voce.chiave}`
  const numero = tipo === "euro" || tipo === "percento" || tipo === "intero"
  const unita = UNITA[tipo]
  const rata = campo.rate ? leggiNumero(testo) : null
  const aiuto = campo.rate && rata !== null
    ? `${campo.rate.numero} rate ${campo.rate.cadenza}: ${euroTondi(rata * campo.rate.numero)} in tutto`
    : campo.aiuto

  return (
    <div className="vl-imp-riga" data-largo={tipo === "area" ? "" : undefined}>
      <div className="min-w-0">
        <div className="vl-imp-etichetta">
          <Label htmlFor={id}>{campo.etichetta}</Label>
          {campo.obbligatorio && !testo.trim() ? <Chip tono="warn">Da compilare</Chip> : null}
          <StatoCampo stato={stato} />
        </div>
        {aiuto ? <p className="vl-imp-aiuto">{aiuto}</p> : null}
      </div>
      {tipo === "area" ? (
        <div className="min-w-0">
          <Textarea ref={area} id={id} rows={Math.max(2, testo.split("\n").length)} value={testo} onChange={(e) => setTesto(e.target.value)} onBlur={conferma} />
          {campo.segnaposto ? (
            <div className="vl-imp-segnaposto">
              <span>Inserisci</span>
              {campo.segnaposto.map((s) => (
                <button key={s} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => inserisci(s)}>{s}</button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="vl-imp-controllo" data-corto={numero ? "" : undefined} data-unita={unita ? "" : undefined}>
          <Input
            id={id}
            type={tipo === "email" ? "email" : "text"}
            inputMode={tipo === "intero" ? "numeric" : numero ? "decimal" : undefined}
            aria-invalid={invalido || undefined}
            value={testo}
            onChange={(e) => { setTesto(e.target.value); setInvalido(false) }}
            onBlur={conferma}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
          />
          {unita ? <span className="vl-imp-unita" aria-hidden>{unita}</span> : null}
        </div>
      )}
    </div>
  )
}

function CampoInterruttore({ campo, voce }: { campo: DefCampo; voce: Voce }) {
  const [acceso, setAcceso] = useState(voce.valore === "true")
  const { stato, salva } = useSalvaVoce(voce.chiave)
  const id = `voce-${voce.chiave}`
  const cambia = async (valore: boolean) => {
    setAcceso(valore)
    if (!await salva(String(valore))) setAcceso(!valore)
  }
  return (
    <div className="vl-imp-riga" data-compatta="">
      <div className="min-w-0">
        <div className="vl-imp-etichetta">
          <Label htmlFor={id}>{campo.etichetta}</Label>
          <StatoCampo stato={stato} />
        </div>
        {campo.aiuto ? <p className="vl-imp-aiuto">{campo.aiuto}</p> : null}
      </div>
      <div className="vl-imp-controllo" data-interruttore="">
        <Switch id={id} checked={acceso} onCheckedChange={(v) => void cambia(v)} />
      </div>
    </div>
  )
}

function RigaIntegrazione({ integrazione, voce }: { integrazione: Integrazione; voce: Voce | undefined }) {
  const [acceso, setAcceso] = useState(voce?.valore === "true")
  const { salva } = useSalvaVoce(integrazione.codice)
  const Icona = ICONE_INTEGRAZIONI[integrazione.codice] ?? Plug
  const attiva = acceso && integrazione.configurata
  const cambia = async (valore: boolean) => {
    setAcceso(valore)
    if (!await salva(String(valore))) setAcceso(!valore)
  }
  return (
    <li className="vl-imp-integrazione" data-attiva={attiva}>
      <span className="vl-imp-integrazione-icona" aria-hidden><Icona className="size-5" /></span>
      <div className="vl-imp-integrazione-testo">
        <p className="vl-imp-integrazione-nome">{integrazione.nome}</p>
        <p className="vl-imp-aiuto">{integrazione.nota}</p>
      </div>
      <Chip tono={attiva ? "ok" : acceso ? "warn" : "muted"}>{attiva ? "Attiva" : acceso ? "In attesa" : integrazione.configurata ? "Spenta" : "Da collegare"}</Chip>
      {/* Senza accessi si può solo spegnere: accenderla non avrebbe effetto */}
      <Switch checked={acceso} disabled={!integrazione.configurata && !acceso} aria-label={integrazione.nome} onCheckedChange={(v) => void cambia(v)} />
    </li>
  )
}

function Integrazioni({ dati }: { dati: DatiImpostazioni }) {
  return (
    <ul className="vl-imp-gruppo m-0 list-none p-0">
      {dati.integrazioni.map((i) => (
        <RigaIntegrazione key={i.codice} integrazione={i} voce={dati.voci.find((v) => v.chiave === i.codice)} />
      ))}
    </ul>
  )
}

function CambiaPassword() {
  const [attuale, setAttuale] = useState("")
  const [nuova, setNuova] = useState("")
  const valida = attuale.length > 0 && nuova.length >= 10
  const salva = async (e: FormEvent) => {
    e.preventDefault()
    if (!valida) return
    try {
      await authService.cambiaPassword(attuale, nuova)
      toast.success("Password aggiornata")
      setAttuale("")
      setNuova("")
    } catch (errore) {
      toastErrore(errore)
    }
  }
  return (
    <form className="vl-imp-gruppo" onSubmit={(e) => void salva(e)}>
      <div className="vl-imp-gruppo-testa"><p className="vl-imp-gruppo-titolo">Cambia password</p></div>
      <div className="vl-imp-riga">
        <div className="vl-imp-etichetta"><Label htmlFor="pw-attuale">Password attuale</Label></div>
        <div className="vl-imp-controllo"><Input id="pw-attuale" type="password" autoComplete="current-password" value={attuale} onChange={(e) => setAttuale(e.target.value)} /></div>
      </div>
      <div className="vl-imp-riga">
        <div className="min-w-0">
          <div className="vl-imp-etichetta"><Label htmlFor="pw-nuova">Nuova password</Label></div>
          <p className="vl-imp-aiuto">Almeno 10 caratteri</p>
        </div>
        <div className="vl-imp-controllo"><Input id="pw-nuova" type="password" autoComplete="new-password" value={nuova} onChange={(e) => setNuova(e.target.value)} /></div>
      </div>
      <div className="vl-imp-azioni"><Button type="submit" disabled={!valida}>Cambia password</Button></div>
    </form>
  )
}

function BloccoGruppo({ gruppo, voci }: { gruppo: Gruppo; voci: Voce[] }) {
  return (
    <section className="vl-imp-gruppo" aria-label={gruppo.titolo}>
      <div className="vl-imp-gruppo-testa">
        <p className="vl-imp-gruppo-titolo">{gruppo.titolo}</p>
        {gruppo.descrizione ? <p className="vl-imp-gruppo-descrizione">{gruppo.descrizione}</p> : null}
      </div>
      {gruppo.campi.map((campo) => {
        const voce = voci.find((v) => v.chiave === campo.chiave)
        if (!voce) return null
        return campo.tipo === "interruttore"
          ? <CampoInterruttore key={campo.chiave} campo={campo} voce={voce} />
          : <CampoVoce key={campo.chiave} campo={campo} voce={voce} />
      })}
    </section>
  )
}

export default function Impostazioni() {
  const [parametri, setParametri] = useSearchParams()
  const { dati, errore, riprova } = useDati(impostazioniService.carica, [])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  /* Una chiave nuova in config resta raggiungibile anche prima di avere il suo posto nelle sezioni */
  const orfane = dati.voci.filter((v) => !CAMPI.some((c) => c.chiave === v.chiave) && !dati.integrazioni.some((i) => i.codice === v.chiave))
  const sezioni: Sezione[] = orfane.length === 0 ? SEZIONI : [...SEZIONI, {
    id: "altro", titolo: "Altro", riassunto: "Altre impostazioni", icona: Plug, descrizione: "Impostazioni senza una sezione dedicata.",
    gruppi: [{ titolo: "Altre impostazioni", campi: orfane.map((v) => ({ chiave: v.chiave, etichetta: v.descrizione ?? v.chiave })) }],
  }]

  const attiva = sezioni.find((s) => s.id === parametri.get("sezione"))?.id ?? SEZIONI[0].id
  const apri = (id: string) => setParametri({ sezione: id }, { replace: true })

  const mancanti = CAMPI.filter((c) => c.obbligatorio && !dati.voci.find((v) => v.chiave === c.chiave)?.valore?.trim())
  const integrazioniAttive = dati.integrazioni.filter((i) => i.attiva).length
  const segnali: Record<string, { valore: number; tono?: string } | undefined> = {
    studio: mancanti.length > 0 ? { valore: mancanti.length, tono: "warn" } : undefined,
    integrazioni: integrazioniAttive > 0 ? { valore: integrazioniAttive } : undefined,
  }

  return (
    <Pagina>
      <LuxHero ariaLabel="Impostazioni" eyebrow="Configurazione" title="Impostazioni" subtitle="Scegli una sezione e modifica quello che ti serve: ogni campo si salva da solo." />

      {mancanti.length > 0 ? (
        <div className="vl-imp-avviso" role="status">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          <p>Per emettere le fatture mancano: {mancanti.map((c) => c.etichetta).join(", ")}.</p>
          {attiva !== "studio" ? <button type="button" onClick={() => apri("studio")}>Completa</button> : null}
        </div>
      ) : null}

      <Tabs className="vl-imp" orientation="vertical" value={attiva} onValueChange={apri}>
        <TabsList className="vl-imp-nav" aria-label="Sezioni delle impostazioni">
          {sezioni.map((s) => (
            <TabsTrigger key={s.id} value={s.id} className="vl-imp-voce" onClick={(e) => e.currentTarget.scrollIntoView({ block: "nearest", inline: "center" })}>
              <span className="vl-imp-voce-icona" aria-hidden><s.icona className="size-4" /></span>
              <span className="vl-imp-voce-testo">
                <span className="vl-imp-voce-titolo">{s.titolo}</span>
                <span className="vl-imp-voce-riassunto">{s.riassunto}</span>
              </span>
              {segnali[s.id] ? <span className="vl-imp-voce-segnale" data-tone={segnali[s.id]?.tono}>{segnali[s.id]?.valore}</span> : null}
            </TabsTrigger>
          ))}
        </TabsList>

        {sezioni.map((s) => (
          <TabsContent key={s.id} value={s.id} className="vl-imp-sezione">
            <div className="vl-imp-testata">
              <h2 className="vl-imp-titolo">{s.titolo}</h2>
              <p className="vl-imp-descrizione">{s.descrizione}</p>
            </div>
            {s.id === "integrazioni" ? <Integrazioni dati={dati} /> : null}
            {s.gruppi.map((g) => <BloccoGruppo key={g.titolo} gruppo={g} voci={dati.voci} />)}
            {s.id === "sicurezza" ? (
              <>
                <CambiaPassword />
                <p className="vl-imp-versione">Versione del {new Date(__VERSIONE_BUILD__).toLocaleString("it-IT")}</p>
              </>
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </Pagina>
  )
}
