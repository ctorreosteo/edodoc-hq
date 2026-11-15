import { useMemo, useState, type ReactNode } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CalendarDays, Clock, Coins, Eye, Heart, Layers, Trophy, UserPlus } from 'lucide-react'
import type { YoutubeGiorno, YoutubePanoramica, YoutubeVideo } from '@/services/youtube-service'
import { Delta, ListaBarre, Pannello, TooltipGrafico, Vuoto } from './yt-shared'
import { fmt, useConteggio, variazione } from '@/lib/youtube'

type Metrica = 'visualizzazioni' | 'ore' | 'iscritti' | 'like' | 'ricavi'

const METRICHE: Array<{ id: Metrica; label: string; valore: (g: YoutubeGiorno) => number; formato: (n: number) => string }> = [
  { id: 'visualizzazioni', label: 'Visualizzazioni', valore: (g) => g.visualizzazioni, formato: fmt.int },
  { id: 'ore', label: 'Ore di visione', valore: (g) => g.minutiVisti / 60, formato: (n) => `${fmt.int(n)} h` },
  { id: 'iscritti', label: 'Iscritti netti', valore: (g) => g.iscrittiGuadagnati - g.iscrittiPersi, formato: fmt.int },
  { id: 'like', label: 'Like', valore: (g) => g.like, formato: fmt.int },
  { id: 'ricavi', label: 'Ricavi', valore: (g) => g.ricavi ?? 0, formato: fmt.eur },
]

const GIORNI_SETTIMANA = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

function Tile({
  icona,
  label,
  valore,
  formato,
  delta,
  inverso,
  piede,
  indice,
}: {
  icona: ReactNode
  label: string
  valore: number
  formato: (n: number) => string
  delta: number | null
  inverso?: boolean
  piede: ReactNode
  indice: number
}) {
  const v = useConteggio(valore)
  return (
    <article className="yt-tile" style={{ animationDelay: `${indice * 60}ms` }}>
      <div className="yt-tile-head">
        <div className="yt-tile-icon" aria-hidden>{icona}</div>
        <p className="yt-tile-label">{label}</p>
      </div>
      <div className="yt-tile-row">
        <p className="yt-tile-value">{formato(v)}</p>
        <Delta valore={delta} inverso={inverso} />
      </div>
      <p className="yt-tile-foot">{piede}</p>
    </article>
  )
}

export function Panoramica({ dati, video, onApriVideo }: { dati: YoutubePanoramica; video: YoutubeVideo[] | null; onApriVideo: (id: string) => void }) {
  const [metrica, setMetrica] = useState<Metrica>('visualizzazioni')
  const c = dati.corrente
  const p = dati.precedente
  const netti = c.iscrittiGuadagnati - c.iscrittiPersi
  const nettiPrec = p.iscrittiGuadagnati - p.iscrittiPersi
  const interazioni = c.like + c.commenti + c.condivisioni
  const tasso = c.visualizzazioni ? (interazioni / c.visualizzazioni) * 100 : 0
  const tassoPrec = p.visualizzazioni ? ((p.like + p.commenti + p.condivisioni) / p.visualizzazioni) * 100 : 0
  const giorni = dati.serie.length || 1

  const def = METRICHE.find((m) => m.id === metrica)!
  const serie = useMemo(() => {
    const valori = dati.serie.map(def.valore)
    return dati.serie.map((g, i) => {
      const finestra = valori.slice(Math.max(0, i - 6), i + 1)
      return {
        data: g.data,
        valore: valori[i],
        media: finestra.length >= 4 ? finestra.reduce((s, x) => s + x, 0) / finestra.length : null,
      }
    })
  }, [dati.serie, def])

  const picco = serie.reduce((m, x) => (x.valore > m.valore ? x : m), serie[0] ?? { data: '', valore: 0 })

  const iscrittiGiorno = dati.serie.map((g) => ({ data: g.data, guadagnati: g.iscrittiGuadagnati, persi: -g.iscrittiPersi }))

  const settimana = useMemo(() => {
    const somme = Array.from({ length: 7 }, () => ({ v: 0, n: 0 }))
    for (const g of dati.serie) {
      const d = (new Date(`${g.data}T12:00:00`).getDay() + 6) % 7
      somme[d].v += g.visualizzazioni
      somme[d].n += 1
    }
    return somme.map((s, i) => ({ giorno: GIORNI_SETTIMANA[i], media: s.n ? s.v / s.n : 0 }))
  }, [dati.serie])
  const migliore = settimana.reduce((m, x) => (x.media > m.media ? x : m), settimana[0])

  const top = useMemo(
    () =>
      (video ?? [])
        .filter((v) => (v.periodoVisualizzazioni ?? 0) > 0)
        .sort((a, b) => (b.periodoVisualizzazioni ?? 0) - (a.periodoVisualizzazioni ?? 0))
        .slice(0, 6),
    [video],
  )
  const topMax = top[0]?.periodoVisualizzazioni ?? 1

  return (
    <div className="yt-stack">
      <p className="yt-periodo">
        Dati dal <b>{fmt.data(`${dati.dal}T12:00:00`)}</b> al <b>{fmt.data(`${dati.al}T12:00:00`)}</b>, l'ultimo giorno già elaborato da
        YouTube Analytics. Per confrontare con Studio scegli lo stesso intervallo: i giorni successivi Studio li mostra come stime provvisorie.
      </p>
      <div className="yt-tiles">
        <Tile indice={0} icona={<Eye />} label="Visualizzazioni" valore={c.visualizzazioni} formato={fmt.int}
          delta={variazione(c.visualizzazioni, p.visualizzazioni)} piede={<>{fmt.int(c.visualizzazioni / giorni)} al giorno</>} />
        <Tile indice={1} icona={<Clock />} label="Ore di visione" valore={c.minutiVisti / 60} formato={(n) => fmt.int(n)}
          delta={variazione(c.minutiVisti, p.minutiVisti)} piede={<>Durata media {fmt.durata(c.durataMediaSec)} · {fmt.pct(c.percentualeMedia, 0)} del video</>} />
        <Tile indice={2} icona={<UserPlus />} label="Iscritti netti" valore={netti} formato={(n) => (n > 0 ? `+${fmt.int(n)}` : fmt.int(n))}
          delta={variazione(netti, nettiPrec)} piede={<>+{fmt.int(c.iscrittiGuadagnati)} nuovi · −{fmt.int(c.iscrittiPersi)} persi</>} />
        <Tile indice={3} icona={<Heart />} label="Interazioni" valore={tasso} formato={(n) => fmt.pct(n, 2)}
          delta={variazione(tasso, tassoPrec)} piede={<>{fmt.int(c.like)} like · {fmt.int(c.commenti)} commenti · {fmt.int(c.condivisioni)} condivisioni</>} />
        {dati.ricaviDisponibili ? (
          <Tile indice={4} icona={<Coins />} label="Ricavi stimati" valore={c.ricavi ?? 0} formato={fmt.eur}
            delta={variazione(c.ricavi ?? 0, p.ricavi ?? 0)}
            piede={<>RPM {fmt.eur(c.visualizzazioni ? ((c.ricavi ?? 0) / c.visualizzazioni) * 1000 : 0)} ogni 1.000 visual.</>} />
        ) : (
          <Tile indice={4} icona={<Trophy />} label="Iscritti ogni 1.000 visual." valore={c.visualizzazioni ? (c.iscrittiGuadagnati / c.visualizzazioni) * 1000 : 0}
            formato={(n) => n.toLocaleString('it-IT', { maximumFractionDigits: 1 })}
            delta={variazione(
              c.visualizzazioni ? c.iscrittiGuadagnati / c.visualizzazioni : 0,
              p.visualizzazioni ? p.iscrittiGuadagnati / p.visualizzazioni : 0,
            )}
            piede="Quanto il canale converte chi guarda" />
        )}
      </div>

      <Pannello
        titolo="Andamento giorno per giorno"
        sottotitolo={<>Linea tratteggiata: media mobile 7 giorni. Picco il {picco?.data ? fmt.giorno(picco.data) : '—'} con {def.formato(picco?.valore ?? 0)}.</>}
        azioni={
          <div className="yt-seg" role="tablist" aria-label="Metrica">
            {METRICHE.filter((m) => m.id !== 'ricavi' || dati.ricaviDisponibili).map((m) => (
              <button key={m.id} type="button" data-active={metrica === m.id ? '' : undefined} onClick={() => setMetrica(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="yt-chart">
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={serie} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="yt-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--yt-c1)" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="var(--yt-c1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--yt-grid)" />
              <XAxis dataKey="data" tickFormatter={fmt.giorno} tick={{ fill: 'var(--yt-axis)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tickFormatter={(v) => (metrica === 'ricavi' ? fmt.eur(v) : fmt.compact(v))} tick={{ fill: 'var(--yt-axis)', fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
              <Tooltip
                cursor={{ stroke: 'var(--yt-axis)', strokeDasharray: '3 3' }}
                content={<TooltipGrafico formatoEtichetta={(l) => fmt.giorno(String(l))} formatoValore={(v) => def.formato(v)} />}
              />
              <Area type="monotone" dataKey="valore" name={def.label} stroke="var(--yt-c1)" strokeWidth={2} fill="url(#yt-area)" activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--yt-surface)' }} />
              <Line type="monotone" dataKey="media" name="Media 7 giorni" stroke="var(--yt-c2)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="yt-legend">
          <p><i style={{ background: 'var(--yt-c1)' }} />{def.label}</p>
          <p><i className="yt-legend-dash" style={{ borderColor: 'var(--yt-c2)' }} />Media 7 giorni</p>
        </div>
      </Pannello>

      <div className="yt-grid-2">
        <Pannello titolo="Iscritti: entrate e uscite" sottotitolo={<>Sopra lo zero i nuovi iscritti, sotto chi ha disdetto. Saldo del periodo: <b>{netti >= 0 ? '+' : ''}{fmt.int(netti)}</b></>} icona={<UserPlus />}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={iscrittiGiorno} stackOffset="sign" margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke="var(--yt-grid)" />
              <XAxis dataKey="data" tickFormatter={fmt.giorno} tick={{ fill: 'var(--yt-axis)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tick={{ fill: 'var(--yt-axis)', fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <ReferenceLine y={0} stroke="var(--yt-axis)" />
              <Tooltip cursor={{ fill: 'var(--yt-hover)' }} content={<TooltipGrafico formatoEtichetta={(l) => fmt.giorno(String(l))} formatoValore={(v) => fmt.int(Math.abs(v))} />} />
              <Bar dataKey="guadagnati" name="Nuovi" stackId="s" fill="var(--yt-c5)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="persi" name="Persi" stackId="s" fill="var(--yt-c1)" radius={[0, 0, 4, 4]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="yt-legend">
            <p><i style={{ background: 'var(--yt-c5)' }} />Nuovi</p>
            <p><i style={{ background: 'var(--yt-c1)' }} />Persi</p>
          </div>
        </Pannello>

        <Pannello titolo="Il giorno migliore" sottotitolo={<>Visualizzazioni medie per giorno della settimana: il <b>{migliore.giorno.toLowerCase()}</b> rende di più. Pubblica il giorno prima o la mattina stessa.</>} icona={<CalendarDays />}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={settimana} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--yt-grid)" />
              <XAxis dataKey="giorno" tick={{ fill: 'var(--yt-axis)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmt.compact} tick={{ fill: 'var(--yt-axis)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip cursor={{ fill: 'var(--yt-hover)' }} content={<TooltipGrafico formatoValore={(v) => fmt.int(v)} />} />
              <Bar dataKey="media" name="Media visualizzazioni" radius={[4, 4, 0, 0]}>
                {settimana.map((s) => (
                  <Cell key={s.giorno} fill={s.giorno === migliore.giorno ? 'var(--yt-c1)' : 'var(--yt-muted-bar)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Pannello>
      </div>

      <div className="yt-grid-2">
        <Pannello titolo="I video che hanno trainato il periodo" sottotitolo="Visualizzazioni nel periodo, non totali" icona={<Trophy />}>
          {video == null ? (
            <Vuoto>Caricamento video…</Vuoto>
          ) : top.length ? (
            <ol className="yt-podium">
              {top.map((v, i) => (
                <li key={v.id}>
                  <button type="button" onClick={() => onApriVideo(v.id)} className="yt-podium-row">
                    <em className="yt-rank" data-rank={i + 1}>{i + 1}</em>
                    {v.miniatura ? <img src={v.miniatura} alt="" referrerPolicy="no-referrer" /> : <div className="yt-thumb-ph" />}
                    <div className="min-w-0 flex-1">
                      <p className="yt-podium-title">{v.titolo}</p>
                      <div className="yt-bar-track">
                        <div className="yt-bar-fill" style={{ width: `${((v.periodoVisualizzazioni ?? 0) / topMax) * 100}%`, background: 'var(--yt-c1)' }} />
                      </div>
                    </div>
                    <div className="yt-podium-num">
                      <b>{fmt.compact(v.periodoVisualizzazioni)}</b>
                      <small>+{fmt.int(v.periodoIscritti ?? 0)} iscritti</small>
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <Vuoto>Nessuna visualizzazione nel periodo.</Vuoto>
          )}
        </Pannello>

        <Pannello titolo="Formati" sottotitolo="Visualizzazioni per tipo di contenuto, con le ore di visione" icona={<Layers />}>
          <ListaBarre
            voci={dati.tipiContenuto}
            colore="var(--yt-c2)"
            formato={fmt.int}
            secondario={(v) => (v.secondario != null ? `${fmt.ore(v.secondario)} di visione` : null)}
          />
        </Pannello>
      </div>
    </div>
  )
}
