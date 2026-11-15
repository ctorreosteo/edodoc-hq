import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, EyeOff, Heart, Loader2, MessageCircleReply, RefreshCw, Search, Send, ShieldAlert, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/lib/toast'
import { errorMessage } from '@/lib/youtube'
import { youtubeService, type YoutubeCommento } from '@/services/youtube-service'
import { Caricamento, Vuoto } from './yt-shared'
import { fmt } from '@/lib/youtube'

type Vista = 'tutti' | 'da-rispondere' | 'heldForReview' | 'likelySpam'

function Avatar({ src, nome }: { src: string | null; nome: string }) {
  return src ? (
    <img src={src} alt="" className="yt-cavatar" referrerPolicy="no-referrer" loading="lazy" />
  ) : (
    <div className="yt-cavatar yt-cavatar--ph" aria-hidden>{nome.replace('@', '').charAt(0).toUpperCase()}</div>
  )
}

export function CommentiTab({ puoGestire, onApriVideo }: { puoGestire: boolean; onApriVideo: (id: string) => void }) {
  const [vista, setVista] = useState<Vista>('da-rispondere')
  const [ordine, setOrdine] = useState<'time' | 'relevance'>('time')
  const [cerca, setCerca] = useState('')
  const [cercaAttiva, setCercaAttiva] = useState('')
  const [commenti, setCommenti] = useState<YoutubeCommento[] | null>(null)
  const [prossima, setProssima] = useState<string | null>(null)
  const [carico, setCarico] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const moderazione = vista === 'heldForReview' || vista === 'likelySpam' ? vista : undefined

  const carica = useCallback(
    async (pagina: string | null) => {
      setCarico(true)
      setErrore(null)
      try {
        const r = await youtubeService.commenti({ pagina, ordine, cerca: cercaAttiva || undefined, moderazione })
        setCommenti((c) => (pagina && c ? [...c, ...r.commenti] : r.commenti))
        setProssima(r.prossimaPagina)
      } catch (e) {
        setErrore(errorMessage(e, 'Commenti non disponibili'))
      } finally {
        setCarico(false)
      }
    },
    [ordine, cercaAttiva, moderazione],
  )

  useEffect(() => {
    setCommenti(null)
    void carica(null)
  }, [carica])

  const visibili = useMemo(
    () => (commenti ?? []).filter((c) => vista !== 'da-rispondere' || !c.rispostoDalCanale),
    [commenti, vista],
  )
  const daRispondere = (commenti ?? []).filter((c) => !c.rispostoDalCanale).length

  const aggiorna = (id: string, f: (c: YoutubeCommento) => YoutubeCommento | null) =>
    setCommenti((lista) =>
      (lista ?? []).flatMap((c) => {
        if (c.id !== id) return [c]
        const nuovo = f(c)
        return nuovo ? [nuovo] : []
      }),
    )

  return (
    <div className="yt-stack">
      <div className="yt-toolbar">
        <div className="yt-seg" role="tablist" aria-label="Commenti">
          {(
            [
              ['da-rispondere', `Da rispondere${commenti ? ` ${daRispondere}` : ''}`],
              ['tutti', 'Tutti'],
              ['heldForReview', 'In revisione'],
              ['likelySpam', 'Probabile spam'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" data-active={vista === id ? '' : undefined} onClick={() => setVista(id)}>
              {label}
            </button>
          ))}
        </div>
        <form
          className="yt-search"
          onSubmit={(e) => {
            e.preventDefault()
            setCercaAttiva(cerca.trim())
          }}
        >
          <Search aria-hidden />
          <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca nei commenti e premi Invio" />
        </form>
        <div className="yt-seg" role="tablist" aria-label="Ordine">
          <button type="button" data-active={ordine === 'time' ? '' : undefined} onClick={() => setOrdine('time')}>Recenti</button>
          <button type="button" data-active={ordine === 'relevance' ? '' : undefined} onClick={() => setOrdine('relevance')}>Rilevanti</button>
        </div>
        <Button variant="outline" size="icon" aria-label="Aggiorna" onClick={() => void carica(null)} disabled={carico}>
          <RefreshCw className={carico ? 'animate-spin' : undefined} aria-hidden />
        </Button>
      </div>

      {errore ? <Vuoto>{errore}</Vuoto> : null}
      {!commenti && carico ? <Caricamento righe={6} /> : null}
      {commenti && !visibili.length ? (
        <Vuoto icona={<Check className="yt-empty-ok" />}>
          {vista === 'da-rispondere' ? 'Inbox zero: hai risposto a tutti i commenti caricati.' : 'Nessun commento qui.'}
        </Vuoto>
      ) : null}

      <ul className="yt-comments">
        {visibili.map((c, i) => (
          <CommentoCard
            key={c.id}
            c={c}
            indice={i}
            puoGestire={puoGestire}
            onApriVideo={onApriVideo}
            onRisposto={(r) => aggiorna(c.id, (x) => ({ ...x, rispostoDalCanale: true, risposte: x.risposte + 1, ultimeRisposte: [...x.ultimeRisposte, r] }))}
            onModerato={() => aggiorna(c.id, () => null)}
          />
        ))}
      </ul>

      {prossima ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void carica(prossima)} disabled={carico}>
            {carico ? <Loader2 className="animate-spin" aria-hidden /> : null} Carica altri commenti
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function CommentoCard({
  c,
  indice,
  puoGestire,
  onApriVideo,
  onRisposto,
  onModerato,
}: {
  c: YoutubeCommento
  indice: number
  puoGestire: boolean
  onApriVideo: (id: string) => void
  onRisposto: (r: YoutubeCommento['ultimeRisposte'][number]) => void
  onModerato: () => void
}) {
  const [aperto, setAperto] = useState(false)
  const [testo, setTesto] = useState('')
  const [invio, setInvio] = useState(false)
  const [ai, setAi] = useState(false)

  const bozzaAi = async () => {
    setAi(true)
    setAperto(true)
    try {
      const r = await youtubeService.aiRisposta({ testo: c.testo, videoTitolo: c.videoTitolo })
      setTesto(r.testo)
    } catch (e) {
      toast.error(errorMessage(e, 'AI non disponibile'))
    } finally {
      setAi(false)
    }
  }

  const invia = async () => {
    setInvio(true)
    try {
      const r = await youtubeService.rispondi(c.commentoId, testo)
      toast.success('Risposta pubblicata su YouTube')
      onRisposto(r)
      setTesto('')
      setAperto(false)
    } catch (e) {
      toast.error(errorMessage(e, 'Risposta non pubblicata'))
    } finally {
      setInvio(false)
    }
  }

  const modera = async (stato: 'published' | 'rejected') => {
    try {
      await youtubeService.modera(c.commentoId, stato)
      toast.success(stato === 'rejected' ? 'Commento nascosto' : 'Commento approvato')
      onModerato()
    } catch (e) {
      toast.error(errorMessage(e, 'Moderazione non riuscita'))
    }
  }

  return (
    <li className="yt-comment" style={{ animationDelay: `${Math.min(indice, 10) * 40}ms` }} data-risposto={c.rispostoDalCanale ? '' : undefined}>
      <Avatar src={c.autoreAvatar} nome={c.autore} />
      <div className="min-w-0 flex-1">
        <div className="yt-comment-head">
          <b>{c.autore}</b>
          <p>{fmt.fa(c.pubblicatoIl)}</p>
          {c.rispostoDalCanale ? <em className="yt-chip" data-tono="ok"><Check aria-hidden /> Risposto</em> : null}
          {c.moderazione !== 'published' ? <em className="yt-chip" data-tono="warn"><ShieldAlert aria-hidden /> In revisione</em> : null}
        </div>
        <button type="button" className="yt-comment-video" onClick={() => onApriVideo(c.videoId)}>
          su «{c.videoTitolo || 'video'}»
        </button>
        <p className="yt-comment-text">{c.testo}</p>
        <div className="yt-comment-foot">
          <p><Heart aria-hidden /> {fmt.int(c.like)}</p>
          {c.risposte ? <p><MessageCircleReply aria-hidden /> {c.risposte} risposte</p> : null}
          {puoGestire ? (
            <div className="yt-comment-actions">
              <button type="button" className="yt-link-btn" onClick={() => setAperto((a) => !a)}><MessageCircleReply aria-hidden /> Rispondi</button>
              <button type="button" className="yt-link-btn yt-link-btn--ai" onClick={bozzaAi} disabled={ai}>
                {ai ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} Bozza AI
              </button>
              {c.moderazione !== 'published' ? (
                <button type="button" className="yt-link-btn" onClick={() => void modera('published')}><Check aria-hidden /> Approva</button>
              ) : null}
              <button type="button" className="yt-link-btn yt-link-btn--danger" onClick={() => void modera('rejected')}><EyeOff aria-hidden /> Nascondi</button>
            </div>
          ) : null}
        </div>

        {c.ultimeRisposte.length ? (
          <ul className="yt-replies">
            {c.ultimeRisposte.map((r) => (
              <li key={r.id} data-canale={r.delCanale ? '' : undefined}>
                <Avatar src={r.autoreAvatar} nome={r.autore} />
                <div className="min-w-0">
                  <div className="yt-comment-head"><b>{r.autore}</b><p>{fmt.fa(r.pubblicatoIl)}</p></div>
                  <p className="yt-comment-text">{r.testo}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {aperto ? (
          <div className="yt-reply-box">
            <Textarea
              autoFocus
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              rows={3}
              placeholder={ai ? 'L’AI sta scrivendo…' : 'Scrivi la risposta del canale…'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && testo.trim()) void invia()
              }}
            />
            <div className="yt-reply-actions">
              <p className="yt-hint">⌘/Ctrl + Invio per pubblicare</p>
              <Button variant="ghost" size="sm" onClick={() => setAperto(false)}>Annulla</Button>
              <Button size="sm" className="yt-cta" disabled={!testo.trim() || invio} onClick={invia}>
                {invio ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Pubblica
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </li>
  )
}
