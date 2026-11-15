import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarChart3, Eye, Heart, Inbox, LayoutGrid, Loader2, PenSquare, Plus, RefreshCw, Users, UsersRound } from 'lucide-react'
import { LuxHero, LuxKpi } from '@/components/lux'
import { toast } from '@/lib/toast'
import { useSocialRealtime } from '@/hooks/use-social-realtime'
import {
  messaggioErroreSocial,
  socialService,
  type SocialAccount,
  type SocialConversazione,
  type SocialElencoCommenti,
  type SocialEvento,
  type SocialPanoramica,
  type SocialStato,
} from '@/services/social-service'
import { SocialPanoramicaTab } from './social-panoramica'
import { SocialInbox } from './social-inbox'
import { SocialContenuti } from './social-contenuti'
import { SocialPubblica } from './social-pubblica'
import { SocialPubblicoTab } from './social-pubblico'
import { SocialSetup } from './social-setup'
import { Delta, IconaPiattaforma } from './social-ui'
import { commentoDaGestire, conversazioneDaGestire, formatCompatto, formatNumero, formatPercentuale, tempoFa, variazione } from './social-utils'
import '@/style/lux-social.css'

export type SocialTab = 'panoramica' | 'inbox' | 'contenuti' | 'pubblica' | 'pubblico'

const TABS: { id: SocialTab; label: string; icon: typeof BarChart3 }[] = [
  { id: 'panoramica', label: 'Panoramica', icon: BarChart3 },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'contenuti', label: 'Contenuti', icon: LayoutGrid },
  { id: 'pubblica', label: 'Pubblica', icon: PenSquare },
  { id: 'pubblico', label: 'Pubblico', icon: UsersRound },
]

const PERIODI = [7, 14, 28] as const
const CHIAVE_ACCOUNT = 'social.account'
const POLLING_INBOX_MS = 30_000
const POLLING_STATISTICHE_MS = 60_000

function leggiAccountSalvato(): string | null {
  try {
    return localStorage.getItem(CHIAVE_ACCOUNT)
  } catch {
    return null
  }
}

function salvaAccount(pageId: string) {
  try {
    localStorage.setItem(CHIAVE_ACCOUNT, pageId)
  } catch {
    /* storage non disponibile */
  }
}

/** Ticker che fa ridisegnare i "x min fa" senza ricaricare niente. */
function useAdesso(ogniMs = 15_000) {
  const [adesso, setAdesso] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setAdesso(Date.now()), ogniMs)
    return () => window.clearInterval(id)
  }, [ogniMs])
  return adesso
}

export function SocialPagina() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as SocialTab | null
  const tab: SocialTab = TABS.some((t) => t.id === tabParam) ? (tabParam as SocialTab) : 'panoramica'

  const [stato, setStato] = useState<SocialStato | null>(null)
  const [erroreStato, setErroreStato] = useState<string | null>(null)
  const [pageId, setPageId] = useState<string | null>(null)
  const [giorni, setGiorni] = useState<number>(28)

  const [panoramica, setPanoramica] = useState<SocialPanoramica | null>(null)
  const [panoramicaErrore, setPanoramicaErrore] = useState<string | null>(null)
  const [panoramicaCarica, setPanoramicaCarica] = useState(false)

  const [commenti, setCommenti] = useState<SocialElencoCommenti | null>(null)
  const [conversazioni, setConversazioni] = useState<SocialConversazione[] | null>(null)
  const [inboxErrore, setInboxErrore] = useState<string | null>(null)
  const [inboxCarica, setInboxCarica] = useState(false)
  /** Cresce a ogni evento realtime: le tab lo usano per ricaricare ciò che stanno mostrando. */
  const [generazione, setGenerazione] = useState(0)
  const [ultimoEvento, setUltimoEvento] = useState<number | null>(null)
  const adesso = useAdesso()

  const caricaStato = useCallback(async () => {
    try {
      setErroreStato(null)
      const s = await socialService.stato()
      setStato(s)
      const salvato = leggiAccountSalvato()
      setPageId((attuale) => {
        const validi = s.account.map((a) => a.pageId)
        if (attuale && validi.includes(attuale)) return attuale
        if (salvato && validi.includes(salvato)) return salvato
        return validi[0] ?? null
      })
    } catch (err) {
      setErroreStato(messaggioErroreSocial(err, 'Impossibile leggere lo stato dell’integrazione'))
    }
  }, [])

  useEffect(() => {
    void caricaStato()
  }, [caricaStato])

  const account: SocialAccount | null = useMemo(
    () => stato?.account.find((a) => a.pageId === pageId) ?? null,
    [stato, pageId],
  )
  const pronto = !!stato?.utilizzabile && !!account

  // ── Panoramica (statistiche): al cambio account/periodo e a polling ──
  const richiestaPanoramica = useRef(0)
  /** Ultima panoramica per pagina e periodo: tornare su un periodo già visto è istantaneo. */
  const panoramichePerPeriodo = useRef(new Map<string, SocialPanoramica>())
  const caricaPanoramica = useCallback(
    async (silenziosa = false) => {
      if (!pageId) return
      const n = ++richiestaPanoramica.current
      if (!silenziosa) setPanoramicaCarica(true)
      try {
        const p = await socialService.panoramica(pageId, giorni)
        panoramichePerPeriodo.current.set(`${p.pageId}:${p.giorni}`, p)
        if (n !== richiestaPanoramica.current) return
        setPanoramica(p)
        setPanoramicaErrore(null)
      } catch (err) {
        if (n !== richiestaPanoramica.current) return
        setPanoramicaErrore(messaggioErroreSocial(err, 'Statistiche non disponibili'))
      } finally {
        if (n === richiestaPanoramica.current) setPanoramicaCarica(false)
      }
    },
    [pageId, giorni],
  )

  useEffect(() => {
    if (!pronto) return
    const giaVista = panoramichePerPeriodo.current.get(`${pageId}:${giorni}`)
    setPanoramica((p) => giaVista ?? (p && p.pageId === pageId ? p : null))
    void caricaPanoramica(!!giaVista)
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void caricaPanoramica(true)
    }, POLLING_STATISTICHE_MS)
    return () => window.clearInterval(id)
  }, [pronto, pageId, giorni, caricaPanoramica])

  // ── Inbox (commenti + DM): servono anche all'hero, quindi vivono qui ──
  const richiestaInbox = useRef(0)
  const caricaInbox = useCallback(
    async (silenziosa = false) => {
      if (!pageId) return
      const n = ++richiestaInbox.current
      if (!silenziosa) setInboxCarica(true)
      // Commenti e DM si mostrano appena arriva ciascuno: chi è più veloce non aspetta l'altro.
      const [c, d] = await Promise.allSettled([
        socialService.commenti(pageId).then((v) => {
          if (n === richiestaInbox.current) setCommenti(v)
          return v
        }),
        socialService.conversazioni(pageId).then((v) => {
          if (n === richiestaInbox.current) setConversazioni(v)
          return v
        }),
      ])
      if (n !== richiestaInbox.current) return
      const errori = [c, d].filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      setInboxErrore(errori.length ? messaggioErroreSocial(errori[0].reason, 'Inbox non disponibile') : null)
      setInboxCarica(false)
    },
    [pageId],
  )

  useEffect(() => {
    if (!pronto) return
    setCommenti(null)
    setConversazioni(null)
    void caricaInbox()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void caricaInbox(true)
    }, POLLING_INBOX_MS)
    return () => window.clearInterval(id)
  }, [pronto, pageId, caricaInbox])

  // ── Realtime: webhook Meta → /topic/social ──
  const suEvento = useCallback(
    (evento: SocialEvento) => {
      // Gli eventi del Planner viaggiano sullo stesso topic: non riguardano inbox e statistiche
      if (evento.tipo === 'PLANNER') return
      if (evento.pageId && evento.pageId !== pageId) return
      setUltimoEvento(Date.now())
      setGenerazione((g) => g + 1)
      void caricaInbox(true)
      if (evento.tipo === 'COMMENTO' || evento.tipo === 'MESSAGGIO') {
        const cosa = evento.tipo === 'COMMENTO' ? 'Nuovo commento' : 'Nuovo messaggio'
        const dove = evento.piattaforma === 'INSTAGRAM' ? 'Instagram' : 'Facebook'
        toast.message(`${cosa} su ${dove}${evento.autoreNome ? ` da ${evento.autoreNome}` : ''}`, {
          description: evento.anteprima ?? undefined,
          action: { label: 'Apri', onClick: () => vaiA('inbox') },
        })
      } else if (evento.tipo === 'PUBBLICAZIONE') {
        void caricaPanoramica(true)
      }
    },
    // vaiA è stabile nel comportamento (scrive solo il parametro tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageId, caricaInbox, caricaPanoramica],
  )
  const realtime = useSocialRealtime(pronto && !!stato?.webhookConfigurato, suEvento)

  const vaiA = useCallback(
    (t: SocialTab) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (t === 'panoramica') p.delete('tab')
          else p.set('tab', t)
          return p
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  // L'inbox vuole tutto lo schermo: aprendola si porta la barra delle tab in cima (l'hero scorre via).
  const tabsRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (tab === 'inbox' && pronto) tabsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [tab, pronto])

  // Scorciatoie 1–5 per le tab (fuori dai campi di testo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
      const i = Number(e.key) - 1
      if (i >= 0 && i < TABS.length) vaiA(TABS[i].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [vaiA])

  const cambiaAccount = (id: string) => {
    setPageId(id)
    salvaAccount(id)
  }

  const aggiornaTutto = () => {
    void caricaPanoramica()
    void caricaInbox()
    setGenerazione((g) => g + 1)
  }

  // ── KPI dell'hero ──
  const fb = panoramica?.facebook
  const ig = panoramica?.instagram
  const metrica = (p: typeof fb, chiave: string) => p?.metriche.find((m) => m.chiave === chiave) ?? null
  const somma = (chiave: string) => {
    const a = metrica(fb, chiave)
    const b = metrica(ig, chiave)
    const valore = a?.valore == null && b?.valore == null ? null : (a?.valore ?? 0) + (b?.valore ?? 0)
    const precedente = a?.precedente == null && b?.precedente == null ? null : (a?.precedente ?? 0) + (b?.precedente ?? 0)
    return { valore, precedente }
  }
  const followerFb = fb?.follower ?? account?.followerFacebook ?? null
  const followerIg = ig?.follower ?? account?.followerInstagram ?? null
  const followerTot = followerFb == null && followerIg == null ? null : (followerFb ?? 0) + (followerIg ?? 0)
  const nuoviFollower = somma('nuoviFollower')
  const copertura = somma('copertura')
  const interazioni = somma('interazioni')
  const community = commenti?.community ?? panoramica?.community ?? null
  const dmNonLetti = conversazioni?.filter(conversazioneDaGestire).length ?? community?.conversazioniNonLette ?? 0
  const daGestire = (commenti?.commenti.filter(commentoDaGestire).length ?? community?.commentiDaRispondere ?? 0) + dmNonLetti

  /** Il periodo scelto non è ancora arrivato: si vedono i numeri del precedente, attenuati. */
  const periodoInArrivo = !!panoramica && panoramica.giorni !== giorni
  const aggiornatoIl = panoramica?.aggiornatoIl ?? commenti?.aggiornatoIl ?? null
  const eyebrow = !pronto
    ? 'Facebook · Instagram'
    : periodoInArrivo
      ? `Carico gli ultimi ${giorni} giorni…`
    : ultimoEvento && adesso - ultimoEvento < 60_000
      ? 'Live · nuova attività adesso'
      : realtime
        ? `Live · ${aggiornatoIl ? `dati di ${tempoFa(aggiornatoIl, adesso)}` : 'in ascolto'}`
        : `Aggiornamento automatico · ${aggiornatoIl ? tempoFa(aggiornatoIl, adesso) : '…'}`

  if (!stato && !erroreStato) {
    return (
      <div data-vl="" data-vl-page="social" className="so-pagina so-pagina--caricamento">
        <Loader2 className="size-6 animate-spin" aria-hidden />
        <span>Collegamento a Meta…</span>
      </div>
    )
  }

  return (
    <div data-vl="" data-vl-page="social" className="so-pagina mx-auto w-full min-w-0 max-w-[1680px]">
      <LuxHero
        ariaLabel="Meta"
        eyebrow={eyebrow}
        title={account ? account.nome : 'Meta'}
        subtitle={
          account ? (
            <span className="so-hero-handle">
              <a href={account.linkFacebook ?? undefined} target="_blank" rel="noreferrer">
                <IconaPiattaforma piattaforma="FACEBOOK" /> {account.nome}
              </a>
              {account.instagramUsername ? (
                <a href={account.linkInstagram ?? `https://instagram.com/${account.instagramUsername}`} target="_blank" rel="noreferrer">
                  <IconaPiattaforma piattaforma="INSTAGRAM" /> @{account.instagramUsername}
                </a>
              ) : (
                <span className="so-hero-handle-off">Instagram non collegato a questa pagina</span>
              )}
            </span>
          ) : (
            'Pagine Facebook e profili Instagram del dottore, in un posto solo.'
          )
        }
        actions={
          pronto ? (
            <>
              {stato.account.length > 1 ? (
                <div className="so-account-switch" role="radiogroup" aria-label="Pagina">
                  {stato.account.map((a) => (
                    <button
                      key={a.pageId}
                      type="button"
                      role="radio"
                      aria-checked={a.pageId === pageId}
                      data-active={a.pageId === pageId ? '' : undefined}
                      onClick={() => cambiaAccount(a.pageId)}
                      title={a.nome}
                    >
                      {a.immagine ? <img src={a.immagine} alt="" referrerPolicy="no-referrer" /> : null}
                      <span>{a.nome}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="vl-md-seg so-seg" role="radiogroup" aria-label="Periodo">
                {PERIODI.map((g) => (
                  <button
                    key={g}
                    type="button"
                    role="radio"
                    aria-checked={giorni === g}
                    data-active={giorni === g ? '' : undefined}
                    onClick={() => setGiorni(g)}
                  >
                    {g} gg
                  </button>
                ))}
              </div>
              <button type="button" className="vl-ghost-btn so-hero-refresh" onClick={aggiornaTutto} aria-label="Aggiorna" title="Aggiorna ora">
                <RefreshCw className={`size-4 ${panoramicaCarica || inboxCarica ? 'animate-spin' : ''}`} />
              </button>
              <button type="button" className="vl-cta" onClick={() => vaiA('pubblica')}>
                <span className="vl-cta-icon">
                  <Plus className="size-4" />
                </span>
                <span className="vl-cta-label">Nuovo post</span>
              </button>
            </>
          ) : undefined
        }
      >
        {pronto ? (
          <div className="vl-kpis" data-so-aggiornando={periodoInArrivo ? '' : undefined} aria-busy={periodoInArrivo}>
            <LuxKpi
              icon={<Users className="size-4" />}
              label="Follower"
              value={formatCompatto(followerTot)}
              foot={
                <span className="so-kpi-foot">
                  <span>
                    <IconaPiattaforma piattaforma="FACEBOOK" className="size-3" /> {formatCompatto(followerFb)}
                  </span>
                  <span>
                    <IconaPiattaforma piattaforma="INSTAGRAM" className="size-3" /> {formatCompatto(followerIg)}
                  </span>
                  {nuoviFollower.valore != null ? <span className="so-kpi-new">+{formatNumero(nuoviFollower.valore)} nuovi</span> : null}
                </span>
              }
            />
            <LuxKpi
              icon={<Eye className="size-4" />}
              label={`Copertura ${giorni} gg`}
              value={formatCompatto(copertura.valore)}
              foot={<Delta valore={variazione(copertura)} className="so-delta--hero" />}
              title="Account raggiunti su Facebook + Instagram (la somma può contare due volte chi segue entrambi)"
            />
            <LuxKpi
              icon={<Heart className="size-4" />}
              label={`Interazioni ${giorni} gg`}
              value={formatCompatto(interazioni.valore)}
              foot={<Delta valore={variazione(interazioni)} className="so-delta--hero" />}
            />
            <LuxKpi
              icon={<Inbox className="size-4" />}
              label="Da gestire"
              value={formatNumero(daGestire)}
              highlight={daGestire > 0}
              foot={
                <span className="so-kpi-foot">
                  <span>{dmNonLetti} DM</span>
                  <span>Risposta {formatPercentuale(community?.tassoRisposta ?? null, 0)}</span>
                </span>
              }
            />
          </div>
        ) : null}
      </LuxHero>

      {!pronto ? (
        <SocialSetup stato={stato} errore={erroreStato} onRiprova={caricaStato} />
      ) : (
        <>
          <nav className="so-tabs" aria-label="Sezioni" ref={tabsRef}>
            {TABS.map((t, i) => {
              const Icona = t.icon
              const badge = t.id === 'inbox' ? daGestire : 0
              return (
                <button
                  key={t.id}
                  type="button"
                  className="so-tab"
                  data-active={tab === t.id ? '' : undefined}
                  aria-current={tab === t.id ? 'page' : undefined}
                  onClick={() => vaiA(t.id)}
                  title={`${t.label} (${i + 1})`}
                >
                  <Icona className="size-4" aria-hidden />
                  <span>{t.label}</span>
                  {badge > 0 ? <span className="so-tab-badge">{badge > 99 ? '99+' : badge}</span> : null}
                </button>
              )
            })}
            <span className="so-tabs-live" data-on={realtime ? '' : undefined} title={realtime ? 'Webhook Meta collegato: commenti e DM arrivano in tempo reale' : 'Aggiornamento ogni 30 secondi'}>
              <span className="so-tabs-live-dot" />
              {realtime ? 'Tempo reale' : 'Ogni 30 s'}
            </span>
          </nav>

          <div className="so-tab-corpo" key={tab}>
            {tab === 'panoramica' ? (
              <SocialPanoramicaTab
                panoramica={panoramica}
                errore={panoramicaErrore}
                caricamento={panoramicaCarica}
                periodoInArrivo={periodoInArrivo ? giorni : null}
                account={account}
                community={community}
                onApriInbox={() => vaiA('inbox')}
              />
            ) : null}
            {tab === 'inbox' ? (
              <SocialInbox
                account={account}
                aiDisponibile={stato.aiDisponibile}
                commenti={commenti}
                conversazioni={conversazioni}
                errore={inboxErrore}
                caricamento={inboxCarica}
                generazione={generazione}
                onAggiorna={(silenziosa) => caricaInbox(silenziosa)}
                setCommenti={setCommenti}
                setConversazioni={setConversazioni}
              />
            ) : null}
            {tab === 'contenuti' ? <SocialContenuti account={account} generazione={generazione} /> : null}
            {tab === 'pubblica' ? (
              <SocialPubblica account={account} aiDisponibile={stato.aiDisponibile} generazione={generazione} onPubblicato={() => void caricaPanoramica(true)} />
            ) : null}
            {tab === 'pubblico' ? <SocialPubblicoTab account={account} /> : null}
          </div>
        </>
      )}
    </div>
  )
}
