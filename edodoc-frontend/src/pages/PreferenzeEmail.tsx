import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Check, CheckCircle2, HeartHandshake, Loader2, Lock, MailCheck, MailX, ShieldCheck } from 'lucide-react'
import { mailingService, messaggioErroreMailing, type MailingPreferenze } from '@/services/mailing-service'
import '@/style/lux-mailing.css'

/*
  Centro preferenze email (pubblico, senza login, fuori dal layout del gestionale).
  Ci si arriva dal link "Gestisci preferenze" / "Disiscriviti" in fondo a ogni email: /preferenze-email/:token?invio=…
  Tema: segue prefers-color-scheme del dispositivo (non il tema del gestionale). Stile: .mlp-* in lux-mailing.css.
*/

const MOTIVI = ['Ricevo troppe email', 'Non mi interessano più', 'Non ricordo di essermi iscritto', 'Altro']

type Fase = 'preferenze' | 'conferma-uscita' | 'uscito' | 'salvato'

export default function PreferenzeEmail() {
  const { token = '' } = useParams()
  const [searchParams] = useSearchParams()
  const invioToken = searchParams.get('invio')

  const [dati, setDati] = useState<MailingPreferenze | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [ricevute, setRicevute] = useState<Record<number, boolean>>({})
  const [fase, setFase] = useState<Fase>('preferenze')
  const [motivo, setMotivo] = useState<string>('')
  const [altro, setAltro] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [erroreAzione, setErroreAzione] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Preferenze email · Dr. Edoardo Bo'
    let vivo = true
    mailingService
      .preferenze(token)
      .then((p) => {
        if (!vivo) return
        setDati(p)
        setRicevute(Object.fromEntries(p.categorie.map((c) => [c.id, c.attiva])))
        if (p.stato !== 'ISCRITTO') setFase('uscito')
      })
      .catch((err) => vivo && setErrore(messaggioErroreMailing(err, 'Questo link non è valido o è scaduto.')))
    return () => {
      vivo = false
    }
  }, [token])

  const escluse = () => Object.entries(ricevute).filter(([, v]) => !v).map(([k]) => Number(k))

  const invia = async (opzioni: { disiscrivi?: boolean; reiscrivi?: boolean; motivo?: string | null }, prossima: Fase) => {
    setInCorso(true)
    setErroreAzione(null)
    try {
      const p = await mailingService.salvaPreferenze(token, {
        categorieEscluse: escluse(),
        disiscrivi: !!opzioni.disiscrivi,
        reiscrivi: opzioni.reiscrivi ?? false,
        motivo: opzioni.motivo ?? null,
        invioToken,
      })
      setDati(p)
      setRicevute(Object.fromEntries(p.categorie.map((c) => [c.id, c.attiva])))
      setFase(prossima)
    } catch (err) {
      setErroreAzione(messaggioErroreMailing(err, 'Non sono riuscito a salvare. Riprova tra poco.'))
    } finally {
      setInCorso(false)
    }
  }

  const tutteSpente = dati ? dati.categorie.length > 0 && dati.categorie.every((c) => !ricevute[c.id]) : false
  const motivoFinale = motivo === 'Altro' ? altro.trim() || 'Altro' : motivo || null

  return (
    <div className="mlp" data-ml-pubblico="">
      <div className="mlp-sfondo" aria-hidden />
      <main className="mlp-contenitore">
        <header className="mlp-marchio">
          <img src="/pittogramma.png" alt="" className="mlp-logo" />
          <span>Dr. Edoardo Bo</span>
        </header>

        <section className="mlp-card" aria-live="polite">
          {errore ? (
            <div className="mlp-stato">
              <span className="mlp-icona mlp-icona--neutra" aria-hidden>
                <Lock className="size-6" />
              </span>
              <div className="mlp-titolo">Link non valido</div>
              <p className="mlp-testo">{errore} Se vuoi cambiare le tue preferenze, usa il link in fondo all’ultima email che hai ricevuto, oppure scrivici.</p>
            </div>
          ) : !dati ? (
            <div className="mlp-stato">
              <Loader2 className="size-6 animate-spin mlp-muto" aria-hidden />
              <p className="mlp-testo">Un attimo…</p>
            </div>
          ) : fase === 'uscito' ? (
            <div className="mlp-stato">
              <span className="mlp-icona mlp-icona--ok" aria-hidden>
                <MailX className="size-6" />
              </span>
              <div className="mlp-titolo">Fatto, non riceverai più email</div>
              <p className="mlp-testo">
                L’indirizzo <strong>{dati.emailMascherata}</strong> è stato tolto da tutte le comunicazioni del Dr. Edoardo Bo. Le email legate alle tue visite (conferme e
                promemoria) continueranno ad arrivare.
              </p>
              <div className="mlp-separatore" />
              <p className="mlp-testo mlp-testo--piccolo">Ti sei sbagliato o hai cambiato idea?</p>
              <button type="button" className="mlp-btn" onClick={() => void invia({ reiscrivi: true }, 'salvato')} disabled={inCorso}>
                {inCorso ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <HeartHandshake className="size-4" aria-hidden />}
                Iscrivimi di nuovo
              </button>
              {erroreAzione ? <p className="mlp-errore" role="alert">{erroreAzione}</p> : null}
            </div>
          ) : fase === 'salvato' ? (
            <div className="mlp-stato">
              <span className="mlp-icona mlp-icona--ok" aria-hidden>
                <CheckCircle2 className="size-6" />
              </span>
              <div className="mlp-titolo">Preferenze salvate</div>
              <p className="mlp-testo">Grazie{dati.nomeMostrato ? `, ${dati.nomeMostrato}` : ''}! Riceverai solo le email che hai scelto.</p>
              <button type="button" className="mlp-btn mlp-btn--leggero" onClick={() => setFase('preferenze')}>
                Rivedi le preferenze
              </button>
            </div>
          ) : fase === 'conferma-uscita' ? (
            <div className="mlp-uscita">
              <div className="mlp-titolo">Ci dispiace vederti andare</div>
              <p className="mlp-testo">Ci dici perché? È facoltativo, ma ci aiuta a scrivere email migliori.</p>
              <div className="mlp-motivi" role="radiogroup" aria-label="Motivo">
                {MOTIVI.map((m) => (
                  <label key={m} className="mlp-motivo" data-scelto={motivo === m ? '' : undefined}>
                    <input type="radio" name="motivo" value={m} checked={motivo === m} onChange={() => setMotivo(m)} />
                    <span className="mlp-motivo-punto" aria-hidden />
                    <span>{m}</span>
                  </label>
                ))}
              </div>
              {motivo === 'Altro' ? (
                <textarea className="mlp-textarea" rows={3} value={altro} onChange={(e) => setAltro(e.target.value)} placeholder="Scrivi qui, se vuoi" aria-label="Altro motivo" maxLength={500} />
              ) : null}
              <div className="mlp-azioni">
                <button type="button" className="mlp-btn mlp-btn--pericolo" onClick={() => void invia({ disiscrivi: true, motivo: motivoFinale }, 'uscito')} disabled={inCorso}>
                  {inCorso ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Confermo, disiscrivimi
                </button>
                <button type="button" className="mlp-btn mlp-btn--leggero" onClick={() => setFase('preferenze')} disabled={inCorso}>
                  Torna indietro
                </button>
              </div>
              {erroreAzione ? <p className="mlp-errore" role="alert">{erroreAzione}</p> : null}
            </div>
          ) : (
            <>
              <div className="mlp-intestazione">
                <span className="mlp-icona" aria-hidden>
                  <MailCheck className="size-6" />
                </span>
                <div>
                  <div className="mlp-titolo">{dati.nomeMostrato ? `Ciao ${dati.nomeMostrato},` : 'Le tue preferenze email'}</div>
                  <p className="mlp-testo">
                    scegli cosa ricevere su <strong>{dati.emailMascherata}</strong>
                    {dati.mittente ? <> da {dati.mittente}</> : null}.
                  </p>
                </div>
              </div>

              {dati.categorie.length ? (
                <ul className="mlp-categorie">
                  {dati.categorie.map((c) => {
                    const on = !!ricevute[c.id]
                    return (
                      <li key={c.id}>
                        <label className="mlp-categoria" data-on={on ? '' : undefined}>
                          <span className="mlp-categoria-testo">
                            <span className="mlp-categoria-nome">{c.nome}</span>
                            {c.descrizione ? <span className="mlp-categoria-descr">{c.descrizione}</span> : null}
                          </span>
                          <input type="checkbox" className="mlp-switch-input" checked={on} onChange={(e) => setRicevute({ ...ricevute, [c.id]: e.target.checked })} />
                          <span className="mlp-switch" aria-hidden />
                        </label>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="mlp-testo">Ricevi le comunicazioni del Dr. Edoardo Bo: consigli di alimentazione, novità e promozioni, mai più di qualche volta al mese.</p>
              )}

              {tutteSpente ? <p className="mlp-nota">Hai spento tutto: è come disiscriversi. Puoi farlo anche col pulsante qui sotto.</p> : null}

              <div className="mlp-azioni">
                {dati.categorie.length ? (
                  <button type="button" className="mlp-btn" onClick={() => void invia({}, 'salvato')} disabled={inCorso}>
                    {inCorso ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                    Salva le preferenze
                  </button>
                ) : null}
                <button type="button" className="mlp-link-uscita" onClick={() => setFase('conferma-uscita')}>
                  Disiscrivimi da tutto
                </button>
              </div>
              {erroreAzione ? <p className="mlp-errore" role="alert">{erroreAzione}</p> : null}
            </>
          )}
        </section>

        <footer className="mlp-piede">
          <ShieldCheck className="size-3.5" aria-hidden />
          <span>I tuoi dati restano al Dr. Edoardo Bo e non vengono ceduti a nessuno. Puoi cambiare idea quando vuoi.</span>
        </footer>
      </main>
    </div>
  )
}
