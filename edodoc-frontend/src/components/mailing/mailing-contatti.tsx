import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Tags,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { toast } from '@/lib/toast'
import {
  mailingService,
  messaggioErroreMailing,
  type MailingContattoRiga,
  type MailingPagina,
  type MailingSegmento,
  type MailingStato,
  type MailingStatoContatto,
  type MailingTag,
} from '@/services/mailing-service'
import { ConfermaMailing } from './mailing-dialog'
import { MailingContattoDettaglio } from './mailing-contatto-dettaglio'
import { MailingImportaCsv, MailingNuovoContatto } from './mailing-contatti-dialog'
import { MailingSegmenti } from './mailing-segmenti'
import { MailingTagGestione } from './mailing-tag-gestione'
import { Avatar, BadgeStatoContatto, BarraPunteggio, PallinoCoinvolgimento, Scheletro, TagPill, Vuoto } from './mailing-ui'
import { dataBreve, etichettaTipoContatto, formatNumero, nomeContatto, nomeTag, tempoFa } from './mailing-utils'

type Vista = 'contatti' | 'segmenti' | 'tag'

const DIMENSIONE = 25

const STATI: { valore: MailingStatoContatto | ''; etichetta: string }[] = [
  { valore: '', etichetta: 'Tutti gli stati' },
  { valore: 'ISCRITTO', etichetta: 'Iscritti' },
  { valore: 'DISISCRITTO', etichetta: 'Disiscritti' },
  { valore: 'RIMBALZATO', etichetta: 'Indirizzi non validi' },
  { valore: 'SEGNALATO_SPAM', etichetta: 'Segnalati come spam' },
  { valore: 'ARCHIVIATO', etichetta: 'Archiviati' },
]

/** Valori di `ordina` passati al backend (campo,direzione). */
const ORDINAMENTI = [
  { valore: 'creatoIl,desc', etichetta: 'Più recenti' },
  { valore: 'punteggio,desc', etichetta: 'Più coinvolti' },
  { valore: 'ultimaAperturaIl,desc', etichetta: 'Ultima apertura' },
  { valore: 'cognome,asc', etichetta: 'Cognome A–Z' },
]

export function MailingContattiTab({ stato }: { stato: MailingStato }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const contattoParam = Number(searchParams.get('contatto'))
  const contattoAperto = Number.isFinite(contattoParam) && contattoParam > 0 ? contattoParam : null
  const vistaParam = searchParams.get('vista') as Vista | null
  const vista: Vista = vistaParam === 'segmenti' || vistaParam === 'tag' ? vistaParam : 'contatti'

  const [q, setQ] = useState('')
  const [qApplicata, setQApplicata] = useState('')
  const [statoFiltro, setStatoFiltro] = useState<MailingStatoContatto | ''>('')
  const [tagId, setTagId] = useState<number | null>(null)
  const [segmentoId, setSegmentoId] = useState<number | null>(null)
  const [ordina, setOrdina] = useState(ORDINAMENTI[0].valore)
  const [pagina, setPagina] = useState(0)

  const [risultato, setRisultato] = useState<MailingPagina<MailingContattoRiga> | null>(null)
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)
  const [tag, setTag] = useState<MailingTag[]>([])
  const [segmenti, setSegmenti] = useState<MailingSegmento[]>([])

  const [importaAperto, setImportaAperto] = useState(false)
  const [nuovoAperto, setNuovoAperto] = useState(false)
  const [sincronizzaAperto, setSincronizzaAperto] = useState(false)

  const impostaParam = useCallback(
    (chiave: string, valore: string | null) =>
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (valore == null) p.delete(chiave)
          else p.set(chiave, valore)
          return p
        },
        { replace: true },
      ),
    [setSearchParams],
  )
  const apriContatto = (id: number | null) => impostaParam('contatto', id ? String(id) : null)
  const cambiaVista = (v: Vista) => impostaParam('vista', v === 'contatti' ? null : v)

  const caricaListe = useCallback(async () => {
    const [t, s] = await Promise.allSettled([mailingService.tag(), mailingService.segmenti()])
    if (t.status === 'fulfilled') setTag(t.value)
    if (s.status === 'fulfilled') setSegmenti(s.value)
  }, [])

  useEffect(() => {
    void caricaListe()
  }, [caricaListe])

  // Ricerca con debounce: si interroga il server solo quando si smette di scrivere.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setQApplicata(q.trim())
      setPagina(0)
    }, 300)
    return () => window.clearTimeout(id)
  }, [q])

  const richiesta = useRef(0)
  const carica = useCallback(async () => {
    const n = ++richiesta.current
    setCaricamento(true)
    try {
      const r = await mailingService.contatti({
        q: qApplicata || undefined,
        stato: statoFiltro || undefined,
        tagId: tagId ?? undefined,
        segmentoId: segmentoId ?? undefined,
        pagina,
        dimensione: DIMENSIONE,
        ordina,
      })
      if (n !== richiesta.current) return
      setRisultato(r)
      setErrore(null)
    } catch (err) {
      if (n === richiesta.current) setErrore(messaggioErroreMailing(err, 'Contatti non disponibili'))
    } finally {
      if (n === richiesta.current) setCaricamento(false)
    }
  }, [qApplicata, statoFiltro, tagId, segmentoId, pagina, ordina])

  useEffect(() => {
    if (vista === 'contatti') void carica()
  }, [carica, vista])

  const filtriAttivi = !!(qApplicata || statoFiltro || tagId || segmentoId)
  const azzeraFiltri = () => {
    setQ('')
    setStatoFiltro('')
    setTagId(null)
    setSegmentoId(null)
    setPagina(0)
  }

  const sincronizza = async () => {
    try {
      const e = await mailingService.sincronizza()
      toast.success('Contatti allineati al gestionale', {
        description: `${formatNumero(e.pazienti)} pazienti e ${formatNumero(e.lead)} lead controllati · ${formatNumero(e.creati)} nuovi · ${formatNumero(e.aggiornati)} aggiornati · ${formatNumero(e.archiviati)} archiviati`,
      })
      void carica()
      void caricaListe()
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Sincronizzazione non riuscita'))
      return false
    }
  }

  const totalePagine = risultato ? Math.max(1, Math.ceil(risultato.totale / (risultato.dimensione || DIMENSIONE))) : 1
  const segmentoAttivo = useMemo(() => segmenti.find((s) => s.id === segmentoId) ?? null, [segmenti, segmentoId])

  return (
    <div className="ml-contatti">
      <div className="ml-contatti-barra">
        <div className="ml-seg" role="tablist" aria-label="Vista">
          <button type="button" role="tab" aria-selected={vista === 'contatti'} data-active={vista === 'contatti' ? '' : undefined} onClick={() => cambiaVista('contatti')}>
            <Users className="size-3.5" aria-hidden /> Contatti
          </button>
          <button type="button" role="tab" aria-selected={vista === 'segmenti'} data-active={vista === 'segmenti' ? '' : undefined} onClick={() => cambiaVista('segmenti')}>
            <Layers className="size-3.5" aria-hidden /> Segmenti
            {segmenti.length ? <span className="ml-seg-conta">{segmenti.length}</span> : null}
          </button>
          <button type="button" role="tab" aria-selected={vista === 'tag'} data-active={vista === 'tag' ? '' : undefined} onClick={() => cambiaVista('tag')}>
            <Tags className="size-3.5" aria-hidden /> Tag
          </button>
        </div>
        <div className="ml-contatti-azioni">
          <button type="button" className="ml-btn ml-btn--sm" onClick={() => setSincronizzaAperto(true)} title="Crea o aggiorna i contatti a partire da pazienti e lead del gestionale">
            <RefreshCw className="size-3.5" aria-hidden /> Sincronizza con pazienti e lead
          </button>
          <button type="button" className="ml-btn ml-btn--sm" onClick={() => setImportaAperto(true)}>
            <Upload className="size-3.5" aria-hidden /> Importa CSV
          </button>
          <button type="button" className="ml-btn ml-btn--sm ml-btn--pieno" onClick={() => setNuovoAperto(true)}>
            <UserPlus className="size-3.5" aria-hidden /> Aggiungi
          </button>
        </div>
      </div>

      {vista === 'segmenti' ? (
        <MailingSegmenti
          stato={stato}
          segmenti={segmenti}
          onSegmentiCambiati={(s) => setSegmenti(s)}
          onVediContatti={(id) => {
            azzeraFiltri()
            setSegmentoId(id)
            cambiaVista('contatti')
          }}
          onApriContatto={apriContatto}
        />
      ) : vista === 'tag' ? (
        <MailingTagGestione
          tag={tag}
          onTagCambiati={setTag}
          onVediContatti={(id) => {
            azzeraFiltri()
            setTagId(id)
            cambiaVista('contatti')
          }}
        />
      ) : (
        <section className="ml-card ml-card--tabella">
          <div className="ml-filtri" role="search">
            <label className="ml-cerca">
              <Search className="size-4" aria-hidden />
              <span className="sr-only">Cerca contatti</span>
              <input className="ml-cerca-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome o email…" type="search" />
              {q ? (
                <button type="button" onClick={() => setQ('')} aria-label="Svuota la ricerca">
                  <X className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </label>
            <label className="sr-only" htmlFor="ml-filtro-stato">Stato</label>
            <select id="ml-filtro-stato" className="ml-select" value={statoFiltro} onChange={(e) => { setStatoFiltro(e.target.value as MailingStatoContatto | ''); setPagina(0) }}>
              {STATI.map((s) => (
                <option key={s.valore} value={s.valore}>
                  {s.etichetta}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="ml-filtro-tag">Tag</label>
            <select id="ml-filtro-tag" className="ml-select" value={tagId ?? ''} onChange={(e) => { setTagId(e.target.value ? Number(e.target.value) : null); setPagina(0) }}>
              <option value="">Tutti i tag</option>
              {tag.map((t) => (
                <option key={t.id} value={t.id}>
                  {nomeTag(t)}
                  {t.contatti != null ? ` (${formatNumero(t.contatti)})` : ''}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="ml-filtro-segmento">Segmento</label>
            <select id="ml-filtro-segmento" className="ml-select" value={segmentoId ?? ''} onChange={(e) => { setSegmentoId(e.target.value ? Number(e.target.value) : null); setPagina(0) }}>
              <option value="">Tutti i segmenti</option>
              {segmenti.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="ml-ordina">Ordina</label>
            <select id="ml-ordina" className="ml-select ml-filtri-ordina" value={ordina} onChange={(e) => { setOrdina(e.target.value); setPagina(0) }}>
              {ORDINAMENTI.map((o) => (
                <option key={o.valore} value={o.valore}>
                  {o.etichetta}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-filtri-riepilogo">
            <span>
              {risultato ? (
                <>
                  <strong>{formatNumero(risultato.totale)}</strong> {risultato.totale === 1 ? 'contatto' : 'contatti'}
                  {segmentoAttivo ? <> nel segmento «{segmentoAttivo.nome}»</> : null}
                </>
              ) : (
                'Carico…'
              )}
              {caricamento && risultato ? <Loader2 className="ml-2 inline size-3.5 animate-spin align-[-2px]" aria-hidden /> : null}
            </span>
            {filtriAttivi ? (
              <button type="button" className="ml-link" onClick={azzeraFiltri}>
                <Filter className="size-3.5" aria-hidden /> Togli i filtri
              </button>
            ) : null}
          </div>

          {errore ? (
            <div className="ml-avviso" data-tono="errore" role="alert">
              {errore}
            </div>
          ) : null}

          {!risultato ? (
            <TabellaScheletro />
          ) : risultato.elementi.length === 0 ? (
            filtriAttivi ? (
              <Vuoto icona={<Search />} titolo="Nessun contatto con questi filtri" testo="Prova a togliere un filtro o a cercare in un altro modo." azioni={<button type="button" className="ml-btn ml-btn--sm" onClick={azzeraFiltri}>Togli i filtri</button>} />
            ) : (
              <Vuoto
                icona={<Users />}
                titolo="La lista è vuota"
                testo="I contatti sono i pazienti e i lead del gestionale: sincronizzali con un clic, oppure importa una lista da un file CSV."
                azioni={
                  <>
                    <button type="button" className="ml-btn ml-btn--pieno" onClick={() => setSincronizzaAperto(true)}>
                      <RefreshCw className="size-4" aria-hidden /> Sincronizza pazienti e lead
                    </button>
                    <button type="button" className="ml-btn" onClick={() => setImportaAperto(true)}>
                      <Upload className="size-4" aria-hidden /> Importa CSV
                    </button>
                  </>
                }
              />
            )
          ) : (
            <div className="ml-tabella-scorri" data-caricamento={caricamento ? '' : undefined}>
              <table className="ml-tabella ml-tabella-contatti">
                <thead>
                  <tr>
                    <th scope="col">Contatto</th>
                    <th scope="col">Stato</th>
                    <th scope="col">Tag</th>
                    <th scope="col">Punteggio</th>
                    <th scope="col">Ultima apertura</th>
                    <th scope="col">Nella lista dal</th>
                  </tr>
                </thead>
                <tbody>
                  {risultato.elementi.map((c) => (
                    <tr
                      key={c.id}
                      data-cliccabile=""
                      data-selezionata={contattoAperto === c.id ? '' : undefined}
                      onClick={() => apriContatto(c.id)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          apriContatto(c.id)
                        }
                      }}
                      aria-label={`Apri ${nomeContatto(c)}`}
                    >
                      <td data-etichetta="Contatto">
                        <span className="ml-cella-contatto">
                          <Avatar nome={nomeContatto(c)} />
                          <span className="min-w-0">
                            <span className="ml-cella-nome">
                              {nomeContatto(c)}
                              <span className="ml-tipo" data-tipo={c.tipo}>
                                {etichettaTipoContatto(c.tipo)}
                              </span>
                            </span>
                            <span className="ml-cella-email">{c.email}</span>
                          </span>
                        </span>
                      </td>
                      <td data-etichetta="Stato">
                        <BadgeStatoContatto stato={c.stato} />
                      </td>
                      <td data-etichetta="Tag">
                        <span className="ml-cella-tag">
                          {c.tag.slice(0, 3).map((t) => (
                            <TagPill key={t.id} tag={t} />
                          ))}
                          {c.tag.length > 3 ? <span className="ml-chip" title={c.tag.slice(3).map((t) => t.nome).join(', ')}>+{c.tag.length - 3}</span> : null}
                          {c.tag.length === 0 ? <span className="ml-muto">—</span> : null}
                        </span>
                      </td>
                      <td data-etichetta="Punteggio">
                        <span className="ml-cella-punteggio">
                          <PallinoCoinvolgimento valore={c.coinvolgimento} />
                          <BarraPunteggio valore={c.punteggio} />
                        </span>
                      </td>
                      <td data-etichetta="Ultima apertura" className="ml-muto">
                        {c.ultimaAperturaIl ? tempoFa(c.ultimaAperturaIl) : 'Mai'}
                      </td>
                      <td data-etichetta="Nella lista dal" className="ml-muto">
                        {dataBreve(c.creatoIl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {risultato && risultato.totale > DIMENSIONE ? (
            <nav className="ml-paginazione" aria-label="Pagine">
              <button type="button" className="ml-btn ml-btn--sm ml-btn--icona" disabled={pagina === 0} onClick={() => setPagina((p) => Math.max(0, p - 1))} aria-label="Pagina precedente">
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <span>
                Pagina <strong>{pagina + 1}</strong> di {formatNumero(totalePagine)}
              </span>
              <button type="button" className="ml-btn ml-btn--sm ml-btn--icona" disabled={pagina + 1 >= totalePagine} onClick={() => setPagina((p) => p + 1)} aria-label="Pagina successiva">
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </nav>
          ) : null}
        </section>
      )}

      <MailingContattoDettaglio
        contattoId={contattoAperto}
        tuttiTag={tag}
        onChiudi={() => apriContatto(null)}
        onCambiato={(riga) => {
          setRisultato((r) => (r ? { ...r, elementi: r.elementi.map((x) => (x.id === riga.id ? riga : x)) } : r))
          void caricaListe()
        }}
      />

      <MailingImportaCsv
        open={importaAperto}
        onOpenChange={setImportaAperto}
        tag={tag}
        onImportato={() => {
          void carica()
          void caricaListe()
        }}
      />

      <MailingNuovoContatto
        open={nuovoAperto}
        onOpenChange={setNuovoAperto}
        onCreato={(id) => {
          void carica()
          apriContatto(id)
        }}
      />

      <ConfermaMailing
        open={sincronizzaAperto}
        onOpenChange={setSincronizzaAperto}
        icona={<RefreshCw className="size-5" aria-hidden />}
        titolo="Sincronizza con pazienti e lead"
        testo="Controllo tutti i pazienti e i lead con email: creo i contatti che mancano e aggiorno nomi e collegamenti. Chi si è disiscritto resta disiscritto, e nessuno riceve email per questo."
        conferma="Sincronizza ora"
        onConferma={sincronizza}
      />
    </div>
  )
}

function TabellaScheletro() {
  return (
    <div className="ml-tabella-scheletro" aria-busy>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="ml-tabella-scheletro-riga">
          <Scheletro altezza={36} larghezza={36} className="rounded-full" />
          <div className="flex-1">
            <Scheletro altezza={12} larghezza="40%" />
            <Scheletro altezza={10} larghezza="60%" className="mt-2" />
          </div>
          <Scheletro altezza={20} larghezza={80} />
          <Scheletro altezza={20} larghezza={120} className="max-sm:hidden" />
        </div>
      ))}
    </div>
  )
}
