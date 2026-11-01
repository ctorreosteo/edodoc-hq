import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertOctagon, Archive, Check, FlaskConical, Mail, MailOpen, Paperclip, RefreshCw, Search, Sparkles, Star, Trash2, X,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { aggiornaCasellaStato, allineaCasellaStato, useCasellaNovita, useCasellaStato } from '@/hooks/use-casella-stato'
import { toast } from '@/lib/toast'
import {
  casellaNonCollegata,
  casellaService,
  messaggioErrore,
  type EmailCasella,
  type EmailMessaggio,
  type EmailThread,
  type EmailThreadRiga,
} from '@/services/casella-service'
import { EmailComposer, type InvioRichiesto } from './email-composer'
import { EmailLettura, type AzioneThread } from './email-lettura'
import { EmailLista, type AzioneRiga } from './email-lista'
import { EmailRail } from './email-rail'
import { EmailSetup } from './email-setup'
import {
  CARTELLE_SISTEMA, composerVuoto, costruisciComposer, FILTRI_VUOTI, formatIndirizzo, queryGmail, ricordaRecenti, ultimoMessaggio,
  nuovaChiave, type BozzaComposer, type FiltriRicerca, type ModoComposer,
} from './email-utils'
import '@/style/lux-email.css'

type Azione = AzioneThread | AzioneRiga

/** Etichette da aggiungere e togliere per ogni azione; cestino e ripristino hanno chiamate proprie. */
const MODIFICHE: Partial<Record<Azione, { aggiungi?: string[]; rimuovi?: string[] }>> = {
  archivia: { rimuovi: ['INBOX'] },
  inArrivo: { aggiungi: ['INBOX'] },
  spam: { aggiungi: ['SPAM'], rimuovi: ['INBOX'] },
  nonSpam: { aggiungi: ['INBOX'], rimuovi: ['SPAM'] },
  letto: { rimuovi: ['UNREAD'] },
  nonLetto: { aggiungi: ['UNREAD'] },
  speciale: { aggiungi: ['STARRED'] },
  nonSpeciale: { rimuovi: ['STARRED'] },
}

const MESSAGGI: Partial<Record<Azione, string>> = {
  archivia: 'Archiviata', cestina: 'Spostata nel cestino', ripristina: 'Ripristinata', spam: 'Segnalata come spam', nonSpam: 'Tolta dallo spam',
  inArrivo: 'Spostata in arrivo',
}

function saluto() {
  const ora = new Date().getHours()
  return ora < 13 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera'
}

export function EmailPagina() {
  const { utente } = useAuth()
  const { nonLetti } = useCasellaStato({ veloce: true })
  const [params, setParams] = useSearchParams()
  const cartella = params.get('cartella') ?? 'INBOX'
  const q = params.get('q') ?? ''
  const apertoId = params.get('t')

  const [casella, setCasella] = useState<EmailCasella | null>(null)
  const [nonCollegata, setNonCollegata] = useState<string | null>(null)
  const [erroreCasella, setErroreCasella] = useState<string | null>(null)

  const [righe, setRighe] = useState<EmailThreadRiga[]>([])
  const [paginaSucc, setPaginaSucc] = useState<string | null>(null)
  const [stima, setStima] = useState(0)
  const [caricando, setCaricando] = useState(true)
  const [caricandoAltre, setCaricandoAltre] = useState(false)
  const [erroreLista, setErroreLista] = useState<string | null>(null)
  const [selezione, setSelezione] = useState<Set<string>>(new Set())
  const [filtri, setFiltri] = useState<FiltriRicerca>(FILTRI_VUOTI)
  const [testoRicerca, setTestoRicerca] = useState(q)

  const [thread, setThread] = useState<EmailThread | null>(null)
  const [caricandoThread, setCaricandoThread] = useState(false)
  const [erroreThread, setErroreThread] = useState<string | null>(null)

  const [finestra, setFinestra] = useState<BozzaComposer | null>(null)
  const [finestraMini, setFinestraMini] = useState(false)
  const [finestraGrande, setFinestraGrande] = useState(false)
  const [inline, setInline] = useState<BozzaComposer | null>(null)

  const richiestaLista = useRef(0)
  const richiestaThread = useRef(0)
  const query = useMemo(() => queryGmail(q, filtri), [q, filtri])

  const cambiaParametri = useCallback((nuovi: Record<string, string | null>) => {
    setParams((attuali) => {
      const prossimi = new URLSearchParams(attuali)
      Object.entries(nuovi).forEach(([k, v]) => (v ? prossimi.set(k, v) : prossimi.delete(k)))
      return prossimi
    })
  }, [setParams])

  const caricaCasella = useCallback(async () => {
    setErroreCasella(null)
    try {
      const c = await casellaService.casella()
      setCasella(c)
      setNonCollegata(null)
      const inbox = c.etichette.find((e) => e.id === 'INBOX')
      allineaCasellaStato(c.historyId, inbox?.threadNonLetti)
    } catch (e) {
      if (casellaNonCollegata(e)) setNonCollegata(messaggioErrore(e))
      else setErroreCasella(messaggioErrore(e, 'Casella non disponibile'))
    }
  }, [])

  const caricaLista = useCallback(async (silenzioso = false) => {
    const id = ++richiestaLista.current
    if (!silenzioso) setCaricando(true)
    setErroreLista(null)
    try {
      const pagina = await casellaService.elenco(cartella, query)
      if (id !== richiestaLista.current) return
      setRighe(pagina.righe)
      setPaginaSucc(pagina.paginaSuccessiva)
      setStima(pagina.stimaTotale)
    } catch (e) {
      if (id === richiestaLista.current) setErroreLista(messaggioErrore(e, 'Email non disponibili'))
    } finally {
      if (id === richiestaLista.current) setCaricando(false)
    }
  }, [cartella, query])

  const caricaThread = useCallback(async (id: string) => {
    const numero = ++richiestaThread.current
    setCaricandoThread(true)
    setErroreThread(null)
    try {
      const t = await casellaService.thread(id)
      if (numero !== richiestaThread.current) return
      setThread(t)
      if (t.messaggi.some((m) => m.nonLetto)) {
        await casellaService.modifica([id], [], ['UNREAD'])
        setRighe((rr) => rr.map((r) => (r.id === id ? { ...r, nonLetto: false } : r)))
        aggiornaCasellaStato()
        void caricaCasella()
      }
    } catch (e) {
      if (numero === richiestaThread.current) setErroreThread(messaggioErrore(e, 'Email non disponibile'))
    } finally {
      if (numero === richiestaThread.current) setCaricandoThread(false)
    }
  }, [caricaCasella])

  useEffect(() => {
    void caricaCasella()
  }, [caricaCasella])

  useEffect(() => {
    if (casella) void caricaLista()
    setSelezione(new Set())
    // La casella si ricarica spesso (contatori): la lista segue solo il primo caricamento e i filtri
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(casella), caricaLista])

  useEffect(() => {
    setInline(null)
    if (!apertoId) {
      setThread(null)
      setErroreThread(null)
      return
    }
    if (casella) void caricaThread(apertoId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apertoId, Boolean(casella), caricaThread])

  useCasellaNovita(() => {
    void caricaLista(true)
    void caricaCasella()
  })

  const ricarica = useCallback(() => {
    void caricaLista(true)
    void caricaCasella()
    aggiornaCasellaStato()
  }, [caricaLista, caricaCasella])

  const caricaAltre = async () => {
    if (!paginaSucc || caricandoAltre) return
    setCaricandoAltre(true)
    try {
      const pagina = await casellaService.elenco(cartella, query, paginaSucc)
      setRighe((rr) => [...rr, ...pagina.righe.filter((r) => !rr.some((x) => x.id === r.id))])
      setPaginaSucc(pagina.paginaSuccessiva)
    } catch (e) {
      toast.error(messaggioErrore(e, 'Email non disponibili'))
    } finally {
      setCaricandoAltre(false)
    }
  }

  const esegui = async (ids: string[], azione: Azione) => {
    try {
      if (azione === 'cestina') await casellaService.cestina(ids)
      else if (azione === 'ripristina') await casellaService.ripristina(ids)
      else {
        const m = MODIFICHE[azione]
        await casellaService.modifica(ids, m?.aggiungi, m?.rimuovi)
      }
      if (MESSAGGI[azione]) toast.success(MESSAGGI[azione])
      setSelezione(new Set())
      // Se la conversazione aperta lascia la cartella, la lettura si chiude
      const esce = ['archivia', 'cestina', 'ripristina', 'spam', 'nonSpam', 'inArrivo', 'nonLetto'].includes(azione)
      if (apertoId && ids.includes(apertoId)) {
        if (esce) cambiaParametri({ t: null })
        else void caricaThread(apertoId)
      }
      ricarica()
    } catch (e) {
      toast.error(messaggioErrore(e, 'Azione non riuscita'))
    }
  }

  const seleziona = (r: EmailThreadRiga) => {
    setSelezione((s) => {
      const n = new Set(s)
      if (n.has(r.id)) n.delete(r.id)
      else n.add(r.id)
      return n
    })
  }

  const scrivi = (a: string[] = []) => {
    setFinestra(composerVuoto(a))
    setFinestraMini(false)
  }

  const rispondi = (modo: Exclude<ModoComposer, 'nuova' | 'bozza'>, m?: EmailMessaggio) => {
    if (!thread || !casella) return
    const messaggio = m ?? ultimoMessaggio(thread)
    if (messaggio) setInline(costruisciComposer(modo, thread, messaggio, casella.email))
  }

  const apriBozza = async (id: string, threadDellaBozza?: string | null) => {
    try {
      const b = await casellaService.bozza(id)
      const riaperta: BozzaComposer = {
        chiave: nuovaChiave(),
        modo: 'bozza',
        a: b.a.map(formatIndirizzo),
        cc: b.cc.map(formatIndirizzo),
        ccn: b.ccn.map(formatIndirizzo),
        oggetto: b.oggetto ?? '',
        html: b.html ?? '',
        citazione: null,
        threadId: b.threadId,
        inReplyTo: b.inReplyTo,
        references: b.references,
        allegatiEsistenti: b.allegati.map((x) => ({ ...x })),
        bozzaId: b.bozzaId,
      }
      if (threadDellaBozza) setInline(riaperta)
      else {
        setFinestra(riaperta)
        setFinestraMini(false)
      }
    } catch (e) {
      toast.error(messaggioErrore(e, 'Bozza non disponibile'))
    }
  }

  const invia = async (invio: InvioRichiesto, dove: 'finestra' | 'inline') => {
    if (dove === 'finestra') {
      setFinestra(null)
      setFinestraGrande(false)
    } else {
      setInline(null)
    }
    try {
      await casellaService.invia(invio.composizione, invio.file)
      ricordaRecenti([...invio.composizione.a, ...invio.composizione.cc])
      toast.success('Email inviata')
      if (apertoId) void caricaThread(apertoId)
      ricarica()
    } catch (e) {
      toast.error(messaggioErrore(e, 'Invio non riuscito'))
      // Il testo non si perde: il composer si riapre com'era
      const ripristino = { ...invio.ripristino, chiave: nuovaChiave() }
      if (dove === 'finestra') setFinestra(ripristino)
      else setInline(ripristino)
    }
  }

  const apri = (r: EmailThreadRiga) => {
    // Una bozza senza altri messaggi si riapre direttamente nel composer
    if (cartella === 'DRAFT' && r.messaggi === 0) {
      void casellaService.thread(r.id)
        .then((t) => {
          const id = t.messaggi.find((m) => m.bozzaId)?.bozzaId
          if (id) void apriBozza(id)
        })
        .catch((e) => toast.error(messaggioErrore(e, 'Bozza non disponibile')))
      return
    }
    cambiaParametri({ t: r.id })
  }

  if (nonCollegata) {
    return (
      <div data-vl="" data-vl-page="email" className="em-pagina em-pagina--setup">
        <EmailSetup dettaglio={nonCollegata} onRiprova={() => void caricaCasella()} />
      </div>
    )
  }

  if (!casella) {
    return (
      <div data-vl="" data-vl-page="email" className="em-pagina em-pagina--caricamento">
        {erroreCasella ? (
          <div className="em-vuoto">
            <AlertOctagon aria-hidden />
            <p>{erroreCasella}</p>
            <button type="button" className="em-btn" onClick={() => void caricaCasella()}>Riprova</button>
          </div>
        ) : (
          <div className="em-avvio">
            <div className="em-vuoto-orb em-vuoto-orb--pulsa" aria-hidden><Mail /></div>
            <p>Apro la casella…</p>
          </div>
        )}
      </div>
    )
  }

  const titoloCartella = q ? `Risultati per «${q}»` : CARTELLE_SISTEMA[cartella] ?? casella.etichette.find((e) => e.id === cartella)?.nome ?? 'Email'
  const selezionate = [...selezione]
  const tuttiSelezionati = righe.length > 0 && righe.every((r) => selezione.has(r.id))

  return (
    <div data-vl="" data-vl-page="email" className="em-pagina" data-vista={apertoId ? 'lettura' : 'lista'} data-ampiezza="normale">
      <header className="em-testa">
        <div className="em-testa-aurora" aria-hidden />
        <div className="em-testa-sx">
          <div className="em-eyebrow">
            <span className="vl-live-dot" aria-hidden />
            <span>{casella.email}</span>
          </div>
          <h1 className="em-titolo">{saluto()}, {utente?.nome}</h1>
          <p className="em-sottotitolo">
            {nonLetti > 0 ? <><strong>{nonLetti}</strong> da leggere</> : <>Tutto letto <Sparkles className="em-inline-ico" aria-hidden /></>}
          </p>
          {casella.demo ? (
            <span className="em-avviso-casella" data-tipo="STUDIO">
              <FlaskConical aria-hidden /> Casella dimostrativa: email inventate, non parte nulla davvero
            </span>
          ) : null}
        </div>
        <form
          className="em-cerca"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            cambiaParametri({ q: testoRicerca.trim() || null, t: null })
          }}
        >
          <Search aria-hidden />
          <input value={testoRicerca} onChange={(e) => setTestoRicerca(e.target.value)} placeholder="Cerca email, persone, allegati…" aria-label="Cerca nella posta" />
          {q ? (
            <button
              type="button"
              className="em-cerca-x"
              aria-label="Annulla la ricerca"
              onClick={() => {
                setTestoRicerca('')
                cambiaParametri({ q: null, t: null })
              }}
            >
              <X />
            </button>
          ) : null}
        </form>
      </header>

      <div className="em-app">
        <EmailRail
          casella={casella}
          cartella={cartella}
          onCartella={(id) => {
            setTestoRicerca('')
            setFiltri(FILTRI_VUOTI)
            setParams({ cartella: id })
          }}
          onScrivi={() => scrivi()}
        />

        <section className="em-colonna-lista" aria-label={titoloCartella}>
          {selezione.size > 0 ? (
            <div className="em-bulk" role="toolbar" aria-label="Azioni sulle selezionate">
              <button
                type="button"
                className="em-bulk-check"
                data-tutti={tuttiSelezionati ? '' : undefined}
                aria-label={tuttiSelezionati ? 'Deseleziona tutte' : 'Seleziona tutte'}
                onClick={() => setSelezione(tuttiSelezionati ? new Set() : new Set(righe.map((r) => r.id)))}
              >
                <Check aria-hidden />
              </button>
              <span className="em-bulk-n">{selezione.size}</span>
              {cartella !== 'TRASH' ? <button type="button" className="em-icon-btn" title="Archivia" aria-label="Archivia" onClick={() => void esegui(selezionate, 'archivia')}><Archive /></button> : null}
              <button type="button" className="em-icon-btn" title="Elimina" aria-label="Elimina" onClick={() => void esegui(selezionate, 'cestina')}><Trash2 /></button>
              <button type="button" className="em-icon-btn" title="Segna come letta" aria-label="Segna come letta" onClick={() => void esegui(selezionate, 'letto')}><MailOpen /></button>
              <button type="button" className="em-icon-btn" title="Segna come da leggere" aria-label="Segna come da leggere" onClick={() => void esegui(selezionate, 'nonLetto')}><Mail /></button>
              <span className="flex-1" />
              <button type="button" className="em-icon-btn" aria-label="Annulla la selezione" onClick={() => setSelezione(new Set())}><X /></button>
            </div>
          ) : (
            <div className="em-lista-testa">
              <div className="em-lista-titolo">
                <h2>{titoloCartella}</h2>
                {!caricando ? <small>{stima > righe.length ? `circa ${stima}` : righe.length}</small> : null}
                <button type="button" className="em-icon-btn" onClick={() => void caricaLista()} aria-label="Aggiorna" title="Aggiorna">
                  <RefreshCw className={caricando ? 'animate-spin' : undefined} />
                </button>
              </div>
              <div className="em-filtri" role="group" aria-label="Filtri">
                {([
                  ['nonLette', 'Da leggere', Mail],
                  ['conAllegati', 'Allegati', Paperclip],
                  ['speciali', 'Speciali', Star],
                ] as const).map(([k, etichetta, Icona]) => (
                  <button
                    key={k}
                    type="button"
                    className="em-filtro"
                    aria-pressed={filtri[k]}
                    data-attivo={filtri[k] ? '' : undefined}
                    onClick={() => setFiltri((f) => ({ ...f, [k]: !f[k] }))}
                  >
                    <Icona aria-hidden /> {etichetta}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="em-lista-scroll">
            {caricando ? (
              <div className="em-scheletro" aria-busy aria-label="Carico le email">
                {Array.from({ length: 7 }, (_, i) => (
                  <div key={i} className="em-scheletro-riga" style={{ animationDelay: `${i * 70}ms` }}>
                    <span className="em-sk-av" />
                    <span className="em-sk-righe"><span /><span /><span /></span>
                  </div>
                ))}
              </div>
            ) : erroreLista ? (
              <div className="em-vuoto">
                <AlertOctagon aria-hidden />
                <p>{erroreLista}</p>
                <button type="button" className="em-btn" onClick={() => void caricaLista()}>Riprova</button>
              </div>
            ) : righe.length === 0 ? (
              cartella === 'INBOX' && !query ? (
                <div className="em-zero">
                  <div className="em-zero-sole" aria-hidden>
                    <span /><span /><span />
                    <Check />
                  </div>
                  <h3>Inbox zero.</h3>
                  <p>Non c'è niente che ti aspetta. Goditi il momento.</p>
                </div>
              ) : (
                <div className="em-vuoto">
                  <Search aria-hidden />
                  <p>{query ? 'Nessun risultato' : 'Nessuna email qui'}</p>
                </div>
              )
            ) : (
              <EmailLista
                righe={righe}
                etichette={casella.etichette}
                mia={casella.email}
                cartella={cartella}
                apertoId={apertoId}
                selezione={selezione}
                caricandoAltre={caricandoAltre}
                haAltre={Boolean(paginaSucc)}
                onApri={apri}
                onSeleziona={seleziona}
                onAzione={(r, azione) => void esegui([r.id], azione)}
                onAltre={() => void caricaAltre()}
              />
            )}
          </div>
        </section>

        <section className="em-colonna-lettura" aria-label="Lettura">
          <EmailLettura
            thread={apertoId ? thread : null}
            caricamento={caricandoThread}
            errore={erroreThread}
            casella={casella}
            etichette={casella.etichette}
            onAzione={(azione) => thread && void esegui([thread.id], azione)}
            onRispondi={rispondi}
            onApriBozza={(id) => void apriBozza(id, thread?.id)}
            onScrivi={(email) => scrivi([email])}
            onChiudi={() => cambiaParametri({ t: null })}
            onRiprova={() => apertoId && void caricaThread(apertoId)}
            composer={
              inline ? (
                <EmailComposer
                  key={inline.chiave}
                  bozza={inline}
                  variante="inline"
                  onChiudi={() => setInline(null)}
                  onInvia={(i) => void invia(i, 'inline')}
                  onBozzaCambiata={ricarica}
                />
              ) : null
            }
          />
        </section>
      </div>

      {finestra ? (
        <div className="em-dock" data-grande={finestraGrande && !finestraMini ? '' : undefined}>
          <EmailComposer
            key={finestra.chiave}
            bozza={finestra}
            variante="finestra"
            minimizzato={finestraMini}
            ingrandito={finestraGrande}
            onMinimizza={setFinestraMini}
            onIngrandisci={setFinestraGrande}
            onChiudi={() => {
              setFinestra(null)
              setFinestraGrande(false)
            }}
            onInvia={(i) => void invia(i, 'finestra')}
            onBozzaCambiata={ricarica}
          />
        </div>
      ) : null}
    </div>
  )
}

