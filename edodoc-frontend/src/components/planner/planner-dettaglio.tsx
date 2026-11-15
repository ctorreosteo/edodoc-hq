import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import {
  Ban,
  CalendarClock,
  Check,
  Copy,
  CopyPlus,
  Download,
  ExternalLink,
  Eye,
  Heart,
  History,
  Loader2,
  MessageCircle,
  PenSquare,
  Repeat,
  RotateCcw,
  Send,
  Share2,
  ShieldCheck,
  ShieldX,
  Bookmark,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from '@/lib/toast'
import { INFO_CANALE, NOME_FORMATO, linkPubblicazioneManuale } from '@/lib/planner-canali'
import { quandoBreve, relativo } from '@/lib/planner-tempo'
import { linkConUtm } from '@/lib/planner-utm'
import {
  messaggioErrorePlanner,
  plannerService,
  urlMedia,
  type PlannerPost,
  type PlannerPostCanale,
  type PlannerPostDettaglio,
  type PlannerStato,
} from '@/services/planner-service'
import { Anteprima } from './planner-anteprime'
import { AvatarCanale, ChipStato, ChipStatoCanale, ChiudiFinestra, FinestraPlanner } from './planner-ui'
import { compatto } from '@/lib/planner-formato'

const MODIFICABILI = new Set(['IDEA', 'BOZZA', 'IN_APPROVAZIONE', 'PROGRAMMATO'])

const EVENTI: Record<string, string> = {
  CREATO: 'Creato',
  MODIFICATO: 'Modificato',
  SPOSTATO: 'Spostato',
  STATO: 'Spostato di colonna',
  DUPLICATO: 'Duplicato',
  APPROVATO: 'Approvato',
  RIFIUTATO: 'Modifiche richieste',
  ANNULLATO: 'Programmazione annullata',
  PUBBLICATO: 'Pubblicato',
  DA_PUBBLICARE: 'Da pubblicare a mano',
  PUBBLICATO_A_MANO: 'Pubblicato a mano',
  ERRORE: 'Errore',
  RIPROVA: 'Nuovo tentativo',
  SERIE: 'Serie creata',
}

/** Il testo da copiare per un canale a mano: col link del post in fondo, con gli UTM del canale se il post li vuole. */
function testoCanale(p: PlannerPost, c: PlannerPostCanale) {
  const t = c.testo || p.testo || ''
  if (!p.link || t.includes(p.link)) return t
  const l = linkConUtm(p.link, c.canale, c.formato, p.titolo, p.id, p.utm)
  return t ? `${t}\n\n${l}` : l
}

/** Aiuto per i canali da pubblicare a mano: copia il testo, scarica i media, apri la piattaforma, segna fatto. */
function PubblicaAMano({ post, c, urlProfilo, onFatto }: { post: PlannerPost; c: PlannerPostCanale; urlProfilo: string | null; onFatto: (p: PlannerPost) => void }) {
  const [link, setLink] = useState('')
  const [salvando, setSalvando] = useState(false)
  const testo = testoCanale(post, c)
  const copia = async () => {
    try {
      await navigator.clipboard.writeText(testo)
      toast.success('Testo copiato')
    } catch {
      toast.error('Copia non riuscita: seleziona il testo a mano.')
    }
  }
  const segna = async () => {
    setSalvando(true)
    try {
      onFatto(await plannerService.segnaPubblicato(post.id, c.id, link.trim() || null))
      toast.success(`${INFO_CANALE[c.canale].nome} segnato come pubblicato`)
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Non segnato'))
    } finally {
      setSalvando(false)
    }
  }
  return (
    <div className="pl-a-mano">
      <ol className="pl-a-mano-passi">
        <li>
          <button type="button" className="pl-btn" data-variante="mini" onClick={() => void copia()}>
            <Copy className="size-3.5" /> Copia il testo
          </button>
          {c.titolo ? (
            <button type="button" className="pl-btn" data-variante="mini-ghost" onClick={() => void navigator.clipboard.writeText(c.titolo ?? '').then(() => toast.success('Titolo copiato'))}>
              Copia il titolo
            </button>
          ) : null}
        </li>
        {post.media.length ? (
          <li className="pl-a-mano-media">
            {post.media.map((m, i) => (
              <a key={m.id} href={urlMedia(m.url)} download={m.nomeFile ?? `media-${i + 1}`} target="_blank" rel="noreferrer" className="pl-a-mano-file" title="Scarica">
                <img src={urlMedia(m.anteprimaUrl ?? m.url)} alt="" />
                <Download className="size-3" />
              </a>
            ))}
          </li>
        ) : null}
        <li>
          <a className="pl-btn" data-variante="mini" href={linkPubblicazioneManuale(c.canale, testo, urlProfilo)} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" /> Apri {INFO_CANALE[c.canale].nome}
          </a>
        </li>
        <li className="pl-a-mano-fatto">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link del post pubblicato (facoltativo)" aria-label="Link del post pubblicato" />
          <button type="button" className="pl-btn" data-variante="primario" onClick={() => void segna()} disabled={salvando}>
            {salvando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Fatto
          </button>
        </li>
      </ol>
    </div>
  )
}

export function PlannerDettaglio({
  postId,
  stato,
  generazione,
  onChiudi,
  onModifica,
  onCambiato,
}: {
  postId: number | null
  stato: PlannerStato
  generazione: number
  onChiudi: () => void
  onModifica: (p: PlannerPost) => void
  onCambiato: () => void
}) {
  const [d, setD] = useState<PlannerPostDettaglio | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [commento, setCommento] = useState('')
  const [occupato, setOccupato] = useState<string | null>(null)
  const [canaleAp, setCanaleAp] = useState(0)
  const [serie, setSerie] = useState<{ ogni: number; volte: number } | null>(null)

  const carica = useCallback(async () => {
    if (!postId) return
    try {
      setErrore(null)
      setD(await plannerService.dettaglio(postId))
    } catch (err) {
      setErrore(messaggioErrorePlanner(err, 'Post non disponibile'))
    }
  }, [postId])

  useEffect(() => {
    setD(null)
    setCanaleAp(0)
    setSerie(null)
    void carica()
  }, [carica])

  useEffect(() => {
    if (postId) void carica()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generazione])

  const azione = async (nome: string, f: () => Promise<unknown>, ok: string) => {
    setOccupato(nome)
    try {
      await f()
      toast.success(ok)
      onCambiato()
      await carica()
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Operazione non riuscita'))
    } finally {
      setOccupato(null)
    }
  }

  const p = d?.post
  const etichetta = p?.etichettaId ? stato.etichette.find((e) => e.id === p.etichettaId) : null
  const destinazione = (c: PlannerPostCanale) => stato.destinazioni.find((x) => x.canale === c.canale && x.account === c.account)
  const cAp = p?.canali[Math.min(canaleAp, (p?.canali.length ?? 1) - 1)]

  return (
    <FinestraPlanner aperta={postId != null} onChiudi={onChiudi} titolo={p?.titolo ?? 'Post'} variante="laterale">
      <div className="pl-dettaglio">
        <div className="pl-finestra-testa">
          <div className="pl-dettaglio-titoli">
            {p ? (
              <>
                <div className="pl-dettaglio-chip">
                  <ChipStato stato={p.stato} />
                  {etichetta ? (
                    <span className="pl-rubrica" data-on="" style={{ '--pl-r': etichetta.colore } as CSSProperties}>
                      <span className="pl-rubrica-dot" />
                      {etichetta.nome}
                    </span>
                  ) : null}
                </div>
                <div className="pl-finestra-titolo">{p.titolo || 'Post senza titolo'}</div>
                <div className="pl-sezione-nota">
                  <CalendarClock className="inline size-3.5" /> {quandoBreve(p.pubblicatoIl ?? p.programmatoAlle)}
                  {p.programmatoAlle && p.stato === 'PROGRAMMATO' ? ` · ${relativo(p.programmatoAlle)}` : ''}
                  {p.responsabileNome ? ` · responsabile ${p.responsabileNome}` : p.creatoDaNome ? ` · di ${p.creatoDaNome}` : ''}
                </div>
              </>
            ) : (
              <div className="pl-finestra-titolo">{errore ?? 'Carico…'}</div>
            )}
          </div>
          <ChiudiFinestra onClick={onChiudi} />
        </div>

        {p ? (
          <div className="pl-finestra-corpo">
            {/* Azioni */}
            <div className="pl-dettaglio-azioni">
              {MODIFICABILI.has(p.stato) ? (
                <button type="button" className="pl-btn" data-variante="primario" onClick={() => onModifica(p)}>
                  <PenSquare className="size-4" /> Modifica
                </button>
              ) : null}
              {p.stato === 'IN_APPROVAZIONE' && stato.puoApprovare ? (
                <>
                  <button type="button" className="pl-btn" data-variante="ok" disabled={!!occupato} onClick={() => void azione('approva', () => plannerService.approva(p.id), 'Post approvato')}>
                    {occupato === 'approva' ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Approva
                  </button>
                  <button
                    type="button"
                    className="pl-btn"
                    data-variante="secondario"
                    disabled={!!occupato}
                    onClick={() => {
                      const motivo = window.prompt('Cosa va cambiato? Lo legge chi ha scritto il post.')
                      if (motivo != null) void azione('rifiuta', () => plannerService.rifiuta(p.id, motivo), 'Richiesta inviata')
                    }}
                  >
                    <ShieldX className="size-4" /> Chiedi modifiche
                  </button>
                </>
              ) : null}
              {p.stato === 'ERRORE' || p.stato === 'PARZIALE' ? (
                <button type="button" className="pl-btn" data-variante="primario" disabled={!!occupato} onClick={() => void azione('riprova', () => plannerService.riprova(p.id), 'Nuovo tentativo avviato')}>
                  {occupato === 'riprova' ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Riprova i canali in errore
                </button>
              ) : null}
              {p.stato === 'PROGRAMMATO' || p.stato === 'IN_APPROVAZIONE' ? (
                <button type="button" className="pl-btn" data-variante="secondario" disabled={!!occupato} onClick={() => void azione('annulla', () => plannerService.annulla(p.id), 'Torna fra le bozze')}>
                  <Ban className="size-4" /> Annulla programmazione
                </button>
              ) : null}
              {p.programmatoAlle ? (
                <button type="button" className="pl-btn" data-variante="ghost" disabled={!!occupato} onClick={() => setSerie(serie ? null : { ogni: 7, volte: 4 })} aria-expanded={!!serie} title="Ripeti il post a intervalli regolari (una rubrica fissa)">
                  <Repeat className="size-4" /> Ripeti
                </button>
              ) : null}
              <button type="button" className="pl-btn" data-variante="ghost" disabled={!!occupato} onClick={() => void azione('duplica', () => plannerService.duplica(p.id), 'Copia creata fra le bozze')} title="Riusa il post (anche per ripubblicarlo)">
                <CopyPlus className="size-4" /> Duplica
              </button>
              <button
                type="button"
                className="pl-btn"
                data-variante="pericolo"
                disabled={!!occupato || p.stato === 'IN_PUBBLICAZIONE'}
                onClick={() => {
                  const uscito = ['PUBBLICATO', 'DA_COMPLETARE', 'PARZIALE'].includes(p.stato)
                  if (!window.confirm(uscito ? 'Togliere il post dal Planner? Sulle piattaforme resta: lì si cancella a mano.' : 'Eliminare il post?')) return
                  void azione('elimina', () => plannerService.elimina(p.id), 'Post eliminato').then(onChiudi)
                }}
              >
                <Trash2 className="size-4" />
              </button>
            </div>

            {serie ? (
              <form
                className="pl-serie"
                onSubmit={(e) => {
                  e.preventDefault()
                  void azione('ripeti', () => plannerService.ripeti(p.id, serie.ogni, serie.volte), `${serie.volte} ${serie.volte === 1 ? 'uscita aggiunta' : 'uscite aggiunte'} nel calendario`).then(() => setSerie(null))
                }}
              >
                <Repeat className="size-4" />
                <span>Ripeti</span>
                <select value={serie.ogni} onChange={(e) => setSerie({ ...serie, ogni: Number(e.target.value) })} aria-label="Ogni quanto">
                  <option value={1}>ogni giorno</option>
                  <option value={7}>ogni settimana</option>
                  <option value={14}>ogni 2 settimane</option>
                  <option value={28}>ogni 4 settimane</option>
                </select>
                <span>per altre</span>
                <input type="number" min={1} max={26} value={serie.volte} onChange={(e) => setSerie({ ...serie, volte: Math.max(1, Math.min(26, Number(e.target.value) || 1)) })} aria-label="Quante volte" />
                <span>volte</span>
                <button type="submit" className="pl-btn" data-variante="primario" disabled={occupato === 'ripeti'}>
                  {occupato === 'ripeti' ? <Loader2 className="size-4 animate-spin" /> : null} Crea la serie
                </button>
                <em>{p.stato === 'PROGRAMMATO' ? 'Le uscite nascono programmate, alla stessa ora.' : 'Le uscite nascono bozze, alla stessa ora.'}</em>
              </form>
            ) : null}

            {p.motivoRifiuto ? (
              <div className="pl-banner" data-tono="danger">
                <ShieldX className="size-4" /> <span><b>Da rivedere:</b> {p.motivoRifiuto}</span>
              </div>
            ) : null}

            {/* Canali */}
            <section className="pl-sezione">
              <div className="pl-sezione-testa">
                <span className="pl-sezione-titolo">Canali</span>
              </div>
              {p.canali.length === 0 ? <div className="pl-sezione-nota">Nessun canale scelto.</div> : null}
              <div className="pl-canali-dettaglio">
                {p.canali.map((c) => {
                  const dest = destinazione(c)
                  const m = c.metriche
                  return (
                    <div key={c.id} className="pl-canale-riga" data-stato={c.stato} style={{ '--pl-c': INFO_CANALE[c.canale].colore } as CSSProperties}>
                      <div className="pl-canale-riga-testa">
                        <AvatarCanale canale={c.canale} immagine={dest?.immagine} nome={c.accountNome} />
                        <div className="pl-canale-riga-testi">
                          <b>{c.accountNome ?? INFO_CANALE[c.canale].nome}</b>
                          <span>
                            {NOME_FORMATO[c.formato]} · {c.modalita === 'AUTOMATICA' ? 'automatico' : 'a mano'}
                            {c.pubblicatoIl ? ` · ${quandoBreve(c.pubblicatoIl)}` : ''}
                            {c.pubblicatoDaNome ? ` da ${c.pubblicatoDaNome}` : ''}
                          </span>
                        </div>
                        <ChipStatoCanale stato={c.stato} />
                        {c.linkEsterno ? (
                          <a className="pl-icon-btn" href={c.linkEsterno} target="_blank" rel="noreferrer" title="Apri il post">
                            <ExternalLink className="size-4" />
                          </a>
                        ) : null}
                      </div>
                      {c.errore ? <div className="pl-canale-errore">{c.errore}</div> : null}
                      {m ? (
                        <div className="pl-metriche">
                          {m.visualizzazioni != null ? <span title="Visualizzazioni"><Eye className="size-3.5" /> {compatto(m.visualizzazioni)}</span> : null}
                          {m.copertura != null ? <span title="Account raggiunti"><Users className="size-3.5" /> {compatto(m.copertura)}</span> : null}
                          {m.miPiace != null ? <span title="Mi piace"><Heart className="size-3.5" /> {compatto(m.miPiace)}</span> : null}
                          {m.commenti != null ? <span title="Commenti"><MessageCircle className="size-3.5" /> {compatto(m.commenti)}</span> : null}
                          {m.condivisioni != null ? <span title="Condivisioni"><Share2 className="size-3.5" /> {compatto(m.condivisioni)}</span> : null}
                          {m.salvataggi != null ? <span title="Salvataggi"><Bookmark className="size-3.5" /> {compatto(m.salvataggi)}</span> : null}
                          {m.aggiornateIl ? <em>{relativo(m.aggiornateIl)}</em> : null}
                        </div>
                      ) : null}
                      {c.stato === 'DA_PUBBLICARE' || (c.modalita === 'MANUALE' && c.stato !== 'PUBBLICATO' && !MODIFICABILI.has(p.stato)) || c.stato === 'ERRORE' ? (
                        <PubblicaAMano
                          post={p}
                          c={c}
                          urlProfilo={dest?.urlProfilo ?? null}
                          onFatto={() => {
                            onCambiato()
                            void carica()
                          }}
                        />
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Anteprima */}
            {cAp ? (
              <section className="pl-sezione">
                <div className="pl-sezione-testa">
                  <span className="pl-sezione-titolo">Anteprima</span>
                  {p.canali.length > 1 ? (
                    <div className="pl-seg">
                      {p.canali.map((c, i) => (
                        <button key={c.id} type="button" data-on={c.id === cAp.id ? '' : undefined} onClick={() => setCanaleAp(i)} title={c.accountNome ?? ''}>
                          {INFO_CANALE[c.canale].nome}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="pl-ap-palco pl-ap-palco--piccolo">
                  <Anteprima
                    d={{
                      canale: cAp.canale,
                      formato: cAp.formato,
                      testo: cAp.testo || p.testo || '',
                      titolo: cAp.titolo ?? '',
                      media: p.media,
                      nome: cAp.accountNome ?? INFO_CANALE[cAp.canale].nome,
                      immagine: destinazione(cAp)?.immagine ?? null,
                      link: p.link ?? '',
                      primoCommento: p.primoCommento ?? '',
                      opzioni: cAp.opzioni ?? {},
                    }}
                  />
                </div>
              </section>
            ) : null}

            {p.note ? (
              <section className="pl-sezione">
                <div className="pl-sezione-titolo">Note per il team</div>
                <p className="pl-note">{p.note}</p>
              </section>
            ) : null}

            {/* Commenti del team */}
            <section className="pl-sezione">
              <div className="pl-sezione-testa">
                <span className="pl-sezione-titolo">Commenti del team</span>
                <span className="pl-sezione-nota">Non si pubblicano</span>
              </div>
              <div className="pl-commenti">
                {d.commenti.length === 0 ? <div className="pl-sezione-nota">Nessun commento: chiedi un parere o lascia un'indicazione.</div> : null}
                {d.commenti.map((c) => (
                  <div key={c.id} className="pl-commento">
                    <b>{c.utenteNome ?? 'Qualcuno'}</b>
                    <em>{relativo(c.creatoIl)}</em>
                    <p>{c.testo}</p>
                    <button
                      type="button"
                      className="pl-commento-elimina"
                      onClick={() => void azione('commento-x', () => plannerService.eliminaCommento(p.id, c.id), 'Commento eliminato')}
                      aria-label="Elimina commento"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
              <form
                className="pl-commento-nuovo"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!commento.trim()) return
                  void azione('commento', () => plannerService.commenta(p.id, commento.trim()), 'Commento aggiunto').then(() => setCommento(''))
                }}
              >
                <input value={commento} onChange={(e) => setCommento(e.target.value)} placeholder="Scrivi un commento…" aria-label="Nuovo commento" />
                <button type="submit" className="pl-icon-btn" disabled={!commento.trim() || occupato === 'commento'} aria-label="Invia commento">
                  {occupato === 'commento' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </button>
              </form>
            </section>

            {/* Cronologia */}
            <section className="pl-sezione">
              <div className="pl-sezione-testa">
                <span className="pl-sezione-titolo">
                  <History className="inline size-4" /> Cronologia
                </span>
              </div>
              <ol className="pl-cronologia">
                {d.storico.map((s) => (
                  <li key={s.id} data-evento={s.evento}>
                    <b>{EVENTI[s.evento] ?? s.evento}</b>
                    {s.dettaglio ? <span> · {s.dettaglio}</span> : null}
                    <em>
                      {s.utenteNome ?? 'Planner'} · {quandoBreve(s.creatoIl)}
                    </em>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        ) : errore ? (
          <div className="pl-finestra-corpo">
            <div className="pl-banner" data-tono="danger">
              {errore}
            </div>
          </div>
        ) : (
          <div className="pl-finestra-corpo">
            <div className="pl-scheletro" style={{ height: 320 }} />
          </div>
        )}
      </div>
    </FinestraPlanner>
  )
}
