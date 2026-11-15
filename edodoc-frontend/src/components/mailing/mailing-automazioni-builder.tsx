import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Map as IconaMappa,
  Maximize2,
  Minus,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  UserPlus,
  Wand2,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useIsMobile } from '@/hooks/use-mobile'
import { toast } from '@/lib/toast'
import {
  mailingService,
  messaggioErroreMailing,
  type MailingAutomazione,
  type MailingAutomazioneEmail,
  type MailingAutomazioneInput,
  type MailingDocumento,
  type MailingGrafo,
  type MailingReportAutomazione,
  type MailingStato,
  type MailingStatoAutomazione,
  type MailingTipoNodo,
} from '@/services/mailing-service'
import {
  ID_TRIGGER,
  arcoDa,
  autoLayout,
  descriviTrigger,
  descriviUscita,
  eliminaNodo,
  flussiArchi,
  inserisciDopo,
  nodiDelRamo,
  nuovoIdNodo,
  numeroDa,
  numerazione,
  riassuntoNodo,
  valida,
  validaTrigger,
  type ProblemaGrafo,
  type PuntoInserimento,
} from '@/lib/mailing-grafo'
import { documentoVuoto, renderEmail } from '@/lib/mailing-render'
import { ConfermaMailing } from './mailing-dialog'
import { descriviRegole } from './mailing-regole'
import { Interruttore } from './mailing-ui'
import { useAdesso } from './mailing-utils'
import { META_NODO } from './mailing-automazioni-meta'
import type { ReportCard } from './mailing-automazioni-nodi'
import { TelaAutomazione, type ProblemiNodo, type TelaApi } from './mailing-automazioni-tela'
import { ElencoPassi } from './mailing-automazioni-elenco'
import {
  PannelloNodo,
  PannelloRisultati,
  PannelloRisultatiNodo,
  PannelloTrigger,
  type ContestoBuilder,
  type ImpostazioniBozza,
  type VoceLive,
} from './mailing-automazioni-pannelli'
import { DialogIscrivi, EditorEmailAutomazione } from './mailing-automazioni-dialoghi'
import '@/style/lux-mailing.css'
import '@/style/lux-mailing-automazioni.css'

/*
  Builder a tutto schermo di un'automazione: testata (nome, stato, salvataggio automatico, annulla/ripeti,
  riordina, problemi, risultati, iscrivi, attiva/pausa), tela (o elenco su telefono) e pannello laterale.
  La bozza (nome, trigger, grafo, uscita, impostazioni) ha una storia per annulla/ripeti e si salva da sola
  dopo 1,2 s di quiete. Le email dei nodi si salvano a parte (PUT /automazioni/{id}/email/{emailId}).
*/

type Bozza = ImpostazioniBozza & { nome: string; grafo: MailingGrafo }

const STATO_ETICHETTA: Record<MailingStatoAutomazione, string> = {
  BOZZA: 'Bozza',
  ATTIVA: 'Attiva',
  IN_PAUSA: 'In pausa',
  ARCHIVIATA: 'Archiviata',
}
const STATO_TONO: Record<MailingStatoAutomazione, string> = { BOZZA: 'neutro', ATTIVA: 'ok', IN_PAUSA: 'avviso', ARCHIVIATA: 'neutro' }

const POLLING_REPORT_MS = 30_000
const CHIAVE_MINIMAPPA = 'mailing.automazioni.minimappa'

function sovrapposti(g: MailingGrafo): boolean {
  if (g.nodi.length < 2) return false
  const posizioni = new Set(g.nodi.map((n) => `${Math.round(n.x / 40)}:${Math.round(n.y / 40)}`))
  return posizioni.size < g.nodi.length
}

function bozzaDa(a: MailingAutomazione): Bozza {
  const grafo: MailingGrafo = { nodi: a.grafo?.nodi ?? [], archi: a.grafo?.archi ?? [] }
  return {
    nome: a.nome,
    descrizione: a.descrizione,
    trigger: a.trigger ?? { tipo: 'MANUALE', parametri: {} },
    grafo: sovrapposti(grafo) ? autoLayout(grafo) : grafo,
    uscita: a.uscita,
    rientroConsentito: a.rientroConsentito,
    soloOrariLavorativi: a.soloOrariLavorativi,
    mittenteId: a.mittenteId,
    categoriaId: a.categoriaId,
  }
}

function inputDa(b: Bozza): MailingAutomazioneInput {
  return {
    nome: b.nome.trim() || 'Automazione senza nome',
    descrizione: b.descrizione,
    mittenteId: b.mittenteId,
    categoriaId: b.categoriaId,
    trigger: b.trigger,
    grafo: b.grafo,
    uscita: b.uscita,
    rientroConsentito: b.rientroConsentito,
    soloOrariLavorativi: b.soloOrariLavorativi,
  }
}

// ───────────────────────── Storia (annulla / ripeti) ─────────────────────────

type Storia = { passato: Bozza[]; presente: Bozza; futuro: Bozza[]; unione: { chiave: string; t: number } | null }
type Azione =
  | { tipo: 'modifica'; f: (b: Bozza) => Bozza; unisci?: string; senzaStoria?: boolean }
  | { tipo: 'annulla' }
  | { tipo: 'ripeti' }

const LIMITE_STORIA = 120

function riduttore(s: Storia, a: Azione): Storia {
  switch (a.tipo) {
    case 'modifica': {
      const nuovo = a.f(s.presente)
      if (nuovo === s.presente) return s
      if (a.senzaStoria) return { ...s, presente: nuovo }
      const adesso = Date.now()
      if (a.unisci && s.unione && s.unione.chiave === a.unisci && adesso - s.unione.t < 1500) {
        return { ...s, presente: nuovo, futuro: [], unione: { chiave: a.unisci, t: adesso } }
      }
      return {
        passato: [...s.passato.slice(-LIMITE_STORIA), s.presente],
        presente: nuovo,
        futuro: [],
        unione: a.unisci ? { chiave: a.unisci, t: adesso } : null,
      }
    }
    case 'annulla':
      if (!s.passato.length) return s
      return { passato: s.passato.slice(0, -1), presente: s.passato[s.passato.length - 1], futuro: [s.presente, ...s.futuro], unione: null }
    case 'ripeti':
      if (!s.futuro.length) return s
      return { passato: [...s.passato, s.presente], presente: s.futuro[0], futuro: s.futuro.slice(1), unione: null }
    default:
      return s
  }
}

// ───────────────────────── Caricamento ─────────────────────────

export function BuilderAutomazione({ automazioneId, stato, onChiudi }: { automazioneId: number; stato: MailingStato; onChiudi: () => void }) {
  const [automazione, setAutomazione] = useState<MailingAutomazione | null>(null)
  const [contesto, setContesto] = useState<Omit<ContestoBuilder, 'creaTag'> | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setAutomazione(null)
    setErrore(null)
    mailingService
      .automazione(automazioneId)
      .then((a) => vivo && setAutomazione(a))
      .catch((err) => vivo && setErrore(messaggioErroreMailing(err, 'Automazione non trovata')))
    Promise.allSettled([mailingService.tag(), mailingService.segmenti(), mailingService.catalogoSegmenti(), mailingService.mittenti(), mailingService.categorie()]).then(
      ([t, s, c, m, k]) => {
        if (!vivo) return
        const v = <T,>(r: PromiseSettledResult<T[]>) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : [])
        setContesto({ tag: v(t), segmenti: v(s), catalogo: v(c), mittenti: v(m), categorie: v(k) })
      },
    )
    return () => {
      vivo = false
    }
  }, [automazioneId])

  // Niente scroll della pagina sotto il builder.
  useEffect(() => {
    const prima = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prima
    }
  }, [])

  const pronto = automazione && contesto
  return createPortal(
    <div className="ml-au-builder" data-vl="" data-vl-page="mailing" role="dialog" aria-modal="true" aria-label={automazione ? `Automazione ${automazione.nome}` : 'Automazione'}>
      {pronto ? (
        <BuilderCaricato key={automazione.id} automazione={automazione} contestoBase={contesto} stato={stato} onChiudi={onChiudi} />
      ) : (
        <div className="ml-au-attesa">
          {errore ? (
            <>
              <AlertTriangle className="size-6" aria-hidden />
              <div>{errore}</div>
              <button type="button" className="ml-btn" onClick={onChiudi}>
                <ArrowLeft className="size-4" aria-hidden /> Torna alle automazioni
              </button>
            </>
          ) : (
            <>
              <Loader2 className="size-6 animate-spin" aria-hidden />
              <div>Apro l’automazione…</div>
            </>
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}

// ───────────────────────── Builder ─────────────────────────

type StatoSalvataggio = 'salvato' | 'modificato' | 'salvo' | 'errore' | 'bloccato'

function BuilderCaricato({
  automazione,
  contestoBase,
  stato,
  onChiudi,
}: {
  automazione: MailingAutomazione
  contestoBase: Omit<ContestoBuilder, 'creaTag'>
  stato: MailingStato
  onChiudi: () => void
}) {
  const id = automazione.id
  const mobile = useIsMobile()
  const adesso = useAdesso(20_000)
  const tela = useRef<TelaApi>(null)

  const [storia, invia] = useReducer(riduttore, automazione, (a) => ({ passato: [], presente: bozzaDa(a), futuro: [], unione: null }))
  const bozza = storia.presente
  const grafo = bozza.grafo
  const [statoAut, setStatoAut] = useState<MailingStatoAutomazione>(automazione.stato)
  const [email, setEmail] = useState<MailingAutomazioneEmail[]>(automazione.email ?? [])
  const [tag, setTag] = useState(contestoBase.tag)
  const [selezionato, setSelezionato] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [minimappa, setMinimappa] = useState(() => {
    try {
      return localStorage.getItem(CHIAVE_MINIMAPPA) !== '0'
    } catch {
      return true
    }
  })

  const modifica = useCallback((f: (b: Bozza) => Bozza, unisci?: string) => invia({ tipo: 'modifica', f, unisci }), [])
  const modificaGrafo = useCallback((f: (g: MailingGrafo) => MailingGrafo, unisci?: string) => modifica((b) => {
    const g = f(b.grafo)
    return g === b.grafo ? b : { ...b, grafo: g }
  }, unisci), [modifica])

  const grafoRef = useRef(grafo)
  const emailRef = useRef(email)
  useLayoutEffect(() => {
    grafoRef.current = grafo
    emailRef.current = email
  })

  // ── Contesto per pannelli e descrizioni ──
  const contesto = useMemo<ContestoBuilder>(
    () => ({
      ...contestoBase,
      tag,
      creaTag: async (nome: string) => {
        try {
          const t = await mailingService.creaTag(nome)
          setTag((l) => [...l, t].sort((a, b) => a.nome.localeCompare(b.nome, 'it')))
          toast.success(`Tag «${t.nome}» creato`)
          return t
        } catch (err) {
          toast.error(messaggioErroreMailing(err, 'Tag non creato'))
          return null
        }
      },
    }),
    [contestoBase, tag],
  )

  // ── Derivati: numeri, problemi, riassunti ──
  const numeri = useMemo(() => numerazione(grafo), [grafo])
  const problemi = useMemo<ProblemaGrafo[]>(() => [...validaTrigger(bozza.trigger), ...valida(grafo, email)], [grafo, email, bozza.trigger])
  const errori = problemi.filter((p) => p.gravita === 'ERRORE').length
  const problemiPerNodo = useMemo(() => {
    const m = new Map<string, ProblemiNodo>()
    for (const p of problemi) {
      if (!p.nodoId) continue
      const v = m.get(p.nodoId) ?? { errori: 0, avvisi: 0, primo: null }
      if (p.gravita === 'ERRORE') v.errori++
      else v.avvisi++
      v.primo = v.primo ?? p.messaggio
      m.set(p.nodoId, v)
    }
    return m
  }, [problemi])
  const riassunti = useMemo(() => {
    const ctx = { ...contesto, email, numeri, descriviRegole: (r: Parameters<typeof descriviRegole>[0]) => descriviRegole(r, contesto.catalogo) }
    return new Map(grafo.nodi.map((n) => [n.id, riassuntoNodo(n, ctx)]))
  }, [grafo, email, numeri, contesto])
  const oggettiEmail = useMemo(() => {
    const m = new Map<string, string>()
    for (const n of grafo.nodi) {
      if (n.tipo !== 'EMAIL') continue
      const e = email.find((x) => x.id === numeroDa(n.config?.emailId))
      m.set(n.id, e?.oggetto ?? '')
    }
    return m
  }, [grafo, email])
  const infoTrigger = useMemo(
    () => ({
      tipo: bozza.trigger?.tipo ?? null,
      descrizione: descriviTrigger(bozza.trigger, contesto),
      uscita: descriviUscita(bozza.uscita, contesto),
      errori: problemiPerNodo.get(ID_TRIGGER)?.errori ?? 0,
    }),
    [bozza.trigger, bozza.uscita, contesto, problemiPerNodo],
  )

  // ── Salvataggio automatico della bozza ──
  const [salvataggio, setSalvataggio] = useState<StatoSalvataggio>('salvato')
  // Ciò che il server ha già: l'eventuale riordino iniziale dei nodi sovrapposti verrà salvato.
  const ultimoSalvato = useRef(JSON.stringify(inputDa({ ...bozzaDa(automazione), grafo: { nodi: automazione.grafo?.nodi ?? [], archi: automazione.grafo?.archi ?? [] } })))
  const inVolo = useRef<Promise<void> | null>(null)
  const daRifare = useRef(false)
  const bozzaRef = useRef(bozza)
  useLayoutEffect(() => {
    bozzaRef.current = bozza
  })

  const salva = useCallback(async (): Promise<void> => {
    if (inVolo.current) {
      daRifare.current = true
      return inVolo.current
    }
    const input = inputDa(bozzaRef.current)
    const json = JSON.stringify(input)
    if (json === ultimoSalvato.current) {
      setSalvataggio('salvato')
      return
    }
    setSalvataggio('salvo')
    const lavoro = (async () => {
      try {
        const a = await mailingService.aggiornaAutomazione(id, input)
        ultimoSalvato.current = json
        setStatoAut(a.stato)
        setSalvataggio(JSON.stringify(inputDa(bozzaRef.current)) === json ? 'salvato' : 'modificato')
      } catch (err) {
        setSalvataggio('errore')
        toast.error(messaggioErroreMailing(err, 'Salvataggio non riuscito'), { id: `salva-automazione-${id}` })
      } finally {
        inVolo.current = null
      }
      if (daRifare.current) {
        daRifare.current = false
        await salva()
      }
    })()
    inVolo.current = lavoro
    return lavoro
  }, [id])

  const timerSalva = useRef<number | null>(null)
  useEffect(() => {
    const json = JSON.stringify(inputDa(bozza))
    if (json === ultimoSalvato.current) {
      if (!inVolo.current) setSalvataggio('salvato')
      return
    }
    if (statoAut === 'ATTIVA' && errori > 0) {
      setSalvataggio('bloccato')
      return
    }
    setSalvataggio((s) => (s === 'salvo' ? s : 'modificato'))
    timerSalva.current = window.setTimeout(() => void salva(), 1200)
    return () => {
      if (timerSalva.current) window.clearTimeout(timerSalva.current)
    }
  }, [bozza, statoAut, errori, salva])

  // ── Email dei nodi ──
  const timerEmail = useRef(new Map<number, number>())
  const [emailInVolo, setEmailInVolo] = useState(0)
  const [emailErrore, setEmailErrore] = useState(false)
  const creazioni = useRef(new Map<string, Promise<MailingAutomazioneEmail | null>>())

  const salvaEmail = useCallback(
    async (emailId: number) => {
      const e = emailRef.current.find((x) => x.id === emailId)
      if (!e) return
      setEmailInVolo((n) => n + 1)
      try {
        await mailingService.aggiornaEmailAutomazione(id, emailId, { nome: e.nome, oggetto: e.oggetto ?? '', preheader: e.preheader, design: e.design, html: e.html ?? '' })
        setEmailErrore(false)
      } catch (err) {
        setEmailErrore(true)
        toast.error(messaggioErroreMailing(err, 'Email non salvata'), { id: `salva-email-${emailId}` })
      } finally {
        setEmailInVolo((n) => n - 1)
      }
    },
    [id],
  )

  const programmaSalvaEmail = useCallback(
    (emailId: number) => {
      const t = timerEmail.current.get(emailId)
      if (t) window.clearTimeout(t)
      timerEmail.current.set(
        emailId,
        window.setTimeout(() => {
          timerEmail.current.delete(emailId)
          void salvaEmail(emailId)
        }, 900),
      )
    },
    [salvaEmail],
  )

  const svuotaEmail = useCallback(async () => {
    const attese = [...timerEmail.current.entries()]
    timerEmail.current.clear()
    await Promise.all(
      attese.map(([emailId, t]) => {
        window.clearTimeout(t)
        return salvaEmail(emailId)
      }),
    )
  }, [salvaEmail])

  /** Crea l'email del nodo se non ce l'ha ancora (subito all'inserimento di un nodo EMAIL). */
  const assicuraEmail = useCallback(
    (nodoId: string): Promise<MailingAutomazioneEmail | null> => {
      const n = grafoRef.current.nodi.find((x) => x.id === nodoId)
      const esistente = n ? numeroDa(n.config?.emailId) : null
      if (esistente != null) return Promise.resolve(emailRef.current.find((e) => e.id === esistente) ?? null)
      const giaInCorso = creazioni.current.get(nodoId)
      if (giaInCorso) return giaInCorso
      const doc = documentoVuoto()
      const p = mailingService
        .creaEmailAutomazione(id, { nome: null, oggetto: '', preheader: null, design: doc, html: renderEmail(doc) })
        .then((e) => {
          setEmail((l) => [...l.filter((x) => x.id !== e.id), e])
          invia({
            tipo: 'modifica',
            senzaStoria: true,
            f: (b) => ({ ...b, grafo: { ...b.grafo, nodi: b.grafo.nodi.map((x) => (x.id === nodoId ? { ...x, config: { ...x.config, emailId: e.id } } : x)) } }),
          })
          return e
        })
        .catch((err) => {
          toast.error(messaggioErroreMailing(err, 'Email non creata'))
          return null
        })
        .finally(() => {
          creazioni.current.delete(nodoId)
          setCreando((s) => {
            const n2 = new Set(s)
            n2.delete(nodoId)
            return n2
          })
        })
      creazioni.current.set(nodoId, p)
      setCreando((s) => new Set(s).add(nodoId))
      return p
    },
    [id],
  )
  const [creando, setCreando] = useState<Set<string>>(new Set())

  const modificaEmail = useCallback(
    (emailId: number, campi: Partial<Pick<MailingAutomazioneEmail, 'oggetto' | 'preheader' | 'design' | 'html'>>) => {
      setEmail((l) => l.map((e) => (e.id === emailId ? { ...e, ...campi } : e)))
      programmaSalvaEmail(emailId)
    },
    [programmaSalvaEmail],
  )

  // ── Modifiche al grafo ──
  const [chiediElimina, setChiediElimina] = useState<{ id: string } | null>(null)
  const [ramoDaTenere, setRamoDaTenere] = useState<'SI' | 'NO'>('SI')
  const [avvisoAttiva, setAvvisoAttiva] = useState(true)

  const inserisci = useCallback(
    (punto: PuntoInserimento, tipo: MailingTipoNodo) => {
      const nuovoId = nuovoIdNodo()
      modificaGrafo((g) => inserisciDopo(g, punto, tipo, { id: nuovoId }).grafo)
      setSelezionato(nuovoId)
      if (tipo === 'EMAIL') window.setTimeout(() => void assicuraEmail(nuovoId), 0)
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => tela.current?.centraSu(nuovoId)))
    },
    [modificaGrafo, assicuraEmail],
  )

  const eseguiElimina = useCallback(
    (nodoId: string, ramo: 'SI' | 'NO' = 'SI') => {
      const n = grafoRef.current.nodi.find((x) => x.id === nodoId)
      if (!n) return
      modificaGrafo((g) => eliminaNodo(g, nodoId, ramo))
      setSelezionato((s) => (s === nodoId ? null : s))
      toast(`${META_NODO[n.tipo].etichetta} eliminato`, { action: { label: 'Annulla', onClick: () => invia({ tipo: 'annulla' }) } })
    },
    [modificaGrafo],
  )

  const reportRef = useRef<MailingReportAutomazione | null>(null)
  const elimina = useCallback(
    (nodoId: string) => {
      if (nodoId === ID_TRIGGER) return
      const g = grafoRef.current
      const n = g.nodi.find((x) => x.id === nodoId)
      if (!n) return
      const conRami = n.tipo === 'CONDIZIONE' && !!arcoDa(g, nodoId, 'SI') && !!arcoDa(g, nodoId, 'NO')
      const qui = reportRef.current?.nodi.find((r) => r.nodoId === nodoId)?.inAttesa ?? 0
      if (conRami || statoAut === 'ATTIVA' || qui > 0) {
        setRamoDaTenere('SI')
        setChiediElimina({ id: nodoId })
        return
      }
      eseguiElimina(nodoId, arcoDa(g, nodoId, 'SI') ? 'SI' : 'NO')
    },
    [statoAut, eseguiElimina],
  )

  const sposta = useCallback(
    (nodoId: string, x: number, y: number, unisci?: string) => {
      modificaGrafo((g) => ({ ...g, nodi: g.nodi.map((n) => (n.id === nodoId ? { ...n, x, y } : n)) }), unisci)
    },
    [modificaGrafo],
  )

  const riordina = () => {
    modificaGrafo((g) => autoLayout(g))
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => tela.current?.adatta(true)))
  }

  // ── Risultati ──
  const [mostraRisultati, setMostraRisultati] = useState(false)
  const [report, setReport] = useState<MailingReportAutomazione | null>(null)
  const [caricoReport, setCaricoReport] = useState(false)
  const [aggiornatoIl, setAggiornatoIl] = useState<number | null>(null)
  const [guizzi, setGuizzi] = useState<Map<string, number>>(new Map())
  const [live, setLive] = useState<VoceLive[]>([])
  const ultimoCarico = useRef(0)

  const caricaReport = useCallback(async () => {
    ultimoCarico.current = Date.now()
    setCaricoReport(true)
    try {
      const r = await mailingService.reportAutomazione(id)
      const prima = reportRef.current
      if (prima) {
        const g = new Map<string, number>()
        for (const n of r.nodi) {
          const p = prima.nodi.find((x) => x.nodoId === n.nodoId)
          if (p && (n.entrati > p.entrati || n.inAttesa !== p.inAttesa)) g.set(n.nodoId, 1)
        }
        if (g.size) setGuizzi((m) => new Map([...m, ...[...g.keys()].map((k) => [k, (m.get(k) ?? 0) + 1] as [string, number])]))
      }
      reportRef.current = r
      setReport(r)
      setAggiornatoIl(Date.now())
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Risultati non disponibili'), { id: `report-${id}` })
    } finally {
      setCaricoReport(false)
    }
  }, [id])

  useEffect(() => {
    if (!mostraRisultati) return
    void caricaReport()
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void caricaReport()
    }, POLLING_REPORT_MS)
    return () => window.clearInterval(t)
  }, [mostraRisultati, caricaReport])

  // Niente realtime in EdoDoc: le ultime attività dell'automazione si leggono dal feed a ogni giro del report
  useEffect(() => {
    if (!mostraRisultati || aggiornatoIl == null) return
    let vivo = true
    mailingService
      .attivita(60)
      .then((a) => {
        if (!vivo) return
        setLive(a.filter((x) => x.automazioneId === id).slice(0, 8).map((x) => ({ id: x.id, testo: x.messaggio, quando: x.avvenutoIl, tipo: x.tipo })))
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [mostraRisultati, aggiornatoIl, id])

  const reportPerNodo = useMemo(() => {
    if (!mostraRisultati || !report) return mostraRisultati ? new Map<string, ReportCard>() : null
    return new Map<string, ReportCard>(
      report.nodi.map((r) => [
        r.nodoId,
        { entrati: r.entrati, inAttesa: r.inAttesa, usciti: r.usciti, tassoApertura: r.metriche?.tassoApertura ?? null, tassoClick: r.metriche?.tassoClick ?? null },
      ]),
    )
  }, [mostraRisultati, report])
  const flussi = useMemo(() => (mostraRisultati && report ? flussiArchi(grafo, report.nodi) : null), [mostraRisultati, report, grafo])
  const entratiTotali = report ? report.attivi + report.completati + report.usciti + report.errori : null

  // ── Attiva / pausa ──
  const [chiediAttiva, setChiediAttiva] = useState(false)
  const [chiediPausa, setChiediPausa] = useState(false)
  const [iscrivi, setIscrivi] = useState(false)
  const [chiediUscita, setChiediUscita] = useState(false)

  const svuotaTutto = useCallback(async () => {
    if (timerSalva.current) window.clearTimeout(timerSalva.current)
    await Promise.all([salva(), svuotaEmail()])
  }, [salva, svuotaEmail])

  const attiva = async () => {
    await svuotaTutto()
    try {
      const a = await mailingService.attivaAutomazione(id)
      setStatoAut(a.stato)
      toast.success('Automazione attiva', { description: `${descriviTrigger(bozza.trigger, contesto)}: da adesso entra nel percorso.` })
      return true
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Attivazione non riuscita'))
      return false
    }
  }
  const pausa = async () => {
    try {
      const a = await mailingService.pausaAutomazione(id)
      setStatoAut(a.stato)
      toast.success('Automazione in pausa')
      return true
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Pausa non riuscita'))
      return false
    }
  }

  const esci = useCallback(async () => {
    if (salvataggio === 'bloccato') {
      setChiediUscita(true)
      return
    }
    await svuotaTutto()
    onChiudi()
  }, [salvataggio, svuotaTutto, onChiudi])

  // Avviso del browser se si chiude la scheda con modifiche non salvate.
  useEffect(() => {
    const avvisa = (e: BeforeUnloadEvent) => {
      if (salvataggio !== 'salvato' || timerEmail.current.size) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', avvisa)
    return () => window.removeEventListener('beforeunload', avvisa)
  }, [salvataggio])

  // ── Editor email a tutto schermo ──
  const [editorNodo, setEditorNodo] = useState<string | null>(null)
  const emailDelNodo = useCallback(
    (nodoId: string | null) => {
      if (!nodoId) return null
      const n = grafo.nodi.find((x) => x.id === nodoId)
      const eid = n ? numeroDa(n.config?.emailId) : null
      return eid != null ? email.find((e) => e.id === eid) ?? null : null
    },
    [grafo, email],
  )
  const apriEditor = async (nodoId: string) => {
    const e = emailDelNodo(nodoId) ?? (await assicuraEmail(nodoId))
    if (e) setEditorNodo(nodoId)
  }
  const emailEditor = emailDelNodo(editorNodo)

  // ── Tastiera: annulla / ripeti ──
  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if (editorNodo) return
      const t = e.target as HTMLElement | null
      if (t && (t.closest('input, textarea, select, [contenteditable="true"]') || t.isContentEditable)) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        invia({ tipo: e.shiftKey ? 'ripeti' : 'annulla' })
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        invia({ tipo: 'ripeti' })
      } else if (e.key === 'Escape' && !document.querySelector('[data-slot="dialog-content"],[data-slot="popover-content"]')) {
        setSelezionato(null)
      }
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [editorNodo])

  // Il nodo selezionato può sparire (annulla, elimina): si chiude il pannello.
  useEffect(() => {
    if (selezionato && selezionato !== ID_TRIGGER && !grafo.nodi.some((n) => n.id === selezionato)) setSelezionato(null)
  }, [grafo, selezionato])

  const vaiAlProblema = (p: ProblemaGrafo) => {
    if (!p.nodoId) return
    setSelezionato(p.nodoId)
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => tela.current?.centraSu(p.nodoId!)))
  }

  // ── Indicatore di salvataggio ──
  const emailPendenti = timerEmail.current.size + emailInVolo
  const statoIndicatore: StatoSalvataggio =
    salvataggio === 'bloccato' ? 'bloccato' : salvataggio === 'errore' || emailErrore ? 'errore' : salvataggio === 'salvo' || emailInVolo > 0 ? 'salvo' : salvataggio === 'modificato' || emailPendenti > 0 ? 'modificato' : 'salvato'
  const testoIndicatore: Record<StatoSalvataggio, string> = {
    salvato: 'Tutto salvato',
    modificato: 'Modifiche in corso…',
    salvo: 'Salvataggio…',
    errore: 'Non salvato · riprova',
    bloccato: 'Non salvato: correggi i problemi',
  }

  // ── Pannello ──
  const nodoSel = selezionato && selezionato !== ID_TRIGGER ? grafo.nodi.find((n) => n.id === selezionato) ?? null : null
  let pannello: ReactNode = null
  if (mostraRisultati && !selezionato) {
    pannello = <PannelloRisultati report={report} live={live} caricamento={caricoReport} onChiudi={() => setMostraRisultati(false)} adesso={adesso} />
  } else if (selezionato === ID_TRIGGER) {
    pannello = (
      <PannelloTrigger
        valori={bozza}
        problemi={problemi.filter((p) => p.nodoId === ID_TRIGGER)}
        contesto={contesto}
        onChange={(v, unisci) => modifica((b) => ({ ...b, ...v }), unisci)}
        onChiudi={() => setSelezionato(null)}
      />
    )
  } else if (nodoSel && mostraRisultati) {
    pannello = (
      <PannelloRisultatiNodo
        nodo={nodoSel}
        numero={numeri.get(nodoSel.id) ?? 0}
        r={report?.nodi.find((r) => r.nodoId === nodoSel.id) ?? null}
        titolo={riassunti.get(nodoSel.id)?.titolo ?? ''}
        onChiudi={() => setSelezionato(null)}
      />
    )
  } else if (nodoSel) {
    const e = emailDelNodo(nodoSel.id)
    pannello = (
      <PannelloNodo
        key={nodoSel.id}
        nodo={nodoSel}
        numero={numeri.get(nodoSel.id) ?? 0}
        grafo={grafo}
        numeri={numeri}
        email={e}
        emailInCreazione={creando.has(nodoSel.id)}
        problemi={problemi.filter((p) => p.nodoId === nodoSel.id)}
        contesto={contesto}
        oggettiEmail={oggettiEmail}
        contestoProva={{ mittenteId: bozza.mittenteId, categoriaId: bozza.categoriaId }}
        onConfig={(config, unisci) => modificaGrafo((g) => ({ ...g, nodi: g.nodi.map((n) => (n.id === nodoSel.id ? { ...n, config } : n)) }), unisci ? `${nodoSel.id}:${unisci}` : undefined)}
        onEmail={(campi) => {
          if (e) modificaEmail(e.id, campi)
          else void assicuraEmail(nodoSel.id).then((nuova) => nuova && modificaEmail(nuova.id, campi))
        }}
        onApriEditor={() => void apriEditor(nodoSel.id)}
        onElimina={() => elimina(nodoSel.id)}
        onChiudi={() => setSelezionato(null)}
        onAggiungiRamo={(ramo) => inserisci({ da: nodoSel.id, ramo }, 'EMAIL')}
      />
    )
  }

  const nodoDaEliminare = chiediElimina ? grafo.nodi.find((n) => n.id === chiediElimina.id) ?? null : null
  const persiPerRamo = nodoDaEliminare?.tipo === 'CONDIZIONE' ? nodiDelRamo(grafo, nodoDaEliminare.id, ramoDaTenere === 'SI' ? 'NO' : 'SI').length : 0
  const quiOra = nodoDaEliminare ? report?.nodi.find((r) => r.nodoId === nodoDaEliminare.id)?.inAttesa ?? 0 : 0
  const nEmail = grafo.nodi.filter((n) => n.tipo === 'EMAIL').length
  const ultimoAggiornamento = aggiornatoIl ? new Date(aggiornatoIl).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : null

  const azioneStato =
    statoAut === 'ATTIVA' ? (
      <button type="button" className={`ml-btn${mobile ? ' ml-btn--icona' : ''}`} onClick={() => setChiediPausa(true)} aria-label="Metti in pausa" title="Metti in pausa">
        <Pause className="size-4" aria-hidden /> {mobile ? null : 'Metti in pausa'}
      </button>
    ) : (
      <button
        type="button"
        className="ml-btn ml-btn--pieno ml-au-attiva"
        disabled={errori > 0}
        title={errori ? `Correggi ${errori === 1 ? 'il problema' : `i ${errori} problemi`} prima di attivare` : 'Attiva l’automazione'}
        onClick={() => setChiediAttiva(true)}
      >
        <Play className="size-4" aria-hidden /> {statoAut === 'IN_PAUSA' ? 'Riattiva' : 'Attiva'}
      </button>
    )

  return (
    <>
      <header className="ml-au-testa">
        <button type="button" className="ml-btn ml-btn--ghost ml-btn--icona" onClick={() => void esci()} aria-label="Torna alle automazioni" title="Torna alle automazioni">
          <ArrowLeft className="size-4" />
        </button>
        <div className="ml-au-testa-nome">
          <input
            className="ml-au-nome"
            value={bozza.nome}
            maxLength={120}
            aria-label="Nome dell’automazione"
            onChange={(e) => modifica((b) => ({ ...b, nome: e.target.value }), 'nome')}
            onBlur={(e) => !e.target.value.trim() && modifica((b) => ({ ...b, nome: 'Automazione senza nome' }))}
          />
          <div className="ml-au-testa-sotto">
            <span className={`ml-badge ml-badge--${STATO_TONO[statoAut]}`}>{STATO_ETICHETTA[statoAut]}</span>
            <span className="ml-au-salvataggio" data-stato={statoIndicatore} aria-live="polite">
              {statoIndicatore === 'salvo' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <span className="ml-au-salvataggio-punto" aria-hidden />}
              {testoIndicatore[statoIndicatore]}
            </span>
          </div>
        </div>

        <div className="ml-au-testa-azioni">
          {!mobile ? (
            <>
              <div className="ml-au-gruppo" role="group" aria-label="Annulla e ripeti">
                <button type="button" className="ml-btn ml-btn--ghost ml-btn--icona" disabled={!storia.passato.length || mostraRisultati} onClick={() => invia({ tipo: 'annulla' })} aria-label="Annulla" title="Annulla (⌘Z)">
                  <Undo2 className="size-4" />
                </button>
                <button type="button" className="ml-btn ml-btn--ghost ml-btn--icona" disabled={!storia.futuro.length || mostraRisultati} onClick={() => invia({ tipo: 'ripeti' })} aria-label="Ripeti" title="Ripeti (⇧⌘Z)">
                  <Redo2 className="size-4" />
                </button>
              </div>
              <button type="button" className="ml-btn ml-btn--ghost" onClick={riordina} disabled={mostraRisultati || grafo.nodi.length < 2} title="Rimette in ordine i passi dall’alto in basso">
                <Wand2 className="size-4" aria-hidden /> Riordina
              </button>
              <ElencoProblemi problemi={problemi} numeri={numeri} onVai={vaiAlProblema} />
              <label className="ml-au-risultati-interruttore">
                <span>{mostraRisultati ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />} Mostra risultati</span>
                <Interruttore attivo={mostraRisultati} onChange={(v) => { setMostraRisultati(v); setSelezionato(null) }} etichetta="Mostra risultati" tono="ok" />
              </label>
              <button type="button" className="ml-btn" onClick={() => setIscrivi(true)} disabled={statoAut !== 'ATTIVA'} title={statoAut === 'ATTIVA' ? 'Iscrivi contatti a mano' : 'Attiva l’automazione per iscrivere contatti'}>
                <UserPlus className="size-4" aria-hidden /> Iscrivi
              </button>
              {azioneStato}
            </>
          ) : (
            <>
              {azioneStato}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="ml-btn ml-btn--ghost ml-btn--icona" aria-label="Altre azioni">
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" data-vl="" data-vl-page="mailing" className="ml-popover">
                  <DropdownMenuItem disabled={!storia.passato.length} onSelect={() => invia({ tipo: 'annulla' })}><Undo2 className="size-4" /> Annulla</DropdownMenuItem>
                  <DropdownMenuItem disabled={!storia.futuro.length} onSelect={() => invia({ tipo: 'ripeti' })}><Redo2 className="size-4" /> Ripeti</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => { setMostraRisultati((v) => !v); setSelezionato(null) }}>
                    {mostraRisultati ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {mostraRisultati ? 'Nascondi risultati' : 'Mostra risultati'}
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={statoAut !== 'ATTIVA'} onSelect={() => setIscrivi(true)}><UserPlus className="size-4" /> Iscrivi contatti</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </header>

      {statoAut === 'ATTIVA' && avvisoAttiva && !mostraRisultati ? (
        <div className="ml-au-banner" role="status">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <span>
            <b>È attiva:</b> ogni modifica vale subito{mobile ? '.' : ' per chi è nel percorso. Chi si trova su un passo che elimini esce dall’automazione.'}
          </span>
          <button type="button" className="ml-btn ml-btn--ghost ml-btn--sm" onClick={() => setAvvisoAttiva(false)}>Ho capito</button>
        </div>
      ) : null}

      {mobile && problemi.some((p) => p.gravita === 'ERRORE') && !mostraRisultati ? (
        <div className="ml-au-banner" data-tono="errore" role="status">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <span>{errori === 1 ? '1 cosa da sistemare' : `${errori} cose da sistemare`} prima di attivare: tocca i passi segnati.</span>
        </div>
      ) : null}

      <div className="ml-au-corpo" data-pannello={pannello ? '' : undefined}>
        <main className="ml-au-area" aria-label="Percorso dell’automazione">
          {mobile ? (
            <ElencoPassi
              grafo={grafo}
              numeri={numeri}
              riassunti={riassunti}
              problemi={problemiPerNodo}
              trigger={infoTrigger}
              selezionato={selezionato}
              report={reportPerNodo}
              entratiTotali={entratiTotali}
              onSeleziona={setSelezionato}
              onInserisci={inserisci}
            />
          ) : (
            <>
              <TelaAutomazione
                grafo={grafo}
                numeri={numeri}
                riassunti={riassunti}
                problemi={problemiPerNodo}
                trigger={infoTrigger}
                selezionato={selezionato}
                report={reportPerNodo}
                flussi={flussi}
                entratiTotali={entratiTotali}
                guizzi={guizzi}
                minimappa={minimappa}
                controllo={tela}
                onSeleziona={setSelezionato}
                onSposta={sposta}
                onInserisci={inserisci}
                onElimina={elimina}
                onVista={setZoom}
              />
              <div className="ml-au-comandi" role="toolbar" aria-label="Vista">
                <button type="button" className="ml-au-comando" onClick={() => tela.current?.zoom(1 / 1.2)} aria-label="Riduci" title="Riduci (⌘ + rotellina)">
                  <Minus className="size-4" />
                </button>
                <span className="ml-au-zoom" aria-live="polite">{Math.round(zoom * 100)}%</span>
                <button type="button" className="ml-au-comando" onClick={() => tela.current?.zoom(1.2)} aria-label="Ingrandisci" title="Ingrandisci">
                  <Plus className="size-4" />
                </button>
                <span className="ml-au-comandi-sep" aria-hidden />
                <button type="button" className="ml-au-comando" onClick={() => tela.current?.adatta(true)} aria-label="Adatta alla finestra" title="Adatta alla finestra">
                  <Maximize2 className="size-4" />
                </button>
                <button
                  type="button"
                  className="ml-au-comando"
                  aria-pressed={minimappa}
                  onClick={() => {
                    setMinimappa((v) => {
                      try {
                        localStorage.setItem(CHIAVE_MINIMAPPA, v ? '0' : '1')
                      } catch {
                        /* storage non disponibile */
                      }
                      return !v
                    })
                  }}
                  aria-label="Minimappa"
                  title="Minimappa"
                >
                  <IconaMappa className="size-4" />
                </button>
              </div>
              {mostraRisultati ? (
                <div className="ml-au-legenda" role="status">
                  <span className="ml-au-pallino-vivo" aria-hidden />
                  <span>
                    Linee più spesse = più persone passate · si aggiorna ogni 30 s
                    {ultimoAggiornamento ? ` · ultimo alle ${ultimoAggiornamento}` : ''}
                  </span>
                  {caricoReport ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                </div>
              ) : !grafo.nodi.length ? (
                <div className="ml-au-legenda ml-au-legenda--suggerimento">Premi <span className="ml-au-piu-finto" aria-hidden><Plus className="size-3" /></span> sotto l’inizio per aggiungere il primo passo</div>
              ) : null}
            </>
          )}
        </main>
        {pannello ? <aside className="ml-au-pannello" aria-label="Proprietà">{pannello}</aside> : null}
      </div>

      {editorNodo && emailEditor ? (
        <EditorEmailAutomazione
          key={emailEditor.id}
          email={emailEditor}
          numero={numeri.get(editorNodo) ?? 0}
          aiDisponibile={stato.aiDisponibile}
          contestoProva={{ mittenteId: bozza.mittenteId, categoriaId: bozza.categoriaId }}
          salvataggio={emailErrore ? 'errore' : emailInVolo ? 'salvo' : timerEmail.current.size ? 'modificato' : 'salvato'}
          onCambia={(doc: MailingDocumento, html: string) => modificaEmail(emailEditor.id, { design: doc, html })}
          onOggetto={(oggetto) => modificaEmail(emailEditor.id, { oggetto })}
          onChiudi={() => {
            setEditorNodo(null)
          }}
        />
      ) : null}

      <DialogIscrivi open={iscrivi} onOpenChange={setIscrivi} automazioneId={id} nome={bozza.nome} />

      <ConfermaMailing
        open={chiediAttiva}
        onOpenChange={setChiediAttiva}
        titolo={statoAut === 'IN_PAUSA' ? 'Riattivare l’automazione?' : 'Attivare l’automazione?'}
        icona={<Play className="size-5" aria-hidden />}
        testo={
          <>
            <b>{descriviTrigger(bozza.trigger, contesto)}</b>, il contatto entra nel percorso: {nEmail === 1 ? '1 email' : `${nEmail} email`}
            {bozza.soloOrariLavorativi ? ', inviate tra le 8 e le 20' : ''}. {descriviUscita(bozza.uscita, contesto)}.
          </>
        }
        conferma={statoAut === 'IN_PAUSA' ? 'Riattiva' : 'Attiva'}
        onConferma={attiva}
      >
        {problemi.some((p) => p.gravita === 'AVVISO') ? (
          <div className="ml-avviso">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span>{problemi.filter((p) => p.gravita === 'AVVISO').map((p) => p.messaggio).join(' ')}</span>
          </div>
        ) : null}
      </ConfermaMailing>

      <ConfermaMailing
        open={chiediPausa}
        onOpenChange={setChiediPausa}
        titolo="Mettere in pausa?"
        icona={<Pause className="size-5" aria-hidden />}
        testo="Non entra più nessuno e chi è già nel percorso resta fermo dov’è finché non la riattivi."
        conferma="Metti in pausa"
        onConferma={pausa}
      />

      <ConfermaMailing
        open={!!chiediElimina}
        onOpenChange={(v) => !v && setChiediElimina(null)}
        titolo={nodoDaEliminare ? `Eliminare «${META_NODO[nodoDaEliminare.tipo].etichetta}» (passo ${numeri.get(nodoDaEliminare.id)})?` : 'Eliminare il passo?'}
        icona={<Trash2 className="size-5" aria-hidden />}
        testo={
          <>
            {quiOra > 0 ? <><b>{quiOra === 1 ? '1 persona è' : `${quiOra} persone sono`} su questo passo adesso</b> e uscirà dall’automazione. </> : null}
            {statoAut === 'ATTIVA' && !quiOra ? 'L’automazione è attiva: chi si trova su questo passo esce dal percorso. ' : null}
            Puoi sempre annullare finché non chiudi il builder.
          </>
        }
        conferma="Elimina"
        pericolo
        onConferma={() => {
          if (chiediElimina) eseguiElimina(chiediElimina.id, ramoDaTenere)
        }}
      >
        {nodoDaEliminare?.tipo === 'CONDIZIONE' && arcoDa(grafo, nodoDaEliminare.id, 'SI') && arcoDa(grafo, nodoDaEliminare.id, 'NO') ? (
          <div className="ml-au-scelta-ramo" role="radiogroup" aria-label="Quale ramo tenere">
            {(['SI', 'NO'] as const).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={ramoDaTenere === r} onClick={() => setRamoDaTenere(r)}>
                <span className="ml-au-ramo" data-ramo={r}>{r === 'SI' ? 'Sì' : 'No'}</span>
                Tieni il ramo {r === 'SI' ? 'Sì' : 'No'}
              </button>
            ))}
            <div className="ml-campo-aiuto">
              {persiPerRamo ? `Il ramo ${ramoDaTenere === 'SI' ? 'No' : 'Sì'} sparisce con ${persiPerRamo === 1 ? '1 passo' : `${persiPerRamo} passi`}.` : 'L’altro ramo è vuoto.'}
            </div>
          </div>
        ) : null}
      </ConfermaMailing>

      <ConfermaMailing
        open={chiediUscita}
        onOpenChange={setChiediUscita}
        titolo="Uscire senza salvare?"
        icona={<AlertTriangle className="size-5" aria-hidden />}
        testo="L’automazione è attiva e il percorso ha dei problemi: le ultime modifiche non sono state salvate per non rompere il percorso di chi è dentro. Se esci, si perdono."
        conferma="Esci senza salvare"
        pericolo
        onConferma={async () => {
          await svuotaEmail()
          onChiudi()
        }}
      />
    </>
  )
}

function ElencoProblemi({ problemi, numeri, onVai }: { problemi: ProblemaGrafo[]; numeri: Map<string, number>; onVai: (p: ProblemaGrafo) => void }) {
  const [aperto, setAperto] = useState(false)
  const errori = problemi.filter((p) => p.gravita === 'ERRORE').length
  const avvisi = problemi.length - errori
  if (!problemi.length) {
    return (
      <span className="ml-au-pronto" title="Nessun problema: si può attivare">
        <CheckCircle2 className="size-4" aria-hidden /> Pronta
      </span>
    )
  }
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <button type="button" className="ml-btn ml-au-problemi-btn" data-gravita={errori ? 'errore' : 'avviso'} aria-label={`${problemi.length} problemi`}>
          <AlertTriangle className="size-4" aria-hidden />
          {errori ? `${errori} da sistemare` : `${avvisi} ${avvisi === 1 ? 'avviso' : 'avvisi'}`}
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent data-vl="" data-vl-page="mailing" className="ml-popover ml-au-problemi-pop" align="end">
        <ul>
          {problemi.map((p, i) => (
            <li key={`${p.nodoId}-${p.codice}-${i}`}>
              <button
                type="button"
                disabled={!p.nodoId}
                data-gravita={p.gravita === 'ERRORE' ? 'errore' : 'avviso'}
                onClick={() => {
                  setAperto(false)
                  onVai(p)
                }}
              >
                <span className="ml-au-problemi-dove">{p.nodoId === ID_TRIGGER ? 'Inizio' : p.nodoId ? `Passo ${numeri.get(p.nodoId) ?? '?'}` : 'Percorso'}</span>
                <span>{p.messaggio}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

