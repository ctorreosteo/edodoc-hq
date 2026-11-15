import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Layers, Loader2, Plus, Save, Sparkles, Trash2, Users, Wand2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import {
  mailingService,
  messaggioErroreMailing,
  type MailingAnteprimaSegmento,
  type MailingCatalogoCampo,
  type MailingGruppoRegole,
  type MailingSegmento,
  type MailingStato,
} from '@/services/mailing-service'
import { ConfermaMailing } from './mailing-dialog'
import { MailingCostruttoreRegole, contaCondizioni, descriviRegole, regoleValide, regoleVuote } from './mailing-regole'
import { Avatar, BadgeStatoContatto, Scheletro, Vuoto } from './mailing-ui'
import { formatNumero, nomeContatto, tempoFa, useNumeroAnimato } from './mailing-utils'

const COLORI = ['#6250d6', '#15966a', '#e05a26', '#2a78d6', '#d55181', '#0f766e', '#a16207', '#64748b']

const ESEMPI_AI = [
  'Pazienti che non vengono da più di 6 mesi e non hanno visite prenotate',
  'Lead con mal di schiena arrivati negli ultimi 30 giorni che non hanno ancora prenotato',
  'Pazienti con almeno 3 visite che hanno aperto una email nell’ultimo mese',
]

type Bozza = { id: number | null; nome: string; descrizione: string; colore: string; regole: MailingGruppoRegole }

function bozzaDa(s: MailingSegmento | null): Bozza {
  return s
    ? { id: s.id, nome: s.nome, descrizione: s.descrizione ?? '', colore: s.colore ?? COLORI[0], regole: s.regole ?? regoleVuote() }
    : { id: null, nome: '', descrizione: '', colore: COLORI[0], regole: regoleVuote() }
}

export function MailingSegmenti({
  stato,
  segmenti,
  onSegmentiCambiati,
  onVediContatti,
  onApriContatto,
}: {
  stato: MailingStato
  segmenti: MailingSegmento[]
  onSegmentiCambiati: (s: MailingSegmento[]) => void
  onVediContatti: (id: number) => void
  onApriContatto: (id: number) => void
}) {
  const [catalogo, setCatalogo] = useState<MailingCatalogoCampo[] | null>(null)
  const [bozza, setBozza] = useState<Bozza | null>(null)
  const [originale, setOriginale] = useState<string>('')
  const [salvando, setSalvando] = useState(false)
  const [elimina, setElimina] = useState(false)

  useEffect(() => {
    mailingService
      .catalogoSegmenti()
      .then(setCatalogo)
      .catch((err) => {
        setCatalogo([])
        toast.error(messaggioErroreMailing(err, 'Catalogo dei campi non disponibile'))
      })
  }, [])

  const apri = (s: MailingSegmento | null) => {
    const b = bozzaDa(s)
    setBozza(b)
    setOriginale(JSON.stringify(b))
  }

  const modificato = bozza ? JSON.stringify(bozza) !== originale : false
  const valido = !!bozza && bozza.nome.trim().length > 0 && !!catalogo && regoleValide(bozza.regole, catalogo)

  const salva = async () => {
    if (!bozza || !valido) return
    setSalvando(true)
    const input = { nome: bozza.nome.trim(), descrizione: bozza.descrizione.trim() || null, colore: bozza.colore, regole: bozza.regole }
    try {
      const s = bozza.id ? await mailingService.aggiornaSegmento(bozza.id, input) : await mailingService.creaSegmento(input)
      onSegmentiCambiati(bozza.id ? segmenti.map((x) => (x.id === s.id ? s : x)) : [...segmenti, s])
      apri(s)
      toast.success(bozza.id ? 'Segmento aggiornato' : 'Segmento creato')
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Segmento non salvato'))
    } finally {
      setSalvando(false)
    }
  }

  const eliminaSegmento = async () => {
    if (!bozza?.id) return
    try {
      await mailingService.eliminaSegmento(bozza.id)
      onSegmentiCambiati(segmenti.filter((s) => s.id !== bozza.id))
      setBozza(null)
      toast.success('Segmento eliminato')
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Segmento non eliminato'))
      return false
    }
  }

  return (
    <div className="ml-segmenti">
      <aside className="ml-segmenti-elenco" aria-label="Segmenti salvati">
        <button type="button" className="ml-segmento-nuovo" onClick={() => apri(null)} data-attivo={bozza && bozza.id == null ? '' : undefined}>
          <Plus className="size-4" aria-hidden /> Nuovo segmento
        </button>
        {segmenti.length === 0 ? (
          <p className="ml-vuoto-riga">Ancora nessun segmento salvato.</p>
        ) : (
          <ul className="ml-segmenti-lista">
            {segmenti.map((s) => (
              <li key={s.id}>
                <button type="button" className="ml-segmento" data-attivo={bozza?.id === s.id ? '' : undefined} onClick={() => apri(s)} style={{ ['--ml-seg-colore' as string]: s.colore ?? COLORI[0] }}>
                  <span className="ml-segmento-colore" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="ml-riga-titolo">{s.nome}</span>
                    <span className="ml-riga-sotto">{catalogo ? descriviRegole(s.regole, catalogo) : s.descrizione ?? ''}</span>
                  </span>
                  <span className="ml-segmento-conta" title={s.contatoIl ? `Contati ${tempoFa(s.contatoIl)}` : undefined}>
                    {s.ultimoConteggio != null ? formatNumero(s.ultimoConteggio) : '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="ml-segmenti-editor">
        {!bozza ? (
          <section className="ml-card">
            <Vuoto
              icona={<Layers />}
              titolo="Gruppi di persone, sempre aggiornati"
              testo="Un segmento è una regola, non un elenco: «pazienti con lombalgia che non vengono da 6 mesi» si aggiorna da solo ogni giorno, con i dati veri del gestionale."
              azioni={
                <button type="button" className="ml-btn ml-btn--pieno" onClick={() => apri(null)}>
                  <Plus className="size-4" aria-hidden /> Crea un segmento
                </button>
              }
            />
          </section>
        ) : (
          <EditorSegmento
            key={bozza.id ?? 'nuovo'}
            bozza={bozza}
            setBozza={setBozza}
            catalogo={catalogo}
            aiDisponibile={stato.aiDisponibile}
            modificato={modificato}
            valido={valido}
            salvando={salvando}
            onSalva={() => void salva()}
            onElimina={() => setElimina(true)}
            onVediContatti={onVediContatti}
            onApriContatto={onApriContatto}
          />
        )}
      </div>

      <ConfermaMailing
        open={elimina}
        onOpenChange={setElimina}
        icona={<Trash2 className="size-5" aria-hidden />}
        titolo="Eliminare il segmento?"
        testo={`«${bozza?.nome ?? ''}» sparirà dall’elenco. I contatti restano dove sono; le campagne già inviate non cambiano.`}
        conferma="Elimina"
        pericolo
        onConferma={eliminaSegmento}
      />
    </div>
  )
}

function EditorSegmento({
  bozza,
  setBozza,
  catalogo,
  aiDisponibile,
  modificato,
  valido,
  salvando,
  onSalva,
  onElimina,
  onVediContatti,
  onApriContatto,
}: {
  bozza: Bozza
  setBozza: (b: Bozza) => void
  catalogo: MailingCatalogoCampo[] | null
  aiDisponibile: boolean
  modificato: boolean
  valido: boolean
  salvando: boolean
  onSalva: () => void
  onElimina: () => void
  onVediContatti: (id: number) => void
  onApriContatto: (id: number) => void
}) {
  const [anteprima, setAnteprima] = useState<MailingAnteprimaSegmento | null>(null)
  const [contando, setContando] = useState(false)
  const [erroreConteggio, setErroreConteggio] = useState<string | null>(null)
  const [descrizioneAi, setDescrizioneAi] = useState('')
  const [aiInCorso, setAiInCorso] = useState(false)
  const [spiegazione, setSpiegazione] = useState<string | null>(null)
  const chiaveRegole = JSON.stringify(bozza.regole)
  const regoleComplete = !!catalogo && regoleValide(bozza.regole, catalogo)

  // Conteggio live: 400 ms dopo l'ultima modifica, annullando la richiesta precedente.
  const controllore = useRef<AbortController | null>(null)
  useEffect(() => {
    if (!catalogo || !regoleComplete) return
    const id = window.setTimeout(() => {
      controllore.current?.abort()
      const c = new AbortController()
      controllore.current = c
      setContando(true)
      mailingService
        .anteprimaSegmento(JSON.parse(chiaveRegole) as MailingGruppoRegole, c.signal)
        .then((a) => {
          if (c.signal.aborted) return
          setAnteprima(a)
          setErroreConteggio(null)
        })
        .catch((err) => {
          if (c.signal.aborted) return
          setErroreConteggio(messaggioErroreMailing(err, 'Conteggio non disponibile'))
        })
        .finally(() => {
          if (!c.signal.aborted) setContando(false)
        })
    }, 400)
    return () => window.clearTimeout(id)
  }, [chiaveRegole, catalogo, regoleComplete])
  useEffect(() => () => controllore.current?.abort(), [])

  const chiediAi = async () => {
    const testo = descrizioneAi.trim()
    if (!testo) return
    setAiInCorso(true)
    try {
      const r = await mailingService.aiSegmento(testo)
      setBozza({ ...bozza, regole: r.regole, nome: bozza.nome || testo.slice(0, 60), descrizione: bozza.descrizione || testo })
      setSpiegazione(r.spiegazione)
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Non sono riuscito a tradurre la frase in regole'))
    } finally {
      setAiInCorso(false)
    }
  }

  const totaleAnimato = useNumeroAnimato(anteprima?.totale ?? null)
  const iscrittiAnimati = useNumeroAnimato(anteprima?.iscritti ?? null)
  const frase = useMemo(() => (catalogo ? descriviRegole(bozza.regole, catalogo) : ''), [bozza.regole, catalogo])

  return (
    <div className="ml-segmento-editor">
      <section className="ml-card ml-segmento-principale">
        <div className="ml-segmento-intestazione">
          <div className="ml-colori" role="radiogroup" aria-label="Colore">
            {COLORI.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={bozza.colore === c}
                aria-label={`Colore ${c}`}
                className="ml-colore"
                style={{ background: c }}
                data-scelto={bozza.colore === c ? '' : undefined}
                onClick={() => setBozza({ ...bozza, colore: c })}
              />
            ))}
          </div>
          <label className="sr-only" htmlFor="ml-segmento-nome">Nome del segmento</label>
          <input id="ml-segmento-nome" className="ml-segmento-nome" value={bozza.nome} onChange={(e) => setBozza({ ...bozza, nome: e.target.value })} placeholder="Dai un nome al segmento" maxLength={120} />
          <label className="sr-only" htmlFor="ml-segmento-descr">Descrizione</label>
          <input id="ml-segmento-descr" className="ml-segmento-descr" value={bozza.descrizione} onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })} placeholder="A cosa serve (facoltativo)" maxLength={300} />
        </div>

        {aiDisponibile ? (
          <div className="ml-ai-box">
            <div className="ml-ai-box-testa">
              <span className="ml-ai-icona" aria-hidden>
                <Wand2 className="size-4" />
              </span>
              <div>
                <div className="ml-ai-titolo">Descrivilo a parole</div>
                <div className="ml-ai-sotto">Scrivi chi vuoi raggiungere: l’AI costruisce le regole, tu controlli e salvi.</div>
              </div>
            </div>
            <div className="ml-ai-riga">
              <label className="sr-only" htmlFor="ml-ai-segmento">Descrizione del pubblico</label>
              <textarea
                id="ml-ai-segmento"
                className="ml-textarea ml-ai-input"
                rows={2}
                value={descrizioneAi}
                onChange={(e) => setDescrizioneAi(e.target.value)}
                placeholder="Es. lead arrivati da YouTube che hanno fatto la chiamata conoscitiva ma non hanno acquistato"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void chiediAi()
                }}
              />
              <button type="button" className="ml-btn ml-btn--ai" onClick={() => void chiediAi()} disabled={!descrizioneAi.trim() || aiInCorso}>
                {aiInCorso ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
                {aiInCorso ? 'Ci penso…' : 'Crea le regole'}
              </button>
            </div>
            {!descrizioneAi && contaCondizioni(bozza.regole) === 0 ? (
              <div className="ml-ai-esempi">
                {ESEMPI_AI.map((e) => (
                  <button key={e} type="button" className="ml-chip" onClick={() => setDescrizioneAi(e)}>
                    {e}
                  </button>
                ))}
              </div>
            ) : null}
            {spiegazione ? (
              <div className="ml-ai-spiegazione" role="status">
                <Sparkles className="size-3.5" aria-hidden /> {spiegazione}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="ml-segmento-frase" aria-live="polite">
          {frase}
        </div>

        {catalogo == null ? (
          <Scheletro altezza={120} />
        ) : (
          <MailingCostruttoreRegole valore={bozza.regole} onChange={(r) => setBozza({ ...bozza, regole: r })} catalogo={catalogo} />
        )}

        <div className="ml-segmento-piede">
          {bozza.id ? (
            <button type="button" className="ml-btn ml-btn--ghost ml-btn--sm" onClick={onElimina}>
              <Trash2 className="size-3.5" aria-hidden /> Elimina
            </button>
          ) : (
            <span />
          )}
          <div className="ml-azioni-riga">
            {!valido && bozza.nome.trim() === '' ? <span className="ml-muto text-xs">Serve un nome</span> : null}
            {catalogo && !regoleComplete ? <span className="ml-muto text-xs">Completa le condizioni evidenziate</span> : null}
            <button type="button" className="ml-btn ml-btn--pieno" onClick={onSalva} disabled={!valido || salvando || (!modificato && bozza.id != null)}>
              {salvando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              {bozza.id ? (modificato ? 'Salva le modifiche' : 'Salvato') : 'Salva segmento'}
            </button>
          </div>
        </div>
      </section>

      <aside className="ml-card ml-conteggio" aria-live="polite" aria-busy={contando}>
        <div className="ml-etichetta">Chi ci rientra adesso</div>
        {!regoleComplete ? (
          <p className="ml-vuoto-riga">Completa le condizioni per vedere quante persone ci rientrano.</p>
        ) : !anteprima ? (
          <>
            <Scheletro altezza={40} larghezza="60%" className="mt-3" />
            <Scheletro altezza={14} larghezza="80%" className="mt-3" />
          </>
        ) : (
          <>
            <div className="ml-conteggio-numero" data-aggiorna={contando ? '' : undefined}>
              <span className="ml-numero-grande">{formatNumero(totaleAnimato)}</span>
              {contando ? <Loader2 className="size-4 animate-spin ml-muto" aria-hidden /> : null}
            </div>
            <div className="ml-conteggio-sotto">
              contatti, di cui <strong>{formatNumero(iscrittiAnimati)}</strong> iscritti che possono ricevere email
            </div>
            <div className="ml-barra" data-tono="ok" aria-hidden>
              <span className="ml-barra-valore" style={{ width: `${anteprima.totale ? (anteprima.iscritti / anteprima.totale) * 100 : 0}%` }} />
            </div>
            {erroreConteggio ? <div className="ml-panoramica-errore mt-2">{erroreConteggio}</div> : null}
            {anteprima.campione.length ? (
              <>
                <div className="ml-etichetta mt-4">Qualche esempio</div>
                <ul className="ml-campione">
                  {anteprima.campione.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <button type="button" className="ml-campione-voce" onClick={() => onApriContatto(c.id)}>
                        <Avatar nome={nomeContatto(c)} dimensione="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="ml-riga-titolo">{nomeContatto(c)}</span>
                          <span className="ml-riga-sotto">{c.email}</span>
                        </span>
                        {c.stato !== 'ISCRITTO' ? <BadgeStatoContatto stato={c.stato} /> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="ml-vuoto-riga">Nessuno, per ora. Prova ad allargare le condizioni.</p>
            )}
            {bozza.id && !modificato ? (
              <button type="button" className="ml-btn ml-btn--sm mt-3 w-full" onClick={() => onVediContatti(bozza.id as number)}>
                <Users className="size-3.5" aria-hidden /> Vedi tutti i contatti <ArrowRight className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </>
        )}
      </aside>
    </div>
  )
}
