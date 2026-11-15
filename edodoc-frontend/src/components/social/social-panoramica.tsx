import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, AlertTriangle, Loader2, ArrowRight, Clock, ExternalLink, Flame, MessageCircle, Sparkles, Timer, Trophy } from 'lucide-react'
import type {
  SocialAccount,
  SocialAzione,
  SocialCellaOrario,
  SocialCommunity,
  SocialContenuto,
  SocialPanoramica,
  SocialPiattaforma,
  SocialPiattaformaStat,
  SocialPuntoSerie,
} from '@/services/social-service'
import { AvatarSocial, Delta, IconaPiattaforma } from './social-ui'
import {
  formatCompatto,
  formatDurataMinuti,
  formatNumero,
  formatPercentuale,
  GIORNI_BREVI,
  NOMI_PIATTAFORMA,
  tempoFa,
  variazione,
  ETICHETTE_AZIONE,
  useColoriSerie,
} from './social-utils'

type Props = {
  panoramica: SocialPanoramica | null
  errore: string | null
  caricamento: boolean
  account: SocialAccount
  community: SocialCommunity | null
  onApriInbox: () => void
  /** Periodo appena scelto e non ancora arrivato da Meta (null se i dati sono quelli giusti). */
  periodoInArrivo: number | null
}

export function SocialPanoramicaTab({ panoramica, errore, caricamento, account, community, onApriInbox, periodoInArrivo }: Props) {
  if (!panoramica) {
    if (errore) return <Avviso testo={errore} />
    return <ScheletroPanoramica caricamento={caricamento} />
  }
  return (
    <div className="so-griglia-panoramica" data-so-aggiornando={periodoInArrivo ? '' : undefined} aria-busy={!!periodoInArrivo}>
      {periodoInArrivo ? (
        <div className="so-in-arrivo" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Carico gli ultimi {periodoInArrivo} giorni… intanto vedi i dati a {panoramica.giorni} giorni
        </div>
      ) : null}
      {errore ? <Avviso testo={`Ultimo aggiornamento non riuscito: ${errore}`} lieve /> : null}

      <div className="so-piattaforme">
        <CardPiattaforma piattaforma="FACEBOOK" stat={panoramica.facebook} giorni={panoramica.giorni} nome={account.nome} />
        <CardPiattaforma
          piattaforma="INSTAGRAM"
          stat={panoramica.instagram}
          giorni={panoramica.giorni}
          nome={account.instagramUsername ? `@${account.instagramUsername}` : 'Instagram'}
        />
      </div>

      <GraficoCopertura serie={panoramica.serie} />

      <div className="so-due-colonne">
        <GraficoBarre
          titolo="Interazioni giornaliere"
          sottotitolo="Facebook: reazioni, commenti, condivisioni e clic sui post"
          serie={panoramica.serie}
          chiave="fbInterazioni"
          piattaforma="FACEBOOK"
        />
        <GraficoBarre
          titolo="Nuovi follower al giorno"
          sottotitolo="Instagram: follower guadagnati ogni giorno"
          serie={panoramica.serie}
          chiave="igNuoviFollower"
          piattaforma="INSTAGRAM"
        />
      </div>

      <div className="so-due-colonne so-due-colonne--larga">
        <MappaOrari celle={panoramica.orariMigliori} />
        <SaluteCommunity community={community ?? panoramica.community} onApriInbox={onApriInbox} />
      </div>

      <TopContenuti contenuti={panoramica.topContenuti} />

      <AttivitaTeam azioni={panoramica.attivitaTeam} />
    </div>
  )
}

function Avviso({ testo, lieve }: { testo: string; lieve?: boolean }) {
  return (
    <div className="so-avviso" data-lieve={lieve ? '' : undefined} role="status">
      <AlertTriangle className="size-4 shrink-0" aria-hidden />
      <span>{testo}</span>
    </div>
  )
}

function ScheletroPanoramica({ caricamento }: { caricamento: boolean }) {
  return (
    <div className="so-griglia-panoramica" aria-busy={caricamento}>
      <div className="so-piattaforme">
        <div className="so-card so-scheletro" style={{ height: 220 }} />
        <div className="so-card so-scheletro" style={{ height: 220 }} />
      </div>
      <div className="so-card so-scheletro" style={{ height: 320 }} />
    </div>
  )
}

function CardPiattaforma({ piattaforma, stat, giorni, nome }: { piattaforma: SocialPiattaforma; stat: SocialPiattaformaStat; giorni: number; nome: string }) {
  return (
    <section className="so-card so-card-piattaforma" data-p={piattaforma}>
      <div className="so-card-piattaforma-head">
        <span className="so-piattaforma-badge" data-p={piattaforma}>
          <IconaPiattaforma piattaforma={piattaforma} className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="so-titolo">{NOMI_PIATTAFORMA[piattaforma]}</div>
          <div className="so-sottotitolo truncate">{nome}</div>
        </div>
        <div className="so-card-piattaforma-follower">
          <span className="so-numero-grande">{formatCompatto(stat.follower)}</span>
          <span className="so-sottotitolo">follower</span>
        </div>
      </div>
      {!stat.disponibile ? (
        <p className="so-vuoto-testo">{stat.errore ?? 'Statistiche non disponibili per questo account.'}</p>
      ) : (
        <dl className="so-metriche">
          {stat.metriche.map((m) => (
            <div key={m.chiave} className="so-metrica" title={m.descrizione ?? undefined}>
              <dt>{m.etichetta}</dt>
              <dd>
                <span className="so-metrica-valore">{formatCompatto(m.valore)}</span>
                <Delta valore={variazione(m)} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="so-card-nota">Ultimi {giorni} giorni, confronto con i {giorni} precedenti</div>
    </section>
  )
}

function etichettaGiorno(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

type Voce = { name?: string | number; value?: number | string | null; dataKey?: string | number; color?: string }

function TooltipGrafico({ active, payload, label, nomi }: { active?: boolean; payload?: Voce[]; label?: string; nomi: Record<string, { nome: string; p: SocialPiattaforma }> }) {
  if (!active || !payload?.length || !label) return null
  return (
    <div className="so-tooltip">
      <div className="so-tooltip-titolo">{new Date(`${label}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      {payload.map((v) => {
        const info = nomi[String(v.dataKey)]
        if (!info) return null
        return (
          <div key={String(v.dataKey)} className="so-tooltip-riga">
            <span className="so-tooltip-chiave" data-p={info.p} />
            <span>{info.nome}</span>
            <strong>{v.value == null ? '—' : formatNumero(Number(v.value))}</strong>
          </div>
        )
      })}
    </div>
  )
}

const SERIE_COPERTURA = {
  fbCopertura: { nome: 'Facebook', p: 'FACEBOOK' as SocialPiattaforma },
  igCopertura: { nome: 'Instagram', p: 'INSTAGRAM' as SocialPiattaforma },
}

function GraficoCopertura({ serie }: { serie: SocialPuntoSerie[] }) {
  const [nascoste, setNascoste] = useState<Set<string>>(new Set())
  const totali = useMemo(
    () => ({
      fbCopertura: serie.reduce((n, p) => n + (p.fbCopertura ?? 0), 0),
      igCopertura: serie.reduce((n, p) => n + (p.igCopertura ?? 0), 0),
    }),
    [serie],
  )
  const alterna = (k: string) =>
    setNascoste((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  const haDati = serie.some((p) => p.fbCopertura != null || p.igCopertura != null)
  const colori = useColoriSerie()

  return (
    <section className="so-card">
      <div className="so-card-head">
        <div>
          <div className="so-titolo">Copertura giornaliera</div>
          <div className="so-sottotitolo">Persone diverse raggiunte ogni giorno dai contenuti</div>
        </div>
        <div className="so-legenda" role="group" aria-label="Serie">
          {(Object.keys(SERIE_COPERTURA) as (keyof typeof SERIE_COPERTURA)[]).map((k) => (
            <button key={k} type="button" className="so-legenda-voce" data-off={nascoste.has(k) ? '' : undefined} onClick={() => alterna(k)} aria-pressed={!nascoste.has(k)}>
              <span className="so-tooltip-chiave" data-p={SERIE_COPERTURA[k].p} />
              {SERIE_COPERTURA[k].nome}
              <strong>{formatCompatto(totali[k])}</strong>
            </button>
          ))}
        </div>
      </div>
      {haDati ? (
        <div className="so-grafico" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="so-grad-fb" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colori.fb} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={colori.fb} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="so-grad-ig" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colori.ig} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={colori.ig} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--vl-line)" />
              <XAxis dataKey="data" tickFormatter={etichettaGiorno} tick={{ fontSize: 11, fill: 'var(--vl-ink-3)' }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tickFormatter={(v) => formatCompatto(Number(v))} tick={{ fontSize: 11, fill: 'var(--vl-ink-3)' }} tickLine={false} axisLine={false} width={44} />
              <Tooltip content={<TooltipGrafico nomi={SERIE_COPERTURA} />} cursor={{ stroke: 'var(--vl-line-strong)', strokeWidth: 1 }} />
              {!nascoste.has('fbCopertura') ? (
                <Area type="monotone" dataKey="fbCopertura" stroke={colori.fb} strokeWidth={2} fill="url(#so-grad-fb)" connectNulls activeDot={{ r: 5, strokeWidth: 2, stroke: colori.superficie }} dot={false} />
              ) : null}
              {!nascoste.has('igCopertura') ? (
                <Area type="monotone" dataKey="igCopertura" stroke={colori.ig} strokeWidth={2} fill="url(#so-grad-ig)" connectNulls activeDot={{ r: 5, strokeWidth: 2, stroke: colori.superficie }} dot={false} />
              ) : null}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="so-vuoto-testo">Meta non ha ancora restituito la copertura giornaliera per questo periodo.</p>
      )}
    </section>
  )
}

function GraficoBarre({
  titolo,
  sottotitolo,
  serie,
  chiave,
  piattaforma,
}: {
  titolo: string
  sottotitolo: string
  serie: SocialPuntoSerie[]
  chiave: 'fbInterazioni' | 'igNuoviFollower'
  piattaforma: SocialPiattaforma
}) {
  const totale = serie.reduce((n, p) => n + (p[chiave] ?? 0), 0)
  const haDati = serie.some((p) => p[chiave] != null)
  const nomi = { [chiave]: { nome: NOMI_PIATTAFORMA[piattaforma], p: piattaforma } }
  const colori = useColoriSerie()
  return (
    <section className="so-card">
      <div className="so-card-head">
        <div>
          <div className="so-titolo">
            <IconaPiattaforma piattaforma={piattaforma} /> {titolo}
          </div>
          <div className="so-sottotitolo">{sottotitolo}</div>
        </div>
        <span className="so-numero-medio">{formatCompatto(haDati ? totale : null)}</span>
      </div>
      {haDati ? (
        <div className="so-grafico" style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke="var(--vl-line)" />
              <XAxis dataKey="data" tickFormatter={etichettaGiorno} tick={{ fontSize: 10, fill: 'var(--vl-ink-3)' }} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis tickFormatter={(v) => formatCompatto(Number(v))} tick={{ fontSize: 10, fill: 'var(--vl-ink-3)' }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
              <Tooltip content={<TooltipGrafico nomi={nomi} />} cursor={{ fill: 'var(--vl-hover)' }} />
              <Bar dataKey={chiave} fill={piattaforma === 'FACEBOOK' ? colori.fb : colori.ig} radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="so-vuoto-testo">Dato non disponibile per questo periodo.</p>
      )}
    </section>
  )
}

/** Heatmap giorno × ora: una sola tinta, più scura = più interazioni medie per contenuto. */
function MappaOrari({ celle }: { celle: SocialCellaOrario[] }) {
  const [sopra, setSopra] = useState<SocialCellaOrario | null>(null)
  const { griglia, massimo, migliori } = useMemo(() => {
    const g = new Map<string, SocialCellaOrario>()
    let max = 0
    celle.forEach((c) => {
      g.set(`${c.giorno}-${c.ora}`, c)
      if (c.contenuti > 0) max = Math.max(max, c.punteggio)
    })
    const top = [...celle].filter((c) => c.contenuti > 0).sort((a, b) => b.punteggio - a.punteggio).slice(0, 3)
    return { griglia: g, massimo: max, migliori: top }
  }, [celle])
  const ore = Array.from({ length: 24 }, (_, i) => i)
  const totaleContenuti = celle.reduce((n, c) => n + c.contenuti, 0)

  return (
    <section className="so-card">
      <div className="so-card-head">
        <div>
          <div className="so-titolo">
            <Clock className="size-4" aria-hidden /> Quando pubblicare
          </div>
          <div className="so-sottotitolo">Interazioni medie per contenuto, per giorno e ora di pubblicazione (ultimi 90 giorni)</div>
        </div>
      </div>
      {totaleContenuti === 0 ? (
        <p className="so-vuoto-testo">Servono un po’ di post pubblicati per capire quali orari funzionano meglio.</p>
      ) : (
        <>
          <div className="so-heatmap" role="grid" aria-label="Interazioni per giorno e ora" onMouseLeave={() => setSopra(null)}>
            <div className="so-heatmap-ore" aria-hidden>
              <span />
              {ore.map((o) => (
                <span key={o}>{o % 3 === 0 ? o : ''}</span>
              ))}
            </div>
            {GIORNI_BREVI.map((g, gi) => (
              <div key={g} className="so-heatmap-riga" role="row">
                <span className="so-heatmap-giorno">{g}</span>
                {ore.map((o) => {
                  const c = griglia.get(`${gi + 1}-${o}`)
                  const intensita = c && c.contenuti > 0 && massimo > 0 ? c.punteggio / massimo : 0
                  return (
                    <span
                      key={o}
                      role="gridcell"
                      className="so-heatmap-cella"
                      data-vuota={!c || c.contenuti === 0 ? '' : undefined}
                      style={{ ['--so-i' as string]: intensita.toFixed(3) }}
                      onMouseEnter={() => setSopra(c ?? { giorno: gi + 1, ora: o, punteggio: 0, contenuti: 0 })}
                      aria-label={`${g} ore ${o}: ${c?.contenuti ? `${formatNumero(c.punteggio)} interazioni medie su ${c.contenuti} contenuti` : 'nessun contenuto'}`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
          <div className="so-heatmap-piede">
            {sopra ? (
              <span>
                <strong>
                  {GIORNI_BREVI[sopra.giorno - 1]} {String(sopra.ora).padStart(2, '0')}:00
                </strong>{' '}
                · {sopra.contenuti ? `${formatNumero(sopra.punteggio)} interazioni medie · ${sopra.contenuti} contenuti` : 'nessun contenuto pubblicato'}
              </span>
            ) : migliori.length ? (
              <span className="so-heatmap-migliori">
                <Flame className="size-4" aria-hidden /> Momenti migliori:{' '}
                {migliori.map((m, i) => (
                  <strong key={`${m.giorno}-${m.ora}`}>
                    {i > 0 ? ', ' : ''}
                    {GIORNI_BREVI[m.giorno - 1]} {String(m.ora).padStart(2, '0')}:00
                  </strong>
                ))}
              </span>
            ) : null}
            <span className="so-heatmap-scala" aria-hidden>
              meno <span className="so-heatmap-scala-barra" /> più
            </span>
          </div>
        </>
      )}
    </section>
  )
}

function SaluteCommunity({ community, onApriInbox }: { community: SocialCommunity; onApriInbox: () => void }) {
  const tasso = community.tassoRisposta ?? 0
  const r = 52
  const circ = 2 * Math.PI * r
  const tono = community.tassoRisposta == null ? 'neutro' : tasso >= 0.9 ? 'ok' : tasso >= 0.6 ? 'warn' : 'danger'
  return (
    <section className="so-card so-salute">
      <div className="so-card-head">
        <div>
          <div className="so-titolo">
            <Activity className="size-4" aria-hidden /> Salute della community
          </div>
          <div className="so-sottotitolo">Commenti degli ultimi post: quanti hanno una risposta della pagina</div>
        </div>
      </div>
      <div className="so-salute-corpo">
        <div className="so-anello" data-tono={tono}>
          <svg viewBox="0 0 120 120" aria-hidden>
            <circle cx="60" cy="60" r={r} className="so-anello-traccia" />
            <circle cx="60" cy="60" r={r} className="so-anello-valore" strokeDasharray={`${circ * tasso} ${circ}`} transform="rotate(-90 60 60)" />
          </svg>
          <div className="so-anello-testo">
            <span className="so-numero-grande">{formatPercentuale(community.tassoRisposta, 0)}</span>
            <span className="so-sottotitolo">risposti</span>
          </div>
        </div>
        <dl className="so-salute-dati">
          <div>
            <dt>
              <Timer className="size-3.5" aria-hidden /> Tempo medio di risposta
            </dt>
            <dd>{formatDurataMinuti(community.tempoMedioRispostaMinuti)}</dd>
          </div>
          <div>
            <dt>
              <MessageCircle className="size-3.5" aria-hidden /> Commenti
            </dt>
            <dd>
              {formatNumero(community.commentiRisposti)} / {formatNumero(community.commentiTotali)}
            </dd>
          </div>
          <div>
            <dt>Da rispondere</dt>
            <dd data-attenzione={community.commentiDaRispondere > 0 ? '' : undefined}>{formatNumero(community.commentiDaRispondere)}</dd>
          </div>
          <div>
            <dt>DM non letti</dt>
            <dd data-attenzione={community.conversazioniNonLette > 0 ? '' : undefined}>{formatNumero(community.conversazioniNonLette)}</dd>
          </div>
        </dl>
      </div>
      <button type="button" className="so-btn so-btn--pieno" onClick={onApriInbox}>
        Apri l’inbox <ArrowRight className="size-4" aria-hidden />
      </button>
    </section>
  )
}

export function CardContenuto({ c, posizione }: { c: SocialContenuto; posizione?: number }) {
  return (
    <a className="so-contenuto" href={c.link ?? undefined} target="_blank" rel="noreferrer">
      <div className="so-contenuto-media">
        {c.immagine ? <img src={c.immagine} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="so-contenuto-testo-solo">{c.testo?.slice(0, 140) || 'Post'}</div>}
        <span className="so-contenuto-piattaforma" data-p={c.piattaforma}>
          <IconaPiattaforma piattaforma={c.piattaforma} className="size-3" />
        </span>
        {posizione != null ? <span className="so-contenuto-pos">#{posizione}</span> : null}
        <span className="so-contenuto-tipo">{c.tipo.toLowerCase()}</span>
      </div>
      <div className="so-contenuto-corpo">
        <p className="so-contenuto-didascalia">{c.testo || <em>Senza testo</em>}</p>
        <div className="so-contenuto-stat">
          <span title="Interazioni">
            <Sparkles className="size-3.5" aria-hidden /> {formatCompatto(c.interazioni)}
          </span>
          <span title="Copertura">
            <Activity className="size-3.5" aria-hidden /> {formatCompatto(c.copertura ?? c.visualizzazioni)}
          </span>
          <span title="Tasso di interazione">{formatPercentuale(c.tassoInterazione)}</span>
        </div>
        <div className="so-contenuto-data">
          {tempoFa(c.pubblicatoIl)} <ExternalLink className="size-3" aria-hidden />
        </div>
      </div>
    </a>
  )
}

function TopContenuti({ contenuti }: { contenuti: SocialContenuto[] }) {
  return (
    <section className="so-card">
      <div className="so-card-head">
        <div>
          <div className="so-titolo">
            <Trophy className="size-4" aria-hidden /> I contenuti che hanno spaccato
          </div>
          <div className="so-sottotitolo">I migliori del periodo per interazioni, su entrambe le piattaforme</div>
        </div>
      </div>
      {contenuti.length ? (
        <div className="so-contenuti-griglia so-contenuti-griglia--top">
          {contenuti.map((c, i) => (
            <CardContenuto key={`${c.piattaforma}-${c.id}`} c={c} posizione={i + 1} />
          ))}
        </div>
      ) : (
        <p className="so-vuoto-testo">Nessun contenuto pubblicato nel periodo.</p>
      )}
    </section>
  )
}


function AttivitaTeam({ azioni }: { azioni: SocialAzione[] }) {
  const classifica = useMemo(() => {
    const m = new Map<string, number>()
    azioni.forEach((a) => {
      if (a.utenteNome) m.set(a.utenteNome, (m.get(a.utenteNome) ?? 0) + 1)
    })
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [azioni])
  return (
    <section className="so-card">
      <div className="so-card-head">
        <div>
          <div className="so-titolo">Attività dal gestionale</div>
          <div className="so-sottotitolo">Chi ha risposto, pubblicato e moderato dal gestionale</div>
        </div>
        {classifica.length ? (
          <div className="so-classifica" aria-label="Più attivi">
            {classifica.map(([nome, n]) => (
              <span key={nome} className="so-classifica-voce" title={`${nome}: ${n} azioni`}>
                <AvatarSocial nome={nome} dimensione="sm" />
                <strong>{n}</strong>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {azioni.length ? (
        <ol className="so-attivita">
          {azioni.map((a) => (
            <li key={a.id}>
              <AvatarSocial nome={a.utenteNome} dimensione="sm" />
              <div className="min-w-0">
                <div>
                  <strong>{a.utenteNome ?? 'Qualcuno'}</strong> {ETICHETTE_AZIONE[a.tipo] ?? a.tipo.toLowerCase()}
                  {a.piattaforma ? (
                    <>
                      {' '}
                      su <IconaPiattaforma piattaforma={a.piattaforma} className="size-3" />
                    </>
                  ) : null}
                </div>
                {a.anteprima ? <div className="so-attivita-anteprima">“{a.anteprima}”</div> : null}
              </div>
              <time className="so-attivita-quando" dateTime={a.creatoIl}>
                {tempoFa(a.creatoIl)}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="so-vuoto-testo">Ancora nessuna azione dal gestionale: le risposte e i post fatti da qui compariranno in questa lista.</p>
      )}
    </section>
  )
}
