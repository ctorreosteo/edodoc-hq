import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, BarChart3, CalendarDays, CalendarRange, Grid3x3, Hand, ImageIcon, KanbanSquare, Layers, Lightbulb, Loader2, Plus, Search, Send, Settings2, ShieldCheck, Sparkles } from 'lucide-react'
import { LuxHero, LuxKpi } from '@/components/lux'
import { toast } from '@/lib/toast'
import { relativo } from '@/lib/planner-tempo'
import { useSocialRealtime } from '@/hooks/use-social-realtime'
import { messaggioErrorePlanner, plannerService, type PlannerAzione, type PlannerMedia, type PlannerPost, type PlannerStato } from '@/services/planner-service'
import { PlannerCalendario } from './planner-calendario'
import { PlannerComposer, type PresetComposer } from './planner-composer'
import { PlannerDettaglio } from './planner-dettaglio'
import { PlannerIdee } from './planner-idee'
import { PlannerLibreria } from './planner-libreria'
import { PlannerAnalisiTab } from './planner-analisi'
import { PlannerImpostazioni } from './planner-impostazioni'
import { PlannerGeneraAi } from './planner-genera-ai'
import { PlannerGriglia } from './planner-griglia'
import { PlannerPalette, type VocePalette } from './planner-palette'
import { PlannerPrimiPassi } from './planner-primi-passi'
import { ChiudiFinestra, FinestraPlanner } from './planner-ui'
import '@/style/lux-planner.css'

type Tab = 'calendario' | 'griglia' | 'idee' | 'libreria' | 'analisi' | 'impostazioni'

const TABS: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
  { id: 'calendario', label: 'Calendario', icon: CalendarDays },
  { id: 'griglia', label: 'Griglia Instagram', icon: Grid3x3 },
  { id: 'idee', label: 'Idee e flusso', icon: KanbanSquare },
  { id: 'libreria', label: 'Libreria', icon: ImageIcon },
  { id: 'analisi', label: 'Analisi', icon: BarChart3 },
  { id: 'impostazioni', label: 'Impostazioni', icon: Settings2 },
]

const CHIAVE_SPAZIO = 'planner.spazio'
const POLLING_MS = 60_000

function leggiSpazio(): number | null {
  try {
    const v = Number(localStorage.getItem(CHIAVE_SPAZIO))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

function salvaSpazio(id: number) {
  try {
    localStorage.setItem(CHIAVE_SPAZIO, String(id))
  } catch {
    /* storage non disponibile */
  }
}

const MESSAGGI_AZIONE: Record<PlannerAzione, string> = {
  IDEA: 'Idea salvata',
  BOZZA: 'Bozza salvata',
  APPROVAZIONE: 'Inviato per approvazione',
  PROGRAMMA: 'Post programmato',
  PUBBLICA_ORA: 'Pubblicazione avviata',
}

export function PlannerPagina() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : 'calendario'
  const postParam = Number(params.get('post')) || null

  const [brandId, setBrandId] = useState<number | null>(leggiSpazio)
  const [stato, setStato] = useState<PlannerStato | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [generazione, setGenerazione] = useState(0)
  const [composer, setComposer] = useState<{ post: PlannerPost | null; preset: PresetComposer | null } | null>(null)
  const [generaAi, setGeneraAi] = useState(false)
  const [palette, setPalette] = useState(false)
  const [scorciatoie, setScorciatoie] = useState(false)
  const richiesta = useRef(0)

  const caricaStato = useCallback(async () => {
    const n = ++richiesta.current
    try {
      const s = await plannerService.stato(brandId)
      if (n !== richiesta.current) return
      setStato(s)
      setErrore(null)
      if (s.brandId !== brandId) {
        setBrandId(s.brandId)
        salvaSpazio(s.brandId)
      }
    } catch (err) {
      if (n === richiesta.current) setErrore(messaggioErrorePlanner(err, 'Planner non disponibile'))
    }
  }, [brandId])

  useEffect(() => {
    void caricaStato()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void caricaStato()
        setGenerazione((g) => g + 1)
      }
    }, POLLING_MS)
    return () => window.clearInterval(id)
  }, [caricaStato])

  const aggiorna = useCallback(() => {
    setGenerazione((g) => g + 1)
    void caricaStato()
  }, [caricaStato])

  // Tempo reale: chi cambia il piano (o il job che pubblica) avvisa tutti quelli che hanno il Planner aperto
  const realtime = useSocialRealtime(true, (e) => {
    if (e.tipo !== 'PLANNER') return
    aggiorna()
  })

  const vaiA = useCallback(
    (t: Tab) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (t === 'calendario') p.delete('tab')
          else p.set('tab', t)
          return p
        },
        { replace: true },
      ),
    [setParams],
  )

  const apriPost = useCallback(
    (id: number | null) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (id) p.set('post', String(id))
          else p.delete('post')
          return p
        },
        { replace: !id },
      ),
    [setParams],
  )

  const nuovo = useCallback((preset: PresetComposer = {}) => setComposer({ post: null, preset }), [])

  const apri = (p: PlannerPost) => {
    if (['IDEA', 'BOZZA'].includes(p.stato) && !p.canali.length && !p.testo) setComposer({ post: p, preset: null })
    else apriPost(p.id)
  }

  const cambiaSpazio = (id: number) => {
    setBrandId(id)
    salvaSpazio(id)
    setStato((s) => (s ? { ...s, brandId: id } : s))
  }

  // Scorciatoie: ⌘K / Ctrl+K ricerca, N nuovo post, 1–6 schede (fuori dai campi)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !composer) {
        e.preventDefault()
        setPalette((p) => !p)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || composer || postParam || generaAi || palette) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
      if (e.key === '?') {
        e.preventDefault()
        setScorciatoie((v) => !v)
        return
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        nuovo()
        return
      }
      const i = Number(e.key) - 1
      if (i >= 0 && i < TABS.length) vaiA(TABS[i].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [vaiA, nuovo, composer, postParam, generaAi, palette])

  if (!stato) {
    return (
      <div data-vl="" data-vl-page="planner" className="pl-pagina pl-pagina--caricamento">
        {errore ? (
          <div className="pl-banner" data-tono="danger">
            <AlertTriangle className="size-4" /> {errore}
            <button type="button" className="pl-btn" data-variante="mini" onClick={() => void caricaStato()}>
              Riprova
            </button>
          </div>
        ) : (
          <>
            <Loader2 className="size-6 animate-spin" />
            <span>Apro il Planner…</span>
          </>
        )}
      </div>
    )
  }

  const vociPalette: VocePalette[] = [
    { id: 'nuovo', titolo: 'Nuovo post', sotto: 'N', icona: <Plus className="size-4" />, azione: () => nuovo(), parole: 'crea scrivi' },
    ...(stato.aiDisponibile
      ? [{ id: 'ai', titolo: 'Genera il piano con l’AI', icona: <Sparkles className="size-4" />, azione: () => setGeneraAi(true), parole: 'idee intelligenza' }]
      : []),
    ...TABS.map((t, i) => {
      const Icona = t.icon
      return { id: `tab-${t.id}`, titolo: `Vai a ${t.label}`, sotto: String(i + 1), icona: <Icona className="size-4" />, azione: () => vaiA(t.id) }
    }),
    ...stato.spazi
      .filter((s) => s.id !== stato.brandId)
      .map((s) => ({ id: `spazio-${s.id}`, titolo: `Passa a ${s.nome}`, sotto: 'Spazio', icona: <Layers className="size-4" />, azione: () => cambiaSpazio(s.id), parole: 'spazio account' })),
  ]

  const c = stato.contatori
  const spazio = stato.spazi.find((s) => s.id === stato.brandId)
  const automatici = new Set(stato.destinazioni.filter((d) => d.automatica).map((d) => d.canale)).size
  const daSistemare = c.daPubblicare + c.errori

  return (
    <div data-vl="" data-vl-page="planner" className="pl-pagina mx-auto w-full min-w-0 max-w-[1680px]" style={{ '--pl-spazio': spazio?.colore ?? '#19c463' } as CSSProperties}>
      <LuxHero
        ariaLabel="Planner social"
        eyebrow={
          <>
            Marketing · Planner social
            {realtime ? <span className="pl-live"> · in tempo reale</span> : null}
          </>
        }
        title={spazio?.nome ?? 'Planner'}
        subtitle={
          <span className="pl-hero-sotto">
            {c.programmatiSettimana
              ? `${c.programmatiSettimana} ${c.programmatiSettimana === 1 ? 'post programmato' : 'post programmati'} nei prossimi 7 giorni`
              : 'Nessun post programmato nei prossimi 7 giorni'}
            {stato.prossimoProgrammato ? ` · il prossimo esce ${relativo(stato.prossimoProgrammato)}` : ''}
            {` · ${automatici} ${automatici === 1 ? 'canale pubblica' : 'canali pubblicano'} da soli`}
          </span>
        }
        actions={
          <>
            {stato.spazi.length > 1 ? (
              <div className="pl-spazi-switch" role="radiogroup" aria-label="Spazio">
                {stato.spazi.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={s.id === stato.brandId}
                    data-active={s.id === stato.brandId ? '' : undefined}
                    onClick={() => cambiaSpazio(s.id)}
                    style={{ '--pl-spazio': s.colore } as CSSProperties}
                    title={s.descrizione ?? s.nome}
                  >
                    <span className="pl-spazio-dot" />
                    <span>{s.nome}</span>
                  </button>
                ))}
              </div>
            ) : stato.puoImpostare ? (
              <button type="button" className="vl-ghost-btn pl-hero-btn" onClick={() => vaiA('impostazioni')} title="Crea uno spazio per gestire altri account (es. Mental coaching)">
                <Plus className="size-4" /> Spazio
              </button>
            ) : null}
            {stato.aiDisponibile ? (
              <button type="button" className="vl-ghost-btn pl-hero-btn" onClick={() => setGeneraAi(true)}>
                <Sparkles className="size-4" /> Genera il piano
              </button>
            ) : null}
            <button type="button" className="vl-cta" onClick={() => nuovo()} title="Nuovo post (N)">
              <span className="vl-cta-icon">
                <Plus className="size-4" />
              </span>
              <span className="vl-cta-label">Nuovo post</span>
            </button>
          </>
        }
      >
        <div className="vl-kpis">
          <LuxKpi icon={<CalendarRange className="size-4" />} label="Programmati 7 gg" value={c.programmatiSettimana} foot="Escono da soli all'ora" />
          <LuxKpi
            icon={<ShieldCheck className="size-4" />}
            label="Da approvare"
            value={c.inApprovazione}
            highlight={stato.puoApprovare && c.inApprovazione > 0}
            foot={stato.approvazioneObbligatoria ? 'Approvazione obbligatoria' : 'Approvazione facoltativa'}
          />
          <LuxKpi icon={<Hand className="size-4" />} label="Da sistemare" value={daSistemare} highlight={daSistemare > 0} foot={`${c.daPubblicare} a mano · ${c.errori} in errore`} />
          <LuxKpi icon={<Lightbulb className="size-4" />} label="Idee e bozze" value={c.idee + c.bozze} foot={`${c.idee} idee · ${c.bozze} bozze`} />
          <LuxKpi icon={<Send className="size-4" />} label="Usciti 30 gg" value={c.pubblicatiMese} foot="Post pubblicati" />
        </div>
      </LuxHero>

      {stato.puoApprovare && c.inApprovazione > 0 ? (
        <button type="button" className="pl-banner pl-banner--azione" data-tono="warn" onClick={() => vaiA('idee')}>
          <ShieldCheck className="size-4" />
          <span>
            <b>{c.inApprovazione}</b> {c.inApprovazione === 1 ? 'post aspetta' : 'post aspettano'} la tua approvazione
          </span>
          <span className="pl-banner-cta">Apri →</span>
        </button>
      ) : null}
      {c.daPubblicare > 0 ? (
        <button type="button" className="pl-banner pl-banner--azione" data-tono="info" onClick={() => vaiA('idee')}>
          <Hand className="size-4" />
          <span>
            <b>{c.daPubblicare}</b> {c.daPubblicare === 1 ? 'canale è arrivato' : 'canali sono arrivati'} all'ora e si {c.daPubblicare === 1 ? 'pubblica' : 'pubblicano'} a mano: testo e media sono pronti
          </span>
          <span className="pl-banner-cta">Apri →</span>
        </button>
      ) : null}

      <nav className="pl-tabs" aria-label="Sezioni del Planner">
        {TABS.map((t, i) => {
          const Icona = t.icon
          return (
            <button
              key={t.id}
              type="button"
              className="pl-tab"
              data-active={tab === t.id ? '' : undefined}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => vaiA(t.id)}
              title={`${t.label} (${i + 1})`}
            >
              <Icona className="size-4" aria-hidden />
              <span>{t.label}</span>
              {t.id === 'idee' && daSistemare + (stato.puoApprovare ? c.inApprovazione : 0) > 0 ? (
                <span className="pl-tab-badge">{daSistemare + (stato.puoApprovare ? c.inApprovazione : 0)}</span>
              ) : null}
            </button>
          )
        })}
        <button type="button" className="pl-tabs-hint" onClick={() => setPalette(true)} title="Cerca post e azioni">
          <Search className="size-3.5" /> Cerca <kbd>⌘</kbd>
          <kbd>K</kbd>
        </button>
        <button type="button" className="pl-tabs-hint pl-tabs-aiuto" onClick={() => setScorciatoie(true)} title="Scorciatoie da tastiera (?)" aria-label="Scorciatoie da tastiera">
          <kbd>?</kbd>
        </button>
      </nav>

      {tab === 'calendario' ? (
        <PlannerPrimiPassi stato={stato} onImpostazioni={() => vaiA('impostazioni')} onGeneraAi={() => setGeneraAi(true)} onNuovo={() => nuovo()} />
      ) : null}

      <div className="pl-tab-corpo" key={`${tab}-${stato.brandId}`}>
        {tab === 'calendario' ? <PlannerCalendario stato={stato} generazione={generazione} onApri={apri} onNuovo={nuovo} onCambiato={aggiorna} /> : null}
        {tab === 'griglia' ? <PlannerGriglia stato={stato} generazione={generazione} onApri={apri} /> : null}
        {tab === 'idee' ? <PlannerIdee stato={stato} generazione={generazione} onApri={apri} onNuovo={() => nuovo()} onGeneraAi={() => setGeneraAi(true)} onCambiato={aggiorna} /> : null}
        {tab === 'libreria' ? <PlannerLibreria onNuovoPost={(m: PlannerMedia[]) => nuovo({ media: m })} /> : null}
        {tab === 'analisi' ? <PlannerAnalisiTab stato={stato} generazione={generazione} /> : null}
        {tab === 'impostazioni' ? <PlannerImpostazioni stato={stato} onCambiato={aggiorna} /> : null}
      </div>

      <PlannerComposer
        aperto={!!composer}
        onChiudi={() => setComposer(null)}
        stato={stato}
        post={composer?.post ?? null}
        preset={composer?.preset ?? null}
        onSalvato={(p, azione) => {
          setComposer(null)
          toast.success(MESSAGGI_AZIONE[azione], {
            description: p.stato === 'IN_APPROVAZIONE' ? 'I responsabili ricevono l’avviso.' : p.titolo ?? undefined,
            action: { label: 'Apri', onClick: () => apriPost(p.id) },
          })
          aggiorna()
        }}
      />

      <PlannerDettaglio
        postId={postParam}
        stato={stato}
        generazione={generazione}
        onChiudi={() => apriPost(null)}
        onModifica={(p) => {
          apriPost(null)
          setComposer({ post: p, preset: null })
        }}
        onCambiato={aggiorna}
      />

      <FinestraPlanner aperta={scorciatoie} onChiudi={() => setScorciatoie(false)} titolo="Scorciatoie da tastiera" variante="palette">
        <div className="pl-finestra-testa">
          <div className="pl-finestra-titolo">Scorciatoie da tastiera</div>
          <ChiudiFinestra onClick={() => setScorciatoie(false)} />
        </div>
        <div className="pl-scorciatoie">
          {[
            [['N'], 'Nuovo post'],
            [['⌘', 'K'], 'Cerca post e azioni'],
            [['1', '–', '6'], 'Cambia scheda'],
            [['⌘', '↵'], 'Programma (nel composer)'],
            [['⌘', 'S'], 'Salva bozza (nel composer)'],
            [['Esc'], 'Chiudi finestra'],
            [['Alt', '+ trascina'], 'Duplica un post nel calendario'],
            [['?'], 'Questo elenco'],
          ].map(([tasti, cosa]) => (
            <div key={cosa as string} className="pl-scorciatoia">
              <span>
                {(tasti as string[]).map((t) => (t === '–' || t.startsWith('+') ? <em key={t}>{t}</em> : <kbd key={t}>{t}</kbd>))}
              </span>
              <span>{cosa as string}</span>
            </div>
          ))}
        </div>
      </FinestraPlanner>

      <PlannerPalette aperta={palette} onChiudi={() => setPalette(false)} stato={stato} azioni={vociPalette} onApriPost={apri} />

      <PlannerGeneraAi
        aperta={generaAi}
        onChiudi={() => setGeneraAi(false)}
        stato={stato}
        onCreate={() => {
          setGeneraAi(false)
          aggiorna()
        }}
      />
    </div>
  )
}
