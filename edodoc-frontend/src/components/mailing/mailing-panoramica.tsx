import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  AtSign,
  CalendarCheck,
  CalendarClock,
  Check,
  CircleSlash,
  Clock,
  Euro,
  HeartPulse,
  Inbox,
  Loader2,
  MailOpen,
  MailX,
  MousePointerClick,
  Radio,
  Reply,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  Workflow,
} from 'lucide-react'
import {
  mailingService,
  messaggioErroreMailing,
  type MailingAttivita,
  type MailingCampagnaRiga,
  type MailingPanoramica,
  type MailingPuntoSerie,
  type MailingSaluteLista,
  type MailingStato,
  type MailingTipoEvento,
} from '@/services/mailing-service'
import { panoramicaCondivisa, usePollingMailing } from './mailing-contesto'
import { Avatar, BadgeStatoCampagna, Delta, Scheletro, Vuoto } from './mailing-ui'
import {
  dataOra,
  formatCompatto,
  formatEuro,
  formatNumero,
  formatPercentuale,
  tempoFa,
  useAdesso,
  useColoriMailing,
  variazione,
} from './mailing-utils'

type Props = {
  stato: MailingStato
  onApriCampagna: (id: number) => void
  onCambiaTab: (tab: string) => void
}

const PERIODI = [7, 30, 90] as const
const LIMITE_FEED = 40

export function MailingPanoramicaTab({ stato, onApriCampagna, onCambiaTab }: Props) {
  const [giorni, setGiorni] = useState<number>(30)
  const [dati, setDati] = useState<MailingPanoramica | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [caricamento, setCaricamento] = useState(true)
  const [feed, setFeed] = useState<MailingAttivita[] | null>(null)
  const [nuovi, setNuovi] = useState<Set<number>>(new Set())
  const richiesta = useRef(0)

  const carica = useCallback(
    async (silenziosa = false) => {
      const n = ++richiesta.current
      if (!silenziosa) setCaricamento(true)
      try {
        const p = await panoramicaCondivisa(giorni, silenziosa)
        if (n !== richiesta.current) return
        setDati(p)
        setErrore(null)
      } catch (err) {
        if (n === richiesta.current) setErrore(messaggioErroreMailing(err, 'Panoramica non disponibile'))
      } finally {
        if (n === richiesta.current) setCaricamento(false)
      }
    },
    [giorni],
  )

  useEffect(() => {
    void carica()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carica(true)
    }, 60_000)
    return () => window.clearInterval(id)
  }, [carica])

  // Niente realtime in EdoDoc: con email in coda o campagne in invio la panoramica si ricarica ogni 10 s
  const qualcosaInInvio = !!dati && (dati.inCodaTotale > 0 || dati.campagneRecenti.some((c) => c.stato === 'IN_INVIO' || c.stato === 'TEST_AB'))
  usePollingMailing(qualcosaInInvio, () => void carica(true))

  // Feed: subito, poi ogni 30 s (scheda visibile); le voci nuove si illuminano per un attimo.
  const visti = useRef<Set<number> | null>(null)
  useEffect(() => {
    let vivo = true
    const timer: number[] = []
    const leggi = () =>
      mailingService
        .attivita(LIMITE_FEED)
        .then((a) => {
          if (!vivo) return
          const prima = visti.current
          visti.current = new Set(a.map((x) => x.id))
          setFeed(a)
          const arrivati = prima ? a.filter((x) => !prima.has(x.id)).map((x) => x.id) : []
          if (!arrivati.length) return
          setNuovi((s) => new Set([...s, ...arrivati]))
          timer.push(window.setTimeout(() => vivo && setNuovi((s) => new Set([...s].filter((x) => !arrivati.includes(x)))), 2400))
        })
        .catch(() => vivo && setFeed((f) => f ?? []))
    void leggi()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void leggi()
    }, 30_000)
    return () => {
      vivo = false
      window.clearInterval(id)
      timer.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  const primoAvvio = !!dati && dati.contattiTotali === 0 && dati.campagneRecenti.length === 0
  const passiMancanti = stato.mittentiAttivi === 0 || (dati?.contattiTotali ?? 0) === 0 || (dati?.campagneRecenti.length ?? 0) === 0

  if (!dati) {
    if (errore && !caricamento) {
      return (
        <div className="ml-card">
          <div className="ml-avviso" data-tono="errore" role="alert">
            <AlertTriangle className="size-4" aria-hidden />
            <span>{errore}</span>
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" className="ml-btn" onClick={() => void carica()}>
              Riprova
            </button>
          </div>
        </div>
      )
    }
    return <ScheletroPanoramica />
  }

  return (
    <div className="ml-panoramica" aria-busy={caricamento}>
      <div className="ml-panoramica-barra">
        <div className="ml-seg" role="radiogroup" aria-label="Periodo">
          {PERIODI.map((g) => (
            <button key={g} type="button" role="radio" aria-checked={giorni === g} data-active={giorni === g ? '' : undefined} onClick={() => setGiorni(g)}>
              {g} giorni
            </button>
          ))}
        </div>
        <span className="ml-panoramica-nota">
          {caricamento ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Aggiorno…
            </>
          ) : (
            <>Confronto con i {dati.giorni} giorni precedenti</>
          )}
        </span>
        {errore ? (
          <span className="ml-panoramica-errore" role="status">
            <AlertTriangle className="size-3.5" aria-hidden /> {errore}
          </span>
        ) : null}
      </div>

      {passiMancanti && (primoAvvio || stato.mittentiAttivi === 0) ? (
        <GuidaPrimoAvvio stato={stato} haContatti={dati.contattiTotali > 0} haCampagne={dati.campagneRecenti.length > 0} onCambiaTab={onCambiaTab} />
      ) : null}

      {primoAvvio ? null : (
        <>
          <StatPeriodo dati={dati} />

          <div className="ml-griglia ml-griglia--2-1">
            <GraficoCrescita serie={dati.crescita} dati={dati} />
            <SaluteLista salute={dati.salute} />
          </div>

          <div className="ml-griglia ml-griglia--2-1">
            <GraficoAttivita serie={dati.attivitaGiornaliera} />
            <FeedLive feed={feed} nuovi={nuovi} onApriCampagna={onApriCampagna} />
          </div>
        </>
      )}

      <div className="ml-griglia ml-griglia--3">
        <CampagneInCorso dati={dati} onApriCampagna={onApriCampagna} onCambiaTab={onCambiaTab} />
        <AutomazioniAttive dati={dati} onCambiaTab={onCambiaTab} />
        <QuoteMittenti dati={dati} onCambiaTab={onCambiaTab} />
      </div>

      <UltimeCampagne campagne={dati.campagneRecenti} onApriCampagna={onApriCampagna} onCambiaTab={onCambiaTab} />
    </div>
  )
}

// ───────────────────────── Scheletro e guida ─────────────────────────

function ScheletroPanoramica() {
  return (
    <div className="ml-panoramica" aria-busy>
      <div className="ml-stat-riga">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="ml-card ml-stat">
            <Scheletro altezza={12} larghezza="55%" />
            <Scheletro altezza={26} larghezza="70%" className="mt-3" />
          </div>
        ))}
      </div>
      <div className="ml-griglia ml-griglia--2-1">
        <div className="ml-card">
          <Scheletro altezza={14} larghezza="35%" />
          <Scheletro altezza={240} className="mt-4" />
        </div>
        <div className="ml-card">
          <Scheletro altezza={14} larghezza="50%" />
          <Scheletro altezza={240} className="mt-4" />
        </div>
      </div>
    </div>
  )
}

function GuidaPrimoAvvio({ stato, haContatti, haCampagne, onCambiaTab }: { stato: MailingStato; haContatti: boolean; haCampagne: boolean; onCambiaTab: (t: string) => void }) {
  const passi: { fatto: boolean; titolo: string; testo: string; azione: string; tab: string; icona: ReactNode }[] = [
    {
      fatto: stato.mittentiAttivi > 0,
      titolo: 'Aggiungi un mittente',
      testo: 'La casella Google Workspace da cui partono le email. Una prova di invio controlla che tutto sia a posto.',
      azione: 'Aggiungi mittente',
      tab: 'impostazioni',
      icona: <AtSign className="size-5" />,
    },
    {
      fatto: haContatti,
      titolo: 'Porta qui i pazienti',
      testo: 'Pazienti e lead del gestionale diventano contatti con un clic. Chi non ha dato il consenso non riceve newsletter.',
      azione: 'Sincronizza i contatti',
      tab: 'contatti',
      icona: <Users className="size-5" />,
    },
    {
      fatto: haCampagne,
      titolo: 'Manda la prima campagna',
      testo: 'Scegli il pubblico tra pazienti e lead veri, scrivi (anche con l’AI) e misura le visite che porta.',
      azione: 'Crea campagna',
      tab: 'campagne',
      icona: <Send className="size-5" />,
    },
  ]
  const fatti = passi.filter((p) => p.fatto).length
  const prossimo = passi.findIndex((p) => !p.fatto)
  return (
    <section className="ml-card ml-guida" aria-label="Primi passi">
      <div className="ml-guida-testa">
        <div>
          <div className="ml-etichetta">Primi passi</div>
          <div className="ml-guida-titolo">Tre passi per la prima newsletter</div>
        </div>
        <div className="ml-guida-progresso" aria-label={`${fatti} passi su 3 completati`}>
          <span className="ml-numero-medio">{fatti}/3</span>
          <div className="ml-barra" data-tono="ok">
            <span className="ml-barra-valore" style={{ width: `${(fatti / 3) * 100}%` }} />
          </div>
        </div>
      </div>
      <ol className="ml-guida-passi">
        {passi.map((p, i) => (
          <li key={p.titolo} className="ml-guida-passo" data-fatto={p.fatto ? '' : undefined} data-prossimo={i === prossimo ? '' : undefined}>
            <span className="ml-guida-icona" aria-hidden>
              {p.fatto ? <Check className="size-5" /> : p.icona}
            </span>
            <div className="ml-guida-corpo">
              <div className="ml-guida-numero">Passo {i + 1}</div>
              <div className="ml-guida-passo-titolo">{p.titolo}</div>
              <p className="ml-guida-passo-testo">{p.testo}</p>
              {p.fatto ? (
                <span className="ml-badge ml-badge--ok">Fatto</span>
              ) : (
                <button type="button" className={`ml-btn ml-btn--sm${i === prossimo ? ' ml-btn--pieno' : ''}`} onClick={() => onCambiaTab(p.tab)}>
                  {p.azione} <ArrowRight className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ───────────────────────── Statistiche del periodo ─────────────────────────

function StatPeriodo({ dati }: { dati: MailingPanoramica }) {
  const m = dati.metriche
  const p = dati.metrichePrecedente
  const voci: { chiave: string; icona: ReactNode; etichetta: string; valore: string; delta: number | null; inverso?: boolean; piede?: string; titolo?: string }[] = [
    {
      chiave: 'nuovi',
      icona: <Users className="size-4" />,
      etichetta: 'Nuovi iscritti',
      valore: formatNumero(dati.nuoviIscritti),
      delta: variazione(dati.nuoviIscritti, dati.nuoviIscrittiPrecedente),
      piede: `${formatNumero(dati.contattiIscritti)} iscritti su ${formatNumero(dati.contattiTotali)}`,
    },
    {
      chiave: 'inviate',
      icona: <Send className="size-4" />,
      etichetta: 'Email inviate',
      valore: formatCompatto(m.inviati),
      delta: variazione(m.inviati, p.inviati),
      piede: m.inCoda ? `${formatNumero(m.inCoda)} in coda` : 'Coda vuota',
    },
    {
      chiave: 'aperture',
      icona: <MailOpen className="size-4" />,
      etichetta: 'Apertura',
      valore: formatPercentuale(m.tassoApertura),
      delta: variazione(m.tassoApertura, p.tassoApertura),
      piede: `${formatNumero(m.apertureUniche)} persone · ${formatNumero(m.apertureAutomatiche)} automatiche escluse`,
      titolo: 'Le aperture automatiche (antivirus, Apple Mail) non contano: questo è il dato umano',
    },
    {
      chiave: 'click',
      icona: <MousePointerClick className="size-4" />,
      etichetta: 'Click',
      valore: formatPercentuale(m.tassoClick),
      delta: variazione(m.tassoClick, p.tassoClick),
      piede: `${formatNumero(m.clickUnici)} persone · ${formatPercentuale(m.tassoClickSuAperture)} di chi apre`,
    },
    {
      chiave: 'visite',
      icona: <CalendarCheck className="size-4" />,
      etichetta: 'Visite generate',
      valore: formatNumero(m.visiteGenerate),
      delta: variazione(m.visiteGenerate, p.visiteGenerate),
      piede: m.fatturatoGenerato != null ? `${formatEuro(m.fatturatoGenerato)} di fatturato` : 'Fatturato non ancora registrato',
    },
    {
      chiave: 'disiscritti',
      icona: <MailX className="size-4" />,
      etichetta: 'Disiscrizioni',
      valore: formatPercentuale(m.tassoDisiscrizione, 2),
      delta: variazione(m.disiscrizioni, p.disiscrizioni),
      inverso: true,
      piede: `${formatNumero(m.disiscrizioni)} persone · rimbalzi ${formatPercentuale(m.tassoRimbalzo, 2)}`,
    },
  ]
  return (
    <div className="ml-stat-riga">
      {voci.map((v) => (
        <div key={v.chiave} className="ml-card ml-stat" title={v.titolo}>
          <div className="ml-stat-testa">
            <span className="ml-stat-icona" aria-hidden>
              {v.icona}
            </span>
            <span className="ml-etichetta">{v.etichetta}</span>
          </div>
          <div className="ml-stat-valore">
            <span className="ml-numero-medio">{v.valore}</span>
            <Delta valore={v.delta} inverso={v.inverso} />
          </div>
          {v.piede ? <div className="ml-stat-piede">{v.piede}</div> : null}
        </div>
      ))}
    </div>
  )
}

// ───────────────────────── Grafici ─────────────────────────

function etichettaGiorno(iso: string) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`)
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : String(iso)
}

/** Appiattisce {giorno, valori:{...}} in righe per recharts. */
function righe(serie: MailingPuntoSerie[]): Record<string, number | string>[] {
  return serie.map((p) => ({ giorno: p.giorno, ...p.valori }))
}

function chiaviSerie(serie: MailingPuntoSerie[]): string[] {
  const s = new Set<string>()
  serie.forEach((p) => Object.keys(p.valori ?? {}).forEach((k) => s.add(k)))
  return [...s]
}

const NOMI_SERIE: Record<string, string> = {
  iscritti: 'Iscritti',
  nuovi: 'Nuovi',
  disiscritti: 'Disiscritti',
  inviati: 'Inviate',
  aperture: 'Aperture',
  click: 'Click',
  conversioni: 'Conversioni',
}

type Voce = { value?: number | string | null; dataKey?: string | number; color?: string }

function TooltipGrafico({ active, payload, label, nomi }: { active?: boolean; payload?: Voce[]; label?: string; nomi: Record<string, { nome: string; colore: string }> }) {
  if (!active || !payload?.length || !label) return null
  return (
    <div className="ml-tooltip">
      <div className="ml-tooltip-titolo">{new Date(`${String(label).slice(0, 10)}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      {payload.map((v) => {
        const info = nomi[String(v.dataKey)]
        if (!info) return null
        return (
          <div key={String(v.dataKey)} className="ml-tooltip-riga">
            <span className="ml-tooltip-chiave" style={{ background: info.colore }} />
            <span>{info.nome}</span>
            <strong>{v.value == null ? '—' : formatNumero(Number(v.value))}</strong>
          </div>
        )
      })}
    </div>
  )
}

function GraficoCrescita({ serie, dati }: { serie: MailingPuntoSerie[]; dati: MailingPanoramica }) {
  const colori = useColoriMailing()
  const chiavi = chiaviSerie(serie)
  const chiave = chiavi.includes('iscritti') ? 'iscritti' : chiavi[0]
  const dataset = useMemo(() => righe(serie), [serie])
  const haDati = !!chiave && serie.some((p) => (p.valori?.[chiave] ?? 0) > 0)
  const nomi = chiave ? { [chiave]: { nome: NOMI_SERIE[chiave] ?? chiave, colore: colori.s1 } } : {}
  return (
    <section className="ml-card">
      <div className="ml-card-testa">
        <div>
          <div className="ml-card-titolo">
            <TrendingUp className="size-4" aria-hidden /> Crescita della lista
          </div>
          <div className="ml-card-sottotitolo">Contatti iscritti giorno per giorno</div>
        </div>
        <div className="ml-crescita-numeri">
          <span>
            <strong className="ml-positivo">+{formatNumero(dati.nuoviIscritti)}</strong> nuovi
          </span>
          <span>
            <strong>−{formatNumero(dati.disiscritti)}</strong> usciti
          </span>
        </div>
      </div>
      {haDati ? (
        <div className="ml-grafico ml-grafico--cresce">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dataset} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ml-grad-crescita" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colori.s1} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={colori.s1} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={colori.griglia} />
              <XAxis dataKey="giorno" tickFormatter={etichettaGiorno} tick={{ fontSize: 11, fill: colori.testo }} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis tickFormatter={(v) => formatCompatto(Number(v))} tick={{ fontSize: 11, fill: colori.testo }} tickLine={false} axisLine={false} width={44} domain={['dataMin - 5', 'auto']} allowDecimals={false} />
              <Tooltip content={<TooltipGrafico nomi={nomi} />} cursor={{ stroke: colori.griglia, strokeWidth: 1 }} />
              <Area type="monotone" dataKey={chiave} stroke={colori.s1} strokeWidth={2} fill="url(#ml-grad-crescita)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: colori.superficie }} isAnimationActive />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Vuoto icona={<TrendingUp />} titolo="Ancora nessun iscritto" testo="Con la sincronizzazione dei pazienti o un import da CSV qui vedrai la lista crescere." />
      )}
    </section>
  )
}

function GraficoAttivita({ serie }: { serie: MailingPuntoSerie[] }) {
  const colori = useColoriMailing()
  const [nascoste, setNascoste] = useState<Set<string>>(new Set())
  const dataset = useMemo(() => righe(serie), [serie])
  const disponibili = chiaviSerie(serie)
  const chiavi = ['aperture', 'click'].filter((k) => disponibili.includes(k))
  const coloreDi: Record<string, string> = { aperture: colori.s1, click: colori.s2 }
  const totali = Object.fromEntries(chiavi.map((k) => [k, serie.reduce((n, p) => n + (p.valori?.[k] ?? 0), 0)]))
  const inviate = serie.reduce((n, p) => n + (p.valori?.inviati ?? 0), 0)
  const haDati = chiavi.some((k) => totali[k] > 0)
  const nomi = Object.fromEntries(chiavi.map((k) => [k, { nome: NOMI_SERIE[k], colore: coloreDi[k] }]))
  const alterna = (k: string) =>
    setNascoste((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  return (
    <section className="ml-card">
      <div className="ml-card-testa">
        <div>
          <div className="ml-card-titolo">
            <Activity className="size-4" aria-hidden /> Attività giornaliera
          </div>
          <div className="ml-card-sottotitolo">
            Aperture e click umani · {formatNumero(inviate)} email inviate nel periodo
          </div>
        </div>
        {chiavi.length ? (
          <div className="ml-legenda" role="group" aria-label="Serie">
            {chiavi.map((k) => (
              <button key={k} type="button" className="ml-legenda-voce" data-off={nascoste.has(k) ? '' : undefined} aria-pressed={!nascoste.has(k)} onClick={() => alterna(k)}>
                <span className="ml-tooltip-chiave" style={{ background: coloreDi[k] }} />
                {NOMI_SERIE[k]}
                <strong>{formatCompatto(totali[k])}</strong>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {haDati ? (
        <div className="ml-grafico ml-grafico--cresce">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dataset} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke={colori.griglia} />
              <XAxis dataKey="giorno" tickFormatter={etichettaGiorno} tick={{ fontSize: 11, fill: colori.testo }} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis tickFormatter={(v) => formatCompatto(Number(v))} tick={{ fontSize: 11, fill: colori.testo }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
              <Tooltip content={<TooltipGrafico nomi={nomi} />} cursor={{ fill: colori.griglia }} />
              {chiavi
                .filter((k) => !nascoste.has(k))
                .map((k) => (
                  <Bar key={k} dataKey={k} fill={coloreDi[k]} radius={[4, 4, 0, 0]} maxBarSize={14} />
                ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Vuoto icona={<Activity />} titolo="Nessuna apertura nel periodo" testo="Appena parte una campagna o un’automazione, qui vedrai aperture e click giorno per giorno." />
      )}
    </section>
  )
}

// ───────────────────────── Salute della lista ─────────────────────────

function SaluteLista({ salute }: { salute: MailingSaluteLista }) {
  const colori = useColoriMailing()
  const segmenti = [
    { chiave: 'attivi', nome: 'Attivi', descr: 'aperto negli ultimi 30 giorni', valore: salute.attivi, colore: colori.s2 },
    { chiave: 'tiepidi', nome: 'Tiepidi', descr: 'aperto tra 30 e 90 giorni fa', valore: salute.tiepidi, colore: colori.s4 },
    { chiave: 'dormienti', nome: 'Dormienti', descr: 'nessuna apertura da 90 giorni', valore: salute.dormienti, colore: colori.s3 },
    { chiave: 'mai', nome: 'Mai aperto', descr: 'non hanno mai aperto', valore: salute.maiAperto, colore: colori.s5 },
  ]
  const totale = segmenti.reduce((n, s) => n + s.valore, 0)
  const r = 54
  const circ = 2 * Math.PI * r
  const spazio = totale > 0 ? 3 : 0
  let offset = 0
  const archi = segmenti
    .filter((s) => s.valore > 0)
    .map((s) => {
      const lung = Math.max(0, (s.valore / totale) * circ - spazio)
      const arco = { ...s, dash: `${lung} ${circ - lung}`, offset: -offset }
      offset += (s.valore / totale) * circ
      return arco
    })
  const tono = totale === 0 ? 'neutro' : salute.punteggio >= 70 ? 'ok' : salute.punteggio >= 45 ? 'avviso' : 'errore'
  const giudizio = totale === 0 ? 'Nessun dato' : salute.punteggio >= 70 ? 'In salute' : salute.punteggio >= 45 ? 'Da curare' : 'A rischio'

  return (
    <section className="ml-card ml-salute">
      <div className="ml-card-testa">
        <div>
          <div className="ml-card-titolo">
            <HeartPulse className="size-4" aria-hidden /> Salute della lista
          </div>
          <div className="ml-card-sottotitolo">Quanto sono coinvolti gli iscritti</div>
        </div>
        <span className={`ml-badge ml-badge--${tono}`}>{giudizio}</span>
      </div>
      <div className="ml-salute-corpo">
        <div className="ml-anello" role="img" aria-label={`Punteggio salute ${Math.round(salute.punteggio)} su 100`}>
          <svg viewBox="0 0 132 132" aria-hidden>
            <circle cx="66" cy="66" r={r} className="ml-anello-traccia" />
            {archi.map((a) => (
              <circle
                key={a.chiave}
                cx="66"
                cy="66"
                r={r}
                fill="none"
                stroke={a.colore}
                strokeWidth={12}
                strokeLinecap="butt"
                strokeDasharray={a.dash}
                strokeDashoffset={a.offset}
                transform="rotate(-90 66 66)"
                className="ml-anello-arco"
              />
            ))}
          </svg>
          <div className="ml-anello-testo">
            <span className="ml-numero-grande">{Math.round(salute.punteggio)}</span>
            <span className="ml-anello-sotto">su 100</span>
          </div>
        </div>
        <ul className="ml-salute-legenda">
          {segmenti.map((s) => (
            <li key={s.chiave} title={s.descr}>
              <span className="ml-tooltip-chiave" style={{ background: s.colore }} />
              <span className="ml-salute-nome">{s.nome}</span>
              <strong>{formatNumero(s.valore)}</strong>
              <span className="ml-salute-perc">{totale ? formatPercentuale((s.valore / totale) * 100, 0) : '—'}</span>
            </li>
          ))}
        </ul>
      </div>
      <dl className="ml-salute-dati">
        <div>
          <dt>Rimbalzi 30 gg</dt>
          <dd data-attenzione={(salute.tassoRimbalzo30g ?? 0) > 2 ? '' : undefined}>{formatPercentuale(salute.tassoRimbalzo30g, 2)}</dd>
        </div>
        <div>
          <dt>Spam 30 gg</dt>
          <dd data-attenzione={(salute.tassoSpam30g ?? 0) > 0.1 ? '' : undefined}>{formatPercentuale(salute.tassoSpam30g, 2)}</dd>
        </div>
        <div>
          <dt>Non validi</dt>
          <dd>{formatNumero(salute.rimbalzati)}</dd>
        </div>
      </dl>
      {salute.consigli.length ? (
        <ul className="ml-consigli">
          {salute.consigli.map((c) => (
            <li key={c}>
              <Sparkles className="size-3.5" aria-hidden />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

// ───────────────────────── Feed live ─────────────────────────

const EVENTO: Record<MailingTipoEvento, { icona: typeof MailOpen; verbo: string; tono: string }> = {
  INVIATO: { icona: Send, verbo: 'ha ricevuto', tono: 'neutro' },
  APERTURA: { icona: MailOpen, verbo: 'ha aperto', tono: 'info' },
  CLICK: { icona: MousePointerClick, verbo: 'ha cliccato', tono: 'accento' },
  RISPOSTA: { icona: Reply, verbo: 'ha risposto a', tono: 'info' },
  DISISCRIZIONE: { icona: CircleSlash, verbo: 'si è disiscritto da', tono: 'neutro' },
  RIMBALZO: { icona: MailX, verbo: 'non ha ricevuto', tono: 'avviso' },
  SPAM: { icona: ShieldAlert, verbo: 'ha segnalato come spam', tono: 'errore' },
  CONVERSIONE_VISITA: { icona: CalendarCheck, verbo: 'ha prenotato una visita dopo', tono: 'ok' },
  CONVERSIONE_ACQUISTO: { icona: Euro, verbo: 'ha acquistato dopo', tono: 'ok' },
}

function FeedLive({ feed, nuovi, onApriCampagna }: { feed: MailingAttivita[] | null; nuovi: Set<number>; onApriCampagna: (id: number) => void }) {
  const adesso = useAdesso(20_000)
  return (
    <section className="ml-card ml-feed">
      <div className="ml-card-testa ml-card-testa--fissa">
        <div>
          <div className="ml-card-titolo">
            <Radio className="size-4" aria-hidden /> In diretta
          </div>
          <div className="ml-card-sottotitolo">Aperture, click e prenotazioni man mano che succedono</div>
        </div>
        <span className="ml-badge" title="Si aggiorna ogni 30 secondi">Ogni 30 s</span>
      </div>
      {feed == null ? (
        <div className="ml-feed-lista">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="ml-feed-voce">
              <Scheletro altezza={32} larghezza={32} className="rounded-full" />
              <div className="flex-1">
                <Scheletro altezza={12} larghezza="80%" />
                <Scheletro altezza={10} larghezza="40%" className="mt-2" />
              </div>
            </div>
          ))}
        </div>
      ) : feed.length === 0 ? (
        <Vuoto icona={<Inbox />} titolo="Tutto tranquillo" testo="Quando qualcuno apre o clicca una tua email, lo vedi comparire qui in tempo reale." />
      ) : (
        <ol className="ml-feed-lista" aria-live="polite">
          {feed.map((a) => {
            const info = EVENTO[a.tipo] ?? EVENTO.INVIATO
            const Icona = info.icona
            const conversione = a.tipo === 'CONVERSIONE_VISITA' || a.tipo === 'CONVERSIONE_ACQUISTO'
            return (
              <li key={a.id} className="ml-feed-voce" data-nuovo={nuovi.has(a.id) ? '' : undefined} data-conversione={conversione ? '' : undefined}>
                <span className="ml-feed-avatar">
                  <Avatar nome={a.contattoNome ?? a.contattoEmail} dimensione="sm" />
                  <span className="ml-feed-tipo" data-tono={info.tono} aria-hidden>
                    <Icona className="size-2.5" />
                  </span>
                </span>
                <div className="ml-feed-corpo">
                  <div className="ml-feed-frase">
                    <strong>{a.contattoNome ?? a.contattoEmail ?? 'Qualcuno'}</strong> {info.verbo}{' '}
                    {a.campagnaId ? (
                      <button type="button" className="ml-feed-link" onClick={() => onApriCampagna(a.campagnaId as number)}>
                        {a.messaggio}
                      </button>
                    ) : (
                      <span className="ml-feed-oggetto">{a.messaggio}</span>
                    )}
                  </div>
                  <div className="ml-feed-meta">
                    <time dateTime={a.avvenutoIl}>{tempoFa(a.avvenutoIl, adesso)}</time>
                    {a.dispositivo ? <span>· {a.dispositivo}</span> : null}
                    {a.url && a.tipo === 'CLICK' ? <span className="ml-feed-url">· {a.url.replace(/^https?:\/\/(www\.)?/, '')}</span> : null}
                  </div>
                </div>
                {conversione && a.valore != null ? <span className="ml-feed-valore">{formatEuro(a.valore)}</span> : null}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

// ───────────────────────── Invii, automazioni, quote ─────────────────────────

function CampagneInCorso({
  dati,
  onApriCampagna,
  onCambiaTab,
}: {
  dati: MailingPanoramica
  onApriCampagna: (id: number) => void
  onCambiaTab: (t: string) => void
}) {
  const adesso = useAdesso(30_000)
  const inCorso = dati.campagneRecenti.filter((c) => c.stato === 'IN_INVIO' || c.stato === 'TEST_AB' || c.stato === 'IN_PAUSA')
  return (
    <section className="ml-card">
      <div className="ml-card-testa">
        <div>
          <div className="ml-card-titolo">
            <Send className="size-4" aria-hidden /> Invii in corso
          </div>
          <div className="ml-card-sottotitolo">
            {dati.inCodaTotale ? `${formatNumero(dati.inCodaTotale)} email in coda` : 'Nessuna email in coda'}
          </div>
        </div>
      </div>
      {inCorso.length === 0 ? (
        <p className="ml-vuoto-riga">Nessuna campagna in invio adesso.</p>
      ) : (
        <ul className="ml-lista">
          {inCorso.map((c) => {
            const totale = c.destinatariTotali || c.metriche.destinatari || 0
            const inviati = c.metriche.inviati
            const perc = totale ? Math.min(100, (inviati / totale) * 100) : 0
            const errori = c.metriche.errori
            return (
              <li key={c.id}>
                <button type="button" className="ml-invio" onClick={() => onApriCampagna(c.id)}>
                  <div className="ml-invio-testa">
                    <span className="ml-invio-nome">{c.nome}</span>
                    <BadgeStatoCampagna stato={c.stato} />
                  </div>
                  <div className="ml-barra" data-vivo={c.stato === 'IN_INVIO' ? '' : undefined} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(perc)} aria-label={`Avanzamento ${c.nome}`}>
                    <span className="ml-barra-valore" style={{ width: `${perc}%` }} />
                  </div>
                  <div className="ml-invio-piede">
                    <span>
                      <strong>{formatNumero(inviati)}</strong> di {formatNumero(totale)}
                      {errori ? <span className="ml-invio-errori"> · {formatNumero(errori)} errori</span> : null}
                    </span>
                    <span>{c.stato === 'IN_PAUSA' ? 'in pausa' : `${Math.round(perc)}%`}</span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="ml-sottosezione">
        <div className="ml-etichetta">
          <CalendarClock className="size-3.5" aria-hidden /> Programmate
        </div>
        {dati.programmate.length === 0 ? (
          <p className="ml-vuoto-riga">
            Niente in calendario.{' '}
            <button type="button" className="ml-link" onClick={() => onCambiaTab('campagne')}>
              Programma una campagna
            </button>
          </p>
        ) : (
          <ul className="ml-lista ml-lista--compatta">
            {dati.programmate.slice(0, 4).map((c) => (
              <li key={c.id}>
                <button type="button" className="ml-riga-link" onClick={() => onApriCampagna(c.id)}>
                  <span className="ml-data-chip" aria-hidden>
                    <span>{c.programmataIl ? new Date(c.programmataIl).toLocaleDateString('it-IT', { month: 'short' }) : ''}</span>
                    <strong>{c.programmataIl ? new Date(c.programmataIl).getDate() : '—'}</strong>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="ml-riga-titolo">{c.nome}</span>
                    <span className="ml-riga-sotto">
                      <Clock className="size-3" aria-hidden /> {dataOra(c.programmataIl)} · {tempoFa(c.programmataIl, adesso)}
                    </span>
                  </span>
                  <span className="ml-riga-num">{formatCompatto(c.destinatariTotali)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function AutomazioniAttive({ dati, onCambiaTab }: { dati: MailingPanoramica; onCambiaTab: (t: string) => void }) {
  return (
    <section className="ml-card">
      <div className="ml-card-testa">
        <div>
          <div className="ml-card-titolo">
            <Workflow className="size-4" aria-hidden /> Automazioni attive
          </div>
          <div className="ml-card-sottotitolo">Lavorano da sole, anche quando il dottore è in visita</div>
        </div>
      </div>
      {dati.automazioniAttive.length === 0 ? (
        <Vuoto
          icona={<Workflow />}
          titolo="Nessuna automazione attiva"
          testo="Benvenuto ai nuovi lead, follow-up dopo la prima visita, riattivazione: si attivano in un minuto dai modelli."
          azioni={
            <button type="button" className="ml-btn ml-btn--sm" onClick={() => onCambiaTab('automazioni')}>
              Scegli un modello <ArrowRight className="size-3.5" aria-hidden />
            </button>
          }
        />
      ) : (
        <ul className="ml-lista">
          {dati.automazioniAttive.map((a) => (
            <li key={a.id}>
              <button type="button" className="ml-automazione" onClick={() => onCambiaTab('automazioni')}>
                <span className="ml-automazione-punto" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="ml-riga-titolo">{a.nome}</span>
                  <span className="ml-riga-sotto">{a.triggerDescrizione}</span>
                </span>
                <span className="ml-automazione-numeri">
                  <span title="Persone dentro l’automazione adesso">
                    <strong>{formatNumero(a.attivi)}</strong> in corso
                  </span>
                  <span title="Tasso di apertura">{formatPercentuale(a.metriche.tassoApertura, 0)} aperture</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function QuoteMittenti({ dati, onCambiaTab }: { dati: MailingPanoramica; onCambiaTab: (t: string) => void }) {
  return (
    <section className="ml-card">
      <div className="ml-card-testa">
        <div>
          <div className="ml-card-titolo">
            <AtSign className="size-4" aria-hidden /> Quote dei mittenti
          </div>
          <div className="ml-card-sottotitolo">Email inviate nelle ultime 24 ore rispetto al limite giornaliero</div>
        </div>
      </div>
      {dati.mittenti.length === 0 ? (
        <Vuoto
          icona={<AtSign />}
          titolo="Nessun mittente"
          testo="Serve almeno una casella da cui inviare."
          azioni={
            <button type="button" className="ml-btn ml-btn--sm ml-btn--pieno" onClick={() => onCambiaTab('impostazioni')}>
              Aggiungi mittente
            </button>
          }
        />
      ) : (
        <ul className="ml-lista">
          {dati.mittenti.map((m) => {
            const perc = m.limiteGiornaliero ? Math.min(100, (m.inviatiUltime24h / m.limiteGiornaliero) * 100) : 0
            const tono = perc >= 90 ? 'errore' : perc >= 70 ? 'avviso' : 'ok'
            return (
              <li key={m.id} className="ml-quota">
                <div className="ml-quota-testa">
                  <span className="min-w-0">
                    <span className="ml-riga-titolo">{m.nomeVisualizzato}</span>
                    <span className="ml-riga-sotto">{m.email}</span>
                  </span>
                  {!m.attivo ? <span className="ml-badge ml-badge--neutro">Spento</span> : m.ultimoErrore ? <span className="ml-badge ml-badge--errore">Errore</span> : null}
                </div>
                <div className="ml-barra" data-tono={tono} role="progressbar" aria-valuemin={0} aria-valuemax={m.limiteGiornaliero} aria-valuenow={m.inviatiUltime24h} aria-label={`Quota di ${m.email}`}>
                  <span className="ml-barra-valore" style={{ width: `${perc}%` }} />
                </div>
                <div className="ml-quota-piede">
                  <span>
                    <strong>{formatNumero(m.inviatiUltime24h)}</strong> / {formatNumero(m.limiteGiornaliero)}
                  </span>
                  <span>{m.inCoda ? `${formatNumero(m.inCoda)} in coda` : 'coda vuota'}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function UltimeCampagne({ campagne, onApriCampagna, onCambiaTab }: { campagne: MailingCampagnaRiga[]; onApriCampagna: (id: number) => void; onCambiaTab: (t: string) => void }) {
  const inviate = campagne.filter((c) => c.stato === 'INVIATA').slice(0, 6)
  if (!inviate.length) return null
  return (
    <section className="ml-card">
      <div className="ml-card-testa">
        <div>
          <div className="ml-card-titolo">
            <MailOpen className="size-4" aria-hidden /> Ultime campagne
          </div>
          <div className="ml-card-sottotitolo">Come sono andate, in una riga</div>
        </div>
        <button type="button" className="ml-link" onClick={() => onCambiaTab('campagne')}>
          Tutte le campagne <ArrowRight className="size-3.5" aria-hidden />
        </button>
      </div>
      <div className="ml-campagne-griglia">
        {inviate.map((c) => (
          <button key={c.id} type="button" className="ml-campagna-mini" onClick={() => onApriCampagna(c.id)}>
            <div className="ml-campagna-mini-testa">
              <BadgeStatoCampagna stato={c.stato} />
              <span className="ml-muto">{tempoFa(c.invioCompletatoIl ?? c.invioIniziatoIl ?? c.aggiornatoIl)}</span>
            </div>
            <div className="ml-campagna-mini-nome">{c.nome}</div>
            <div className="ml-campagna-mini-oggetto">{c.oggetto}</div>
            <div className="ml-campagna-mini-numeri">
              <span>
                <strong>{formatPercentuale(c.metriche.tassoApertura, 0)}</strong> aperture
              </span>
              <span>
                <strong>{formatPercentuale(c.metriche.tassoClick, 1)}</strong> click
              </span>
              <span>
                <strong>{formatNumero(c.metriche.visiteGenerate)}</strong> visite
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
