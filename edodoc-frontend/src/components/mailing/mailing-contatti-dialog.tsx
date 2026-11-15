import { useRef, useState, type DragEvent } from 'react'
import { CheckCircle2, FileSpreadsheet, Loader2, Scale, Upload, UserPlus } from 'lucide-react'
import { toast } from '@/lib/toast'
import {
  mailingService,
  messaggioErroreMailing,
  type MailingBaseGiuridica,
  type MailingEsitoImport,
  type MailingTag,
} from '@/services/mailing-service'
import { MailingDialog } from './mailing-dialog'
import { ETICHETTE_BASE_GIURIDICA, formatNumero } from './mailing-utils'

/* Dialog della scheda Contatti: import da CSV e aggiunta manuale di un contatto. */

const BASI_IMPORT: { valore: MailingBaseGiuridica; testo: string }[] = [
  { valore: 'CONSENSO', testo: 'Hanno dato il consenso esplicito a ricevere email dal dottore (modulo, sito, masterclass).' },
  { valore: 'CLIENTE_SOFT_SPAM', testo: 'Sono pazienti o clienti: possiamo scrivere solo di servizi simili a quelli già acquistati.' },
  { valore: 'MANUALE', testo: 'Altro, documentato a parte (per esempio un elenco firmato a un evento).' },
]

export function MailingImportaCsv({
  open,
  onOpenChange,
  tag,
  onImportato,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  tag: MailingTag[]
  onImportato: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [base, setBase] = useState<MailingBaseGiuridica | ''>('')
  const [tagId, setTagId] = useState<number | null>(null)
  const [confermaLegale, setConfermaLegale] = useState(false)
  const [inCorso, setInCorso] = useState(false)
  const [esito, setEsito] = useState<MailingEsitoImport | null>(null)
  const [sopra, setSopra] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setFile(null)
    setBase('')
    setTagId(null)
    setConfermaLegale(false)
    setEsito(null)
  }

  const chiudi = (v: boolean) => {
    if (inCorso) return
    onOpenChange(v)
    if (!v) window.setTimeout(reset, 250)
  }

  const scegli = (f: File | null | undefined) => {
    if (!f) return
    if (!/\.(csv|txt)$/i.test(f.name)) {
      toast.error('Serve un file .csv')
      return
    }
    setFile(f)
  }

  const suDrop = (e: DragEvent) => {
    e.preventDefault()
    setSopra(false)
    scegli(e.dataTransfer.files?.[0])
  }

  const importa = async () => {
    if (!file || !base) return
    setInCorso(true)
    try {
      const r = await mailingService.importaCsv(file, { tagId, baseGiuridica: base })
      setEsito(r)
      onImportato()
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Import non riuscito'))
    } finally {
      setInCorso(false)
    }
  }

  return (
    <MailingDialog
      open={open}
      onOpenChange={chiudi}
      larghezza="max-w-xl"
      icona={<Upload className="size-5" aria-hidden />}
      titolo="Importa contatti da CSV"
      descrizione={esito ? undefined : 'Una riga per persona con almeno la colonna «email»; «nome» e «cognome» sono facoltative. Chi esiste già viene aggiornato, chi si era disiscritto resta disiscritto.'}
    >
      {esito ? (
        <div className="ml-esito">
          <span className="ml-esito-icona" aria-hidden>
            <CheckCircle2 className="size-7" />
          </span>
          <div className="ml-esito-titolo">Import completato</div>
          <dl className="ml-esito-numeri">
            <div>
              <dt>Righe lette</dt>
              <dd>{formatNumero(esito.righe)}</dd>
            </div>
            <div data-tono="ok">
              <dt>Nuovi</dt>
              <dd>{formatNumero(esito.creati)}</dd>
            </div>
            <div>
              <dt>Aggiornati</dt>
              <dd>{formatNumero(esito.aggiornati)}</dd>
            </div>
            <div>
              <dt>Saltati</dt>
              <dd>{formatNumero(esito.saltati)}</dd>
            </div>
            <div data-tono={esito.nonValidi ? 'avviso' : undefined}>
              <dt>Email non valide</dt>
              <dd>{formatNumero(esito.nonValidi)}</dd>
            </div>
          </dl>
          {esito.errori.length ? (
            <details className="ml-esito-errori">
              <summary>{esito.errori.length} righe con problemi</summary>
              <ul>
                {esito.errori.slice(0, 50).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="ml-dialog-piede">
            <button type="button" className="ml-btn" onClick={reset}>
              Importa un altro file
            </button>
            <button type="button" className="ml-btn ml-btn--pieno" onClick={() => chiudi(false)}>
              Fatto
            </button>
          </div>
        </div>
      ) : (
        <div className="ml-form">
          <div
            className="ml-drop"
            data-sopra={sopra ? '' : undefined}
            data-pieno={file ? '' : undefined}
            onDragOver={(e) => {
              e.preventDefault()
              setSopra(true)
            }}
            onDragLeave={() => setSopra(false)}
            onDrop={suDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                inputRef.current?.click()
              }
            }}
            aria-label="Scegli il file CSV"
          >
            <FileSpreadsheet className="size-7" aria-hidden />
            {file ? (
              <>
                <strong>{file.name}</strong>
                <span>{(file.size / 1024).toLocaleString('it-IT', { maximumFractionDigits: 0 })} KB · clicca per cambiare</span>
              </>
            ) : (
              <>
                <strong>Trascina qui il file</strong>
                <span>oppure clicca per sceglierlo</span>
              </>
            )}
            <input ref={inputRef} type="file" accept=".csv,text/csv,.txt" hidden onChange={(e) => scegli(e.target.files?.[0])} />
          </div>

          <fieldset className="ml-campo">
            <legend className="ml-campo-etichetta">
              Perché possiamo scrivere a queste persone? <span className="ml-obbligatorio">obbligatorio</span>
            </legend>
            <div className="ml-scelte">
              {BASI_IMPORT.map((b) => (
                <label key={b.valore} className="ml-scelta" data-scelta={base === b.valore ? '' : undefined}>
                  <input type="radio" name="ml-base-import" value={b.valore} checked={base === b.valore} onChange={() => setBase(b.valore)} />
                  <span>
                    <strong>{ETICHETTE_BASE_GIURIDICA[b.valore]}</strong>
                    <span>{b.testo}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="ml-campo">
            <label htmlFor="ml-import-tag">Aggiungi un tag a tutti (facoltativo)</label>
            <select id="ml-import-tag" className="ml-select" value={tagId ?? ''} onChange={(e) => setTagId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Nessun tag</option>
              {tag
                .filter((t) => !t.sistema)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
            </select>
          </div>

          <div className="ml-avviso ml-avviso--legale" data-tono="info">
            <Scale className="size-4" aria-hidden />
            <span>
              Importare persone che non hanno dato il consenso (o che non sono clienti) viola il GDPR e fa finire le email del dottore nello spam. Il dottore
              deve poter dimostrare da dove arriva ogni indirizzo.
            </span>
          </div>
          <label className="ml-spunta">
            <input type="checkbox" checked={confermaLegale} onChange={(e) => setConfermaLegale(e.target.checked)} />
            <span>Confermo che queste persone hanno accettato di ricevere email dal dottore e che posso dimostrarlo.</span>
          </label>

          <div className="ml-dialog-piede">
            <button type="button" className="ml-btn ml-btn--ghost" onClick={() => chiudi(false)} disabled={inCorso}>
              Annulla
            </button>
            <button type="button" className="ml-btn ml-btn--pieno" onClick={() => void importa()} disabled={!file || !base || !confermaLegale || inCorso}>
              {inCorso ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
              {inCorso ? 'Importo…' : 'Importa'}
            </button>
          </div>
        </div>
      )}
    </MailingDialog>
  )
}

export function MailingNuovoContatto({ open, onOpenChange, onCreato }: { open: boolean; onOpenChange: (v: boolean) => void; onCreato: (id: number) => void }) {
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [cognome, setCognome] = useState('')
  const [base, setBase] = useState<MailingBaseGiuridica>('CONSENSO')
  const [inCorso, setInCorso] = useState(false)
  const valida = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const salva = async () => {
    if (!valida) return
    setInCorso(true)
    try {
      const d = await mailingService.creaContatto({ email: email.trim(), nome: nome.trim() || null, cognome: cognome.trim() || null, baseGiuridica: base })
      toast.success('Contatto aggiunto')
      onOpenChange(false)
      setEmail('')
      setNome('')
      setCognome('')
      onCreato(d.contatto.id)
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Contatto non creato'))
    } finally {
      setInCorso(false)
    }
  }

  return (
    <MailingDialog
      open={open}
      onOpenChange={(v) => !inCorso && onOpenChange(v)}
      icona={<UserPlus className="size-5" aria-hidden />}
      titolo="Aggiungi un contatto"
      descrizione="Per i pazienti non serve: arrivano da soli dal gestionale. Usalo per chi ti ha lasciato l’email fuori dai canali soliti."
    >
      <form
        className="ml-form"
        onSubmit={(e) => {
          e.preventDefault()
          void salva()
        }}
      >
        <div className="ml-campo">
          <label htmlFor="ml-nuovo-email">Email</label>
          <input id="ml-nuovo-email" className="ml-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@esempio.it" required autoFocus />
        </div>
        <div className="ml-form-riga">
          <div className="ml-campo">
            <label htmlFor="ml-nuovo-nome">Nome</label>
            <input id="ml-nuovo-nome" className="ml-input" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="ml-campo">
            <label htmlFor="ml-nuovo-cognome">Cognome</label>
            <input id="ml-nuovo-cognome" className="ml-input" value={cognome} onChange={(e) => setCognome(e.target.value)} />
          </div>
        </div>
        <div className="ml-campo">
          <label htmlFor="ml-nuovo-base">Perché possiamo scrivergli</label>
          <select id="ml-nuovo-base" className="ml-select" value={base} onChange={(e) => setBase(e.target.value as MailingBaseGiuridica)}>
            {BASI_IMPORT.map((b) => (
              <option key={b.valore} value={b.valore}>
                {ETICHETTE_BASE_GIURIDICA[b.valore]}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-dialog-piede">
          <button type="button" className="ml-btn ml-btn--ghost" onClick={() => onOpenChange(false)} disabled={inCorso}>
            Annulla
          </button>
          <button type="submit" className="ml-btn ml-btn--pieno" disabled={!valida || inCorso}>
            {inCorso ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Aggiungi
          </button>
        </div>
      </form>
    </MailingDialog>
  )
}
