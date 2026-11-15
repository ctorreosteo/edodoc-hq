import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BarChart3,
  Brain,
  KanbanSquare,
  Link2,
  Loader2,
  LogOut,
  MessageSquareText,
  MoreHorizontal,
  PlaySquare,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { toast } from '@/lib/toast'
import { errorMessage } from '@/lib/youtube'
import {
  youtubeService,
  type YoutubeIdea,
  type YoutubePanoramica,
  type YoutubePubblico,
  type YoutubeStato,
  type YoutubeVideo,
} from '@/services/youtube-service'
import { LiveHero } from '@/components/youtube/yt-live'
import { useLive } from '@/hooks/use-youtube-live'
import { Panoramica } from '@/components/youtube/yt-panoramica'
import { VideoSheet, VideoTab } from '@/components/youtube/yt-video'
import { PubblicoTab } from '@/components/youtube/yt-pubblico'
import { CommentiTab } from '@/components/youtube/yt-commenti'
import { PianoTab } from '@/components/youtube/yt-piano'
import { AiTab } from '@/components/youtube/yt-ai'
import { Caricamento, Vuoto } from '@/components/youtube/yt-shared'
import '@/style/lux-youtube.css'

type Tab = 'panoramica' | 'video' | 'pubblico' | 'commenti' | 'piano' | 'ai'

const TABS: Array<{ id: Tab; label: string; icona: typeof BarChart3 }> = [
  { id: 'panoramica', label: 'Panoramica', icona: BarChart3 },
  { id: 'video', label: 'Video', icona: PlaySquare },
  { id: 'pubblico', label: 'Pubblico', icona: Users },
  { id: 'commenti', label: 'Commenti', icona: MessageSquareText },
  { id: 'piano', label: 'Piano editoriale', icona: KanbanSquare },
  { id: 'ai', label: 'AI Lab', icona: Brain },
]

const PERIODI = [
  { giorni: 7, label: '7 g' },
  { giorni: 28, label: '28 g' },
  { giorni: 90, label: '90 g' },
  { giorni: 365, label: '12 mesi' },
]

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function YouTube() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'panoramica') as Tab
  const setTab = useCallback(
    (t: Tab) =>
      setParams((p) => {
        const n = new URLSearchParams(p)
        n.set('tab', t)
        return n
      }, { replace: true }),
    [setParams],
  )

  const [stato, setStato] = useState<YoutubeStato | null>(null)
  const [erroreStato, setErroreStato] = useState<string | null>(null)
  const [giorni, setGiorni] = useState(28)
  const [panoramica, setPanoramica] = useState<YoutubePanoramica | null>(null)
  const [erroreDati, setErroreDati] = useState<string | null>(null)
  const [video, setVideo] = useState<YoutubeVideo[] | null>(null)
  const [pubblico, setPubblico] = useState<YoutubePubblico | null>(null)
  const [caricoDati, setCaricoDati] = useState(false)
  const [giro, setGiro] = useState(0)
  const [videoAperto, setVideoAperto] = useState<string | null>(null)
  const [ideaAi, setIdeaAi] = useState<YoutubeIdea | null>(null)
  const [netti28, setNetti28] = useState<number | null>(null)

  const collegato = Boolean(stato?.collegato && stato.canale)
  const { live, errore: erroreLive, primo } = useLive(collegato)

  const periodo = useMemo(() => {
    const al = new Date()
    const dal = new Date()
    dal.setDate(al.getDate() - (giorni - 1))
    return { dal: ymd(dal), al: ymd(al) }
  }, [giorni])

  const caricaStato = useCallback(async () => {
    try {
      setStato(await youtubeService.stato())
      setErroreStato(null)
    } catch (e) {
      setErroreStato(errorMessage(e, 'YouTube non disponibile'))
    }
  }, [])

  useEffect(() => {
    void caricaStato()
  }, [caricaStato])

  // Panoramica e video del periodo
  useEffect(() => {
    if (!collegato) return
    const ctrl = new AbortController()
    setCaricoDati(true)
    setErroreDati(null)
    setPubblico(null)
    Promise.allSettled([
      youtubeService.panoramica(periodo, ctrl.signal).then(setPanoramica),
      youtubeService.video(periodo, ctrl.signal).then(setVideo),
    ]).then((r) => {
      if (ctrl.signal.aborted) return
      const fallita = r.find((x) => x.status === 'rejected') as PromiseRejectedResult | undefined
      if (fallita) setErroreDati(errorMessage(fallita.reason, 'Dati non disponibili'))
      setCaricoDati(false)
    })
    return () => ctrl.abort()
  }, [collegato, periodo, giro])

  // Ritmo di crescita per la previsione dell'obiettivo: sempre sugli ultimi 28 giorni
  useEffect(() => {
    if (!collegato) return
    if (giorni === 28 && panoramica) {
      setNetti28(panoramica.corrente.iscrittiGuadagnati - panoramica.corrente.iscrittiPersi)
      return
    }
    if (netti28 != null) return
    const al = new Date()
    const dal = new Date()
    dal.setDate(al.getDate() - 27)
    youtubeService
      .panoramica({ dal: ymd(dal), al: ymd(al) })
      .then((p) => setNetti28(p.corrente.iscrittiGuadagnati - p.corrente.iscrittiPersi))
      .catch(() => undefined)
  }, [collegato, giorni, panoramica, netti28])

  useEffect(() => {
    if (!collegato || tab !== 'pubblico' || pubblico) return
    const ctrl = new AbortController()
    youtubeService.pubblico(periodo, ctrl.signal).then(setPubblico).catch((e) => !ctrl.signal.aborted && toast.error(errorMessage(e)))
    return () => ctrl.abort()
  }, [collegato, tab, pubblico, periodo])

  // Scorciatoie 1-6 per le schede
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest('input, textarea, [contenteditable="true"], [role="dialog"]')) return
      const n = Number(e.key)
      if (n >= 1 && n <= TABS.length) setTab(TABS[n - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setTab])

  const collega = async () => {
    try {
      const { url } = await youtubeService.urlConsenso()
      window.location.assign(url)
    } catch (e) {
      toast.error(errorMessage(e, 'Collegamento non disponibile'))
    }
  }

  const scollega = async () => {
    if (!window.confirm('Scollegare il canale YouTube? Le statistiche smetteranno di aggiornarsi finché non lo ricolleghi.')) return
    try {
      await youtubeService.scollega()
      toast.success('Canale scollegato')
      await caricaStato()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const salvaObiettivo = async (n: number | null) => {
    try {
      await youtubeService.salvaObiettivo(n)
      setStato((s) => (s ? { ...s, obiettivoIscritti: n } : s))
      toast.success(n ? 'Obiettivo salvato' : 'Obiettivo rimosso')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  if (!stato) {
    return (
      <div className="yt-root yt-page">
        {erroreStato ? <Vuoto>{erroreStato}</Vuoto> : <Caricamento righe={4} />}
      </div>
    )
  }

  if (!collegato) {
    return (
      <div className="yt-root yt-page">
        <Collegamento stato={stato} onCollega={collega} />
      </div>
    )
  }

  return (
    <div className="yt-root yt-page">
      <LiveHero
        canale={stato.canale!}
        live={live}
        primo={primo}
        errore={erroreLive}
        obiettivo={stato.obiettivoIscritti}
        netti30g={netti28}
        puoGestire={stato.puoGestire}
        onObiettivo={salvaObiettivo}
      />

      <div className="yt-nav">
        <nav className="yt-tabs" role="tablist" aria-label="Sezioni YouTube">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              data-active={tab === t.id ? '' : undefined}
              onClick={() => setTab(t.id)}
              title={`${t.label} (${i + 1})`}
            >
              <t.icona aria-hidden />
              <p>{t.label}</p>
            </button>
          ))}
        </nav>
        <div className="yt-nav-right">
          {tab !== 'commenti' && tab !== 'piano' ? (
            <div className="yt-seg" role="tablist" aria-label="Periodo">
              {PERIODI.map((p) => (
                <button key={p.giorni} type="button" data-active={giorni === p.giorni ? '' : undefined} onClick={() => setGiorni(p.giorni)}>
                  {p.label}
                </button>
              ))}
            </div>
          ) : null}
          <Button variant="outline" size="icon" aria-label="Aggiorna i dati" disabled={caricoDati} onClick={() => { setPubblico(null); setGiro((g) => g + 1) }}>
            {caricoDati ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          </Button>
          {stato.puoCollegare ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Altro"><MoreHorizontal aria-hidden /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={collega}><Link2 aria-hidden /> Ricollega o cambia canale</DropdownMenuItem>
                <DropdownMenuItem onClick={scollega} className="text-red-600"><LogOut aria-hidden /> Scollega il canale</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {erroreDati && tab !== 'commenti' && tab !== 'piano' ? <p className="yt-banner-error">{erroreDati}</p> : null}

      <div className="yt-tabpanel" key={tab}>
        {tab === 'panoramica' ? (
          panoramica ? <Panoramica dati={panoramica} video={video} onApriVideo={setVideoAperto} /> : <Caricamento righe={6} />
        ) : null}
        {tab === 'video' ? <VideoTab video={video} caricamento={caricoDati} onApri={setVideoAperto} /> : null}
        {tab === 'pubblico' ? (pubblico ? <PubblicoTab dati={pubblico} /> : <Caricamento righe={6} />) : null}
        {tab === 'commenti' ? <CommentiTab puoGestire={stato.puoGestire} onApriVideo={setVideoAperto} /> : null}
        {tab === 'piano' ? (
          <PianoTab puoGestire={stato.puoGestire} video={video} onAi={(i) => { setIdeaAi(i); setTab('ai') }} />
        ) : null}
        {tab === 'ai' ? <AiTab dal={periodo.dal} al={periodo.al} puoGestire={stato.puoGestire} ideaIniziale={ideaAi} /> : null}
      </div>

      <VideoSheet
        videoId={videoAperto}
        puoGestire={stato.puoGestire}
        onChiudi={() => setVideoAperto(null)}
        onAggiornato={() => setGiro((g) => g + 1)}
      />
    </div>
  )
}

function Collegamento({ stato, onCollega }: { stato: YoutubeStato; onCollega: () => void }) {
  const [attesa, setAttesa] = useState(false)
  return (
    <section className="yt-connect">
      <div className="yt-hero-aurora" aria-hidden />
      <div className="yt-connect-logo" aria-hidden>
        <PlaySquare />
      </div>
      <h2 className="yt-connect-title">Collega il canale YouTube</h2>
      <p className="yt-connect-sub">
        Statistiche in tempo reale, Analytics completi, gestione di video e commenti, piano editoriale e AI: tutto qui, senza aprire YouTube Studio.
      </p>
      {stato.errore ? <p className="yt-banner-error">{stato.errore}</p> : null}
      {!stato.clientConfigurato ? (
        <div className="yt-connect-steps">
          <p><ShieldCheck aria-hidden /> Canale non collegato: manca il client OAuth Google. Crea un client «Applicazione web» nel progetto Google Cloud e imposta <code>YOUTUBE_OAUTH_CLIENT_ID</code> e <code>YOUTUBE_OAUTH_CLIENT_SECRET</code> come variabili d’ambiente del backend, poi riavvialo.</p>
        </div>
      ) : null}
      <ol className="yt-connect-steps">
        <li>Nel progetto Google Cloud abilita <b>YouTube Data API v3</b> e <b>YouTube Analytics API</b>.</li>
        <li>Tra gli URI di reindirizzamento del client OAuth aggiungi <code>{stato.redirectUri}</code>.</li>
        <li>Clicca «Collega» ed entra con l’account proprietario del canale (scegli il canale se ne hai più di uno).</li>
      </ol>
      {stato.puoCollegare ? (
        <Button className="yt-cta yt-cta--lg" disabled={!stato.clientConfigurato || attesa} onClick={() => { setAttesa(true); onCollega() }}>
          {attesa ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 aria-hidden />} Collega il canale
        </Button>
      ) : (
        <p className="yt-connect-sub">Solo l’account del dottore può collegare il canale.</p>
      )}
    </section>
  )
}
