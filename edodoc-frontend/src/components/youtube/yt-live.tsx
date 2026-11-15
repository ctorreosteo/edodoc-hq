import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Eye, Flag, Gauge, Pencil, PlaySquare, Radio, Sparkles, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from '@/lib/toast'
import type { YoutubeCanale, YoutubeLive } from '@/services/youtube-service'
import { fmt, prossimoTraguardo, urlVideo } from '@/lib/youtube'
import { Odometro, TooltipGrafico } from './yt-shared'

/** Visualizzazioni l'ora negli ultimi rilevamenti (almeno 30 minuti di distanza). */
function ritmoOrario(live: YoutubeLive | null) {
  if (!live || live.storico.length < 2) return null
  const ultimo = { t: live.rilevatoIl, v: live.visualizzazioni }
  const indietro = [...live.storico].reverse().find((p) => ultimo.t - p.t >= 30 * 60_000 && ultimo.t - p.t <= 26 * 3600_000)
  if (!indietro) return null
  return ((ultimo.v - indietro.visualizzazioni) / (ultimo.t - indietro.t)) * 3600_000
}

function Coriandoli({ attivi }: { attivi: boolean }) {
  if (!attivi) return null
  return (
    <div className="yt-confetti" aria-hidden>
      {Array.from({ length: 60 }).map((_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            animationDelay: `${(i % 12) * 70}ms`,
            animationDuration: `${1600 + ((i * 53) % 900)}ms`,
            background: ['#ff3b3b', '#ffffff', '#72fa93', '#ffd166', '#7aa7ff'][i % 5],
            transform: `rotate(${i * 29}deg)`,
          }}
        />
      ))}
    </div>
  )
}

export function LiveHero({
  canale,
  live,
  primo,
  errore,
  obiettivo,
  netti30g,
  puoGestire,
  onObiettivo,
}: {
  canale: YoutubeCanale
  live: YoutubeLive | null
  primo: YoutubeLive | null
  errore: string | null
  obiettivo: number | null
  netti30g: number | null
  puoGestire: boolean
  onObiettivo: (n: number | null) => void
}) {
  const pubblici = live?.iscritti ?? canale.iscritti
  // Il numero pubblico è arrotondato a 3 cifre (1.234 → 1.230); quello di Analytics è esatto, come in Studio, ma
  // indietro di 2-3 giorni: si usa se cade nella stessa fascia di arrotondamento, cioè se è ancora attuale
  const fascia = Math.pow(10, Math.max(0, String(Math.trunc(pubblici)).length - 3))
  const esatti = live?.iscrittiEsatti ?? null
  const iscritti = esatti != null && Math.abs(esatti - pubblici) < fascia ? esatti : pubblici
  const views = live?.visualizzazioni ?? canale.visualizzazioni
  const nVideo = live?.video ?? canale.video
  const [metrica, setMetrica] = useState<'visualizzazioni' | 'iscritti'>('visualizzazioni')
  const [festa, setFesta] = useState(false)
  const precedenti = useRef<Record<string, number>>({})
  const [lampi, setLampi] = useState<Record<string, number>>({})
  const ultimoIscritti = useRef(iscritti)

  // Traguardo superato mentre la pagina è aperta: coriandoli
  useEffect(() => {
    const prima = ultimoIscritti.current
    ultimoIscritti.current = iscritti
    if (prima && iscritti > prima && prossimoTraguardo(prima) <= iscritti) {
      setFesta(true)
      toast.success(`Traguardo raggiunto: ${fmt.int(prossimoTraguardo(prima))} iscritti!`)
      const t = setTimeout(() => setFesta(false), 3200)
      return () => clearTimeout(t)
    }
  }, [iscritti])

  // "+N" lampeggiante sui video che hanno preso visualizzazioni dall'ultimo giro
  useEffect(() => {
    if (!live) return
    const nuovi: Record<string, number> = {}
    for (const v of live.ultimiVideo) {
      const prima = precedenti.current[v.id]
      if (prima != null && v.visualizzazioni > prima) nuovi[v.id] = v.visualizzazioni - prima
      precedenti.current[v.id] = v.visualizzazioni
    }
    if (Object.keys(nuovi).length) {
      setLampi(nuovi)
      const t = setTimeout(() => setLampi({}), 4000)
      return () => clearTimeout(t)
    }
  }, [live])

  const ritmo = ritmoOrario(live)
  const sessione = live && primo ? live.visualizzazioni - primo.visualizzazioni : 0
  const target = obiettivo && obiettivo > iscritti ? obiettivo : prossimoTraguardo(iscritti)
  const progresso = Math.min(100, (iscritti / target) * 100)
  const alGiorno = netti30g != null ? netti30g / 28 : null
  const giorniAlTarget = alGiorno && alGiorno > 0 ? Math.ceil((target - iscritti) / alGiorno) : null
  const dataTarget = giorniAlTarget != null ? new Date(Date.now() + giorniAlTarget * 86400_000) : null

  const serie = useMemo(() => {
    const punti = live?.storico ?? []
    return punti.map((p) => ({ t: p.t, valore: metrica === 'iscritti' ? p.iscritti : p.visualizzazioni }))
  }, [live, metrica])

  return (
    <section className="yt-hero" aria-label="Canale YouTube in tempo reale">
      {canale.banner ? <div className="yt-hero-banner" style={{ backgroundImage: `url(${canale.banner})` }} aria-hidden /> : null}
      <div className="yt-hero-aurora" aria-hidden />
      <div className="yt-hero-grain" aria-hidden />
      <Coriandoli attivi={festa} />

      <div className="yt-hero-top">
        <div className="yt-hero-id">
          {canale.avatar ? <img src={canale.avatar} alt="" className="yt-hero-avatar" referrerPolicy="no-referrer" /> : null}
          <div className="min-w-0">
            <div className="yt-hero-eyebrow">
              <i className="yt-live-dot" aria-hidden />
              {errore ? 'Live in pausa' : 'Live'} · aggiornato ogni 30 s
            </div>
            <div className="yt-hero-title">{canale.titolo}</div>
            <div className="yt-hero-handle">
              {canale.handle ? (
                <a href={`https://www.youtube.com/${canale.handle}`} target="_blank" rel="noreferrer">
                  {canale.handle}
                </a>
              ) : null}
              {canale.creatoIl ? <> · dal {new Date(canale.creatoIl).getFullYear()}</> : null}
            </div>
          </div>
        </div>
        <div className="yt-hero-links">
          <a className="yt-ghost-btn" href={`https://studio.youtube.com/channel/${canale.id}`} target="_blank" rel="noreferrer">
            <PlaySquare aria-hidden /> YouTube Studio
          </a>
        </div>
      </div>

      <div className="yt-hero-main">
        <div className="yt-hero-counter">
          <div className="yt-hero-label">
            <Users aria-hidden /> Iscritti
          </div>
          {canale.iscrittiNascosti ? <b className="yt-odo">Nascosti</b> : <Odometro valore={iscritti} className="yt-odo--xl" />}
          <p className="yt-hero-note">
            {esatti != null && iscritti === esatti ? (
              <>Numero esatto da Analytics al {fmt.giorno(live?.iscrittiEsattiAl ?? '')}: i nuovi iscritti degli ultimi giorni arrivano con 2-3 giorni di ritardo.</>
            ) : esatti != null ? (
              <>Esatti da Analytics: <b>{fmt.int(esatti)}</b> al {fmt.giorno(live?.iscrittiEsattiAl ?? '')}. YouTube arrotonda il numero pubblico.</>
            ) : (
              'YouTube arrotonda il numero pubblico.'
            )}
          </p>
        </div>

        <div className="yt-hero-side">
          <div className="yt-hero-stat">
            <div className="yt-hero-label">
              <Eye aria-hidden /> Visualizzazioni totali
            </div>
            <Odometro valore={views} className="yt-odo--lg" />
            <p className="yt-hero-note">
              {sessione > 0 ? (
                <b className="yt-plus">+{fmt.int(sessione)} da quando hai aperto la pagina</b>
              ) : (
                'Le visualizzazioni compaiono con qualche minuto di ritardo.'
              )}
            </p>
          </div>
          <div className="yt-hero-mini">
            <div>
              <div className="yt-hero-label">
                <Gauge aria-hidden /> Ritmo
              </div>
              <b>{ritmo != null ? fmt.int(ritmo) : '—'}</b>
              <small>visualizzazioni / ora</small>
            </div>
            <div>
              <div className="yt-hero-label">
                <Radio aria-hidden /> Video
              </div>
              <b>{fmt.int(nVideo)}</b>
              <small>pubblicati</small>
            </div>
          </div>
        </div>

        <div className="yt-goal">
          <div className="yt-goal-ring" style={{ ['--p' as string]: progresso }}>
            <div className="yt-goal-inner">
              <b>{fmt.pct(progresso, 0)}</b>
              <small>{obiettivo && obiettivo > iscritti ? 'obiettivo' : 'traguardo'}</small>
            </div>
          </div>
          <div className="yt-goal-text">
            <div className="yt-hero-label">
              <Flag aria-hidden /> {fmt.int(target)} iscritti
            </div>
            <p>
              Mancano <b>{fmt.int(Math.max(0, target - iscritti))}</b>
              {dataTarget ? (
                <>
                  {' '}
                  · al ritmo attuale il{' '}
                  <b>{dataTarget.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</b>
                </>
              ) : alGiorno != null && alGiorno <= 0 ? (
                <> · negli ultimi 28 giorni gli iscritti non crescono</>
              ) : null}
            </p>
            {puoGestire ? <ObiettivoPopover valore={obiettivo} onSalva={onObiettivo} /> : null}
          </div>
        </div>
      </div>

      <div className="yt-hero-bottom">
        <div className="yt-hero-spark">
          <div className="yt-hero-spark-head">
            <div className="yt-hero-label">
              <Sparkles aria-hidden /> Ultimi 7 giorni, rilevazione oraria
            </div>
            <div className="yt-seg yt-seg--hero" role="tablist">
              {(['visualizzazioni', 'iscritti'] as const).map((m) => (
                <button key={m} type="button" data-active={metrica === m ? '' : undefined} onClick={() => setMetrica(m)}>
                  {m === 'visualizzazioni' ? 'Visualizzazioni' : 'Iscritti'}
                </button>
              ))}
            </div>
          </div>
          {serie.length > 1 ? (
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={serie} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="yt-spark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff4d4f" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#ff4d4f" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" hide />
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Tooltip
                  cursor={{ stroke: 'rgba(255,255,255,0.35)', strokeWidth: 1 }}
                  content={
                    <TooltipGrafico
                      formatoEtichetta={(l) =>
                        new Date(Number(l)).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                      }
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="valore"
                  name={metrica === 'iscritti' ? 'Iscritti' : 'Visualizzazioni'}
                  stroke="#ff6b6b"
                  strokeWidth={2}
                  fill="url(#yt-spark)"
                  isAnimationActive
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="yt-hero-note yt-hero-spark-empty">
              Lo storico si costruisce da solo: una rilevazione ogni ora, più una ogni 10 minuti quando la pagina è aperta.
            </p>
          )}
        </div>

        <div className="yt-ticker">
          <div className="yt-hero-label">
            <PlaySquare aria-hidden /> Ultime uscite, in diretta
          </div>
          <ul>
            {(live?.ultimiVideo ?? []).slice(0, 4).map((v) => (
              <li key={v.id}>
                <a href={urlVideo(v.id)} target="_blank" rel="noreferrer" className="yt-ticker-row">
                  {v.miniatura ? <img src={v.miniatura} alt="" referrerPolicy="no-referrer" /> : <div className="yt-thumb-ph" />}
                  <div className="min-w-0">
                    <p className="yt-ticker-title">{v.titolo}</p>
                    <p className="yt-ticker-meta">
                      {fmt.fa(v.pubblicatoIl)} · {fmt.compact(v.like)} like · {fmt.compact(v.commenti)} commenti
                    </p>
                  </div>
                  <div className="yt-ticker-views">
                    <b>{fmt.int(v.visualizzazioni)}</b>
                    {lampi[v.id] ? <em className="yt-flash">+{fmt.int(lampi[v.id])}</em> : <small>visual.</small>}
                  </div>
                </a>
              </li>
            ))}
            {!live ? <li className="yt-hero-note">Caricamento…</li> : null}
          </ul>
        </div>
      </div>
      {errore ? <p className="yt-hero-error">{errore}</p> : null}
    </section>
  )
}

function ObiettivoPopover({ valore, onSalva }: { valore: number | null; onSalva: (n: number | null) => void }) {
  const [testo, setTesto] = useState(valore ? String(valore) : '')
  const [aperto, setAperto] = useState(false)
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <button type="button" className="yt-link-btn">
          <Pencil aria-hidden /> {valore ? 'Cambia obiettivo' : 'Imposta un obiettivo'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3">
        <p className="text-sm font-medium">Obiettivo iscritti</p>
        <Input inputMode="numeric" value={testo} onChange={(e) => setTesto(e.target.value.replace(/\D/g, ''))} placeholder="es. 10000" />
        <div className="flex justify-end gap-2">
          {valore ? (
            <Button variant="ghost" size="sm" onClick={() => { onSalva(null); setAperto(false) }}>
              Rimuovi
            </Button>
          ) : null}
          <Button size="sm" disabled={!testo} onClick={() => { onSalva(Number(testo)); setAperto(false) }}>
            Salva
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
