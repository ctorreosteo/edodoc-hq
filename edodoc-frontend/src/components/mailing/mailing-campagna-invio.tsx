import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, FlaskConical, Loader2, MailCheck, RefreshCcw, Send, ShieldCheck, Sparkles, X, XCircle } from 'lucide-react'
import { toast } from '@/lib/toast'
import {
  ERRORE_MITTENTE_NON_CONFIGURATO,
  mailingService,
  messaggioErroreMailing,
  type MailingCampagna,
  type MailingControlli,
  type MailingControllo,
  type MailingStato,
  type MailingStimaPubblico,
} from '@/services/mailing-service'
import { MailingMiniatura } from './mailing-anteprima'
import { AzioniEmail } from './mailing-editor-strumenti'
import { MailingDialog } from './mailing-dialog'
import { Interruttore } from './mailing-editor-controlli'
import { htmlCampagna, perInputLocale } from './mailing-campagna-dati'
import type { Passo, Riferimenti } from './mailing-campagna-wizard'
import { dataOra, emailProvaRicordata, formatNumero, ricordaEmailProva } from './mailing-utils'

/* Passo 4: controlli pre-invio con punteggio spam, invio di prova, invio intelligente, invia ora o programma. */

const SOGLIA_DIGITAZIONE = 500

function IconaEsito({ esito }: { esito: MailingControllo['esito'] }) {
  if (esito === 'OK') return <CheckCircle2 className="ml-cp-esito" data-esito="OK" />
  if (esito === 'AVVISO') return <AlertTriangle className="ml-cp-esito" data-esito="AVVISO" />
  return <XCircle className="ml-cp-esito" data-esito="BLOCCANTE" />
}

/** Punteggio spam in stile SpamAssassin: 0 ottimo, 5 soglia di rischio, 10 pessimo. */
function Indicatore({ valore }: { valore: number }) {
  const v = Math.max(0, Math.min(10, valore))
  const angolo = -90 + (v / 10) * 180
  const tono = v < 3 ? 'ok' : v < 5 ? 'avviso' : 'errore'
  const testo = v < 3 ? 'Rischio spam basso' : v < 5 ? 'Rischio spam moderato' : 'Rischio spam alto'
  return (
    <div className="ml-cp-gauge" data-tono={tono} role="meter" aria-valuemin={0} aria-valuemax={10} aria-valuenow={v} aria-label={testo}>
      <svg viewBox="0 0 120 70" aria-hidden>
        <path d="M10 62 A50 50 0 0 1 110 62" className="ml-cp-gauge-fondo" />
        <path d="M10 62 A50 50 0 0 1 110 62" className="ml-cp-gauge-valore" pathLength={100} strokeDasharray={`${v * 10} 100`} />
        <g style={{ transform: `rotate(${angolo}deg)`, transformOrigin: '60px 62px', transition: 'transform 700ms cubic-bezier(0.2,0.9,0.25,1.15)' }}>
          <line x1="60" y1="62" x2="60" y2="22" className="ml-cp-gauge-ago" />
        </g>
        <circle cx="60" cy="62" r="5" className="ml-cp-gauge-perno" />
      </svg>
      <div className="ml-cp-gauge-testi">
        <strong>{v.toLocaleString('it-IT', { maximumFractionDigits: 1 })}</strong>
        <span>{testo}</span>
      </div>
    </div>
  )
}

function controlliLocali(c: MailingCampagna, completo: Record<Passo, boolean>): (MailingControllo & { passo?: Passo })[] {
  const out: (MailingControllo & { passo?: Passo })[] = []
  if (!completo.dettagli) out.push({ chiave: 'L_DETTAGLI', esito: 'BLOCCANTE', titolo: 'Mancano mittente o oggetto', dettaglio: 'Completa il passo Dettagli.', passo: 'dettagli' })
  if (!completo.pubblico) out.push({ chiave: 'L_PUBBLICO', esito: 'BLOCCANTE', titolo: 'Nessun destinatario', dettaglio: 'Scegli a chi scrivere nel passo Pubblico.', passo: 'pubblico' })
  if (!completo.contenuto) out.push({ chiave: 'L_CONTENUTO', esito: 'BLOCCANTE', titolo: "L'email è vuota", dettaglio: 'Aggiungi il contenuto.', passo: 'contenuto' })
  const html = htmlCampagna(c) ?? ''
  if (html && !html.includes('{{link_disiscrizione}}')) out.push({ chiave: 'L_PIEDE', esito: 'AVVISO', titolo: 'Manca il piè di pagina', dettaglio: 'Lo aggiungiamo noi in automatico con disiscrizione e indirizzo, ma con il blocco "Piè di pagina" decidi tu come appare.', passo: 'contenuto' })
  return out
}

function InvioProva({ c, salva }: { c: MailingCampagna; salva: () => Promise<boolean> }) {
  const [indirizzi, setIndirizzi] = useState<string[]>(() => {
    const e = emailProvaRicordata()
    return e ? [e] : []
  })
  const [bozza, setBozza] = useState('')
  const [invio, setInvio] = useState(false)
  const aggiungi = (t: string) => {
    const nuovi = t
      .split(/[\s,;]+/)
      .map((x) => x.trim().toLowerCase())
      .filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x) && !indirizzi.includes(x))
    if (nuovi.length) setIndirizzi([...indirizzi, ...nuovi].slice(0, 10))
    setBozza('')
  }
  const invia = async () => {
    if (bozza.trim()) aggiungi(bozza)
    const lista = bozza.trim() ? [...indirizzi, bozza.trim().toLowerCase()] : indirizzi
    if (!lista.length) {
      toast.info('Scrivi almeno un indirizzo')
      return
    }
    setInvio(true)
    try {
      await salva()
      await mailingService.inviaTest(c.id, lista)
      ricordaEmailProva(lista[0])
      toast.success(`Prova inviata a ${lista.length === 1 ? lista[0] : `${lista.length} indirizzi`}`, { description: 'L\'oggetto inizia con [TEST]. Controlla anche nella cartella Promozioni.' })
    } catch (e) {
      toast.error(messaggioErroreMailing(e, 'Invio di prova non riuscito'))
    } finally {
      setInvio(false)
    }
  }
  return (
    <section className="ml-card ml-cp-sezione">
      <div className="ml-cp-sezione-titolo">
        <MailCheck /> Invio di prova
      </div>
      <div className="ml-ed-aiuto">Mandala prima a te: guardala sul telefono e su Gmail, prova i link e il pulsante.</div>
      <div className="ml-cp-indirizzi" onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}>
        {indirizzi.map((x) => (
          <span key={x} className="ml-chip ml-cp-indirizzo">
            {x}
            <button type="button" aria-label={`Togli ${x}`} onClick={() => setIndirizzi(indirizzi.filter((y) => y !== x))}>
              <X />
            </button>
          </span>
        ))}
        <input
          value={bozza}
          onChange={(e) => setBozza(e.target.value)}
          onKeyDown={(e) => {
            if (['Enter', ',', ' ', 'Tab'].includes(e.key) && bozza.trim()) {
              e.preventDefault()
              aggiungi(bozza)
            } else if (e.key === 'Backspace' && !bozza && indirizzi.length) setIndirizzi(indirizzi.slice(0, -1))
          }}
          onBlur={() => bozza.trim() && aggiungi(bozza)}
          placeholder={indirizzi.length ? 'Aggiungi un altro indirizzo' : 'nome@esempio.it'}
          aria-label="Indirizzi per la prova"
        />
      </div>
      <button type="button" className="ml-btn ml-cp-prova-btn" onClick={() => void invia()} disabled={invio}>
        {invio ? <Loader2 className="ml-ed-gira" /> : <Send />} Invia la prova
      </button>
    </section>
  )
}

export function PassoInvio({
  c,
  rif,
  stato,
  aggiorna,
  stima,
  salva,
  completo,
  onVai,
  onAvviata,
}: {
  c: MailingCampagna
  rif: Riferimenti
  stato: MailingStato
  aggiorna: (p: Partial<MailingCampagna>) => void
  stima: MailingStimaPubblico | null
  salva: () => Promise<boolean>
  completo: Record<Passo, boolean>
  onVai: (p: Passo) => void
  onAvviata: (c: MailingCampagna) => void
}) {
  const [controlli, setControlli] = useState<MailingControlli | null>(null)
  const [controllo, setControllo] = useState(false)
  const [erroreControlli, setErroreControlli] = useState<string | null>(null)
  const [quando, setQuando] = useState<'ora' | 'programma'>(c.programmataIl ? 'programma' : 'ora')
  const [dataProgramma, setDataProgramma] = useState(() => perInputLocale(c.programmataIl ? new Date(c.programmataIl) : new Date(Date.now() + 26 * 3600e3 - ((Date.now() / 60000) % 30) * 60000)))
  const [conferma, setConferma] = useState(false)
  const [digitato, setDigitato] = useState('')
  const [invio, setInvio] = useState(false)
  const [, setSearchParams] = useSearchParams()
  const vaiAiMittenti = async () => {
    await salva()
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev)
      p.set('tab', 'impostazioni')
      p.delete('campagna')
      p.delete('nuova')
      return p
    })
  }

  const esegui = useCallback(async () => {
    setControllo(true)
    setErroreControlli(null)
    try {
      await salva()
      setControlli(await mailingService.controlli(c.id))
    } catch (e) {
      setErroreControlli(messaggioErroreMailing(e, 'Controlli non disponibili'))
    } finally {
      setControllo(false)
    }
  }, [c.id, salva])
  useEffect(() => {
    void esegui()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const locali = controlliLocali(c, completo)
  const tutti: (MailingControllo & { passo?: Passo })[] = [...locali, ...(controlli?.controlli ?? [])]
  const bloccanti = tutti.filter((x) => x.esito === 'BLOCCANTE' || x.esito === 'ERRORE')
  const pronta = !!controlli && controlli.pronta && bloccanti.length === 0
  const destinatari = stima?.destinatari ?? 0
  const mittente = rif.mittenti.find((m) => m.id === c.mittenteId)
  const html = useMemo(() => htmlCampagna(c), [c])
  const programmataIso = quando === 'programma' ? new Date(dataProgramma).toISOString() : null
  const programmaValida = quando === 'ora' || new Date(dataProgramma).getTime() > Date.now() + 2 * 60000
  const serveDigitare = destinatari > SOGLIA_DIGITAZIONE
  const digitazioneOk = !serveDigitare || digitato.replace(/\D/g, '') === String(destinatari)

  const avvia = async () => {
    setInvio(true)
    try {
      if (!(await salva())) throw new Error('Non riesco a salvare la bozza: riprova tra un attimo')
      const r = await mailingService.avviaInvio(c.id, programmataIso)
      setConferma(false)
      toast.success(programmataIso ? `Programmata per ${dataOra(programmataIso)}` : 'Invio avviato', {
        description: programmataIso ? 'Puoi ancora modificarla fino alla partenza.' : 'Segui l\'avanzamento in diretta nel report.',
      })
      onAvviata(r)
    } catch (e) {
      const msg = messaggioErroreMailing(e, 'Invio non avviato')
      toast.error(msg.startsWith(ERRORE_MITTENTE_NON_CONFIGURATO) ? 'Il mittente non è autorizzato all\'invio: controlla Impostazioni › Mittenti.' : msg)
    } finally {
      setInvio(false)
    }
  }

  return (
    <div className="ml-cp-due">
      <div className="ml-cp-colonna">
        <section className="ml-card ml-cp-sezione">
          <div className="ml-cp-sezione-testa">
            <div className="ml-cp-sezione-titolo">
              <ShieldCheck /> Controlli prima dell'invio
            </div>
            <button type="button" className="ml-btn ml-btn--ghost ml-btn--sm" onClick={() => void esegui()} disabled={controllo}>
              {controllo ? <Loader2 className="ml-ed-gira" /> : <RefreshCcw />} Ricontrolla
            </button>
          </div>
          {erroreControlli ? <div className="ml-avviso" data-tono="errore">{erroreControlli}</div> : null}
          <div className="ml-cp-controlli-corpo">
            {controlli ? <Indicatore valore={controlli.punteggioSpam} /> : <span className="ml-skeleton" style={{ width: 150, height: 110, display: 'block', borderRadius: 16 }} />}
            <ul className="ml-cp-controlli" data-occupato={controllo ? '' : undefined}>
              {!controlli && controllo
                ? [0, 1, 2, 3].map((i) => (
                    <li key={i}>
                      <span className="ml-skeleton" style={{ height: 18, width: `${60 + i * 8}%`, display: 'block' }} />
                    </li>
                  ))
                : tutti.map((x, i) => (
                    <li key={x.chiave} data-esito={x.esito} style={{ animationDelay: `${i * 50}ms` }}>
                      <IconaEsito esito={x.esito} />
                      <div>
                        <strong>{x.titolo}</strong>
                        {x.dettaglio ? <small>{x.dettaglio}</small> : null}
                      </div>
                      {x.passo ? (
                        <button type="button" className="ml-link" onClick={() => x.passo && onVai(x.passo)}>
                          Sistema
                        </button>
                      ) : x.esito === 'BLOCCANTE' && /mittente/i.test(`${x.chiave} ${x.titolo}`) ? (
                        <button type="button" className="ml-link" onClick={() => void vaiAiMittenti()}>
                          Verifica il mittente
                        </button>
                      ) : null}
                    </li>
                  ))}
            </ul>
          </div>
        </section>

        <InvioProva c={c} salva={salva} />

        <section className="ml-card ml-cp-sezione">
          <div className="ml-cp-sezione-titolo">
            <Clock /> Quando
          </div>
          <div className="ml-cp-scelte ml-cp-scelte--2">
            <button type="button" className="ml-cp-scelta" data-attivo={quando === 'ora' ? '' : undefined} aria-pressed={quando === 'ora'} onClick={() => setQuando('ora')}>
              <span className="ml-cp-scelta-icona">
                <Send />
              </span>
              <span className="ml-cp-scelta-titolo">Adesso</span>
              <span className="ml-cp-scelta-testo">Parte appena confermi, rispettando le quote del mittente</span>
            </button>
            <button type="button" className="ml-cp-scelta" data-attivo={quando === 'programma' ? '' : undefined} aria-pressed={quando === 'programma'} onClick={() => setQuando('programma')}>
              <span className="ml-cp-scelta-icona">
                <CalendarClock />
              </span>
              <span className="ml-cp-scelta-titolo">Programma</span>
              <span className="ml-cp-scelta-testo">Scegli giorno e ora: il martedì e il giovedì mattina di solito aprono di più</span>
            </button>
          </div>
          {quando === 'programma' ? (
            <label className="ml-ed-campo">
              <span className="ml-ed-etichetta">Data e ora di partenza</span>
              <input type="datetime-local" className="ml-input ml-ed-input ml-cp-data" value={dataProgramma} min={perInputLocale(new Date(Date.now() + 5 * 60000))} onChange={(e) => setDataProgramma(e.target.value)} />
              {!programmaValida ? <span className="ml-ed-aiuto ml-ed-avviso">Scegli un momento nel futuro.</span> : null}
            </label>
          ) : null}
          <Interruttore
            etichetta={
              <span className="ml-cp-sezione-titolo ml-cp-intelligente">
                <Sparkles /> Invio intelligente
              </span>
            }
            descrizione="Ognuno la riceve all'ora in cui di solito apre le email (entro 24 ore dalla partenza). Chi non ha uno storico la riceve subito."
            attivo={c.invioIntelligente}
            onChange={(v) => aggiorna({ invioIntelligente: v })}
          />
        </section>
      </div>

      <aside className="ml-cp-colonna ml-cp-colonna--anteprima">
        <div className="ml-cp-appiccicoso">
          <section className="ml-card ml-cp-riepilogo">
            <div className="ml-cp-riepilogo-mini">
              <MailingMiniatura html={html} titolo={c.nome} altezza={220} />
            </div>
            <div className="ml-azioni-email">
              <AzioniEmail html={html} contesto={{ oggetto: c.oggetto, preheader: c.preheader, mittenteId: c.mittenteId, categoriaId: c.categoriaId }} />
            </div>
            <dl className="ml-cp-riepilogo-dati">
              <div>
                <dt>Destinatari</dt>
                <dd>{stima ? formatNumero(destinatari) : '…'}</dd>
              </div>
              <div>
                <dt>Mittente</dt>
                <dd>{mittente ? `${mittente.nomeVisualizzato} · ${mittente.email}` : 'Da scegliere'}</dd>
              </div>
              <div>
                <dt>Oggetto</dt>
                <dd>{c.oggetto || 'Da scrivere'}</dd>
              </div>
              {c.testAb ? (
                <div>
                  <dt>
                    <FlaskConical /> Test A/B
                  </dt>
                  <dd>
                    {c.testAb.varianti.length} varianti sul {c.testAb.percentualeTest}% · vincitore dopo {c.testAb.oreAttesa} h
                  </dd>
                </div>
              ) : null}
            </dl>
            {!stato.invioAbilitato ? <div className="ml-avviso" data-tono="errore">Gli invii sono spenti nelle Impostazioni: puoi programmare, ma nulla partirà finché non li riaccendi.</div> : null}
            <button
              type="button"
              className="ml-btn ml-btn--pieno ml-cp-invia"
              disabled={!pronta || !programmaValida || controllo || !destinatari}
              onClick={() => {
                setDigitato('')
                setConferma(true)
              }}
            >
              {quando === 'ora' ? <Send /> : <CalendarClock />}
              {quando === 'ora' ? `Invia a ${formatNumero(destinatari)} persone` : 'Programma l\'invio'}
            </button>
            {!pronta && controlli ? <div className="ml-ed-aiuto ml-cp-invia-nota">Risolvi i punti in rosso per poter inviare.</div> : null}
          </section>
        </div>
      </aside>

      <MailingDialog open={conferma} onOpenChange={(o) => !invio && setConferma(o)} titolo={quando === 'ora' ? 'Pronta a partire' : 'Programma la campagna'} icona={<Send />} larghezza="max-w-md">
        <div className="ml-cp-conferma">
          <div className="ml-cp-conferma-numero">
            <span>{formatNumero(destinatari)}</span>
            <small>persone riceveranno questa email</small>
          </div>
          <dl className="ml-cp-riepilogo-dati">
            <div>
              <dt>Da</dt>
              <dd>{mittente ? `${mittente.nomeVisualizzato} <${mittente.email}>` : '—'}</dd>
            </div>
            <div>
              <dt>Oggetto</dt>
              <dd>{c.oggetto}</dd>
            </div>
            <div>
              <dt>Quando</dt>
              <dd>
                {quando === 'ora' ? 'Adesso' : dataOra(programmataIso)}
                {c.invioIntelligente ? ' · con invio intelligente' : ''}
              </dd>
            </div>
            {stima && stima.giorniInvioStimati > 1 ? (
              <div>
                <dt>Durata</dt>
                <dd>circa {stima.giorniInvioStimati} giorni per la quota del mittente</dd>
              </div>
            ) : null}
          </dl>
          <div className="ml-ed-aiuto">Una volta partita, un'email non si può richiamare: puoi solo mettere in pausa chi non l'ha ancora ricevuta.</div>
          {serveDigitare ? (
            <label className="ml-ed-campo">
              <span className="ml-ed-etichetta">
                Per confermare, scrivi il numero di destinatari: <strong>{formatNumero(destinatari)}</strong>
              </span>
              <input className="ml-input" inputMode="numeric" autoFocus value={digitato} onChange={(e) => setDigitato(e.target.value)} aria-label="Numero di destinatari" placeholder={formatNumero(destinatari)} />
            </label>
          ) : null}
          <div className="ml-dialog-piede">
            <button type="button" className="ml-btn ml-btn--ghost" onClick={() => setConferma(false)} disabled={invio}>
              Non ancora
            </button>
            <button type="button" className="ml-btn ml-btn--pieno" onClick={() => void avvia()} disabled={invio || !digitazioneOk}>
              {invio ? <Loader2 className="ml-ed-gira" /> : <Send />}
              {quando === 'ora' ? 'Invia adesso' : 'Programma'}
            </button>
          </div>
        </div>
      </MailingDialog>
    </div>
  )
}
