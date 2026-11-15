import { useEffect, useState, type CSSProperties } from 'react'
import { Loader2, Printer, Sparkles } from 'lucide-react'
import { INFO_CANALE } from '@/lib/planner-canali'
import { compatto, numero } from '@/lib/planner-formato'
import { etichettaGiornoLunga, quandoBreve } from '@/lib/planner-tempo'
import { messaggioErrorePlanner, plannerService, urlMedia, type PlannerAnalisi, type PlannerReportAi, type PlannerStato } from '@/services/planner-service'
import { ChiudiFinestra, FinestraPlanner, IconaCanale } from './planner-ui'

const GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica']

function variazione(ora: number, prima: number): string {
  if (!prima) return ora ? 'nuovo' : '—'
  const v = (ora - prima) / prima
  return `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toLocaleString('it-IT', { maximumFractionDigits: 0 })}%`
}

/**
 * Report del periodo da condividere con la direzione: numeri col periodo prima, canali, rubriche, orari, post migliori
 * e il commento dell'AI scritto solo da quei numeri. «Stampa» lo salva in PDF (solo il report, il resto si nasconde).
 */
export function PlannerReport({ aperto, onChiudi, stato, analisi }: { aperto: boolean; onChiudi: () => void; stato: PlannerStato; analisi: PlannerAnalisi }) {
  const [commento, setCommento] = useState<PlannerReportAi | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [carica, setCarica] = useState(false)
  const spazio = stato.spazi.find((s) => s.id === stato.brandId)
  const a = analisi

  useEffect(() => {
    if (!aperto || !stato.aiDisponibile) return
    setCommento(null)
    setErrore(null)
    setCarica(true)
    plannerService
      .reportAi(stato.brandId, a.dal, a.al)
      .then(setCommento)
      .catch((err) => setErrore(messaggioErrorePlanner(err, 'Commento non disponibile')))
      .finally(() => setCarica(false))
  }, [aperto, stato.brandId, stato.aiDisponibile, a.dal, a.al])

  /**
   * Stampa in un iframe a parte, col solo report, gli stili della pagina e il tema chiaro: la finestra modale e i temi
   * scuri del gestionale non entrano nel foglio.
   */
  const stampa = () => {
    const el = document.querySelector('.pl-report')
    if (!el) return
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) return
    const stili = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join('')
    doc.open()
    doc.write(
      `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Report ${spazio?.nome ?? ''} ${a.dal} ${a.al}</title>${stili}` +
        // Altre pagine nascondono «body *» in stampa (Documenti): qui si rimette tutto visibile
        `<style>@page{size:A4;margin:12mm}html,body{background:#fff!important;margin:0}body *{visibility:visible!important}</style></head>` +
        `<body><div data-vl="" data-vl-page="planner">${el.outerHTML}</div></body></html>`,
    )
    doc.close()
    window.setTimeout(() => {
      win.focus()
      win.print()
      window.setTimeout(() => iframe.remove(), 1000)
    }, 600)
  }

  const migliori = [...a.orari].filter((o) => o.interazioniMedie > 0).sort((x, y) => y.interazioniMedie - x.interazioniMedie).slice(0, 3)
  const kpi = [
    { nome: 'Post usciti', ora: a.totali.post, prima: a.precedente.post },
    { nome: 'Pubblicazioni', ora: a.totali.pubblicazioni, prima: a.precedente.pubblicazioni },
    { nome: 'Visualizzazioni', ora: a.totali.visualizzazioni, prima: a.precedente.visualizzazioni },
    { nome: 'Account raggiunti', ora: a.totali.copertura, prima: a.precedente.copertura },
    { nome: 'Interazioni', ora: a.totali.interazioni, prima: a.precedente.interazioni },
  ]

  return (
    <FinestraPlanner aperta={aperto} onChiudi={onChiudi} titolo="Report del periodo" variante="centrata">
      <div className="pl-finestra-testa">
        <div>
          <div className="pl-finestra-titolo">Report del periodo</div>
          <div className="pl-sezione-nota">Pronto da stampare o salvare in PDF e mandare alla direzione</div>
        </div>
        <button type="button" className="pl-btn" data-variante="primario" onClick={stampa}>
          <Printer className="size-4" /> Stampa / PDF
        </button>
        <ChiudiFinestra onClick={onChiudi} />
      </div>
      <div className="pl-finestra-corpo">
        <article className="pl-report" style={{ '--pl-spazio': spazio?.colore ?? '#19c463' } as CSSProperties}>
          <header className="pl-report-testa">
            <span className="pl-report-marchio">Planner social · {spazio?.nome}</span>
            <div className="pl-report-titolo">
              Dal {etichettaGiornoLunga(a.dal)} al {etichettaGiornoLunga(a.al)}
            </div>
          </header>

          <section className="pl-report-kpi">
            {kpi.map((k) => (
              <div key={k.nome}>
                <span>{k.nome}</span>
                <b>{compatto(k.ora)}</b>
                <em>
                  {variazione(k.ora, k.prima)} sul periodo prima ({numero(k.prima)})
                </em>
              </div>
            ))}
          </section>

          <section className="pl-report-blocco pl-report-ai">
            <div className="pl-report-h">
              <Sparkles className="inline size-4" /> Il commento
            </div>
            {!stato.aiDisponibile ? <p>AI non configurata su questo gestionale.</p> : null}
            {carica ? (
              <p className="pl-report-attesa">
                <Loader2 className="inline size-4 animate-spin" /> L'AI sta leggendo i numeri…
              </p>
            ) : null}
            {errore ? <p>{errore}</p> : null}
            {commento ? (
              <>
                <p>{commento.sintesi}</p>
                <div className="pl-report-colonne">
                  {[
                    ['Cosa ha funzionato', commento.puntiForti],
                    ['Da migliorare', commento.daMigliorare],
                    ['Prossimi passi', commento.prossimiPassi],
                  ].map(([t, l]) => (
                    <div key={t as string}>
                      <div className="pl-report-h4">{t as string}</div>
                      <ul>
                        {(l as string[]).map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </section>

          <div className="pl-report-due">
            <section className="pl-report-blocco">
              <div className="pl-report-h">Canali</div>
              <div className="pl-report-tabella" data-colonne={4}>
                <div className="pl-report-riga" data-testa="">
                  <span>Canale</span>
                  <span>Pubblicazioni</span>
                  <span>Visualizzazioni</span>
                  <span>Interazioni</span>
                </div>
                {a.canali.map((c) => (
                  <div className="pl-report-riga" key={c.canale}>
                    <span>
                      <IconaCanale canale={c.canale} className="size-3.5" /> {INFO_CANALE[c.canale].nome}
                    </span>
                    <span>{numero(c.pubblicazioni)}</span>
                    <span>{c.visualizzazioni ? numero(c.visualizzazioni) : '—'}</span>
                    <span>{c.interazioni ? numero(c.interazioni) : '—'}</span>
                  </div>
                ))}
                {a.canali.length === 0 ? (
                  <div className="pl-report-riga">
                    <span className="pl-report-vuota">Nessuna pubblicazione nel periodo.</span>
                  </div>
                ) : null}
              </div>
            </section>
            <section className="pl-report-blocco">
              <div className="pl-report-h">Rubriche</div>
              <div className="pl-report-tabella" data-colonne={3}>
                <div className="pl-report-riga" data-testa="">
                  <span>Rubrica</span>
                  <span>Post</span>
                  <span>Interazioni</span>
                </div>
                {a.etichette.map((e) => (
                  <div className="pl-report-riga" key={e.etichettaId ?? 'x'}>
                    <span>
                      <span className="pl-rubrica-dot" style={{ '--pl-r': e.colore } as CSSProperties} /> {e.nome}
                    </span>
                    <span>{e.post}</span>
                    <span>{e.interazioni ? numero(e.interazioni) : '—'}</span>
                  </div>
                ))}
              </div>
              {migliori.length ? (
                <p className="pl-report-nota">
                  Le fasce che rendono di più: {migliori.map((o) => `${GIORNI[o.giorno - 1]} alle ${o.ora}`).join(', ')}.
                </p>
              ) : null}
            </section>
          </div>

          {a.top.length ? (
            <section className="pl-report-blocco">
              <div className="pl-report-h">I post migliori</div>
              <div className="pl-report-top">
                {a.top.slice(0, 6).map((t, i) => (
                  <div key={`${t.postId}-${t.canale}`}>
                    {t.anteprimaUrl ? <img src={urlMedia(t.anteprimaUrl)} alt="" /> : <span className="pl-report-senza" />}
                    <b>
                      {i + 1}. {t.titolo || t.testo || 'Post'}
                    </b>
                    <span>
                      {INFO_CANALE[t.canale].nome} · {quandoBreve(t.pubblicatoIl)} · {numero(t.interazioni)} interazioni
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <footer className="pl-report-piede">
            Numeri riletti da Instagram, Facebook e YouTube; Google Business, TikTok e i canali pubblicati a mano contano come
            pubblicazioni. Generato il {etichettaGiornoLunga(new Date().toISOString().slice(0, 10))}.
          </footer>
        </article>
      </div>
    </FinestraPlanner>
  )
}
