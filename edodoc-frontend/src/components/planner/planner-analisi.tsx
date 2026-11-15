import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { BarChart3, CopyPlus, ExternalLink, Eye, FileBarChart, Heart, Send, Trophy, Users } from 'lucide-react'
import { toast } from '@/lib/toast'
import { INFO_CANALE } from '@/lib/planner-canali'
import { etichettaGiorno, oggiRoma, piuGiorni, quandoBreve, relativo } from '@/lib/planner-tempo'
import { messaggioErrorePlanner, plannerService, urlMedia, type PlannerAnalisi, type PlannerStato } from '@/services/planner-service'
import { IconaCanale, Vuoto } from './planner-ui'
import { PlannerConcorrentiTab } from './planner-concorrenti'
import { PlannerReport } from './planner-report'
import { compatto, numero } from '@/lib/planner-formato'

const PERIODI = [
  { giorni: 7, etichetta: '7 giorni' },
  { giorni: 30, etichetta: '30 giorni' },
  { giorni: 90, etichetta: '90 giorni' },
]
const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const FASCE = Array.from({ length: 16 }, (_, i) => i + 7)

function delta(ora: number, prima: number): { testo: string; tono: 'su' | 'giu' | 'piatto' } | null {
  if (!prima) return null
  const v = (ora - prima) / prima
  const tono = v > 0.005 ? 'su' : v < -0.005 ? 'giu' : 'piatto'
  return { testo: `${tono === 'su' ? '▲' : tono === 'giu' ? '▼' : '■'} ${Math.abs(v * 100).toLocaleString('it-IT', { maximumFractionDigits: 0 })}%`, tono }
}

/**
 * Analisi del piano dello spazio: quanto si pubblica, dove rende, a che ore, quali rubriche, i migliori.
 * Grafici in HTML (barre e mappa di calore) con i token della pagina: una serie per grafico, niente doppi assi.
 */
export function PlannerAnalisiTab({ stato, generazione }: { stato: PlannerStato; generazione: number }) {
  const [vista, setVista] = useState<'piano' | 'concorrenti'>('piano')
  const selettore = (
    <div className="pl-seg pl-seg--grande" role="radiogroup" aria-label="Analisi">
      <button type="button" role="radio" aria-checked={vista === 'piano'} data-on={vista === 'piano' ? '' : undefined} onClick={() => setVista('piano')}>
        Il tuo piano
      </button>
      <button type="button" role="radio" aria-checked={vista === 'concorrenti'} data-on={vista === 'concorrenti' ? '' : undefined} onClick={() => setVista('concorrenti')}>
        Concorrenti
      </button>
    </div>
  )
  if (vista === 'concorrenti') {
    return (
      <div className="pl-analisi">
        {selettore}
        <PlannerConcorrentiTab stato={stato} />
      </div>
    )
  }
  return <AnalisiPiano stato={stato} generazione={generazione} selettore={selettore} />
}

function AnalisiPiano({ stato, generazione, selettore }: { stato: PlannerStato; generazione: number; selettore: React.ReactNode }) {
  const [giorni, setGiorni] = useState(30)
  const [a, setA] = useState<PlannerAnalisi | null>(null)
  const [report, setReport] = useState(false)

  const riusa = async (postId: number) => {
    try {
      await plannerService.duplica(postId)
      toast.success('Copia creata fra le bozze', { description: 'Aprila in «Idee e flusso», cambia quello che serve e riprogrammala.' })
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Copia non creata'))
    }
  }
  const [errore, setErrore] = useState<string | null>(null)

  const carica = useCallback(async () => {
    try {
      setErrore(null)
      const al = oggiRoma()
      setA(await plannerService.analisi(stato.brandId, piuGiorni(al, -(giorni - 1)), al))
    } catch (err) {
      setErrore(messaggioErrorePlanner(err, 'Analisi non disponibile'))
    }
  }, [stato.brandId, giorni])

  useEffect(() => {
    void carica()
  }, [carica, generazione])

  const maxSettimana = useMemo(() => Math.max(1, ...(a?.settimane ?? []).map((s) => s.pubblicati + s.programmati)), [a])
  const maxCanale = useMemo(() => Math.max(1, ...(a?.canali ?? []).map((c) => c.interazioni)), [a])
  const maxPubCanale = useMemo(() => Math.max(1, ...(a?.canali ?? []).map((c) => c.pubblicazioni)), [a])
  const maxRubrica = useMemo(() => Math.max(1, ...(a?.etichette ?? []).map((e) => e.post)), [a])
  const orari = useMemo(() => {
    const m = new Map<string, { post: number; media: number }>()
    for (const o of a?.orari ?? []) m.set(`${o.giorno}|${o.ora}`, { post: o.post, media: o.interazioniMedie })
    return m
  }, [a])
  const maxOrario = useMemo(() => Math.max(0, ...(a?.orari ?? []).map((o) => o.interazioniMedie)), [a])
  const migliore = useMemo(() => [...(a?.orari ?? [])].filter((o) => o.interazioniMedie > 0).sort((x, y) => y.interazioniMedie - x.interazioniMedie)[0], [a])
  const settimaneNelPeriodo = Math.max(1, giorni / 7)

  const kpi = a
    ? [
        { icona: <Send className="size-4" />, etichetta: 'Post usciti', valore: a.totali.post, prima: a.precedente.post, nota: `${a.totali.pubblicazioni} pubblicazioni sui canali` },
        { icona: <Eye className="size-4" />, etichetta: 'Visualizzazioni', valore: a.totali.visualizzazioni, prima: a.precedente.visualizzazioni },
        { icona: <Users className="size-4" />, etichetta: 'Account raggiunti', valore: a.totali.copertura, prima: a.precedente.copertura, nota: 'Somma per post: chi vede più post conta più volte' },
        {
          icona: <Heart className="size-4" />,
          etichetta: 'Interazioni',
          valore: a.totali.interazioni,
          prima: a.precedente.interazioni,
          nota: a.totali.interazioniMedie != null ? `${a.totali.interazioniMedie.toLocaleString('it-IT', { maximumFractionDigits: 1 })} in media per pubblicazione` : undefined,
        },
      ]
    : []

  return (
    <div className="pl-analisi">
      {selettore}
      <div className="pl-barra">
        <div className="pl-seg" role="radiogroup" aria-label="Periodo">
          {PERIODI.map((p) => (
            <button key={p.giorni} type="button" role="radio" aria-checked={giorni === p.giorni} data-on={giorni === p.giorni ? '' : undefined} onClick={() => setGiorni(p.giorni)}>
              {p.etichetta}
            </button>
          ))}
        </div>
        <button type="button" className="pl-btn" data-variante="secondario" onClick={() => setReport(true)} disabled={!a}>
          <FileBarChart className="size-4" /> Report
        </button>
        <span className="pl-sezione-nota">
          Confronto con i {giorni} giorni prima · numeri riletti ogni ora da Instagram, Facebook e YouTube
          {a?.metricheAggiornateIl ? ` (ultimo: ${relativo(a.metricheAggiornateIl)})` : ''}
        </span>
      </div>

      {errore ? (
        <div className="pl-banner" data-tono="danger">
          {errore}
        </div>
      ) : null}

      {!a && !errore ? <div className="pl-scheletro" style={{ height: 420 }} /> : null}

      {a ? (
        <>
          <div className="pl-kpi-griglia">
            {kpi.map((k) => {
              const d = delta(k.valore, k.prima)
              return (
                <div key={k.etichetta} className="pl-kpi">
                  <div className="pl-kpi-testa">
                    {k.icona}
                    <span>{k.etichetta}</span>
                  </div>
                  <div className="pl-kpi-valore">{compatto(k.valore)}</div>
                  <div className="pl-kpi-piede">
                    {d ? (
                      <span className="pl-delta" data-tono={d.tono} title={`Prima: ${numero(k.prima)}`}>
                        {d.testo}
                      </span>
                    ) : (
                      <span className="pl-delta" data-tono="piatto">—</span>
                    )}
                    {k.nota ? <span>{k.nota}</span> : null}
                  </div>
                </div>
              )
            })}
          </div>

          {a.totali.pubblicazioni === 0 ? (
            <Vuoto
              icona={<BarChart3 className="size-6" />}
              titolo="Ancora niente da analizzare"
              testo="Quando i post del Planner escono, qui trovi ritmo, canali, rubriche, orari migliori e i post che rendono di più."
            />
          ) : null}

          <div className="pl-analisi-griglia">
            {/* Ritmo settimanale */}
            <section className="pl-sezione pl-grafico">
              <div className="pl-sezione-testa">
                <span className="pl-sezione-titolo">Ritmo di pubblicazione</span>
                <span className="pl-legenda">
                  <span data-serie="usciti" /> Usciti <span data-serie="programmati" /> Programmati
                </span>
              </div>
              <div className="pl-barre-v" role="img" aria-label="Post per settimana">
                {a.settimane.map((s) => (
                  <div key={s.inizio} className="pl-barra-v" title={`Settimana del ${etichettaGiorno(s.inizio)}: ${s.pubblicati} usciti, ${s.programmati} programmati`}>
                    <div className="pl-barra-v-pila" style={{ height: `${((s.pubblicati + s.programmati) / maxSettimana) * 100}%` }}>
                      {s.programmati ? <span data-serie="programmati" style={{ flexGrow: s.programmati }} /> : null}
                      {s.pubblicati ? <span data-serie="usciti" style={{ flexGrow: s.pubblicati }} /> : null}
                    </div>
                    <span className="pl-barra-v-valore">{s.pubblicati + s.programmati || ''}</span>
                    <span className="pl-barra-v-etichetta">{etichettaGiorno(s.inizio).replace(/^\w+ /, '')}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Canali */}
            <section className="pl-sezione pl-grafico">
              <div className="pl-sezione-testa">
                <span className="pl-sezione-titolo">Canali</span>
                <span className="pl-sezione-nota">interazioni · pubblicazioni</span>
              </div>
              <div className="pl-barre-h">
                {a.canali.map((c) => (
                  <div key={c.canale} className="pl-barra-h" title={`${INFO_CANALE[c.canale].nome}: ${numero(c.interazioni)} interazioni, ${numero(c.visualizzazioni)} visualizzazioni, ${c.pubblicazioni} pubblicazioni`}>
                    <span className="pl-barra-h-nome">
                      <IconaCanale canale={c.canale} className="size-3.5" /> {INFO_CANALE[c.canale].nome}
                    </span>
                    <span className="pl-barra-h-traccia">
                      <span className="pl-barra-h-fill" style={{ width: `${(c.interazioni / maxCanale) * 100}%` }} />
                    </span>
                    <span className="pl-barra-h-valore">{compatto(c.interazioni)}</span>
                    <span className="pl-barra-h-pub">
                      <span style={{ width: `${(c.pubblicazioni / maxPubCanale) * 100}%` }} />
                      {c.pubblicazioni}
                    </span>
                  </div>
                ))}
                {a.canali.length === 0 ? <div className="pl-sezione-nota">Nessuna pubblicazione nel periodo.</div> : null}
              </div>
            </section>

            {/* Rubriche */}
            <section className="pl-sezione pl-grafico">
              <div className="pl-sezione-testa">
                <span className="pl-sezione-titolo">Rubriche</span>
                <span className="pl-sezione-nota">post usciti e obiettivo del periodo</span>
              </div>
              <div className="pl-barre-h">
                {a.etichette.map((e) => {
                  const obiettivo = e.obiettivoSettimanale ? Math.round(e.obiettivoSettimanale * settimaneNelPeriodo) : null
                  const scala = Math.max(maxRubrica, obiettivo ?? 0)
                  return (
                    <div key={e.etichettaId ?? 'nessuna'} className="pl-barra-h" title={`${e.nome}: ${e.post} post, ${numero(e.interazioni)} interazioni${obiettivo ? `, obiettivo ${obiettivo}` : ''}`}>
                      <span className="pl-barra-h-nome">
                        <span className="pl-rubrica-dot" style={{ '--pl-r': e.colore } as CSSProperties} /> {e.nome}
                      </span>
                      <span className="pl-barra-h-traccia">
                        <span className="pl-barra-h-fill" data-rubrica="" style={{ width: `${(e.post / scala) * 100}%`, '--pl-r': e.colore } as CSSProperties} />
                        {obiettivo ? <span className="pl-obiettivo" style={{ left: `${(obiettivo / scala) * 100}%` }} title={`Obiettivo: ${obiettivo}`} /> : null}
                      </span>
                      <span className="pl-barra-h-valore" data-sotto={obiettivo && e.post < obiettivo ? '' : undefined}>
                        {e.post}
                        {obiettivo ? `/${obiettivo}` : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Orari */}
            <section className="pl-sezione pl-grafico">
              <div className="pl-sezione-testa">
                <span className="pl-sezione-titolo">Quando rende di più</span>
                <span className="pl-sezione-nota">
                  {migliore ? `Meglio ${GIORNI[migliore.giorno - 1].toLowerCase()} alle ${migliore.ora}:00` : 'Interazioni medie per fascia oraria'}
                </span>
              </div>
              <div className="pl-calore" role="img" aria-label="Interazioni medie per giorno e ora di pubblicazione">
                <span />
                {FASCE.map((h) => (
                  <span key={h} className="pl-calore-ora">
                    {h % 3 === 1 ? h : ''}
                  </span>
                ))}
                {GIORNI.map((g, i) => (
                  <div key={g} className="pl-calore-riga">
                    <span className="pl-calore-giorno">{g}</span>
                    {FASCE.map((h) => {
                      const v = orari.get(`${i + 1}|${h}`)
                      // Una fascia con post ha sempre almeno il tono più chiaro, anche senza interazioni (o senza numeri)
                      const intensita = !v ? 0 : maxOrario > 0 ? 0.15 + 0.85 * (v.media / maxOrario) : 0.15
                      return (
                        <span
                          key={h}
                          className="pl-calore-cella"
                          data-vuota={v ? undefined : ''}
                          style={{ '--pl-i': intensita } as CSSProperties}
                          title={v ? `${g} ${h}:00 · ${v.post} post · ${v.media.toLocaleString('it-IT', { maximumFractionDigits: 1 })} interazioni medie` : `${g} ${h}:00 · nessun post`}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
              <div className="pl-calore-legenda">
                meno <span className="pl-calore-scala" /> più · celle vuote = nessun post a quell'ora
              </div>
            </section>
          </div>

          {/* I migliori */}
          {a.top.length ? (
            <section className="pl-sezione">
              <div className="pl-sezione-testa">
                <span className="pl-sezione-titolo">
                  <Trophy className="inline size-4" /> I post che hanno reso di più
                </span>
              </div>
              <div className="pl-top">
                {a.top.map((t, i) => (
                  <div key={`${t.postId}-${t.canale}`} className="pl-top-voce">
                    <span className="pl-top-pos">{i + 1}</span>
                    {t.anteprimaUrl ? <img src={urlMedia(t.anteprimaUrl)} alt="" loading="lazy" /> : <span className="pl-lista-mini" data-vuota="" />}
                    <span className="pl-top-testi">
                      <b>{t.titolo || t.testo || 'Post'}</b>
                      <span>
                        <IconaCanale canale={t.canale} className="size-3" /> {quandoBreve(t.pubblicatoIl)}
                      </span>
                    </span>
                    <span className="pl-top-num">
                      <b>{compatto(t.interazioni)}</b>
                      <span>interazioni</span>
                    </span>
                    {t.visualizzazioni != null ? (
                      <span className="pl-top-num">
                        <b>{compatto(t.visualizzazioni)}</b>
                        <span>visualizzazioni</span>
                      </span>
                    ) : null}
                    <span className="pl-top-azioni">
                      <button type="button" className="pl-btn" data-variante="mini" onClick={() => void riusa(t.postId)} title="Crea una copia fra le bozze per ripubblicarlo">
                        <CopyPlus className="size-3.5" /> Riusa
                      </button>
                      {t.linkEsterno ? (
                        <a className="pl-icon-btn" href={t.linkEsterno} target="_blank" rel="noreferrer" title="Apri il post">
                          <ExternalLink className="size-4" />
                        </a>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <PlannerReport aperto={report} onChiudi={() => setReport(false)} stato={stato} analisi={a} />
        </>
      ) : null}
    </div>
  )
}
