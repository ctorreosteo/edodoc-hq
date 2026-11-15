import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarCheck,
  Euro,
  Loader2,
  MailOpen,
  MousePointerClick,
  PauseCircle,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Users,
  Workflow,
  LayoutTemplate,
  ShieldAlert,
} from 'lucide-react'
import { LuxHero, LuxKpi } from '@/components/lux'
import { toast } from '@/lib/toast'
import {
  mailingService,
  messaggioErroreMailing,
  type MailingPanoramica,
  type MailingStato,
} from '@/services/mailing-service'
import { panoramicaCondivisa, usePollingMailing } from './mailing-contesto'
import { MailingPanoramicaTab } from './mailing-panoramica'
import { MailingCampagneTab } from './mailing-campagne'
import { MailingAutomazioniTab } from './mailing-automazioni'
import { MailingContattiTab } from './mailing-contatti'
import { MailingTemplateTab } from './mailing-template'
import { MailingImpostazioniTab } from './mailing-impostazioni'
import { Delta } from './mailing-ui'
import { formatCompatto, formatEuro, formatNumero, formatPercentuale, tempoFa, useAdesso, useNumeroAnimato, variazione } from './mailing-utils'
import '@/style/lux-mailing.css'

export type MailingTab = 'panoramica' | 'campagne' | 'automazioni' | 'contatti' | 'template' | 'impostazioni'

const TABS: { id: MailingTab; label: string; icon: typeof BarChart3 }[] = [
  { id: 'panoramica', label: 'Panoramica', icon: BarChart3 },
  { id: 'campagne', label: 'Campagne', icon: Send },
  { id: 'automazioni', label: 'Automazioni', icon: Workflow },
  { id: 'contatti', label: 'Contatti', icon: Users },
  { id: 'template', label: 'Template', icon: LayoutTemplate },
  { id: 'impostazioni', label: 'Impostazioni', icon: Settings },
]

const POLLING_HERO_MS = 60_000
const IN_INVIO = ['IN_INVIO', 'TEST_AB']

/** Numero del KPI che "conta" fino al valore nuovo. */
function Contatore({ valore, formato }: { valore: number | null | undefined; formato: (n: number | null) => string }) {
  const animato = useNumeroAnimato(valore ?? null)
  return <span className="ml-contatore">{formato(animato)}</span>
}

export function MailingPagina() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as MailingTab | null
  const tab: MailingTab = TABS.some((t) => t.id === tabParam) ? (tabParam as MailingTab) : 'panoramica'
  const campagnaParam = Number(searchParams.get('campagna'))
  const campagnaIdIniziale = Number.isFinite(campagnaParam) && campagnaParam > 0 ? campagnaParam : null

  const [stato, setStato] = useState<MailingStato | null>(null)
  const [erroreStato, setErroreStato] = useState<string | null>(null)
  const [panoramica, setPanoramica] = useState<MailingPanoramica | null>(null)
  const [caricataIl, setCaricataIl] = useState<number | null>(null)
  const [aggiornando, setAggiornando] = useState(false)
  const adesso = useAdesso()

  const caricaStato = useCallback(async () => {
    try {
      setErroreStato(null)
      setStato(await mailingService.stato())
    } catch (err) {
      setErroreStato(messaggioErroreMailing(err, 'Non riesco a leggere lo stato dell’Email Marketing'))
    }
  }, [])

  useEffect(() => {
    void caricaStato()
  }, [caricaStato])

  // ── KPI dell'hero: ultimi 30 giorni, condivisi con la Panoramica ──
  const richiesta = useRef(0)
  const caricaHero = useCallback(async (forza = false) => {
    const n = ++richiesta.current
    try {
      const p = await panoramicaCondivisa(30, forza)
      if (n === richiesta.current) {
        setPanoramica(p)
        setCaricataIl(Date.now())
      }
    } catch {
      /* l'hero resta con i numeri precedenti: la scheda Panoramica mostra l'errore */
    }
  }, [])

  useEffect(() => {
    if (!stato) return
    void caricaHero()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void caricaHero(true)
    }, POLLING_HERO_MS)
    return () => window.clearInterval(id)
  }, [stato, caricaHero])

  // ── Niente realtime in EdoDoc: con qualcosa in invio l'hero si ricarica ogni 10 s (scheda visibile) ──
  const inInvio = !!panoramica && (panoramica.inCodaTotale > 0 || panoramica.campagneRecenti.some((c) => IN_INVIO.includes(c.stato)))
  usePollingMailing(!!stato && inInvio, () => void caricaHero(true))

  const vaiA = useCallback(
    (t: MailingTab, extra?: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (t === 'panoramica') p.delete('tab')
          else p.set('tab', t)
          if (t !== 'campagne') p.delete('campagna')
          if (t !== 'contatti') p.delete('contatto')
          p.delete('nuova')
          Object.entries(extra ?? {}).forEach(([k, v]) => (v == null ? p.delete(k) : p.set(k, v)))
          return p
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  // Una campagna che era in invio e al giro dopo risulta inviata: avviso con il link al report.
  const inviiPrecedenti = useRef<Set<number>>(new Set())
  useEffect(() => {
    if (!panoramica) return
    for (const c of panoramica.campagneRecenti) {
      if (c.stato === 'INVIATA' && inviiPrecedenti.current.has(c.id)) {
        toast.success('Campagna inviata a tutti i destinatari', {
          description: c.nome,
          action: { label: 'Apri report', onClick: () => vaiA('campagne', { campagna: String(c.id) }) },
        })
      }
    }
    inviiPrecedenti.current = new Set(panoramica.campagneRecenti.filter((c) => IN_INVIO.includes(c.stato)).map((c) => c.id))
  }, [panoramica, vaiA])

  // Scorciatoie 1–6 per le schede (fuori dai campi di testo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.closest('[role="dialog"]'))) return
      const i = Number(e.key) - 1
      if (i >= 0 && i < TABS.length) vaiA(TABS[i].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [vaiA])

  const aggiornaTutto = async () => {
    setAggiornando(true)
    await Promise.allSettled([caricaStato(), caricaHero(true)])
    setAggiornando(false)
  }

  const m = panoramica?.metriche
  const mp = panoramica?.metrichePrecedente
  const eyebrow = !stato
    ? 'Email Marketing'
    : caricataIl
      ? `Ultimi 30 giorni · aggiornato ${tempoFa(new Date(caricataIl).toISOString(), adesso)}`
      : 'Email Marketing'

  if (!stato && !erroreStato) {
    return (
      <div data-vl="" data-vl-page="mailing" className="ml-pagina ml-pagina--caricamento">
        <Loader2 className="size-6 animate-spin" aria-hidden />
        <span>Preparo l’Email Marketing…</span>
      </div>
    )
  }

  return (
    <>
      <div data-vl="" data-vl-page="mailing" className="ml-pagina mx-auto w-full min-w-0 max-w-[1680px]">
        <LuxHero
          ariaLabel="Email Marketing"
          eyebrow={eyebrow}
          title="Email Marketing"
          subtitle="Newsletter e automazioni ai pazienti e ai lead di EdoDoc: contatti veri, risultati misurati in visite e percorsi."
          actions={
            stato ? (
              <>
                <button type="button" className="vl-ghost-btn ml-hero-refresh" onClick={() => void aggiornaTutto()} aria-label="Aggiorna" title="Aggiorna ora">
                  <RefreshCw className={`size-4 ${aggiornando ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" className="vl-cta" onClick={() => vaiA('campagne', { nuova: '1' })}>
                  <span className="vl-cta-icon">
                    <Plus className="size-4" />
                  </span>
                  <span className="vl-cta-label">Nuova campagna</span>
                </button>
              </>
            ) : undefined
          }
        >
          {stato ? (
            <div className="vl-kpis ml-kpis" aria-busy={!panoramica}>
              <LuxKpi
                icon={<Users className="size-4" />}
                label="Iscritti"
                value={<Contatore valore={panoramica?.contattiIscritti} formato={formatCompatto} />}
                foot={
                  panoramica ? (
                    <span className="ml-kpi-piede">
                      <span className="ml-kpi-nuovi">+{formatNumero(panoramica.nuoviIscritti)} in 30 gg</span>
                      <Delta valore={variazione(panoramica.nuoviIscritti, panoramica.nuoviIscrittiPrecedente)} className="ml-delta--hero" />
                    </span>
                  ) : (
                    <span className="ml-kpi-attesa" />
                  )
                }
              />
              <LuxKpi
                icon={<MailOpen className="size-4" />}
                label="Tasso di apertura"
                value={<Contatore valore={m?.tassoApertura} formato={(n) => formatPercentuale(n, 1)} />}
                foot={m ? <Delta valore={variazione(m.tassoApertura, mp?.tassoApertura)} className="ml-delta--hero" /> : <span className="ml-kpi-attesa" />}
                title="Aperture uniche sulle email consegnate negli ultimi 30 giorni, escluse quelle automatiche di antivirus e Apple Mail"
              />
              <LuxKpi
                icon={<MousePointerClick className="size-4" />}
                label="Click"
                value={<Contatore valore={m?.clickUnici} formato={formatCompatto} />}
                foot={
                  m ? (
                    <span className="ml-kpi-piede">
                      {m.tassoClick != null ? <span>{formatPercentuale(m.tassoClick)} dei destinatari</span> : null}
                      <Delta valore={variazione(m.clickUnici, mp?.clickUnici)} className="ml-delta--hero" />
                    </span>
                  ) : (
                    <span className="ml-kpi-attesa" />
                  )
                }
              />
              <LuxKpi
                icon={<CalendarCheck className="size-4" />}
                label="Visite generate"
                value={<Contatore valore={m?.visiteGenerate} formato={formatNumero} />}
                highlight={!!m && m.visiteGenerate > 0}
                foot={m ? <Delta valore={variazione(m.visiteGenerate, mp?.visiteGenerate)} className="ml-delta--hero" /> : <span className="ml-kpi-attesa" />}
                title="Prenotazioni arrivate entro la finestra di attribuzione dopo il click su una email"
              />
              <LuxKpi
                icon={<Euro className="size-4" />}
                label="Fatturato"
                value={<Contatore valore={m?.fatturatoGenerato} formato={formatEuro} />}
                foot={m ? <Delta valore={variazione(m.fatturatoGenerato, mp?.fatturatoGenerato)} className="ml-delta--hero" /> : <span className="ml-kpi-attesa" />}
              />
            </div>
          ) : null}
        </LuxHero>

        {!stato ? (
          <div className="ml-card">
            <div className="ml-avviso" data-tono="errore" role="alert">
              <AlertTriangle className="size-4" aria-hidden />
              <span>{erroreStato}</span>
            </div>
            <div className="mt-3 flex justify-end">
              <button type="button" className="ml-btn" onClick={() => void caricaStato()}>
                <RefreshCw className="size-4" aria-hidden /> Riprova
              </button>
            </div>
          </div>
        ) : (
          <>
            <Avvisi stato={stato} tab={tab} onVai={vaiA} />

            <nav className="ml-tab-bar" aria-label="Sezioni">
              {TABS.map((t, i) => {
                const Icona = t.icon
                const badge = t.id === 'campagne' ? (panoramica?.campagneRecenti.filter((c) => c.stato === 'IN_INVIO' || c.stato === 'TEST_AB').length ?? 0) : 0
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="ml-tab"
                    data-active={tab === t.id ? '' : undefined}
                    aria-current={tab === t.id ? 'page' : undefined}
                    onClick={() => vaiA(t.id)}
                    title={`${t.label} (${i + 1})`}
                  >
                    <Icona className="size-4" aria-hidden />
                    <span>{t.label}</span>
                    {badge > 0 ? (
                      <span className="ml-tab-conta" title="Campagne in invio">
                        {badge}
                      </span>
                    ) : null}
                  </button>
                )
              })}
              <span className="ml-tab-live" data-on={inInvio ? '' : undefined} title={inInvio ? 'Invio in corso: aggiornamento ogni 10 secondi' : 'Aggiornamento automatico ogni minuto'}>
                <span className="ml-tab-live-punto" />
                {inInvio ? 'Ogni 10 s' : 'Ogni minuto'}
              </span>
            </nav>

            <div className="ml-tab-corpo" key={tab}>
              {tab === 'panoramica' ? (
                <MailingPanoramicaTab stato={stato} onApriCampagna={(id) => vaiA('campagne', { campagna: String(id) })} onCambiaTab={(t) => vaiA(t as MailingTab)} />
              ) : null}
              {tab === 'campagne' ? <MailingCampagneTab stato={stato} campagnaIdIniziale={campagnaIdIniziale} /> : null}
              {tab === 'automazioni' ? <MailingAutomazioniTab stato={stato} /> : null}
              {tab === 'contatti' ? <MailingContattiTab stato={stato} /> : null}
              {tab === 'template' ? <MailingTemplateTab stato={stato} /> : null}
              {tab === 'impostazioni' ? (
                <MailingImpostazioniTab
                  stato={stato}
                  onStatoCambiato={() => {
                    void caricaStato()
                    void caricaHero(true)
                  }}
                />
              ) : null}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function Avvisi({ stato, tab, onVai }: { stato: MailingStato; tab: MailingTab; onVai: (t: MailingTab) => void }) {
  const voci: { chiave: string; tono: 'avviso' | 'info' | 'errore' | 'accento'; icona: ReactNode; testo: ReactNode; azione?: { label: string; onClick: () => void } }[] = []
  const versoImpostazioni = tab !== 'impostazioni'

  if (stato.mittentiAttivi === 0) {
    voci.push({
      chiave: 'mittenti',
      tono: 'accento',
      icona: <Sparkles className="size-4" aria-hidden />,
      testo: (
        <>
          <strong>Manca un mittente.</strong> Aggiungi la casella da cui partiranno le email (per esempio la casella del dottore) e verificala con un invio di prova.
        </>
      ),
      azione: versoImpostazioni ? { label: 'Aggiungi mittente', onClick: () => onVai('impostazioni') } : undefined,
    })
  }
  if (!stato.invioAbilitato) {
    voci.push({
      chiave: 'invio',
      tono: 'avviso',
      icona: <PauseCircle className="size-4" aria-hidden />,
      testo: (
        <>
          <strong>Gli invii sono in pausa.</strong> Puoi preparare campagne e automazioni: nessuna email parte finché non riattivi gli invii.
        </>
      ),
      azione: versoImpostazioni ? { label: 'Impostazioni', onClick: () => onVai('impostazioni') } : undefined,
    })
  }
  stato.avvisi.forEach((a, i) =>
    voci.push({ chiave: `avviso-${i}`, tono: 'errore', icona: <ShieldAlert className="size-4" aria-hidden />, testo: a }),
  )

  if (!voci.length) return null
  return (
    <div className="ml-avvisi" role="status">
      {voci.map((v) => (
        <div key={v.chiave} className="ml-avviso ml-avviso--banner" data-tono={v.tono === 'avviso' ? undefined : v.tono}>
          {v.icona}
          <span className="ml-avviso-testo">{v.testo}</span>
          {v.azione ? (
            <button type="button" className="ml-btn ml-btn--sm ml-avviso-azione" onClick={v.azione.onClick}>
              {v.azione.label} <ArrowRight className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
