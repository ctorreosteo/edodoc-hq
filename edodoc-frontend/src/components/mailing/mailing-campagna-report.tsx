import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  BarChart3,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crown,
  Euro,
  Laptop,
  Mail,
  MousePointerClick,
  Pause,
  Play,
  Search,
  Sparkles,
  ThumbsUp,
  Lightbulb,
  Users,
  XCircle,
} from 'lucide-react'
import { toast } from '@/lib/toast'
import {
  mailingService,
  messaggioErroreMailing,
  type MailingAiAnalisi,
  type MailingDestinatarioRiga,
  type MailingFiltroDestinatari,
  type MailingPagina,
  type MailingReportCampagna,
  type MailingStato,
  type MailingStatoInvio,
  type MailingVoceConteggio,
} from '@/services/mailing-service'
import { normalizzaDocumento, renderEmail, sostituisciSegnaposto, valoriEsempio } from '@/lib/mailing-render'
import { usePollingMailing } from './mailing-contesto'
import { BadgeStatoCampagna, Vuoto } from './mailing-ui'
import { ConfermaMailing } from './mailing-dialog'
import { MappaClick } from './mailing-campagna-mappa'
import { AzioniEmail } from './mailing-editor-strumenti'
import { STATI_IN_CORSO } from './mailing-campagna-dati'
import { dataOra, formatEuro, formatNumero, formatPercentuale, tempoFa, useColoriMailing, useNumeroAnimato } from './mailing-utils'

/* Report della campagna: avanzamento live, funnel fino al fatturato, andamento 48 h, mappa dei click, dispositivi, A/B, conversioni, destinatari, analisi AI. */

function Kpi({ icona, etichetta, valore, sotto, tono }: { icona: React.ReactNode; etichetta: string; valore: string; sotto?: string; tono?: 'accento' }) {
  return (
    <div className="ml-cp-kpi" data-tono={tono}>
      <div className="ml-cp-kpi-testa">
        {icona}
        <span>{etichetta}</span>
      </div>
      <div className="ml-cp-kpi-valore">{valore}</div>
      {sotto ? <div className="ml-cp-kpi-sotto">{sotto}</div> : null}
    </div>
  )
}

function Imbuto({ passi }: { passi: { etichetta: string; valore: number; testo?: string }[] }) {
  const base = Math.max(1, passi[0]?.valore ?? 1)
  return (
    <ol className="ml-cp-imbuto">
      {passi.map((p, i) => {
        const pct = (p.valore / base) * 100
        const daPrima = i > 0 && passi[i - 1].valore ? (p.valore / passi[i - 1].valore) * 100 : null
        return (
          <li key={p.etichetta} style={{ animationDelay: `${i * 70}ms` }}>
            <div className="ml-cp-imbuto-testa">
              <span>{p.etichetta}</span>
              <strong>{p.testo ?? formatNumero(p.valore)}</strong>
            </div>
            <div className="ml-cp-imbuto-barra">
              <span style={{ width: `${Math.max(pct, p.valore ? 1.5 : 0)}%`, opacity: 1 - i * 0.12 }} />
            </div>
            {daPrima != null ? <div className="ml-cp-imbuto-conv">{formatPercentuale(daPrima)} del passo prima</div> : null}
          </li>
        )
      })}
    </ol>
  )
}

function Barre({ voci, titolo, icona }: { voci: MailingVoceConteggio[]; titolo: string; icona: React.ReactNode }) {
  const tot = voci.reduce((s, v) => s + v.valore, 0) || 1
  return (
    <section className="ml-card ml-cp-sezione">
      <div className="ml-cp-sezione-titolo">
        {icona} {titolo}
      </div>
      {voci.length ? (
        <ul className="ml-cp-barre">
          {[...voci]
            .sort((a, b) => b.valore - a.valore)
            .map((v) => (
              <li key={v.chiave}>
                <div className="ml-cp-barre-testa">
                  <span>{v.etichetta}</span>
                  <strong>{formatPercentuale((v.valore / tot) * 100, 0)}</strong>
                </div>
                <div className="ml-cp-barre-barra" title={`${formatNumero(v.valore)} aperture`}>
                  <span style={{ width: `${(v.valore / tot) * 100}%` }} />
                </div>
              </li>
            ))}
        </ul>
      ) : (
        <div className="ml-ed-aiuto">Ancora nessun dato.</div>
      )}
    </section>
  )
}

const ETICHETTE_SERIE: Record<string, string> = { aperture: 'Aperture', apertura: 'Aperture', click: 'Click', inviati: 'Inviati' }

function Andamento({ report }: { report: MailingReportCampagna }) {
  const colori = useColoriMailing()
  const chiavi = useMemo(() => {
    const s = new Set<string>()
    report.andamentoOrario.forEach((p) => Object.keys(p.valori).forEach((k) => s.add(k)))
    const ordine = ['aperture', 'apertura', 'click']
    return [...s].sort((a, b) => ordine.indexOf(a.toLowerCase()) - ordine.indexOf(b.toLowerCase())).filter((k) => k.toLowerCase() !== 'inviati')
  }, [report])
  const dati = useMemo(
    () =>
      report.andamentoOrario.map((p) => {
        const d = new Date(p.giorno)
        return { t: d.getTime(), etichetta: d.toLocaleString('it-IT', { weekday: 'short', hour: '2-digit', minute: '2-digit' }), ...p.valori }
      }),
    [report],
  )
  const serie = [colori.s1, colori.s2, colori.s3]
  if (!dati.length) return <div className="ml-cp-grafico-vuoto">Le aperture compariranno qui ora per ora, appena arrivano.</div>
  return (
    <div className="ml-cp-grafico">
      <div className="ml-cp-legenda">
        {chiavi.map((k, i) => (
          <span key={k}>
            <i style={{ background: serie[i] }} />
            {ETICHETTE_SERIE[k.toLowerCase()] ?? k}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={dati} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            {chiavi.map((k, i) => (
              <linearGradient key={k} id={`ml-cp-g-${i}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={serie[i]} stopOpacity={0.28} />
                <stop offset="100%" stopColor={serie[i]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={colori.griglia} vertical={false} />
          <XAxis dataKey="etichetta" tick={{ fill: colori.testo, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={40} />
          <YAxis tick={{ fill: colori.testo, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
          <Tooltip
            cursor={{ stroke: colori.testo, strokeDasharray: '3 3' }}
            contentStyle={{ background: colori.superficie, border: `1px solid ${colori.griglia}`, borderRadius: 12, fontSize: 12 }}
            labelStyle={{ fontWeight: 700 }}
            formatter={(v, k) => [formatNumero(Number(v)), ETICHETTE_SERIE[String(k).toLowerCase()] ?? String(k)]}
          />
          {chiavi.map((k, i) => (
            <Area key={k} type="monotone" dataKey={k} stroke={serie[i]} strokeWidth={2} fill={`url(#ml-cp-g-${i})`} activeDot={{ r: 4, strokeWidth: 2, stroke: colori.superficie }} isAnimationActive />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

const FILTRI_DEST: { k: MailingFiltroDestinatari; l: string }[] = [
  { k: 'TUTTI', l: 'Tutti' },
  { k: 'APERTO', l: 'Hanno aperto' },
  { k: 'CLICK', l: 'Hanno cliccato' },
  { k: 'NON_APERTO', l: 'Non hanno aperto' },
  { k: 'RIMBALZATO', l: 'Non consegnate' },
  { k: 'DISISCRITTO', l: 'Disiscritti' },
]

const STATO_INVIO: Record<MailingStatoInvio, { l: string; t: string }> = {
  IN_CODA: { l: 'In coda', t: 'neutro' },
  IN_INVIO: { l: 'In invio', t: 'info' },
  INVIATO: { l: 'Consegnata', t: 'ok' },
  RIMBALZATO: { l: 'Non consegnata', t: 'errore' },
  ERRORE: { l: 'Errore', t: 'errore' },
  SALTATO: { l: 'Saltata', t: 'neutro' },
  ANNULLATO: { l: 'Annullata', t: 'neutro' },
}

function Destinatari({ id, ab }: { id: number; ab: boolean }) {
  const [filtro, setFiltro] = useState<MailingFiltroDestinatari>('TUTTI')
  const [pagina, setPagina] = useState(0)
  const [q, setQ] = useState('')
  const [qAttiva, setQAttiva] = useState('')
  const [dati, setDati] = useState<MailingPagina<MailingDestinatarioRiga> | null>(null)
  const [carico, setCarico] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => {
      setQAttiva(q.trim())
      setPagina(0)
    }, 350)
    return () => window.clearTimeout(t)
  }, [q])
  useEffect(() => {
    let vivo = true
    setCarico(true)
    mailingService
      .destinatari(id, filtro, pagina, qAttiva || undefined)
      .then((d) => vivo && setDati(d))
      .catch((e) => vivo && toast.error(messaggioErroreMailing(e, 'Destinatari non disponibili')))
      .finally(() => vivo && setCarico(false))
    return () => {
      vivo = false
    }
  }, [id, filtro, pagina, qAttiva])
  const pagine = dati ? Math.max(1, Math.ceil(dati.totale / Math.max(1, dati.dimensione))) : 1
  return (
    <section className="ml-card ml-cp-sezione ml-cp-destinatari">
      <div className="ml-cp-sezione-testa">
        <div className="ml-cp-sezione-titolo">
          <Users /> Destinatari
        </div>
        <div className="ml-tpl-cerca ml-cp-dest-cerca">
          <Search aria-hidden />
          <input className="ml-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nome o email" aria-label="Cerca destinatari" />
        </div>
      </div>
      <div className="ml-cp-chips" role="tablist" aria-label="Filtro">
        {FILTRI_DEST.map((f) => (
          <button
            key={f.k}
            type="button"
            role="tab"
            aria-selected={filtro === f.k}
            className={`ml-chip${filtro === f.k ? ' ml-chip--attivo' : ''}`}
            onClick={() => {
              setFiltro(f.k)
              setPagina(0)
            }}
          >
            {f.l}
          </button>
        ))}
      </div>
      <div className="ml-cp-tabella-box" data-occupato={carico ? '' : undefined}>
        <table className="ml-tabella ml-cp-tabella">
          <thead>
            <tr>
              <th>Contatto</th>
              <th>Consegna</th>
              {ab ? <th>Variante</th> : null}
              <th className="ml-cp-num">Aperture</th>
              <th className="ml-cp-num">Click</th>
              <th>Ultima attività</th>
            </tr>
          </thead>
          <tbody>
            {dati == null
              ? [0, 1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td colSpan={ab ? 6 : 5}>
                      <span className="ml-skeleton" style={{ height: 16, display: 'block' }} />
                    </td>
                  </tr>
                ))
              : dati.elementi.map((d) => {
                  const s = STATO_INVIO[d.stato] ?? { l: d.stato, t: 'neutro' }
                  const ultima = [d.disiscrittoIl, d.rispostoIl, d.primoClickIl, d.primaAperturaIl, d.inviatoIl].find(Boolean) ?? null
                  return (
                    <tr key={d.invioId}>
                      <td>
                        <div className="ml-cp-dest-nome">{d.nome || d.email}</div>
                        {d.nome ? <div className="ml-cp-dest-email">{d.email}</div> : null}
                      </td>
                      <td>
                        <span className={`ml-badge ml-badge--${s.t}`} title={d.errore ?? undefined}>
                          {s.l}
                        </span>
                        {d.disiscrittoIl ? <span className="ml-badge ml-badge--avviso ml-cp-dest-extra">Disiscritto</span> : null}
                        {d.rispostoIl ? <span className="ml-badge ml-badge--info ml-cp-dest-extra">Ha risposto</span> : null}
                      </td>
                      {ab ? <td>{d.variante ?? '—'}</td> : null}
                      <td className="ml-cp-num">{d.aperture || '—'}</td>
                      <td className="ml-cp-num">{d.click || '—'}</td>
                      <td className="ml-cp-dest-quando">{ultima ? tempoFa(ultima) : '—'}</td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
        {dati && !dati.elementi.length ? <div className="ml-cp-tabella-vuota">Nessun destinatario con questo filtro.</div> : null}
      </div>
      {dati && dati.totale > dati.dimensione ? (
        <div className="ml-cp-paginazione">
          <span>
            {formatNumero(dati.totale)} destinatari · pagina {pagina + 1} di {formatNumero(pagine)}
          </span>
          <div>
            <button type="button" className="ml-btn ml-btn--sm ml-btn--icona" aria-label="Pagina precedente" disabled={pagina === 0 || carico} onClick={() => setPagina((p) => p - 1)}>
              <ChevronLeft />
            </button>
            <button type="button" className="ml-btn ml-btn--sm ml-btn--icona" aria-label="Pagina successiva" disabled={pagina + 1 >= pagine || carico} onClick={() => setPagina((p) => p + 1)}>
              <ChevronRight />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export function CampagnaReport({ id, stato, onIndietro, onDuplicata }: { id: number; stato: MailingStato; onIndietro: () => void; onDuplicata: () => void }) {
  const [report, setReport] = useState<MailingReportCampagna | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [evidenzia, setEvidenzia] = useState<number | null>(null)
  const [azione, setAzione] = useState<'annulla' | null>(null)
  const [occupato, setOccupato] = useState(false)
  const [analisiKey, setAnalisiKey] = useState(0)

  const carica = useCallback(() => {
    mailingService
      .reportCampagna(id)
      .then((r) => {
        setReport(r)
        setErrore(null)
      })
      .catch((e) => setErrore(messaggioErroreMailing(e, 'Report non disponibile')))
  }, [id])
  useEffect(carica, [carica])

  const inCorso = !!report && STATI_IN_CORSO.includes(report.campagna.stato)
  // Niente realtime in EdoDoc: mentre la campagna è in invio il report si ricarica ogni 10 s (scheda visibile)
  usePollingMailing(inCorso, carica)

  const htmlGrezzo = useMemo(() => {
    const c = report?.campagna
    if (!c) return null
    return c.html || (c.design ? renderEmail(normalizzaDocumento(c.design), { preheader: c.preheader }) : null)
  }, [report])
  // Nell'anteprima i segnaposto mostrano un contatto d'esempio (i link {{...}} non sono comunque tracciati)
  const html = useMemo(() => (htmlGrezzo ? sostituisciSegnaposto(htmlGrezzo, valoriEsempio()) : null), [htmlGrezzo])

  const numeroInviati = useNumeroAnimato(report?.metriche.inviati ?? null)

  if (errore) return <Vuoto icona={<BarChart3 />} titolo="Report non disponibile" testo={errore} azioni={<button className="ml-btn" onClick={onIndietro}>Torna alle campagne</button>} />
  if (!report) {
    return (
      <div className="ml-cp-report" aria-busy>
        <span className="ml-skeleton" style={{ height: 120, display: 'block', borderRadius: 20 }} />
        <div className="ml-cp-kpi-griglia">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="ml-skeleton" style={{ height: 96, display: 'block', borderRadius: 16 }} />
          ))}
        </div>
        <span className="ml-skeleton" style={{ height: 320, display: 'block', borderRadius: 20 }} />
      </div>
    )
  }

  const c = report.campagna
  const m = report.metriche
  const totale = c.destinatariTotali || m.destinatari
  const pct = totale ? Math.min(100, (m.inviati / totale) * 100) : 0
  const consegnati = Math.max(0, m.inviati - m.rimbalzi - m.errori)
  const totClick = report.link.reduce((s, l) => s + l.clickUnici, 0) || 1
  const baseLink = report.link.some((l) => l.indice === 0) ? 0 : 1

  const esegui = async (fn: () => Promise<unknown>, ok: string) => {
    setOccupato(true)
    try {
      await fn()
      toast.success(ok)
      carica()
      return true
    } catch (e) {
      toast.error(messaggioErroreMailing(e, 'Operazione non riuscita'))
      return false
    } finally {
      setOccupato(false)
    }
  }

  return (
    <div className="ml-cp-report">
      <section className="ml-card ml-cp-testa">
        <button type="button" className="ml-btn ml-btn--ghost ml-btn--sm ml-indietro" onClick={onIndietro}>
          <ChevronLeft /> Campagne
        </button>
        <div className="ml-cp-testa-riga">
          <div className="ml-cp-testa-testi">
            <div className="ml-cp-testa-nome">
              {c.nome} <BadgeStatoCampagna stato={c.stato} />
            </div>
            <div className="ml-cp-testa-oggetto">{c.oggetto}</div>
            <div className="ml-cp-testa-meta">
              {c.invioIniziatoIl ? <span>Partita {dataOra(c.invioIniziatoIl)}</span> : null}
              {c.invioCompletatoIl ? <span>Completata {dataOra(c.invioCompletatoIl)}</span> : null}
              {c.testAb ? <span>Test A/B · {c.testAb.varianti.length} varianti</span> : null}
              {c.invioIntelligente ? <span>Invio intelligente</span> : null}
            </div>
          </div>
          <div className="ml-cp-testa-azioni">
            {c.stato === 'IN_INVIO' || c.stato === 'TEST_AB' ? (
              <button type="button" className="ml-btn ml-btn--sm" disabled={occupato} onClick={() => void esegui(() => mailingService.pausaCampagna(id), 'Invio in pausa')}>
                <Pause /> Pausa
              </button>
            ) : null}
            {c.stato === 'IN_PAUSA' ? (
              <button type="button" className="ml-btn ml-btn--sm ml-btn--pieno" disabled={occupato} onClick={() => void esegui(() => mailingService.riprendiCampagna(id), 'Invio ripreso')}>
                <Play /> Riprendi
              </button>
            ) : null}
            {inCorso ? (
              <button type="button" className="ml-btn ml-btn--sm ml-btn--pericolo" disabled={occupato} onClick={() => setAzione('annulla')}>
                <XCircle /> Annulla l'invio
              </button>
            ) : null}
            <button type="button" className="ml-btn ml-btn--sm" onClick={onDuplicata}>
              <Copy /> Duplica
            </button>
            {stato.aiDisponibile && m.inviati > 0 ? (
              <button type="button" className="ml-btn ml-btn--sm ml-btn--ai" onClick={() => setAnalisiKey((k) => k + 1)}>
                <Sparkles /> Analizza con AI
              </button>
            ) : null}
          </div>
        </div>
        {inCorso ? (
          <div className="ml-cp-live">
            <div className="ml-cp-live-testa">
              <span>
                <strong>{formatNumero(numeroInviati)}</strong> di {formatNumero(totale)} inviate
              </span>
              <span>
                {c.stato === 'IN_PAUSA' ? 'In pausa' : c.stato === 'TEST_AB' ? 'Test A/B in corso: il resto partirà con l\'oggetto vincente' : 'In corso'}
              </span>
            </div>
            <div className="ml-barra ml-cp-barra ml-cp-barra--grande" data-vivo={c.stato !== 'IN_PAUSA' ? '' : undefined}>
              <span className="ml-barra-valore" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : null}
      </section>

      {analisiKey ? <AnalisiAi key={analisiKey} id={id} onRifai={() => setAnalisiKey((k) => k + 1)} /> : null}

      <>
          <div className="ml-cp-kpi-griglia">
            <Kpi icona={<Mail />} etichetta="Consegnate" valore={formatNumero(consegnati)} sotto={m.rimbalzi ? `${formatNumero(m.rimbalzi)} non consegnate` : 'nessun rimbalzo'} />
            <Kpi icona={<Users />} etichetta="Aperture" valore={formatPercentuale(m.tassoApertura)} sotto={`${formatNumero(m.apertureUniche)} persone${m.apertureAutomatiche ? ` · ${formatNumero(m.apertureAutomatiche)} automatiche escluse` : ''}`} tono="accento" />
            <Kpi icona={<MousePointerClick />} etichetta="Click" valore={formatPercentuale(m.tassoClick)} sotto={`${formatNumero(m.clickUnici)} persone · ${formatPercentuale(m.tassoClickSuAperture)} di chi ha aperto`} />
            <Kpi icona={<CalendarCheck />} etichetta="Visite prenotate" valore={formatNumero(m.visiteGenerate)} sotto="dopo un click sull'email" />
            <Kpi icona={<Euro />} etichetta="Fatturato" valore={m.fatturatoGenerato ? formatEuro(m.fatturatoGenerato) : '—'} sotto="acquisti attribuiti" />
            <Kpi icona={<XCircle />} etichetta="Disiscrizioni" valore={formatNumero(m.disiscrizioni)} sotto={`${formatPercentuale(m.tassoDisiscrizione, 2)}${m.risposte ? ` · ${formatNumero(m.risposte)} risposte` : ''}`} />
          </div>

          <div className="ml-cp-griglia-2">
            <section className="ml-card ml-cp-sezione">
              <div className="ml-cp-sezione-titolo">
                <BarChart3 /> Dall'invio alla visita
              </div>
              <Imbuto
                passi={[
                  { etichetta: 'Inviate', valore: m.inviati },
                  { etichetta: 'Consegnate', valore: consegnati },
                  { etichetta: 'Aperte', valore: m.apertureUniche },
                  { etichetta: 'Cliccate', valore: m.clickUnici },
                  { etichetta: 'Visite prenotate', valore: m.visiteGenerate },
                ]}
              />
              {m.fatturatoGenerato ? (
                <div className="ml-cp-imbuto-fine">
                  <Euro /> {formatEuro(m.fatturatoGenerato)} di acquisti attribuiti a questa email
                </div>
              ) : null}
            </section>
            <section className="ml-card ml-cp-sezione">
              <div className="ml-cp-sezione-titolo">
                <Users /> Aperture e click nelle prime 48 ore
              </div>
              <Andamento report={report} />
            </section>
          </div>

          <div className="ml-cp-griglia-mappa">
            <section className="ml-card ml-cp-sezione">
              <div className="ml-cp-sezione-titolo">
                <MousePointerClick /> Mappa dei click
                <span className="ml-cp-sezione-nota">percentuale delle persone che hanno cliccato</span>
                <div className="ml-azioni-email">
                  <AzioniEmail html={htmlGrezzo} contesto={{ oggetto: c.oggetto, preheader: c.preheader, mittenteId: c.mittenteId, categoriaId: c.categoriaId }} soloIcone />
                </div>
              </div>
              {html ? <MappaClick html={html} link={report.link} evidenzia={evidenzia} onHover={setEvidenzia} /> : <div className="ml-ed-aiuto">Email non disponibile.</div>}
            </section>
            <div className="ml-cp-colonna">
              <section className="ml-card ml-cp-sezione">
                <div className="ml-cp-sezione-titolo">
                  <MousePointerClick /> Link più cliccati
                </div>
                {report.link.length ? (
                  <ol className="ml-cp-link">
                    {[...report.link]
                      .sort((a, b) => b.clickUnici - a.clickUnici)
                      .map((l) => (
                        <li key={l.indice} data-on={evidenzia === l.indice ? '' : undefined} onMouseEnter={() => setEvidenzia(l.indice)} onMouseLeave={() => setEvidenzia(null)}>
                          <span className="ml-cp-link-num">{l.indice - baseLink + 1}</span>
                          <div className="ml-cp-link-testi">
                            <a href={l.url} target="_blank" rel="noreferrer noopener" title={l.url}>
                              {l.etichetta || l.url.replace(/^https?:\/\/(www\.)?/, '')}
                            </a>
                            <div className="ml-cp-barre-barra">
                              <span style={{ width: `${(l.clickUnici / totClick) * 100}%` }} />
                            </div>
                          </div>
                          <span className="ml-cp-link-v">
                            <strong>{formatNumero(l.clickUnici)}</strong>
                            <small>{formatPercentuale((l.clickUnici / totClick) * 100, 0)}</small>
                          </span>
                        </li>
                      ))}
                  </ol>
                ) : (
                  <div className="ml-ed-aiuto">Nessun link tracciato in questa email.</div>
                )}
              </section>
              <Barre titolo="Dispositivi" icona={<Laptop />} voci={report.dispositivi} />
              <Barre titolo="Programmi di posta" icona={<Mail />} voci={report.client} />
            </div>
          </div>

          {report.varianti.length ? (
            <section className="ml-card ml-cp-sezione">
              <div className="ml-cp-sezione-titolo">
                <Crown /> Test A/B
                {c.testAb?.decisoIl ? <span className="ml-cp-sezione-nota">deciso {dataOra(c.testAb.decisoIl)} su {c.testAb.metrica === 'CLICK' ? 'click' : 'aperture'}</span> : null}
              </div>
              <div className="ml-cp-varianti">
                {report.varianti.map((v) => (
                  <div key={v.chiave} className="ml-cp-variante" data-vincitore={v.vincitore ? '' : undefined}>
                    <div className="ml-cp-variante-testa">
                      <span className="ml-cp-ab-lettera" data-v={v.chiave}>
                        {v.chiave}
                      </span>
                      {v.vincitore ? (
                        <span className="ml-badge ml-badge--ok">
                          <Crown /> Vincitrice
                        </span>
                      ) : null}
                    </div>
                    <div className="ml-cp-variante-oggetto">{v.oggetto}</div>
                    <div className="ml-cp-variante-numeri">
                      <div>
                        <strong>{formatPercentuale(v.metriche.tassoApertura)}</strong>
                        <span>aperture</span>
                      </div>
                      <div>
                        <strong>{formatPercentuale(v.metriche.tassoClick)}</strong>
                        <span>click</span>
                      </div>
                      <div>
                        <strong>{formatNumero(v.metriche.inviati)}</strong>
                        <span>inviate</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="ml-card ml-cp-sezione">
            <div className="ml-cp-sezione-titolo">
              <Euro /> Visite e acquisti grazie a questa email
            </div>
            {report.conversioni.length ? (
              <ul className="ml-cp-conversioni">
                {report.conversioni.map((x) => (
                  <li key={x.id}>
                    <span className="ml-cp-conv-icona" data-tipo={x.tipo}>
                      {x.tipo === 'CONVERSIONE_ACQUISTO' ? <Euro /> : <CalendarCheck />}
                    </span>
                    <div>
                      <strong>{x.contattoNome ?? x.contattoEmail ?? 'Contatto'}</strong>
                      <small>{x.messaggio}</small>
                    </div>
                    <span className="ml-cp-conv-valore">{x.valore ? formatEuro(x.valore) : ''}</span>
                    <span className="ml-cp-conv-quando">{tempoFa(x.avvenutoIl)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="ml-ed-aiuto">Quando qualcuno prenota una visita o fa un acquisto dopo aver cliccato l'email, lo vedrai qui con l'importo.</div>
            )}
          </section>

          <Destinatari id={id} ab={!!report.varianti.length} />
      </>

      <ConfermaMailing
        open={azione === 'annulla'}
        onOpenChange={(o) => !o && setAzione(null)}
        titolo="Annullare l'invio?"
        icona={<XCircle />}
        testo="Chi l'ha già ricevuta la tiene; tutti gli altri non la riceveranno più. Non si può riprendere."
        conferma="Annulla l'invio"
        pericolo
        onConferma={() => esegui(() => mailingService.annullaCampagna(id), 'Invio annullato')}
      />
    </div>
  )
}

/** Analisi AI: parte al montaggio (il genitore cambia la key per rifarla) e si porta in vista. */
function AnalisiAi({ id, onRifai }: { id: number; onRifai: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [analisi, setAnalisi] = useState<MailingAiAnalisi | null>(null)
  const [errore, setErrore] = useState(false)
  useEffect(() => {
    let vivo = true
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    mailingService
      .aiAnalisiCampagna(id)
      .then((a) => vivo && setAnalisi(a))
      .catch((e) => {
        if (!vivo) return
        setErrore(true)
        toast.error(messaggioErroreMailing(e, 'Analisi non disponibile'))
      })
    return () => {
      vivo = false
    }
  }, [id])
  if (errore) return null
  return (
    <div ref={ref}>
      <AnalisiVista analisi={analisi} onRifai={onRifai} />
    </div>
  )
}

function AnalisiVista({ analisi, onRifai }: { analisi: MailingAiAnalisi | null; onRifai: () => void }) {
  return (
    <section className="ml-card ml-cp-analisi" aria-live="polite">
      <div className="ml-cp-sezione-titolo">
        <Sparkles /> Cosa dicono i numeri
        {analisi ? (
          <button type="button" className="ml-btn ml-btn--ghost ml-btn--sm ml-cp-analisi-rifai" onClick={onRifai}>
            Rifai l'analisi
          </button>
        ) : null}
      </div>
      {!analisi ? (
        <div className="ml-cp-analisi-attesa">
          <span className="ml-skeleton" style={{ height: 16, width: '90%', display: 'block' }} />
          <span className="ml-skeleton" style={{ height: 16, width: '75%', display: 'block' }} />
          <span className="ml-skeleton" style={{ height: 16, width: '82%', display: 'block' }} />
        </div>
      ) : (
        <>
          <p className="ml-cp-analisi-sintesi">{analisi.sintesi}</p>
          <div className="ml-cp-analisi-colonne">
            <div>
              <div className="ml-etichetta">
                <ThumbsUp /> Ha funzionato
              </div>
              <ul>
                {analisi.puntiForza.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="ml-etichetta">
                <Lightbulb /> Per la prossima volta
              </div>
              <ol>
                {analisi.consigli.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

