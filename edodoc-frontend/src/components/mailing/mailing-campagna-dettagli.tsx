import { useEffect, useRef, useState } from 'react'
import { FlaskConical, Inbox, Link2, Loader2, Monitor, Plus, Smartphone, Smile, Sparkles, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from '@/lib/toast'
import { mailingService, messaggioErroreMailing, type MailingAiOggetto, type MailingCampagna, type MailingTestAb } from '@/services/mailing-service'
import { normalizzaDocumento, testoSemplice } from '@/lib/mailing-render'
import { AnteprimaInbox } from './mailing-anteprima'
import { Campo, Cursore, Interruttore, MenuSegnaposto, Segmentato } from './mailing-editor-controlli'
import { inserisciAlCursore, PORTALE } from './mailing-editor-dati'
import { EMOJI_OGGETTO, slug, testAbVuoto } from './mailing-campagna-dati'
import type { Riferimenti } from './mailing-campagna-wizard'
import { formatNumero } from './mailing-utils'

/* Passo 1: nome, mittente, categoria, oggetto e preheader con anteprima nella casella, suggerimenti AI, A/B test, UTM. */

function Contatore({ n, ideale, massimo }: { n: number; ideale: [number, number]; massimo: number }) {
  const tono = n === 0 ? undefined : n > massimo ? 'errore' : n < ideale[0] || n > ideale[1] ? 'avviso' : 'ok'
  return (
    <span className="ml-cp-contatore" data-tono={tono} title={`Ideale tra ${ideale[0]} e ${ideale[1]} caratteri`}>
      {n}
    </span>
  )
}

function SceltaEmoji({ onScegli }: { onScegli: (e: string) => void }) {
  const [aperto, setAperto] = useState(false)
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <button type="button" className="ml-ed-tb-btn" title="Aggiungi un'emoji" aria-label="Aggiungi un'emoji" onMouseDown={(e) => e.preventDefault()}>
          <Smile />
        </button>
      </PopoverTrigger>
      <PopoverContent className="ml-ed-pop ml-cp-emoji" align="end" {...PORTALE}>
        <div className="ml-cp-emoji-griglia">
          {EMOJI_OGGETTO.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onScegli(e)
                setAperto(false)
              }}
              aria-label={`Emoji ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="ml-ed-aiuto">Una sola emoji basta: aiuta a farsi notare, troppe sembrano spam.</div>
      </PopoverContent>
    </Popover>
  )
}

/** Input di testo con emoji, segnaposto e contatore caratteri. */
function CampoOggetto({
  etichetta,
  valore,
  onChange,
  placeholder,
  ideale,
  massimo,
  aiuto,
  azioneExtra,
  autoFocus,
}: {
  etichetta: string
  valore: string
  onChange: (v: string) => void
  placeholder: string
  ideale: [number, number]
  massimo: number
  aiuto?: React.ReactNode
  azioneExtra?: React.ReactNode
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const cursore = useRef<number | null>(null)
  useEffect(() => {
    if (cursore.current != null && ref.current) {
      ref.current.focus()
      ref.current.setSelectionRange(cursore.current, cursore.current)
      cursore.current = null
    }
  })
  const inserisci = (t: string) => {
    const r = inserisciAlCursore(ref.current, valore, t)
    cursore.current = r.cursore
    onChange(r.valore)
  }
  return (
    <Campo etichetta={etichetta} aiuto={aiuto} azione={azioneExtra}>
      <div className="ml-cp-oggetto">
        <input ref={ref} className="ml-input" value={valore} placeholder={placeholder} aria-label={etichetta} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} maxLength={200} />
        <div className="ml-cp-oggetto-strumenti">
          <SceltaEmoji onScegli={inserisci} />
          <MenuSegnaposto compatto onScegli={inserisci} />
          <Contatore n={[...valore].length} ideale={ideale} massimo={massimo} />
        </div>
      </div>
    </Campo>
  )
}

function SuggerimentiAi({ c, onUsa }: { c: MailingCampagna; onUsa: (oggetto: string) => void }) {
  const [lista, setLista] = useState<MailingAiOggetto[] | null>(null)
  const [lavoro, setLavoro] = useState(false)
  const chiedi = async () => {
    setLavoro(true)
    try {
      const contenuto = c.design ? testoSemplice(normalizzaDocumento(c.design)).slice(0, 4000) : null
      setLista(await mailingService.aiOggetti({ oggetto: c.oggetto, contenuto, obiettivo: null }))
    } catch (e) {
      toast.error(messaggioErroreMailing(e, 'Suggerimenti non disponibili'))
    } finally {
      setLavoro(false)
    }
  }
  return (
    <div className="ml-cp-ai">
      <button type="button" className="ml-btn ml-btn--ai ml-btn--sm" onClick={() => void chiedi()} disabled={lavoro}>
        {lavoro ? <Loader2 className="ml-ed-gira" /> : <Sparkles />}
        {lista ? 'Altri suggerimenti' : 'Suggerisci oggetti con AI'}
      </button>
      {lavoro && !lista ? (
        <div className="ml-cp-ai-lista">
          {[0, 1, 2].map((i) => (
            <span key={i} className="ml-skeleton" style={{ height: 58, display: 'block', borderRadius: 12 }} />
          ))}
        </div>
      ) : lista ? (
        <div className="ml-cp-ai-lista" data-occupato={lavoro ? '' : undefined}>
          {lista.map((s, i) => (
            <button key={`${s.oggetto}-${i}`} type="button" className="ml-cp-ai-voce" onClick={() => onUsa(s.oggetto)} style={{ animationDelay: `${i * 60}ms` }}>
              <span className="ml-cp-ai-punteggio" style={{ '--ml-p': `${Math.max(0, Math.min(100, s.punteggio))}%` } as React.CSSProperties}>
                {Math.round(s.punteggio)}
              </span>
              <span className="ml-cp-ai-testi">
                <strong>{s.oggetto}</strong>
                <small>{s.motivazione}</small>
              </span>
              <span className="ml-cp-ai-usa">Usa</span>
            </button>
          ))}
          {c.design ? null : <div className="ml-ed-aiuto">Scrivi prima il contenuto: i suggerimenti saranno più mirati.</div>}
        </div>
      ) : null}
    </div>
  )
}

function SezioneAb({ c, aggiorna }: { c: MailingCampagna; aggiorna: (p: Partial<MailingCampagna>) => void }) {
  const ab = c.testAb
  const imposta = (p: Partial<MailingTestAb>) => {
    if (!ab) return
    const nuovo = { ...ab, ...p }
    const a = nuovo.varianti[0]
    aggiorna({ testAb: nuovo, oggetto: a.oggetto, preheader: a.preheader })
  }
  return (
    <section className="ml-card ml-cp-sezione">
      <Interruttore
        etichetta={
          <span className="ml-cp-sezione-titolo">
            <FlaskConical /> Test A/B dell'oggetto
          </span>
        }
        descrizione="Prova 2 o 3 oggetti su una parte del pubblico: al resto arriva quello che funziona meglio."
        attivo={!!ab}
        onChange={(v) => aggiorna({ testAb: v ? testAbVuoto(c.oggetto, c.preheader) : null })}
      />
      {ab ? (
        <div className="ml-cp-ab">
          {ab.varianti.map((v, i) => (
            <div key={v.chiave} className="ml-cp-ab-variante">
              <span className="ml-cp-ab-lettera" data-v={v.chiave}>
                {v.chiave}
              </span>
              <div className="ml-cp-ab-campi">
                <input
                  className="ml-input"
                  value={v.oggetto}
                  placeholder={i === 0 ? 'Oggetto principale' : 'Oggetto alternativo'}
                  aria-label={`Oggetto variante ${v.chiave}`}
                  onChange={(e) => imposta({ varianti: ab.varianti.map((x, j) => (j === i ? { ...x, oggetto: e.target.value } : x)) })}
                />
                <input
                  className="ml-input ml-cp-ab-pre"
                  value={v.preheader ?? ''}
                  placeholder="Anteprima (facoltativa)"
                  aria-label={`Anteprima variante ${v.chiave}`}
                  onChange={(e) => imposta({ varianti: ab.varianti.map((x, j) => (j === i ? { ...x, preheader: e.target.value || null } : x)) })}
                />
              </div>
              {i === 2 ? (
                <button type="button" className="ml-ed-icona-btn" aria-label="Rimuovi la variante C" onClick={() => imposta({ varianti: ab.varianti.slice(0, 2) })}>
                  <X />
                </button>
              ) : null}
            </div>
          ))}
          {ab.varianti.length < 3 ? (
            <button type="button" className="ml-btn ml-btn--ghost ml-btn--sm ml-cp-ab-aggiungi" onClick={() => imposta({ varianti: [...ab.varianti, { chiave: 'C', oggetto: '', preheader: ab.varianti[0].preheader }] })}>
              <Plus /> Aggiungi una terza variante
            </button>
          ) : null}
          <div className="ml-ed-riga2">
            <Campo etichetta="Parte del pubblico per il test">
              <Cursore ariaLabel="Percentuale test" valore={ab.percentualeTest} min={10} max={50} step={5} unita="%" onChange={(v) => imposta({ percentualeTest: v })} />
            </Campo>
            <Campo etichetta="Attesa prima di scegliere">
              <select className="ml-select ml-ed-input" value={ab.oreAttesa} onChange={(e) => imposta({ oreAttesa: Number(e.target.value) })} aria-label="Ore di attesa">
                {[1, 2, 4, 6, 12, 24].map((h) => (
                  <option key={h} value={h}>
                    {h === 1 ? '1 ora' : h === 24 ? '1 giorno' : `${h} ore`}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo etichetta="Vince l'oggetto con più">
            <Segmentato
              ariaLabel="Metrica"
              valore={ab.metrica}
              onChange={(v) => imposta({ metrica: v })}
              opzioni={[
                { valore: 'APERTURE', etichetta: 'Aperture' },
                { valore: 'CLICK', etichetta: 'Click' },
              ]}
            />
          </Campo>
          <div className="ml-ed-nota">
            Ogni variante va al {Math.round(ab.percentualeTest / ab.varianti.length)}% del pubblico. Dopo {ab.oreAttesa === 1 ? "un'ora" : `${ab.oreAttesa} ore`} il restante {100 - ab.percentualeTest}% riceve l'oggetto con più {ab.metrica === 'APERTURE' ? 'aperture' : 'click'} (le aperture automatiche degli antivirus non contano).
          </div>
        </div>
      ) : null}
    </section>
  )
}

export function PassoDettagli({ c, rif, aggiorna, aiDisponibile }: { c: MailingCampagna; rif: Riferimenti; aggiorna: (p: Partial<MailingCampagna>) => void; aiDisponibile: boolean }) {
  const [vistaInbox, setVistaInbox] = useState<'mobile' | 'desktop'>('mobile')
  const mittente = rif.mittenti.find((m) => m.id === c.mittenteId)
  const oggetto = c.testAb ? c.testAb.varianti[0].oggetto : (c.oggetto ?? '')
  const setOggetto = (v: string) => (c.testAb ? aggiorna({ oggetto: v, testAb: { ...c.testAb, varianti: c.testAb.varianti.map((x, i) => (i === 0 ? { ...x, oggetto: v } : x)) } }) : aggiorna({ oggetto: v }))
  const setPreheader = (v: string) =>
    c.testAb ? aggiorna({ preheader: v || null, testAb: { ...c.testAb, varianti: c.testAb.varianti.map((x, i) => (i === 0 ? { ...x, preheader: v || null } : x)) } }) : aggiorna({ preheader: v || null })
  const utmSuggerito = slug(c.nome)

  return (
    <div className="ml-cp-due">
      <div className="ml-cp-colonna">
        <section className="ml-card ml-cp-sezione">
          <div className="ml-cp-sezione-titolo">
            <Inbox /> Chi scrive e cosa si legge nella casella
          </div>
          <div className="ml-ed-riga2">
            <Campo etichetta="Mittente" aiuto={mittente ? `${mittente.email} · oggi ${formatNumero(mittente.inviatiUltime24h)} di ${formatNumero(mittente.limiteGiornaliero)} invii` : 'Le email partono da questa casella del dottore.'}>
              <select className="ml-select ml-ed-input" value={c.mittenteId ?? ''} onChange={(e) => aggiorna({ mittenteId: e.target.value ? Number(e.target.value) : null })} aria-label="Mittente">
                <option value="">Scegli il mittente…</option>
                {rif.mittenti
                  .filter((m) => m.attivo || m.id === c.mittenteId)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nomeVisualizzato} · {m.email}
                      {m.predefinito ? ' (predefinito)' : ''}
                    </option>
                  ))}
              </select>
            </Campo>
            <Campo etichetta="Categoria" aiuto="Chi ha escluso questa categoria dalle preferenze non la riceve.">
              <select className="ml-select ml-ed-input" value={c.categoriaId ?? ''} onChange={(e) => aggiorna({ categoriaId: e.target.value ? Number(e.target.value) : null })} aria-label="Categoria">
                <option value="">Nessuna categoria</option>
                {rif.categorie
                  .filter((x) => x.attiva || x.id === c.categoriaId)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nome}
                    </option>
                  ))}
              </select>
            </Campo>
          </div>
          <CampoOggetto
            etichetta="Oggetto"
            valore={oggetto}
            onChange={setOggetto}
            placeholder="Es. {{nome|Ciao}}, le novità di novembre"
            ideale={[25, 50]}
            massimo={90}
            autoFocus={!oggetto}
            aiuto="Tra 25 e 50 caratteri si legge per intero anche sul telefono. Evita MAIUSCOLE e troppi punti esclamativi."
          />
          <CampoOggetto
            etichetta="Anteprima del testo (preheader)"
            valore={(c.testAb ? c.testAb.varianti[0].preheader : c.preheader) ?? ''}
            onChange={setPreheader}
            placeholder="La riga grigia che segue l'oggetto"
            ideale={[40, 100]}
            massimo={140}
            aiuto="Completa l'oggetto: è il secondo motivo per cui si apre un'email."
          />
          {aiDisponibile ? (
            <SuggerimentiAi
              c={c}
              onUsa={(o) => {
                setOggetto(o)
                toast.success('Oggetto aggiornato')
              }}
            />
          ) : null}
        </section>

        <SezioneAb c={c} aggiorna={aggiorna} />

        <section className="ml-card ml-cp-sezione">
          <div className="ml-cp-sezione-titolo">
            <Link2 /> Tracciamento su Google Analytics
          </div>
          <Interruttore
            etichetta="Aggiungi i parametri UTM ai link"
            descrizione="Così in Analytics vedi le visite al sito arrivate da questa email (sorgente: email)."
            attivo={c.utmCampaign != null}
            onChange={(v) => aggiorna({ utmCampaign: v ? utmSuggerito || 'campagna-email' : null })}
          />
          {c.utmCampaign != null ? (
            <Campo etichetta="Nome della campagna in Analytics (utm_campaign)">
              <input className="ml-input ml-ed-input" value={c.utmCampaign} onChange={(e) => aggiorna({ utmCampaign: slug(e.target.value) || e.target.value })} aria-label="utm_campaign" spellCheck={false} />
            </Campo>
          ) : null}
        </section>
      </div>

      <aside className="ml-cp-colonna ml-cp-colonna--anteprima">
        <div className="ml-cp-appiccicoso">
          <div className="ml-cp-anteprima-testa">
            <span className="ml-etichetta">Così la vedranno</span>
            <div className="ml-ed-seg" role="radiogroup" aria-label="Dispositivo">
              <button type="button" role="radio" aria-checked={vistaInbox === 'mobile'} data-attivo={vistaInbox === 'mobile' ? '' : undefined} onClick={() => setVistaInbox('mobile')}>
                <Smartphone /> Telefono
              </button>
              <button type="button" role="radio" aria-checked={vistaInbox === 'desktop'} data-attivo={vistaInbox === 'desktop' ? '' : undefined} onClick={() => setVistaInbox('desktop')}>
                <Monitor /> Computer
              </button>
            </div>
          </div>
          <AnteprimaInbox
            modo={vistaInbox}
            mittente={mittente?.nomeVisualizzato ?? 'Dr. Edoardo Bo'}
            oggetto={oggetto.replace(/\{\{\s*nome\s*(\|[^}]*)?\}\}/gi, 'Giulia').replace(/\{\{[^}]*\}\}/g, '…')}
            preheader={((c.testAb ? c.testAb.varianti[0].preheader : c.preheader) ?? '').replace(/\{\{\s*nome\s*(\|[^}]*)?\}\}/gi, 'Giulia')}
          />
          {c.testAb && c.testAb.varianti.length > 1 ? (
            <div className="ml-cp-anteprima-varianti">
              {c.testAb.varianti.slice(1).map((v) => (
                <div key={v.chiave} className="ml-cp-anteprima-variante">
                  <span className="ml-cp-ab-lettera" data-v={v.chiave}>
                    {v.chiave}
                  </span>
                  <span>{v.oggetto || <em>Oggetto da scrivere</em>}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="ml-cp-consigli">
            <div className="ml-etichetta">Per farla aprire</div>
            <ul>
              <li>Il nome della persona nell'oggetto aumenta le aperture: {'{{nome|Ciao}}'} usa "Ciao" se il nome manca.</li>
              <li>Prometti solo ciò che c'è dentro: niente "ultima occasione" se non lo è.</li>
              <li>Parla di benessere e prevenzione, mai di guarigione garantita.</li>
            </ul>
          </div>
        </div>
      </aside>
    </div>
  )
}
