import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  AtSign,
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  CircleX,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Send,
  Server,
  ShieldCheck,
  Star,
  Trash2,
  Zap,
} from 'lucide-react'
import { toast } from '@/lib/toast'
import {
  ERRORE_MITTENTE_NON_CONFIGURATO,
  mailingService,
  messaggioErroreMailing,
  type MailingCanale,
  type MailingEsitoVerifica,
  type MailingMittente,
  type MailingMittenteInput,
} from '@/services/mailing-service'
import { ConfermaMailing, MailingDialog } from './mailing-dialog'
import { Scheletro, Vuoto } from './mailing-ui'
import { dataBreve, emailProvaRicordata, formatNumero, ricordaEmailProva } from './mailing-utils'

/* Mittenti: elenco con quota, form crea/modifica, verifica con email di prova, guida Google Admin. */

const CANALI: { valore: MailingCanale; titolo: string; breve: string; testo: string; icona: typeof Mail }[] = [
  {
    valore: 'GMAIL_API',
    titolo: 'Google Workspace',
    breve: 'Consigliato',
    testo: 'Invia dalla casella del dottore con la stessa autorizzazione già usata dalla pagina Email. Fino a circa 2.000 email al giorno per casella.',
    icona: Mail,
  },
  {
    valore: 'SMTP_RELAY_GOOGLE',
    titolo: 'Relay SMTP di Google',
    breve: 'Volumi alti',
    testo: 'Sempre Google Workspace, ma con limiti molto più alti (fino a 10.000 destinatari al giorno). Va attivato una volta in Google Admin.',
    icona: Zap,
  },
  {
    valore: 'SMTP',
    titolo: 'Altro server SMTP',
    breve: 'Domini esterni',
    testo: 'Per indirizzi fuori da Google Workspace. La password resta sul server, in una variabile d’ambiente: qui si scrive solo il suo nome.',
    icona: Server,
  },
]

const NOME_CANALE: Record<MailingCanale, string> = { GMAIL_API: 'Google Workspace', SMTP_RELAY_GOOGLE: 'Relay Google', SMTP: 'SMTP' }

function inputDa(m: MailingMittente | null): MailingMittenteInput {
  return m
    ? {
        email: m.email,
        nomeVisualizzato: m.nomeVisualizzato,
        rispondiA: m.rispondiA,
        casellaDelegata: m.casellaDelegata,
        canale: m.canale,
        smtpHost: m.smtpHost,
        smtpPorta: m.smtpPorta,
        smtpUtente: m.smtpUtente,
        smtpPasswordEnv: m.smtpPasswordEnv,
        limiteGiornaliero: m.limiteGiornaliero,
        limiteAlMinuto: m.limiteAlMinuto,
        predefinito: m.predefinito,
        attivo: m.attivo,
      }
    : {
        email: '',
        nomeVisualizzato: 'Dr. Edoardo Bo',
        rispondiA: null,
        casellaDelegata: null,
        canale: 'GMAIL_API',
        smtpHost: null,
        smtpPorta: 587,
        smtpUtente: null,
        smtpPasswordEnv: null,
        limiteGiornaliero: 1500,
        limiteAlMinuto: 20,
        predefinito: false,
        attivo: true,
      }
}

export function MailingMittenti({ onCambiati }: { onCambiati: () => void }) {
  const [mittenti, setMittenti] = useState<MailingMittente[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [form, setForm] = useState<{ mittente: MailingMittente | null } | null>(null)
  const [verifica, setVerifica] = useState<MailingMittente | null>(null)
  const [elimina, setElimina] = useState<MailingMittente | null>(null)

  const carica = () =>
    mailingService
      .mittenti()
      .then((m) => {
        setMittenti(m)
        setErrore(null)
      })
      .catch((err) => setErrore(messaggioErroreMailing(err, 'Mittenti non disponibili')))

  useEffect(() => {
    void carica()
  }, [])

  const salvato = (m: MailingMittente) => {
    setMittenti((l) => {
      const base = (l ?? []).map((x) => (m.predefinito && x.id !== m.id ? { ...x, predefinito: false } : x))
      return base.some((x) => x.id === m.id) ? base.map((x) => (x.id === m.id ? m : x)) : [...base, m]
    })
    onCambiati()
  }

  const eliminaMittente = async () => {
    if (!elimina) return
    try {
      await mailingService.eliminaMittente(elimina.id)
      setMittenti((l) => (l ?? []).filter((x) => x.id !== elimina.id))
      onCambiati()
      toast.success('Mittente eliminato')
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Mittente non eliminato'))
      return false
    }
  }

  return (
    <section className="ml-card">
      <div className="ml-card-testa">
        <div>
          <div className="ml-card-titolo">
            <AtSign className="size-4" aria-hidden /> Mittenti
          </div>
          <div className="ml-card-sottotitolo">Le caselle da cui partono le email. Ogni campagna ne usa una sola.</div>
        </div>
        {mittenti?.length ? (
          <button type="button" className="ml-btn ml-btn--sm ml-btn--pieno" onClick={() => setForm({ mittente: null })}>
            <Plus className="size-3.5" aria-hidden /> Aggiungi
          </button>
        ) : null}
      </div>

      {errore ? (
        <div className="ml-avviso" data-tono="errore" role="alert">
          {errore}
        </div>
      ) : mittenti == null ? (
        <Scheletro altezza={110} />
      ) : mittenti.length === 0 ? (
        <Vuoto
          icona={<AtSign />}
          titolo="Aggiungi la prima casella"
          testo="Con Google Workspace basta scrivere l’indirizzo (per esempio info@edodoc.it): l’autorizzazione è la stessa della pagina Email."
          azioni={
            <button type="button" className="ml-btn ml-btn--pieno" onClick={() => setForm({ mittente: null })}>
              <Plus className="size-4" aria-hidden /> Aggiungi mittente
            </button>
          }
        />
      ) : (
        <ul className="ml-mittenti">
          {mittenti.map((m) => {
            const perc = m.limiteGiornaliero ? Math.min(100, (m.inviatiUltime24h / m.limiteGiornaliero) * 100) : 0
            const nonConfigurato = !!m.ultimoErrore?.includes(ERRORE_MITTENTE_NON_CONFIGURATO)
            return (
              <li key={m.id} className="ml-mittente" data-spento={m.attivo ? undefined : ''}>
                <div className="ml-mittente-testa">
                  <span className="ml-mittente-icona" aria-hidden>
                    {m.canale === 'SMTP' ? <Server className="size-4" /> : m.canale === 'SMTP_RELAY_GOOGLE' ? <Zap className="size-4" /> : <Mail className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="ml-mittente-nome">
                      {m.nomeVisualizzato}
                      {m.predefinito ? (
                        <span className="ml-mittente-predefinito" title="Usato di default per le nuove campagne">
                          <Star className="size-3" aria-hidden /> predefinito
                        </span>
                      ) : null}
                    </div>
                    <div className="ml-mittente-email">{m.email}</div>
                  </div>
                  <div className="ml-mittente-stato">
                    {!m.attivo ? (
                      <span className="ml-badge ml-badge--neutro">Spento</span>
                    ) : m.ultimoErrore ? (
                      <span className="ml-badge ml-badge--errore">Da sistemare</span>
                    ) : m.verificatoIl ? (
                      <span className="ml-badge ml-badge--ok" title={`Verificato il ${dataBreve(m.verificatoIl)}`}>
                        Verificato
                      </span>
                    ) : (
                      <span className="ml-badge ml-badge--avviso">Da verificare</span>
                    )}
                    <span className="ml-chip">{NOME_CANALE[m.canale]}</span>
                  </div>
                </div>

                <div className="ml-mittente-quota">
                  <div className="ml-barra" data-tono={perc >= 90 ? 'errore' : perc >= 70 ? 'avviso' : 'ok'} role="progressbar" aria-valuemin={0} aria-valuemax={m.limiteGiornaliero} aria-valuenow={m.inviatiUltime24h} aria-label="Quota ultime 24 ore">
                    <span className="ml-barra-valore" style={{ width: `${perc}%` }} />
                  </div>
                  <span>
                    <strong>{formatNumero(m.inviatiUltime24h)}</strong> / {formatNumero(m.limiteGiornaliero)} nelle ultime 24 h · max {formatNumero(m.limiteAlMinuto)} al minuto
                    {m.inCoda ? ` · ${formatNumero(m.inCoda)} in coda` : ''}
                  </span>
                </div>

                {m.ultimoErrore ? (
                  nonConfigurato ? (
                    <GuidaGoogleAdmin canale={m.canale} email={m.casellaDelegata ?? m.email} />
                  ) : (
                    <div className="ml-avviso" data-tono="errore">
                      <AlertTriangle className="size-4" aria-hidden />
                      <span>{m.ultimoErrore}</span>
                    </div>
                  )
                ) : null}

                <div className="ml-azioni-riga">
                  <button type="button" className="ml-btn ml-btn--sm" onClick={() => setVerifica(m)}>
                    <ShieldCheck className="size-3.5" aria-hidden /> Verifica
                  </button>
                  <button type="button" className="ml-btn ml-btn--sm ml-btn--ghost" onClick={() => setForm({ mittente: m })}>
                    <Pencil className="size-3.5" aria-hidden /> Modifica
                  </button>
                  <button type="button" className="ml-btn ml-btn--sm ml-btn--ghost" onClick={() => setElimina(m)}>
                    <Trash2 className="size-3.5" aria-hidden /> Elimina
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {form ? <FormMittente mittente={form.mittente} onChiudi={() => setForm(null)} onSalvato={salvato} /> : null}
      {verifica ? (
        <VerificaMittente
          mittente={verifica}
          onChiudi={() => setVerifica(null)}
          onVerificato={() => {
            void carica()
            onCambiati()
          }}
        />
      ) : null}
      <ConfermaMailing
        open={!!elimina}
        onOpenChange={(v) => !v && setElimina(null)}
        icona={<Trash2 className="size-5" aria-hidden />}
        titolo="Eliminare il mittente?"
        testo={`Le campagne e le automazioni che usano ${elimina?.email ?? ''} dovranno sceglierne un altro prima di partire.`}
        conferma="Elimina"
        pericolo
        onConferma={eliminaMittente}
      />
    </section>
  )
}

// ───────────────────────── Form ─────────────────────────

function FormMittente({ mittente, onChiudi, onSalvato }: { mittente: MailingMittente | null; onChiudi: () => void; onSalvato: (m: MailingMittente) => void }) {
  const [v, setV] = useState<MailingMittenteInput>(() => inputDa(mittente))
  const [alias, setAlias] = useState(!!mittente?.casellaDelegata)
  const [salvando, setSalvando] = useState(false)
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const smtp = v.canale === 'SMTP'
  const valido =
    email.test(v.email.trim()) &&
    v.nomeVisualizzato.trim().length > 0 &&
    (!v.rispondiA || email.test(v.rispondiA.trim())) &&
    (!alias || smtp || email.test((v.casellaDelegata ?? '').trim())) &&
    (!smtp || (!!v.smtpHost?.trim() && !!v.smtpPorta && !!v.smtpUtente?.trim() && /^[A-Z_][A-Z0-9_]*$/.test(v.smtpPasswordEnv?.trim() ?? '')))

  const salva = async () => {
    if (!valido) return
    setSalvando(true)
    const input: MailingMittenteInput = {
      ...v,
      email: v.email.trim(),
      nomeVisualizzato: v.nomeVisualizzato.trim(),
      rispondiA: v.rispondiA?.trim() || null,
      casellaDelegata: !smtp && alias ? v.casellaDelegata?.trim() || null : null,
      smtpHost: smtp ? v.smtpHost?.trim() || null : null,
      smtpPorta: smtp ? v.smtpPorta ?? 587 : null,
      smtpUtente: smtp ? v.smtpUtente?.trim() || null : null,
      smtpPasswordEnv: smtp ? v.smtpPasswordEnv?.trim() || null : null,
    }
    try {
      const m = mittente ? await mailingService.aggiornaMittente(mittente.id, input) : await mailingService.creaMittente(input)
      onSalvato(m)
      toast.success(mittente ? 'Mittente aggiornato' : 'Mittente aggiunto: ora fai una verifica')
      onChiudi()
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Mittente non salvato'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <MailingDialog
      open
      onOpenChange={(o) => !o && !salvando && onChiudi()}
      larghezza="max-w-2xl"
      icona={<AtSign className="size-5" aria-hidden />}
      titolo={mittente ? 'Modifica mittente' : 'Nuovo mittente'}
    >
      <form
        className="ml-form"
        onSubmit={(e) => {
          e.preventDefault()
          void salva()
        }}
      >
        <fieldset className="ml-campo">
          <legend className="ml-campo-etichetta">Come inviare</legend>
          <div className="ml-canali">
            {CANALI.map((c) => {
              const Icona = c.icona
              return (
                <label key={c.valore} className="ml-canale" data-scelto={v.canale === c.valore ? '' : undefined}>
                  <input type="radio" name="ml-canale" value={c.valore} checked={v.canale === c.valore} onChange={() => setV({ ...v, canale: c.valore })} />
                  <span className="ml-canale-testa">
                    <Icona className="size-4" aria-hidden />
                    <strong>{c.titolo}</strong>
                    <span className="ml-canale-breve">{c.breve}</span>
                  </span>
                  <span className="ml-canale-testo">{c.testo}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className="ml-form-riga">
          <div className="ml-campo">
            <label htmlFor="ml-mit-email">Indirizzo mittente</label>
            <input id="ml-mit-email" className="ml-input" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} placeholder="info@edodoc.it" required />
          </div>
          <div className="ml-campo">
            <label htmlFor="ml-mit-nome">Nome visualizzato</label>
            <input id="ml-mit-nome" className="ml-input" value={v.nomeVisualizzato} onChange={(e) => setV({ ...v, nomeVisualizzato: e.target.value })} placeholder="Dr. Edoardo Bo" required />
          </div>
        </div>
        <div className="ml-campo">
          <label htmlFor="ml-mit-reply">Le risposte vanno a (facoltativo)</label>
          <input id="ml-mit-reply" className="ml-input" type="email" value={v.rispondiA ?? ''} onChange={(e) => setV({ ...v, rispondiA: e.target.value })} placeholder="Lascia vuoto per ricevere le risposte sul mittente" />
        </div>

        {!smtp ? (
          <div className="ml-riquadro">
            <label className="ml-spunta">
              <input type="checkbox" checked={alias} onChange={(e) => setAlias(e.target.checked)} />
              <span>
                <strong>È un alias o un indirizzo «Invia come»</strong>
                <span className="ml-campo-aiuto block">
                  Per una casella vera di Workspace basta l’indirizzo sopra. Se invece è un alias (es. newsletter@…) configurato come «Invia come» su un’altra casella, indica qui la casella reale.
                </span>
              </span>
            </label>
            {alias ? (
              <div className="ml-campo mt-2">
                <label htmlFor="ml-mit-delegata">Casella reale che invia</label>
                <input id="ml-mit-delegata" className="ml-input" type="email" value={v.casellaDelegata ?? ''} onChange={(e) => setV({ ...v, casellaDelegata: e.target.value })} placeholder="carlos@studiomobilitas.it" />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="ml-riquadro">
            <div className="ml-form-riga ml-form-riga--host">
              <div className="ml-campo">
                <label htmlFor="ml-mit-host">Server SMTP</label>
                <input id="ml-mit-host" className="ml-input" value={v.smtpHost ?? ''} onChange={(e) => setV({ ...v, smtpHost: e.target.value })} placeholder="smtp.esempio.it" />
              </div>
              <div className="ml-campo">
                <label htmlFor="ml-mit-porta">Porta</label>
                <input id="ml-mit-porta" className="ml-input" type="number" value={v.smtpPorta ?? ''} onChange={(e) => setV({ ...v, smtpPorta: e.target.value ? Number(e.target.value) : null })} placeholder="587" />
              </div>
            </div>
            <div className="ml-campo">
              <label htmlFor="ml-mit-utente">Utente</label>
              <input id="ml-mit-utente" className="ml-input" value={v.smtpUtente ?? ''} onChange={(e) => setV({ ...v, smtpUtente: e.target.value })} autoComplete="off" />
            </div>
            <div className="ml-campo">
              <label htmlFor="ml-mit-env">
                <KeyRound className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
                Nome della variabile con la password
              </label>
              <input
                id="ml-mit-env"
                className="ml-input ml-input--mono"
                value={v.smtpPasswordEnv ?? ''}
                onChange={(e) => setV({ ...v, smtpPasswordEnv: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })}
                placeholder="MAILING_SMTP_PASSWORD_INFO"
                autoComplete="off"
                spellCheck={false}
              />
              <span className="ml-campo-aiuto">
                La password <strong>non si scrive qui</strong>: va salvata sul server (Cloud Run) in una variabile d’ambiente con questo nome.
                {mittente ? (mittente.smtpPasswordPresente ? ' Il server la trova già.' : ' Al momento il server non la trova.') : ''}
              </span>
            </div>
          </div>
        )}

        <details className="ml-avanzate">
          <summary>Limiti di invio e opzioni</summary>
          <div className="ml-form-riga">
            <div className="ml-campo">
              <label htmlFor="ml-mit-giorno">Massimo al giorno</label>
              <input id="ml-mit-giorno" className="ml-input" type="number" min={1} value={v.limiteGiornaliero ?? 1500} onChange={(e) => setV({ ...v, limiteGiornaliero: Number(e.target.value) || 1 })} />
              <span className="ml-campo-aiuto">Gmail blocca oltre i 2.000: restiamo sotto. Le campagne più grandi si distribuiscono su più giorni.</span>
            </div>
            <div className="ml-campo">
              <label htmlFor="ml-mit-minuto">Massimo al minuto</label>
              <input id="ml-mit-minuto" className="ml-input" type="number" min={1} value={v.limiteAlMinuto ?? 20} onChange={(e) => setV({ ...v, limiteAlMinuto: Number(e.target.value) || 1 })} />
            </div>
          </div>
          <label className="ml-spunta">
            <input type="checkbox" checked={!!v.predefinito} onChange={(e) => setV({ ...v, predefinito: e.target.checked })} />
            <span>Usalo di default per le nuove campagne</span>
          </label>
          <label className="ml-spunta">
            <input type="checkbox" checked={v.attivo !== false} onChange={(e) => setV({ ...v, attivo: e.target.checked })} />
            <span>Attivo (se lo spegni, le sue email restano in coda)</span>
          </label>
        </details>

        <div className="ml-dialog-piede">
          <button type="button" className="ml-btn ml-btn--ghost" onClick={onChiudi} disabled={salvando}>
            Annulla
          </button>
          <button type="submit" className="ml-btn ml-btn--pieno" disabled={!valido || salvando}>
            {salvando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {mittente ? 'Salva' : 'Aggiungi mittente'}
          </button>
        </div>
      </form>
    </MailingDialog>
  )
}

// ───────────────────────── Verifica ─────────────────────────

const ICONA_ESITO = { OK: CheckCircle2, AVVISO: CircleAlert, BLOCCANTE: CircleX, ERRORE: CircleX }

function VerificaMittente({ mittente, onChiudi, onVerificato }: { mittente: MailingMittente; onChiudi: () => void; onVerificato: () => void }) {
  const [indirizzo, setIndirizzo] = useState<string>(() => emailProvaRicordata())
  const [inCorso, setInCorso] = useState(false)
  const [esito, setEsito] = useState<MailingEsitoVerifica | null>(null)

  const verifica = async () => {
    setInCorso(true)
    setEsito(null)
    try {
      const e = await mailingService.verificaMittente(mittente.id, indirizzo.trim())
      ricordaEmailProva(indirizzo)
      setEsito(e)
      onVerificato()
    } catch (err) {
      const msg = messaggioErroreMailing(err, 'Verifica non riuscita')
      setEsito({ inviata: false, errore: msg, controlli: [] })
    } finally {
      setInCorso(false)
    }
  }

  const nonConfigurato = !!esito?.errore?.includes(ERRORE_MITTENTE_NON_CONFIGURATO)

  return (
    <MailingDialog
      open
      onOpenChange={(o) => !o && !inCorso && onChiudi()}
      larghezza="max-w-xl"
      icona={<ShieldCheck className="size-5" aria-hidden />}
      titolo={`Verifica ${mittente.email}`}
      descrizione="Mando un’email di prova e controllo che il dominio sia configurato bene (SPF, DKIM, DMARC) e che Google ci autorizzi a inviare."
    >
      <form
        className="ml-form"
        onSubmit={(e) => {
          e.preventDefault()
          void verifica()
        }}
      >
        <div className="ml-campo">
          <label htmlFor="ml-verifica-a">Manda la prova a</label>
          <div className="ml-input-bottone">
            <input id="ml-verifica-a" className="ml-input" type="email" value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)} required />
            <button type="submit" className="ml-btn ml-btn--pieno" disabled={inCorso || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(indirizzo.trim())}>
              {inCorso ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              {inCorso ? 'Controllo…' : 'Invia prova'}
            </button>
          </div>
        </div>
      </form>

      {inCorso ? (
        <ul className="ml-checklist" aria-busy>
          {['Autorizzazione Google', 'SPF', 'DKIM', 'DMARC', 'Invio di prova'].map((t, i) => (
            <li key={t} className="ml-checklist-voce" data-esito="ATTESA" style={{ animationDelay: `${i * 90}ms` }}>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <span className="ml-checklist-titolo">{t}</span>
            </li>
          ))}
        </ul>
      ) : esito ? (
        <div className="ml-verifica-esito">
          <div className="ml-avviso" data-tono={esito.inviata ? 'ok' : 'errore'} role="status">
            {esito.inviata ? <BadgeCheck className="size-4" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}
            <span>
              {esito.inviata
                ? `Email di prova inviata a ${indirizzo}: controlla che sia arrivata in Posta in arrivo e non nello spam.`
                : nonConfigurato
                  ? 'Google non ci autorizza ancora a inviare da questa casella. Segui i passi qui sotto (una volta sola).'
                  : esito.errore ?? 'Invio non riuscito.'}
            </span>
          </div>
          {esito.controlli.length ? (
            <ul className="ml-checklist">
              {esito.controlli.map((c, i) => {
                const Icona = ICONA_ESITO[c.esito] ?? CircleAlert
                return (
                  <li key={c.chiave} className="ml-checklist-voce" data-esito={c.esito} style={{ animationDelay: `${i * 70}ms` }}>
                    <Icona className="size-4" aria-hidden />
                    <span className="min-w-0">
                      <span className="ml-checklist-titolo">{c.titolo}</span>
                      {c.dettaglio ? <span className="ml-checklist-dettaglio">{c.dettaglio}</span> : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : null}
          {nonConfigurato ? <GuidaGoogleAdmin canale={mittente.canale} email={mittente.casellaDelegata ?? mittente.email} aperta /> : null}
        </div>
      ) : null}
    </MailingDialog>
  )
}

// ───────────────────────── Guida Google Admin ─────────────────────────

function Copiabile({ testo }: { testo: string }) {
  return (
    <button
      type="button"
      className="ml-codice"
      onClick={() => {
        void navigator.clipboard?.writeText(testo).then(() => toast.success('Copiato'))
      }}
      title="Copia"
    >
      <code>{testo}</code>
      <Copy className="size-3" aria-hidden />
    </button>
  )
}

export function GuidaGoogleAdmin({ canale, email, aperta }: { canale: MailingCanale; email: string; aperta?: boolean }) {
  const relay = canale === 'SMTP_RELAY_GOOGLE'
  return (
    <details className="ml-guida-admin" open={aperta}>
      <summary>
        <ShieldCheck className="size-4" aria-hidden /> Come autorizzare l’invio in Google Admin
      </summary>
      <ol>
        <li>
          Apri <a href="https://admin.google.com" target="_blank" rel="noreferrer" className="ml-link">admin.google.com</a> con un account amministratore di EdoDoc.
        </li>
        <li>
          Vai su <strong>Sicurezza → Accesso e controllo dei dati → Controlli API</strong> e apri <strong>Gestisci la delega a livello di dominio</strong>.
        </li>
        <li>
          Trova il client del gestionale (lo stesso già usato dalla pagina Email) e premi <strong>Modifica</strong>.
        </li>
        <li>
          Controlla che tra gli ambiti ci sia {relay ? <Copiabile testo="https://mail.google.com/" /> : <Copiabile testo="https://www.googleapis.com/auth/gmail.modify" />}
          {relay ? ' (in aggiunta a quelli già presenti) e salva.' : ': è quello già autorizzato per la pagina Email, di solito non serve aggiungere nulla.'}
        </li>
        {relay ? (
          <li>
            In <strong>App → Google Workspace → Gmail → Routing</strong> attiva il <strong>servizio di inoltro SMTP</strong> consentendo l’autenticazione SMTP e la crittografia TLS.
          </li>
        ) : null}
        <li>
          Verifica che <strong>{email}</strong> sia una casella attiva di Workspace (o che l’alias sia impostato come «Invia come» su di essa).
        </li>
        <li>Torna qui e premi di nuovo «Verifica»: le modifiche in Google Admin possono richiedere qualche minuto.</li>
      </ol>
    </details>
  )
}
