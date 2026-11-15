import { useEffect, useState } from 'react'
import { Brain, Check, Copy, Lightbulb, ListPlus, Loader2, Rocket, ShieldAlert, Sparkles, Target, ThumbsUp, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/lib/toast'
import { errorMessage } from '@/lib/youtube'
import {
  youtubeService,
  type YoutubeAiAnalisi,
  type YoutubeAiPacchetto,
  type YoutubeFormato,
  type YoutubeIdea,
} from '@/services/youtube-service'
import { Pannello } from './yt-shared'
import { copia } from '@/lib/youtube'

function Copia({ testo }: { testo: string }) {
  return (
    <button type="button" className="yt-icon-btn" aria-label="Copia" title="Copia" onClick={() => copia(testo, toast)}>
      <Copy aria-hidden />
    </button>
  )
}

export function AiTab({
  dal,
  al,
  puoGestire,
  ideaIniziale,
}: {
  dal: string
  al: string
  puoGestire: boolean
  ideaIniziale: YoutubeIdea | null
}) {
  const [argomento, setArgomento] = useState('')
  const [note, setNote] = useState('')
  const [formato, setFormato] = useState<YoutubeFormato>('VIDEO')
  const [pacchetto, setPacchetto] = useState<YoutubeAiPacchetto | null>(null)
  const [generando, setGenerando] = useState(false)
  const [analisi, setAnalisi] = useState<YoutubeAiAnalisi | null>(null)
  const [analizzando, setAnalizzando] = useState(false)
  const [aggiunte, setAggiunte] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!ideaIniziale) return
    setArgomento(ideaIniziale.titolo)
    setNote(ideaIniziale.note ?? '')
    setFormato(ideaIniziale.formato === 'SHORT' ? 'SHORT' : 'VIDEO')
    setPacchetto(null)
  }, [ideaIniziale])

  const genera = async () => {
    setGenerando(true)
    try {
      setPacchetto(await youtubeService.aiPacchetto({ argomento, note, formato }))
    } catch (e) {
      toast.error(errorMessage(e, 'AI non disponibile'))
    } finally {
      setGenerando(false)
    }
  }

  const analizza = async () => {
    setAnalizzando(true)
    try {
      setAnalisi(await youtubeService.aiAnalisi({ dal, al }))
    } catch (e) {
      toast.error(errorMessage(e, 'Analisi non disponibile'))
    } finally {
      setAnalizzando(false)
    }
  }

  const aggiungiAlPiano = async (titolo: string) => {
    try {
      await youtubeService.creaIdea({ titolo, stato: 'IDEA', formato: 'VIDEO', priorita: 'MEDIA', note: 'Idea suggerita dall’analisi AI del canale.' })
      setAggiunte((s) => new Set(s).add(titolo))
      toast.success('Aggiunta al piano editoriale')
    } catch (e) {
      toast.error(errorMessage(e, 'Idea non aggiunta'))
    }
  }

  return (
    <div className="yt-stack">
      <Pannello
        className="yt-panel--ai"
        icona={<Brain />}
        titolo="Il consulente del canale"
        sottotitolo="Legge tutti i numeri del periodo selezionato (crescita, video, fonti, ricerche, pubblico) e ti dice cosa fare nelle prossime due settimane."
        azioni={
          <Button className="yt-cta" onClick={analizza} disabled={analizzando}>
            {analizzando ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} {analisi ? 'Rifai l’analisi' : 'Analizza il canale'}
          </Button>
        }
      >
        {analizzando && !analisi ? (
          <div className="yt-thinking">
            <i /><i /><i />
            <p>Sto leggendo visualizzazioni, fidelizzazione, ricerche e pubblico…</p>
          </div>
        ) : null}
        {analisi ? (
          <div className="yt-analysis">
            <div className="yt-grade" data-voto={analisi.voto.charAt(0)}>
              <b>{analisi.voto.charAt(0) || '?'}</b>
              <small>salute del canale</small>
            </div>
            <p className="yt-analysis-sum">{analisi.sintesi}</p>
            <div className="yt-grid-2">
              <div className="yt-analysis-list" data-tono="ok">
                <p className="yt-ai-label"><ThumbsUp aria-hidden /> Cosa funziona</p>
                <ul>{analisi.puntiForza.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
              <div className="yt-analysis-list" data-tono="warn">
                <p className="yt-ai-label"><ShieldAlert aria-hidden /> Cosa frena</p>
                <ul>{analisi.criticita.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            </div>
            <p className="yt-ai-label"><Target aria-hidden /> Piano d’azione</p>
            <ol className="yt-actions">
              {analisi.azioni.map((a, i) => (
                <li key={a.titolo}>
                  <em className="yt-actions-n">{i + 1}</em>
                  <div className="min-w-0">
                    <div className="yt-actions-head">
                      <b>{a.titolo}</b>
                      <em className="yt-chip" data-tono={a.impatto === 'ALTO' ? 'hot' : a.impatto === 'MEDIO' ? 'info' : 'muted'}>
                        Impatto {a.impatto.toLowerCase()}
                      </em>
                    </div>
                    <p>{a.dettaglio}</p>
                  </div>
                </li>
              ))}
            </ol>
            {analisi.ideeVideo.length ? (
              <>
                <p className="yt-ai-label"><Lightbulb aria-hidden /> Video da fare</p>
                <ul className="yt-ideas">
                  {analisi.ideeVideo.map((t) => (
                    <li key={t}>
                      <p>{t}</p>
                      {puoGestire ? (
                        <Button size="sm" variant="outline" disabled={aggiunte.has(t)} onClick={() => void aggiungiAlPiano(t)}>
                          {aggiunte.has(t) ? <Check aria-hidden /> : <ListPlus aria-hidden />} {aggiunte.has(t) ? 'Nel piano' : 'Al piano'}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </Pannello>

      {puoGestire ? (
        <Pannello
          icona={<Rocket />}
          titolo="Pacchetto di lancio"
          sottotitolo="Titoli, descrizione SEO, tag, hook dei primi 15 secondi e testi della miniatura per il prossimo video."
        >
          <div className="yt-launch">
            <div className="yt-launch-form">
              <label className="yt-field">
                <div className="yt-field-head"><p>Di cosa parla il video</p></div>
                <Input value={argomento} onChange={(e) => setArgomento(e.target.value)} placeholder="es. Colazione proteica: perché ti cambia la mattinata" />
              </label>
              <div className="yt-field">
                <div className="yt-field-head"><p>Formato</p></div>
                <div className="yt-seg" role="tablist">
                  <button type="button" data-active={formato === 'VIDEO' ? '' : undefined} onClick={() => setFormato('VIDEO')}>Video lungo</button>
                  <button type="button" data-active={formato === 'SHORT' ? '' : undefined} onClick={() => setFormato('SHORT')}>Short</button>
                </div>
              </div>
              <label className="yt-field">
                <div className="yt-field-head"><p>Scaletta o trascrizione (facoltativa, migliora molto il risultato)</p></div>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={8} placeholder="Incolla la scaletta, lo script o la trascrizione del video" />
              </label>
              <Button className="yt-cta" disabled={generando || (!argomento.trim() && !note.trim())} onClick={genera}>
                {generando ? <Loader2 className="animate-spin" aria-hidden /> : <Wand2 aria-hidden />} Genera il pacchetto
              </Button>
            </div>

            <div className="yt-launch-out">
              {!pacchetto && !generando ? (
                <div className="yt-launch-ph">
                  <Sparkles aria-hidden />
                  <p>Il pacchetto comparirà qui.</p>
                </div>
              ) : null}
              {generando && !pacchetto ? (
                <div className="yt-thinking"><i /><i /><i /><p>Sto pensando al titolo perfetto…</p></div>
              ) : null}
              {pacchetto ? (
                <div className="yt-stack yt-stack--tight">
                  {pacchetto.testiMiniatura.length ? (
                    <div className="yt-thumbmocks">
                      {pacchetto.testiMiniatura.map((t, i) => (
                        <div key={t} className="yt-thumbmock" data-v={i % 4}>
                          <b>{t}</b>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div>
                    <p className="yt-ai-label">Titoli</p>
                    <ol className="yt-titles">
                      {pacchetto.titoli.map((t) => (
                        <li key={t}>
                          <p>{t}</p>
                          <small data-lungo={t.length > 70 ? '' : undefined}>{t.length}</small>
                          <Copia testo={t} />
                        </li>
                      ))}
                    </ol>
                  </div>
                  {pacchetto.hook.length ? (
                    <div>
                      <p className="yt-ai-label">Hook dei primi secondi</p>
                      <ul className="yt-hooks">{pacchetto.hook.map((h) => <li key={h}>“{h}”</li>)}</ul>
                    </div>
                  ) : null}
                  <div>
                    <div className="yt-ai-label-row"><p className="yt-ai-label">Descrizione</p><Copia testo={pacchetto.descrizione} /></div>
                    <div className="yt-ai-text">{pacchetto.descrizione}</div>
                  </div>
                  <div>
                    <div className="yt-ai-label-row"><p className="yt-ai-label">Tag</p><Copia testo={pacchetto.tag.join(', ')} /></div>
                    <div className="yt-tags yt-tags--static">{pacchetto.tag.map((t) => <em key={t} className="yt-tag">{t}</em>)}</div>
                  </div>
                  {pacchetto.capitoli.length ? (
                    <div>
                      <div className="yt-ai-label-row"><p className="yt-ai-label">Capitoli</p><Copia testo={pacchetto.capitoli.join('\n')} /></div>
                      <div className="yt-ai-text">{pacchetto.capitoli.join('\n')}</div>
                    </div>
                  ) : null}
                  {pacchetto.consiglio ? <p className="yt-ai-tip">{pacchetto.consiglio}</p> : null}
                </div>
              ) : null}
            </div>
          </div>
        </Pannello>
      ) : null}
    </div>
  )
}
