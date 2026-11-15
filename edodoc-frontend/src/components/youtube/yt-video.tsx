import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowUpRight,
  Check,
  Clock,
  ExternalLink,
  Eye,
  Flame,
  LayoutGrid,
  List,
  Loader2,
  Lock,
  MessageSquare,
  Search,
  Sparkles,
  ThumbsUp,
  UserPlus,
  Wand2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { toast } from '@/lib/toast'
import { errorMessage } from '@/lib/youtube'
import { cn } from '@/lib/utils'
import {
  youtubeService,
  type YoutubeAiPacchetto,
  type YoutubeVideo,
  type YoutubeVideoDettaglio,
} from '@/services/youtube-service'
import { Caricamento, ListaBarre, Pannello, TooltipGrafico, Vuoto } from './yt-shared'
import { copia, fmt, urlStudioVideo, urlVideo } from '@/lib/youtube'

type Ordine = 'recenti' | 'periodo' | 'totali' | 'ritenzione' | 'iscritti' | 'coinvolgimento' | 'outlier'
type Filtro = 'tutti' | 'video' | 'short' | 'nascosti'

/** Rendimento rispetto alla mediana dei video dello stesso formato (1 = nella media del canale). */
function punteggiOutlier(video: YoutubeVideo[]) {
  const mediana = (xs: number[]) => {
    if (!xs.length) return 1
    const s = [...xs].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)] || 1
  }
  // Solo video con almeno 3 giorni: quelli appena usciti non sono ancora confrontabili
  const maturi = video.filter((v) => v.pubblicatoIl && Date.now() - new Date(v.pubblicatoIl).getTime() > 3 * 86400_000)
  const medVideo = mediana(maturi.filter((v) => !v.breve).slice(0, 30).map((v) => v.visualizzazioni))
  const medShort = mediana(maturi.filter((v) => v.breve).slice(0, 30).map((v) => v.visualizzazioni))
  const out = new Map<string, number>()
  for (const v of video) out.set(v.id, v.visualizzazioni / (v.breve ? medShort : medVideo))
  return out
}

function Privacy({ v }: { v: YoutubeVideo }) {
  if (v.privacy === 'public') return null
  const testo = v.programmatoIl ? `Programmato ${fmt.data(v.programmatoIl)}` : v.privacy === 'unlisted' ? 'Non in elenco' : 'Privato'
  return (
    <em className="yt-chip" data-tono="warn">
      <Lock aria-hidden /> {testo}
    </em>
  )
}

function Outlier({ x }: { x: number | undefined }) {
  if (x == null) return null
  if (x >= 2) {
    return (
      <em className="yt-chip" data-tono="hot" title="Visualizzazioni rispetto alla mediana del canale">
        <Flame aria-hidden /> ×{x.toLocaleString('it-IT', { maximumFractionDigits: 1 })}
      </em>
    )
  }
  if (x < 0.5) return <em className="yt-chip" data-tono="muted" title="Visualizzazioni rispetto alla mediana del canale">×{x.toLocaleString('it-IT', { maximumFractionDigits: 1 })}</em>
  return null
}

export function VideoTab({
  video,
  caricamento,
  onApri,
}: {
  video: YoutubeVideo[] | null
  caricamento: boolean
  onApri: (id: string) => void
}) {
  const [cerca, setCerca] = useState('')
  const [ordine, setOrdine] = useState<Ordine>('recenti')
  const [filtro, setFiltro] = useState<Filtro>('tutti')
  const [vista, setVista] = useState<'griglia' | 'elenco'>(() => {
    try {
      return (localStorage.getItem('yt-vista-video') as 'griglia' | 'elenco') || 'griglia'
    } catch {
      return 'griglia'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('yt-vista-video', vista)
    } catch {
      /* solo comodità */
    }
  }, [vista])

  const outlier = useMemo(() => punteggiOutlier(video ?? []), [video])

  const righe = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    const lista = (video ?? []).filter((v) => {
      if (q && !v.titolo.toLowerCase().includes(q)) return false
      if (filtro === 'video') return !v.breve
      if (filtro === 'short') return v.breve
      if (filtro === 'nascosti') return v.privacy !== 'public'
      return true
    })
    const coinv = (v: YoutubeVideo) => (v.visualizzazioni ? ((v.like + v.commenti) / v.visualizzazioni) * 100 : 0)
    const chiave: Record<Ordine, (v: YoutubeVideo) => number> = {
      recenti: (v) => (v.pubblicatoIl ? new Date(v.pubblicatoIl).getTime() : 0),
      periodo: (v) => v.periodoVisualizzazioni ?? -1,
      totali: (v) => v.visualizzazioni,
      ritenzione: (v) => v.periodoPercentualeMedia ?? -1,
      iscritti: (v) => v.periodoIscritti ?? -1,
      coinvolgimento: coinv,
      outlier: (v) => outlier.get(v.id) ?? 0,
    }
    return [...lista].sort((a, b) => chiave[ordine](b) - chiave[ordine](a))
  }, [video, cerca, filtro, ordine, outlier])

  if (caricamento && !video) return <Caricamento righe={6} />
  if (!video) return <Vuoto>Video non disponibili.</Vuoto>

  const short = video.filter((v) => v.breve).length

  return (
    <div className="yt-stack">
      <div className="yt-toolbar">
        <div className="yt-search">
          <Search aria-hidden />
          <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder={`Cerca tra ${video.length} video…`} />
        </div>
        <div className="yt-seg" role="tablist" aria-label="Formato">
          {(
            [
              ['tutti', `Tutti ${video.length}`],
              ['video', `Video ${video.length - short}`],
              ['short', `Short ${short}`],
              ['nascosti', 'Non pubblici'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" data-active={filtro === id ? '' : undefined} onClick={() => setFiltro(id)}>
              {label}
            </button>
          ))}
        </div>
        <Select value={ordine} onValueChange={(v) => setOrdine(v as Ordine)}>
          <SelectTrigger className="yt-select w-[230px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recenti">Più recenti</SelectItem>
            <SelectItem value="periodo">Visualizzazioni nel periodo</SelectItem>
            <SelectItem value="totali">Visualizzazioni totali</SelectItem>
            <SelectItem value="outlier">Rendimento sopra la media</SelectItem>
            <SelectItem value="ritenzione">% media vista</SelectItem>
            <SelectItem value="iscritti">Iscritti portati</SelectItem>
            <SelectItem value="coinvolgimento">Coinvolgimento</SelectItem>
          </SelectContent>
        </Select>
        <div className="yt-seg yt-seg--icon" role="tablist" aria-label="Vista">
          <button type="button" aria-label="Griglia" data-active={vista === 'griglia' ? '' : undefined} onClick={() => setVista('griglia')}>
            <LayoutGrid aria-hidden />
          </button>
          <button type="button" aria-label="Elenco" data-active={vista === 'elenco' ? '' : undefined} onClick={() => setVista('elenco')}>
            <List aria-hidden />
          </button>
        </div>
      </div>

      {!righe.length ? <Vuoto>Nessun video con questi filtri.</Vuoto> : null}

      {vista === 'griglia' ? (
        <div className="yt-vgrid">
          {righe.map((v, i) => (
            <button key={v.id} type="button" className="yt-vcard" onClick={() => onApri(v.id)} style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
              <div className={cn('yt-vthumb', v.breve && 'yt-vthumb--short')}>
                {v.miniatura ? <img src={v.miniatura} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="yt-thumb-ph" />}
                <em className="yt-vdur">{v.breve ? 'Short' : fmt.durata(v.durataSec)}</em>
                <div className="yt-vbadges">
                  <Outlier x={outlier.get(v.id)} />
                  <Privacy v={v} />
                </div>
              </div>
              <div className="yt-vbody">
                <p className="yt-vtitle">{v.titolo}</p>
                <p className="yt-vmeta">
                  {fmt.compact(v.visualizzazioni)} visualizzazioni · {fmt.fa(v.pubblicatoIl)}
                </p>
                <div className="yt-vstats">
                  <p title="Visualizzazioni nel periodo"><Eye aria-hidden />{fmt.compact(v.periodoVisualizzazioni ?? 0)}</p>
                  <p title="% media vista nel periodo"><Clock aria-hidden />{fmt.pct(v.periodoPercentualeMedia, 0)}</p>
                  <p title="Iscritti portati nel periodo"><UserPlus aria-hidden />{fmt.int(v.periodoIscritti ?? 0)}</p>
                  <p title="Like totali"><ThumbsUp aria-hidden />{fmt.compact(v.like)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="yt-table-wrap">
          <table className="yt-table">
            <thead>
              <tr>
                <th>Video</th>
                <th className="num">Periodo</th>
                <th className="num">Totali</th>
                <th className="num">% vista</th>
                <th className="num">Durata media</th>
                <th className="num">Iscritti</th>
                <th className="num">Like</th>
                <th className="num">Commenti</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((v) => (
                <tr key={v.id} onClick={() => onApri(v.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onApri(v.id)}>
                  <td>
                    <div className="yt-trow">
                      {v.miniatura ? <img src={v.miniatura} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="yt-thumb-ph" />}
                      <div className="min-w-0">
                        <p className="yt-vtitle">{v.titolo}</p>
                        <div className="yt-trow-meta">
                          <p>{fmt.data(v.pubblicatoIl)} · {v.breve ? 'Short' : fmt.durata(v.durataSec)}</p>
                          <Outlier x={outlier.get(v.id)} />
                          <Privacy v={v} />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="num">{fmt.int(v.periodoVisualizzazioni ?? 0)}</td>
                  <td className="num">{fmt.int(v.visualizzazioni)}</td>
                  <td className="num">{fmt.pct(v.periodoPercentualeMedia, 0)}</td>
                  <td className="num">{fmt.durata(v.periodoDurataMediaSec)}</td>
                  <td className="num">{fmt.int(v.periodoIscritti ?? 0)}</td>
                  <td className="num">{fmt.int(v.like)}</td>
                  <td className="num">{fmt.int(v.commenti)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ───────────────────────── Dettaglio ─────────────────────────

export function VideoSheet({
  videoId,
  puoGestire,
  onChiudi,
  onAggiornato,
}: {
  videoId: string | null
  puoGestire: boolean
  onChiudi: () => void
  onAggiornato: () => void
}) {
  const [dati, setDati] = useState<YoutubeVideoDettaglio | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [scheda, setScheda] = useState<'numeri' | 'modifica'>('numeri')

  useEffect(() => {
    if (!videoId) return
    setDati(null)
    setErrore(null)
    setScheda('numeri')
    const ctrl = new AbortController()
    youtubeService
      .dettaglioVideo(videoId, {}, ctrl.signal)
      .then(setDati)
      .catch((e) => !ctrl.signal.aborted && setErrore(errorMessage(e, 'Video non disponibile')))
    return () => ctrl.abort()
  }, [videoId])

  return (
    <Sheet open={videoId != null} onOpenChange={(o) => !o && onChiudi()}>
      <SheetContent className="yt-root yt-sheet w-full sm:!max-w-[920px] overflow-y-auto">
        <SheetTitle className="sr-only">{dati?.video.titolo ?? 'Video'}</SheetTitle>
        <SheetDescription className="sr-only">Statistiche e modifica del video</SheetDescription>
        {errore ? <Vuoto>{errore}</Vuoto> : null}
        {!dati && !errore ? <div className="p-6"><Caricamento righe={8} /></div> : null}
        {dati ? (
          <div className="yt-sheet-inner">
            <div className="yt-player">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${dati.video.id}?rel=0`}
                title={dati.video.titolo}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="yt-sheet-head">
              <h2 className="yt-sheet-title">{dati.video.titolo}</h2>
              <div className="yt-sheet-meta">
                <p>Pubblicato {fmt.data(dati.video.pubblicatoIl)} · {dati.video.breve ? 'Short' : fmt.durata(dati.video.durataSec)}</p>
                <Privacy v={dati.video} />
              </div>
              <div className="yt-sheet-links">
                <a href={urlVideo(dati.video.id)} target="_blank" rel="noreferrer" className="yt-link-btn"><ExternalLink aria-hidden /> Apri su YouTube</a>
                <a href={urlStudioVideo(dati.video.id)} target="_blank" rel="noreferrer" className="yt-link-btn"><ArrowUpRight aria-hidden /> Studio</a>
              </div>
            </div>

            <div className="yt-seg" role="tablist">
              <button type="button" data-active={scheda === 'numeri' ? '' : undefined} onClick={() => setScheda('numeri')}>Statistiche</button>
              {puoGestire ? (
                <button type="button" data-active={scheda === 'modifica' ? '' : undefined} onClick={() => setScheda('modifica')}>
                  <Wand2 aria-hidden /> Modifica e ottimizza
                </button>
              ) : null}
            </div>

            {scheda === 'numeri' ? <NumeriVideo d={dati} /> : (
              <ModificaVideo
                d={dati}
                onSalvato={(nuovo) => {
                  setDati(nuovo)
                  onAggiornato()
                }}
              />
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function NumeriVideo({ d }: { d: YoutubeVideoDettaglio }) {
  const t = d.totali
  const ritenzione = d.ritenzione.map((p) => ({ t: p.t * 100, ritenzione: p.ritenzione * 100, relativa: p.relativa }))
  const relativaMedia = d.ritenzione.filter((p) => p.relativa != null).reduce((s, p, _, a) => s + (p.relativa ?? 0) / a.length, 0)
  const crollo = useMemo(() => {
    // Il punto dove si perde più pubblico (escluso il primo 10%, dove il calo è fisiologico)
    let peggiore: { t: number; calo: number } | null = null
    for (let i = 1; i < ritenzione.length; i++) {
      if (ritenzione[i - 1].t < 10) continue
      const calo = ritenzione[i - 1].ritenzione - ritenzione[i].ritenzione
      if (!peggiore || calo > peggiore.calo) peggiore = { t: ritenzione[i].t, calo }
    }
    return peggiore
  }, [ritenzione])
  const durata = d.video.durataSec

  return (
    <div className="yt-stack">
      <div className="yt-minitiles">
        <div><Eye aria-hidden /><b>{fmt.int(t?.visualizzazioni ?? d.video.visualizzazioni)}</b><small>visualizzazioni</small></div>
        <div><Clock aria-hidden /><b>{fmt.ore(t?.minutiVisti)}</b><small>di visione</small></div>
        <div><Sparkles aria-hidden /><b>{fmt.pct(t?.percentualeMedia, 0)}</b><small>vista in media ({fmt.durata(t?.durataMediaSec)})</small></div>
        <div><UserPlus aria-hidden /><b>{t ? `+${fmt.int(t.iscrittiGuadagnati - t.iscrittiPersi)}` : '—'}</b><small>iscritti</small></div>
        <div><ThumbsUp aria-hidden /><b>{fmt.int(d.video.like)}</b><small>like</small></div>
        <div><MessageSquare aria-hidden /><b>{fmt.int(d.video.commenti)}</b><small>commenti</small></div>
      </div>

      <Pannello
        titolo="Fidelizzazione del pubblico"
        sottotitolo={
          ritenzione.length ? (
            <>
              Quota di chi sta ancora guardando in ogni punto del video.
              {d.ritenzione.some((p) => p.relativa != null) ? (
                <> Rispetto a video simili su YouTube: <b>{relativaMedia > 0.55 ? 'sopra la media' : relativaMedia < 0.45 ? 'sotto la media' : 'nella media'}</b>.</>
              ) : null}
              {crollo && durata ? <> Il calo più forte è intorno a <b>{fmt.durata((crollo.t / 100) * durata)}</b>: riguarda quel passaggio.</> : null}
            </>
          ) : 'Dati di fidelizzazione non ancora disponibili.'
        }
      >
        {ritenzione.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={ritenzione} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="yt-ret" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--yt-c2)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--yt-c2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--yt-grid)" />
              <XAxis dataKey="t" type="number" domain={[0, 100]} tickFormatter={(v) => (durata ? fmt.durata((v / 100) * durata) : `${v}%`)} tick={{ fill: 'var(--yt-axis)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `${v}%`} tick={{ fill: 'var(--yt-axis)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
              {crollo ? <ReferenceLine x={crollo.t} stroke="var(--yt-c1)" strokeDasharray="4 4" /> : null}
              <Tooltip
                content={<TooltipGrafico formatoEtichetta={(l) => (durata ? fmt.durata((Number(l) / 100) * durata) : `${l}%`)} formatoValore={(v) => fmt.pct(v, 0)} />}
              />
              <Area type="monotone" dataKey="ritenzione" name="Ancora a guardare" stroke="var(--yt-c2)" strokeWidth={2} fill="url(#yt-ret)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : null}
      </Pannello>

      {d.serie.length > 1 ? (
        <Pannello titolo="Visualizzazioni dal lancio">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={d.serie} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--yt-grid)" />
              <XAxis dataKey="data" tickFormatter={fmt.giorno} tick={{ fill: 'var(--yt-axis)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tickFormatter={fmt.compact} tick={{ fill: 'var(--yt-axis)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip content={<TooltipGrafico formatoEtichetta={(l) => fmt.giorno(String(l))} />} />
              <Area type="monotone" dataKey="visualizzazioni" name="Visualizzazioni" stroke="var(--yt-c1)" strokeWidth={2} fill="var(--yt-c1)" fillOpacity={0.12} />
            </AreaChart>
          </ResponsiveContainer>
        </Pannello>
      ) : null}

      <div className="yt-grid-2">
        <Pannello titolo="Da dove arrivano">
          <ListaBarre voci={d.fonti} colore="var(--yt-c1)" />
        </Pannello>
        <Pannello titolo="Cosa cercavano" sottotitolo="Ricerche su YouTube che hanno portato al video">
          {d.ricerche.length ? (
            <div className="yt-cloud">
              {d.ricerche.map((r, i) => (
                <em key={r.chiave} style={{ fontSize: `${Math.max(0.78, 1.25 - i * 0.03)}rem` }} title={`${fmt.int(r.valore)} visualizzazioni`}>
                  {r.etichetta}
                  <small>{fmt.compact(r.valore)}</small>
                </em>
              ))}
            </div>
          ) : (
            <Vuoto>Nessuna ricerca nel periodo.</Vuoto>
          )}
        </Pannello>
        <Pannello titolo="Dispositivi">
          <ListaBarre voci={d.dispositivi} colore="var(--yt-c4)" />
        </Pannello>
        <Pannello titolo="Paesi">
          <ListaBarre voci={d.paesi} colore="var(--yt-c3)" />
        </Pannello>
      </div>
    </div>
  )
}

function Contatore({ n, max }: { n: number; max: number }) {
  return <small className={cn('yt-count', n > max && 'yt-count--over')}>{n}/{max}</small>
}

function ModificaVideo({ d, onSalvato }: { d: YoutubeVideoDettaglio; onSalvato: (v: YoutubeVideoDettaglio) => void }) {
  const [titolo, setTitolo] = useState(d.video.titolo)
  const [descrizione, setDescrizione] = useState(d.descrizione)
  const [tag, setTag] = useState<string[]>(d.tag)
  const [nuovoTag, setNuovoTag] = useState('')
  const [privacy, setPrivacy] = useState(d.video.privacy)
  const [salvo, setSalvo] = useState(false)
  const [ai, setAi] = useState<YoutubeAiPacchetto | null>(null)
  const [aiCarica, setAiCarica] = useState(false)

  const caratteriTag = tag.join(',').length
  const modificato =
    titolo !== d.video.titolo || descrizione !== d.descrizione || privacy !== d.video.privacy || tag.join('|') !== d.tag.join('|')

  const aggiungiTag = (s: string) => {
    const nuovi = s.split(',').map((x) => x.trim()).filter(Boolean)
    setTag((t) => Array.from(new Set([...t, ...nuovi])))
    setNuovoTag('')
  }

  const salva = async () => {
    setSalvo(true)
    try {
      const nuovo = await youtubeService.modificaVideo(d.video.id, { titolo, descrizione, tag, privacy })
      toast.success('Video aggiornato su YouTube')
      onSalvato(nuovo)
    } catch (e) {
      toast.error(errorMessage(e, 'Modifica non salvata'))
    } finally {
      setSalvo(false)
    }
  }

  const ottimizza = async () => {
    setAiCarica(true)
    try {
      setAi(await youtubeService.aiPacchetto({ videoId: d.video.id }))
    } catch (e) {
      toast.error(errorMessage(e, 'AI non disponibile'))
    } finally {
      setAiCarica(false)
    }
  }

  return (
    <div className="yt-edit">
      <div className="yt-edit-form">
        <label className="yt-field">
          <div className="yt-field-head"><p>Titolo</p><Contatore n={titolo.length} max={100} /></div>
          <Input value={titolo} onChange={(e) => setTitolo(e.target.value)} />
          <div className="yt-preview-title" aria-hidden>
            <p>Anteprima nei risultati di ricerca (si tronca intorno ai 70 caratteri):</p>
            <b>{titolo.length > 70 ? `${titolo.slice(0, 70)}…` : titolo}</b>
          </div>
        </label>
        <label className="yt-field">
          <div className="yt-field-head"><p>Descrizione</p><Contatore n={descrizione.length} max={5000} /></div>
          <Textarea value={descrizione} onChange={(e) => setDescrizione(e.target.value)} rows={9} />
        </label>
        <div className="yt-field">
          <div className="yt-field-head"><p>Tag</p><Contatore n={caratteriTag} max={500} /></div>
          <div className="yt-tags">
            {tag.map((t) => (
              <em key={t} className="yt-tag">
                {t}
                <button type="button" aria-label={`Togli ${t}`} onClick={() => setTag((x) => x.filter((y) => y !== t))}><X aria-hidden /></button>
              </em>
            ))}
            <input
              className="yt-tag-input"
              value={nuovoTag}
              onChange={(e) => setNuovoTag(e.target.value)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ',') && nuovoTag.trim()) {
                  e.preventDefault()
                  aggiungiTag(nuovoTag)
                }
              }}
              onBlur={() => nuovoTag.trim() && aggiungiTag(nuovoTag)}
              placeholder="Aggiungi tag e premi Invio"
            />
          </div>
        </div>
        <div className="yt-field">
          <div className="yt-field-head"><p>Visibilità</p></div>
          <Select value={privacy} onValueChange={setPrivacy}>
            <SelectTrigger className="yt-select w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Pubblico</SelectItem>
              <SelectItem value="unlisted">Non in elenco</SelectItem>
              <SelectItem value="private">Privato</SelectItem>
            </SelectContent>
          </Select>
          {d.video.programmatoIl && privacy !== 'private' ? (
            <p className="yt-hint">Cambiando visibilità si annulla la pubblicazione programmata del {fmt.data(d.video.programmatoIl)}.</p>
          ) : null}
        </div>
        <div className="yt-edit-actions">
          <Button variant="ghost" disabled={!modificato || salvo} onClick={() => { setTitolo(d.video.titolo); setDescrizione(d.descrizione); setTag(d.tag); setPrivacy(d.video.privacy) }}>
            Annulla modifiche
          </Button>
          <Button className="yt-cta" disabled={!modificato || salvo || !titolo.trim() || titolo.length > 100} onClick={salva}>
            {salvo ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} Pubblica su YouTube
          </Button>
        </div>
      </div>

      <aside className="yt-ai-side">
        <div className="yt-ai-card">
          <div className="yt-ai-head">
            <Sparkles aria-hidden />
            <div>
              <p className="yt-ai-title">Ottimizza con l'AI</p>
              <p className="yt-ai-sub">Legge titolo, descrizione, ricerche e fidelizzazione e propone un nuovo pacchetto.</p>
            </div>
          </div>
          <Button className="yt-cta w-full" disabled={aiCarica} onClick={ottimizza}>
            {aiCarica ? <Loader2 className="animate-spin" aria-hidden /> : <Wand2 aria-hidden />} {ai ? 'Rigenera' : 'Genera proposte'}
          </Button>
          {ai ? (
            <div className="yt-ai-out">
              <p className="yt-ai-label">Titoli: clic per usarlo</p>
              {ai.titoli.map((t) => (
                <button key={t} type="button" className="yt-ai-pick" onClick={() => setTitolo(t)} data-active={titolo === t ? '' : undefined}>
                  {t}
                  <small>{t.length}</small>
                </button>
              ))}
              <p className="yt-ai-label">Descrizione</p>
              <div className="yt-ai-text">{ai.descrizione}</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setDescrizione(ai.descrizione)}>Usa questa</Button>
                <Button size="sm" variant="ghost" onClick={() => copia(ai.descrizione, toast)}>Copia</Button>
              </div>
              <p className="yt-ai-label">Tag</p>
              <div className="yt-tags yt-tags--static">
                {ai.tag.map((t) => <em key={t} className="yt-tag">{t}</em>)}
              </div>
              <Button size="sm" variant="outline" onClick={() => setTag(ai.tag)}>Sostituisci i tag</Button>
              {ai.testiMiniatura.length ? (
                <>
                  <p className="yt-ai-label">Testi per la miniatura</p>
                  <div className="yt-thumbtexts">{ai.testiMiniatura.map((t) => <b key={t}>{t}</b>)}</div>
                </>
              ) : null}
              {ai.consiglio ? <p className="yt-ai-tip">{ai.consiglio}</p> : null}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
