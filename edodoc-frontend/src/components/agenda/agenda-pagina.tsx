import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Keyboard, Loader2, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, Search, Stethoscope, Video, X,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useAzioni } from '@/contexts/azioni-context'
import { toast } from '@/lib/toast'
import {
  agendaNonConfigurata, agendaService, isoConOffset, isoData, messaggioErroreAgenda,
  type AgendaContatto, type AgendaEvento, type AgendaEventoRequest, type AgendaRisposta, type AgendaStato,
} from '@/services/agenda-service'
import { AgendaTempo, type Bozza } from './agenda-tempo'
import { AgendaAnno, AgendaElenco, AgendaMese, AgendaMeseMobile } from './agenda-viste'
import { BarraMobile } from './agenda-mobile'
import { useSwipeOrizzontale } from './agenda-swipe'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSchermoIntero } from '@/hooks/use-schermo-intero'
import { DettaglioEvento } from './agenda-dettaglio'
import { useConferma, type EsitoConferma } from './agenda-conferma'
import { CreazioneRapida, EditorEvento } from './agenda-editor'
import { moduloDaBozza, moduloDaEvento, richiesta, type Modulo } from './agenda-modulo'
import { ListaCalendari, MiniMese } from './agenda-lato'
import { AgendaScorciatoie, AgendaSetup } from './agenda-setup'
import {
  aggiungiGiorni, daGoogle, durata, durataMinuti, elencoNomi, etichettaGiorno, eventiDelGiorno, finestra, inizioGiorno, ora, perVista, quando, scrivibile, sposta,
  stessoGiorno, titoloFinestra, titoloMobile, traQuanto, VISTE, type EventoVista, type Vista,
} from './agenda-utils'
import '@/style/lux-agenda.css'

const POLLING_MS = 20_000
const STATO_OGNI_MS = 10 * 60_000
const ORE_LAVORO: [number, number] = [8, 20]

interface Annullabile {
  etichetta: string
  annulla: () => Promise<void>
}

function staScrivendo(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || Boolean(t.closest('[role="dialog"]'))
}

function saluto(d = new Date()): string {
  const h = d.getHours()
  if (h < 5) return 'Buonanotte'
  if (h < 13) return 'Buongiorno'
  if (h < 18) return 'Buon pomeriggio'
  return 'Buonasera'
}

const leggi = <T,>(chiave: string, ripiego: T): T => {
  try {
    const v = localStorage.getItem(chiave)
    return v ? (JSON.parse(v) as T) : ripiego
  } catch {
    return ripiego
  }
}
const scrivi = (chiave: string, v: unknown) => {
  try {
    localStorage.setItem(chiave, JSON.stringify(v))
  } catch {
    // solo comodità
  }
}

const altri = (e: AgendaEvento) => e.partecipanti.filter((p) => !p.io && !p.risorsa)
const altriInvitati = (e: AgendaEvento) => altri(e).length > 0
/** L'evento come lo mostra la finestra di conferma. */
const inConferma = (e: EventoVista) => ({ evento: { titolo: e.titolo ?? '', colore: e.colore, quando: quando(e) }, persone: altri(e) })
const tempiRichiesta = (start: Date, end: Date, tuttoIlGiorno: boolean): AgendaEventoRequest =>
  tuttoIlGiorno
    ? { inizio: isoData(start), fine: isoData(end), tuttoIlGiorno: true }
    : { inizio: isoConOffset(start), fine: isoConOffset(end), tuttoIlGiorno: false, fusoOrario: Intl.DateTimeFormat().resolvedOptions().timeZone }

/** Ora attuale aggiornata ogni 30 secondi (linea "adesso", conti alla rovescia). */
function useAdesso() {
  const [adesso, setAdesso] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setAdesso(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return adesso
}

export function AgendaPagina() {
  const { utente } = useAuth()
  const azioni = useAzioni()
  const uid = utente?.id ?? ''
  const adesso = useAdesso()
  const mobile = useIsMobile()
  useSchermoIntero()

  const [params, setParams] = useSearchParams()
  const vista = (VISTE.some((v) => v.id === params.get('vista')) ? params.get('vista') : leggi(`agenda-vista-${uid}`, window.innerWidth < 760 ? 'giorno' : 'settimana')) as Vista
  const data = useMemo(() => {
    const p = params.get('data')
    const d = p ? daGoogle(p) : new Date()
    return Number.isNaN(d.getTime()) ? inizioGiorno(new Date()) : inizioGiorno(d)
  }, [params])
  const vai = useCallback(
    (v: Vista, d: Date) => {
      scrivi(`agenda-vista-${uid}`, v)
      setParams((p) => {
        const n = new URLSearchParams(p)
        n.set('vista', v)
        if (stessoGiorno(d, new Date())) n.delete('data')
        else n.set('data', isoData(d))
        return n
      }, { replace: true })
    },
    [setParams, uid],
  )

  const [stato, setStato] = useState<AgendaStato | null>(null)
  const [errore, setErrore] = useState<{ testo: string; nonConfigurata: boolean } | null>(null)
  const [visibili, setVisibili] = useState<Set<string> | null>(null)
  const [cache, setCache] = useState<Map<string, AgendaEvento[]>>(new Map())
  const [nonLetti, setNonLetti] = useState<string[]>([])
  const [caricando, setCaricando] = useState(false)
  const [ultimaSync, setUltimaSync] = useState<number | null>(null)
  const controllato = useRef(0)
  const [contatti, setContatti] = useState<AgendaContatto[]>([])
  const [soloVisite, setSoloVisite] = useState(false)
  // Sul telefono il pannello è un cassetto che parte chiuso; da computer si ricorda com'era.
  const [lato, setLato] = useState<boolean>(() => window.innerWidth >= 768 && leggi(`agenda-lato-${uid}`, window.innerWidth >= 1100))
  const [miniAperto, setMiniAperto] = useState(false)
  const [cercaMobile, setCercaMobile] = useState(false)
  const vistaRef = useRef<HTMLDivElement>(null)
  const [arrivo, setArrivo] = useState<'avanti' | 'indietro' | null>(null)

  const [aperto, setAperto] = useState<{ evento: EventoVista; ancora: DOMRect | null } | null>(null)
  const [dettaglio, setDettaglio] = useState<AgendaEvento | null>(null)
  const [bozza, setBozza] = useState<{ bozza: Bozza; ancora: DOMRect | null } | null>(null)
  const [editor, setEditor] = useState<{ titolo: string; iniziale: Modulo; prima: Modulo | null; evento: AgendaEvento | null } | null>(null)
  const [scorciatoie, setScorciatoie] = useState(false)
  const [ricerca, setRicerca] = useState('')
  const [risultati, setRisultati] = useState<AgendaEvento[] | null>(null)
  const [cercando, setCercando] = useState(false)
  const ultima = useRef<Annullabile | null>(null)
  const cercaRef = useRef<HTMLInputElement>(null)
  const { chiedi, elemento: conferma } = useConferma()

  // ───────────── Stato e calendari ─────────────

  const caricaStato = useCallback(async () => {
    try {
      const s = await agendaService.stato()
      setStato(s)
      setErrore(null)
      setVisibili((v) => {
        if (v) return new Set([...v].filter((id) => s.calendari.some((c) => c.id === id)))
        const salvati = leggi<string[] | null>(`agenda-calendari-${uid}`, null)
        const ids = salvati?.filter((id) => s.calendari.some((c) => c.id === id))
        return new Set(ids?.length ? ids : s.calendari.filter((c) => c.selezionato).map((c) => c.id))
      })
    } catch (err) {
      setErrore({ testo: messaggioErroreAgenda(err, 'Agenda non disponibile'), nonConfigurata: agendaNonConfigurata(err) })
    }
  }, [uid])

  useEffect(() => {
    void caricaStato()
    agendaService.contatti().then(setContatti).catch(() => setContatti([]))
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void caricaStato()
    }, STATO_OGNI_MS)
    return () => window.clearInterval(id)
  }, [caricaStato])

  const calendariMap = useMemo(() => new Map((stato?.calendari ?? []).map((c) => [c.id, c])), [stato])
  const idsVisibili = useMemo(() => (stato?.calendari ?? []).filter((c) => visibili?.has(c.id)).map((c) => c.id), [stato, visibili])
  const calendarioPredefinito = useMemo(() => {
    const p = stato?.calendari.find((c) => c.principale && scrivibile(c))
    return p?.id ?? stato?.calendari.find(scrivibile)?.id ?? 'primary'
  }, [stato])

  const cambiaVisibili = (v: Set<string>) => {
    setVisibili(v)
    scrivi(`agenda-calendari-${uid}`, [...v])
  }

  // ───────────── Eventi della finestra ─────────────

  const { da, a, giorni } = useMemo(() => finestra(vista, data), [vista, data])
  const chiaveFinestra = (d: Date, f: Date) => `${d.getTime()}|${f.getTime()}|${idsVisibili.join(',')}`
  const chiave = chiaveFinestra(da, a)
  const [ultimiMostrati, setUltimiMostrati] = useState<AgendaEvento[]>([])

  const scarica = useCallback(
    async (d: Date, f: Date, silenzioso = false) => {
      if (!idsVisibili.length) return
      const k = `${d.getTime()}|${f.getTime()}|${idsVisibili.join(',')}`
      if (!silenzioso) setCaricando(true)
      try {
        const r = await agendaService.eventi(idsVisibili, isoConOffset(d), isoConOffset(f))
        setCache((c) => new Map(c).set(k, r.eventi))
        setNonLetti(r.calendariNonLetti)
        setUltimaSync(Date.now())
        if (!controllato.current) controllato.current = Date.now()
      } catch (err) {
        if (agendaNonConfigurata(err)) setErrore({ testo: messaggioErroreAgenda(err), nonConfigurata: true })
        else if (!silenzioso) toast.error(messaggioErroreAgenda(err, 'Eventi non caricati'))
      } finally {
        if (!silenzioso) setCaricando(false)
      }
    },
    [idsVisibili],
  )

  useEffect(() => {
    if (!stato || !idsVisibili.length) return
    if (!cache.has(chiave)) void scarica(da, a)
    // Le finestre accanto si scaricano in silenzio: le frecce sono istantanee.
    if (vista !== 'anno' && vista !== 'elenco') {
      const prima = finestra(vista, sposta(vista, data, -1))
      const dopo = finestra(vista, sposta(vista, data, 1))
      const t = window.setTimeout(() => {
        if (!cache.has(chiaveFinestra(prima.da, prima.a))) void scarica(prima.da, prima.a, true)
        if (!cache.has(chiaveFinestra(dopo.da, dopo.a))) void scarica(dopo.da, dopo.a, true)
      }, 600)
      return () => window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stato, chiave])

  // Telefono, viste a giorni: si scarica anche la settimana intera, per i puntini della striscia.
  useEffect(() => {
    if (!mobile || !stato || !idsVisibili.length || (vista !== 'giorno' && vista !== '3giorni')) return
    const w = finestra('settimana', data)
    if (!cache.has(chiaveFinestra(w.da, w.a))) void scarica(w.da, w.a, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile, stato, chiave])

  const grezzi = cache.get(chiave)
  useEffect(() => {
    if (grezzi) setUltimiMostrati(grezzi)
  }, [grezzi])
  const mostrati = grezzi ?? ultimiMostrati
  const eventi = useMemo(
    () => mostrati.filter((e) => visibili?.has(e.calendarioId) && (!soloVisite || e.visitaId)).map((e) => perVista(e, stato, calendariMap)),
    [mostrati, visibili, soloVisite, stato, calendariMap],
  )

  /** Modifica locale immediata su tutte le finestre in cache (poi arriva la versione di Google). */
  const aggiornaCache = useCallback((fn: (lista: AgendaEvento[]) => AgendaEvento[]) => {
    setCache((c) => {
      const n = new Map<string, AgendaEvento[]>()
      c.forEach((v, k) => n.set(k, fn(v)))
      return n
    })
    setUltimiMostrati((v) => fn(v))
  }, [])

  const sostituisci = (vecchio: Pick<AgendaEvento, 'id' | 'calendarioId'>, nuovo: AgendaEvento | null) =>
    aggiornaCache((l) => {
      const senza = l.filter((x) => !(x.id === vecchio.id && x.calendarioId === vecchio.calendarioId))
      return nuovo ? [...senza, nuovo] : senza
    })

  /** Dopo una modifica a una serie (o in dubbio) si butta la cache e si rilegge la finestra. */
  const ricarica = useCallback(async () => {
    setCache(new Map())
    await scarica(da, a, true)
  }, [scarica, da, a])

  // ───────────── Sincronizzazione continua con Google ─────────────

  const trascinando = useRef(false)
  const controlla = useCallback(async () => {
    if (!stato || !idsVisibili.length || document.visibilityState !== 'visible' || trascinando.current) return
    try {
      const n = await agendaService.novita(idsVisibili, controllato.current)
      controllato.current = n.controllatoIl
      setUltimaSync(Date.now())
      if (n.cambiato) {
        setCache((c) => {
          const tenuta = new Map<string, AgendaEvento[]>()
          const k = c.get(chiave)
          if (k) tenuta.set(chiave, k)
          return tenuta
        })
        await scarica(da, a, true)
      }
    } catch (err) {
      if (agendaNonConfigurata(err)) setErrore({ testo: messaggioErroreAgenda(err), nonConfigurata: true })
    }
  }, [stato, idsVisibili, chiave, scarica, da, a])

  useEffect(() => {
    const id = window.setInterval(() => void controlla(), POLLING_MS)
    const visibile = () => {
      if (document.visibilityState === 'visible') void controlla()
    }
    document.addEventListener('visibilitychange', visibile)
    window.addEventListener('focus', visibile)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', visibile)
      window.removeEventListener('focus', visibile)
    }
  }, [controlla])

  // ───────────── Azioni ─────────────

  const ricordaAnnulla = (etichetta: string, annulla: () => Promise<void>, messaggio: string) => {
    ultima.current = { etichetta, annulla }
    toast.success(messaggio, { action: { label: 'Annulla', onClick: () => void annullaUltima() }, duration: 6000 })
  }

  const annullaUltima = useCallback(async () => {
    const u = ultima.current
    if (!u) return
    ultima.current = null
    try {
      await u.annulla()
      toast(`Annullato: ${u.etichetta}`, { duration: 2000 })
    } catch (err) {
      toast.error(messaggioErroreAgenda(err, 'Non sono riuscito ad annullare'))
    }
  }, [])

  const apri = useCallback((e: EventoVista, el: HTMLElement | null) => {
    setBozza(null)
    setAperto({ evento: e, ancora: el?.getBoundingClientRect() ?? null })
  }, [])

  useEffect(() => {
    setDettaglio(null)
    if (!aperto) return
    let vivo = true
    agendaService
      .evento(aperto.evento.calendarioId, aperto.evento.id)
      .then((d) => vivo && setDettaglio(d))
      .catch((err) => {
        if (!vivo) return
        if (String(messaggioErroreAgenda(err)).includes('non trovato')) {
          toast.error("L'evento non esiste più: è stato eliminato altrove")
          setAperto(null)
          void ricarica()
        }
      })
    return () => {
      vivo = false
    }
  }, [aperto, ricarica])

  // ?cal=…&evento=… (dalla pillola "La mia giornata" nell'intestazione): apre quell'evento e pulisce l'URL
  const eventoDaUrl = params.get('evento')
  const calendarioDaUrl = params.get('cal')
  useEffect(() => {
    if (!stato || !eventoDaUrl || !calendarioDaUrl) return
    setParams((p) => {
      const n = new URLSearchParams(p)
      n.delete('evento')
      n.delete('cal')
      return n
    }, { replace: true })
    agendaService
      .evento(calendarioDaUrl, eventoDaUrl)
      .then((e) => setAperto({ evento: perVista(e, stato, calendariMap), ancora: null }))
      .catch((err) => toast.error(messaggioErroreAgenda(err, 'Evento non disponibile')))
  }, [stato, eventoDaUrl, calendarioDaUrl, calendariMap, setParams])

  const cambiaOrario = useCallback(
    async (ev: EventoVista, start: Date, end: Date) => {
      const esito = await chiedi({
        titolo: 'Spostare l\'evento?', ricorrente: !!ev.serieId, conInvitati: altriInvitati(ev), azione: 'Sposta',
        ...inConferma(ev), cambio: { da: quando(ev), a: quando({ start, end, tuttoIlGiorno: ev.tuttoIlGiorno }) },
      })
      if (!esito) return
      const req = tempiRichiesta(start, end, ev.tuttoIlGiorno)
      const prima = tempiRichiesta(ev.start, ev.end, ev.tuttoIlGiorno)
      sostituisci(ev, { ...ev, inizio: req.inizio!, fine: req.fine! })
      setAperto(null)
      try {
        const nuovo = await agendaService.modifica(ev.calendarioId, ev.id, req, esito.ambito, esito.notifica)
        if (esito.ambito === 'QUESTO') {
          sostituisci(ev, nuovo)
          ricordaAnnulla('spostamento', async () => {
            const tornato = await agendaService.modifica(nuovo.calendarioId, nuovo.id, prima, 'QUESTO', esito.notifica)
            sostituisci(nuovo, tornato)
          }, `Spostato a ${etichettaGiorno(start).toLowerCase()}${ev.tuttoIlGiorno ? '' : `, ${ora(start)}`}`)
        } else {
          toast.success('Serie aggiornata')
          void ricarica()
        }
      } catch (err) {
        toast.error(messaggioErroreAgenda(err, 'Evento non spostato'))
        void ricarica()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chiedi, ricarica],
  )

  const elimina = useCallback(
    async (ev: EventoVista) => {
      const esito = ev.serieId || altriInvitati(ev)
        ? await chiedi({ titolo: "Eliminare l'evento?", ricorrente: !!ev.serieId, conInvitati: altriInvitati(ev) && !!ev.organizzatore?.io, azione: 'Elimina', pericolosa: true, ...inConferma(ev) })
        : { ambito: 'QUESTO' as const, notifica: false }
      if (!esito) return
      setAperto(null)
      const copia = dettaglio && dettaglio.id === ev.id ? dettaglio : ev
      sostituisci(ev, null)
      try {
        await agendaService.elimina(ev.calendarioId, ev.id, esito.ambito, esito.notifica)
        if (esito.ambito === 'QUESTO' && !ev.serieId) {
          ricordaAnnulla('eliminazione', async () => {
            const m = moduloDaEvento(copia)
            const ricreato = await agendaService.crea(copia.calendarioId, richiesta(m, null, stato!.email), false)
            sostituisci(ricreato, ricreato)
          }, 'Evento eliminato')
        } else {
          toast.success(esito.ambito === 'QUESTO' ? 'Occorrenza eliminata' : 'Serie eliminata')
          if (esito.ambito !== 'QUESTO') void ricarica()
        }
      } catch (err) {
        toast.error(messaggioErroreAgenda(err, 'Evento non eliminato'))
        void ricarica()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chiedi, dettaglio, ricarica, stato],
  )

  const rispondi = async (ev: EventoVista, r: Exclude<AgendaRisposta, 'needsAction'>) => {
    const esito = ev.serieId
      ? await chiedi({ titolo: 'A quali date rispondi?', ricorrente: true, conInvitati: false, azione: 'Rispondi', ambiti: ['QUESTO', 'TUTTI'], ...inConferma(ev) })
      : { ambito: 'QUESTO' as const, notifica: true }
    if (!esito) return
    try {
      const nuovo = await agendaService.rispondi(ev.calendarioId, ev.id, r, esito.ambito)
      if (esito.ambito === 'QUESTO') {
        sostituisci(ev, nuovo)
        setDettaglio(nuovo)
      } else void ricarica()
      toast.success(r === 'accepted' ? 'Ci sarai: risposta inviata' : r === 'declined' ? 'Invito rifiutato' : 'Risposto «forse»')
    } catch (err) {
      toast.error(messaggioErroreAgenda(err, 'Risposta non inviata'))
    }
  }

  const salvaNuovo = async (m: Modulo, esito: EsitoConferma) => {
    if (!stato) return
    try {
      const creato = await agendaService.crea(m.calendarioId, richiesta(m, null, stato.email), esito.notifica)
      setBozza(null)
      setEditor(null)
      if (m.ricorrenza.length) void ricarica()
      else sostituisci(creato, creato)
      const start = daGoogle(creato.inizio)
      ricordaAnnulla('creazione', async () => {
        await agendaService.elimina(creato.calendarioId, creato.id, m.ricorrenza.length ? 'TUTTI' : 'QUESTO', esito.notifica)
        sostituisci(creato, null)
        if (m.ricorrenza.length) void ricarica()
      }, `${esito.notifica && m.invitati.length ? `Invito inviato a ${elencoNomi(m.invitati)}` : `Creato: ${creato.titolo || 'evento'}`} · ${etichettaGiorno(start)}${creato.tuttoIlGiorno ? '' : `, ${ora(start)}`}`)
      if (!stessoGiorno(start, data) && (start < da || start >= a)) vai(vista, start)
    } catch (err) {
      toast.error(messaggioErroreAgenda(err, 'Evento non creato'))
      throw err
    }
  }

  const salvaModifica = async (m: Modulo, esito: EsitoConferma) => {
    if (!stato || !editor?.prima || !editor.evento) return
    const ev = editor.evento
    const req = richiesta(m, editor.prima, stato.email)
    const cambioCalendario = m.calendarioId !== editor.prima.calendarioId
    if (!Object.keys(req).length && !cambioCalendario) {
      setEditor(null)
      return
    }
    try {
      let corrente: AgendaEvento = ev
      if (cambioCalendario) corrente = await agendaService.sposta(ev.calendarioId, ev.id, m.calendarioId, esito.notifica)
      const ambito = 'ricorrenza' in req && ev.serieId ? 'TUTTI' : esito.ambito
      const nuovo = Object.keys(req).length ? await agendaService.modifica(corrente.calendarioId, corrente.id, req, ambito, esito.notifica) : corrente
      setEditor(null)
      setAperto(null)
      if (ambito === 'QUESTO' && !cambioCalendario && !('ricorrenza' in req)) sostituisci(ev, nuovo)
      else void ricarica()
      toast.success(esito.notifica ? `Modifiche salvate · avvisat${m.invitati.length === 1 ? 'o' : 'i'} ${elencoNomi(m.invitati.length ? m.invitati : altri(ev))}` : 'Modifiche salvate su Google Calendar')
    } catch (err) {
      toast.error(messaggioErroreAgenda(err, 'Modifiche non salvate'))
      throw err
    }
  }

  const nuovoEvento = useCallback(
    (inizio?: Date) => {
      const base = inizio ?? (() => {
        const d = stessoGiorno(data, new Date()) ? new Date() : new Date(data.getFullYear(), data.getMonth(), data.getDate(), 9)
        d.setMinutes(d.getMinutes() > 30 ? 60 : 30, 0, 0)
        return d
      })()
      setAperto(null)
      setBozza(null)
      setEditor({ titolo: 'Nuovo evento', iniziale: moduloDaBozza({ start: base, end: new Date(base.getTime() + 3_600_000), tuttoIlGiorno: false }, calendarioPredefinito), prima: null, evento: null })
    },
    [data, calendarioPredefinito],
  )

  const modifica = useCallback(async (ev: EventoVista) => {
    let d: AgendaEvento = ev
    try {
      d = dettaglio?.id === ev.id ? dettaglio : await agendaService.evento(ev.calendarioId, ev.id)
    } catch {
      // si modifica con i dati della vista
    }
    const iniziale = moduloDaEvento(d)
    setAperto(null)
    setEditor({ titolo: 'Modifica evento', iniziale, prima: iniziale, evento: d })
  }, [dettaglio])

  const duplica = (ev: EventoVista) => {
    const base = dettaglio?.id === ev.id ? dettaglio : ev
    const m = moduloDaEvento(base)
    setAperto(null)
    setEditor({
      titolo: 'Duplica evento',
      iniziale: { ...m, titolo: m.titolo, ricorrenza: [], calendarioId: scrivibile(calendariMap.get(m.calendarioId)) ? m.calendarioId : calendarioPredefinito },
      prima: null,
      evento: null,
    })
  }

  // ───────────── Ricerca ─────────────

  useEffect(() => {
    const q = ricerca.trim()
    if (q.length < 2) {
      setRisultati(null)
      return
    }
    let vivo = true
    const t = window.setTimeout(() => {
      setCercando(true)
      agendaService
        .cerca(q, idsVisibili)
        .then((r) => vivo && setRisultati(r))
        .catch(() => undefined)
        .finally(() => vivo && setCercando(false))
    }, 320)
    return () => {
      window.clearTimeout(t)
      vivo = false
    }
  }, [ricerca, idsVisibili])

  // ───────────── Tastiera ─────────────

  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (staScrivendo(e) || e.altKey) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (ultima.current) {
          e.preventDefault()
          void annullaUltima()
        }
        return
      }
      if (e.metaKey || e.ctrlKey) return
      const k = e.key
      const vista2 = VISTE.find((v) => v.tasto.toLowerCase() === k.toLowerCase())
      if (vista2) {
        e.preventDefault()
        vai(vista2.id, data)
        return
      }
      switch (k) {
        case 't':
        case 'T':
          vai(vista, new Date())
          break
        case 'j':
        case 'n':
        case 'ArrowRight':
          vai(vista, sposta(vista, data, 1))
          break
        case 'k':
        case 'p':
        case 'ArrowLeft':
          vai(vista, sposta(vista, data, -1))
          break
        case 'c':
        case 'C':
          e.preventDefault()
          nuovoEvento()
          break
        case 'v':
        case 'V':
          e.preventDefault()
          azioni.nuovaVisita()
          break
        case '/':
          e.preventDefault()
          cercaRef.current?.focus()
          break
        case 'r':
        case 'R':
          void ricarica().then(() => toast('Sincronizzato con Google', { duration: 1500 }))
          break
        case 'e':
        case 'E':
          if (aperto?.evento.modificabile) void modifica(aperto.evento)
          break
        case 'Delete':
        case 'Backspace':
          if (aperto?.evento.modificabile) void elimina(aperto.evento)
          break
        case 'z':
        case 'Z':
          if (ultima.current) void annullaUltima()
          break
        case '?':
          setScorciatoie(true)
          break
        case 'Escape':
          setAperto(null)
          setBozza(null)
          break
        default:
          return
      }
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [vista, data, vai, nuovoEvento, aperto, modifica, elimina, annullaUltima, ricarica, lato, azioni])

  // ───────────── Riepilogo della giornata ─────────────

  const oggi = useMemo(() => {
    const lista = (cache.get(chiave) ?? mostrati)
      .map((e) => perVista(e, stato, calendariMap))
      .filter((e) => visibili?.has(e.calendarioId) && e.miaRisposta !== 'declined')
    const diOggi = eventiDelGiorno(lista, adesso)
    const conOrario = diOggi.filter((e) => !e.tuttoIlGiorno)
    const occupati = conOrario.filter((e) => e.trasparenza !== 'transparent').reduce((s, e) => s + durataMinuti(e), 0)
    const inCorso = conOrario.find((e) => e.start <= adesso && e.end > adesso) ?? null
    const prossimo = lista.filter((e) => !e.tuttoIlGiorno && e.start > adesso).sort((x, y) => x.start.getTime() - y.start.getTime())[0] ?? null
    return { totale: diOggi.length, occupati, inCorso, prossimo }
  }, [cache, chiave, mostrati, stato, calendariMap, visibili, adesso])

  // Tutto ciò che è in cache (finestre accanto comprese): mini mese e striscia mostrano i puntini anche fuori vista.
  const giorniConEventi = useMemo(() => {
    const s = new Set<number>()
    const visti = new Set<string>()
    const tutti: EventoVista[] = []
    cache.forEach((lista) => lista.forEach((e) => {
      const k = `${e.calendarioId}|${e.id}`
      if (visti.has(k) || !visibili?.has(e.calendarioId)) return
      visti.add(k)
      tutti.push(perVista(e, stato, calendariMap))
    }))
    ;(tutti.length ? tutti : eventi).forEach((e) => {
      let g = inizioGiorno(e.start)
      let i = 0
      while (g < e.end && i++ < 60) {
        s.add(g.getTime())
        g = aggiungiGiorni(g, 1)
      }
    })
    return s
  }, [cache, eventi, visibili, stato, calendariMap])

  const iniziaTrascinamento = () => {
    trascinando.current = true
    const fine = () => {
      trascinando.current = false
      window.removeEventListener('pointerup', fine)
    }
    window.addEventListener('pointerup', fine)
  }

  const swipe = useSwipeOrizzontale(
    (verso) => {
      setArrivo(verso === 1 ? 'avanti' : 'indietro')
      vai(vista, sposta(vista, data, verso))
    },
    {
      segui: vistaRef,
      bloccato: () => !!document.querySelector('.ag-tempo[data-trascina="sposta"], .ag-tempo[data-trascina="ridimensiona"]'),
    },
  )

  // Una visita fissata o spostata dal gestionale compare subito, senza aspettare il controllo periodico.
  const versioneVista = useRef(azioni.versione)
  useEffect(() => {
    if (versioneVista.current === azioni.versione) return
    versioneVista.current = azioni.versione
    void ricarica()
  }, [azioni.versione, ricarica])

  // ───────────── Render ─────────────

  if (errore?.nonConfigurata) {
    return (
      <div data-vl="" data-vl-page="agenda" className="ag-pagina ag-pagina--setup">
        <AgendaSetup dettaglio={errore.testo} onRiprova={() => void caricaStato()} />
      </div>
    )
  }

  if (!stato || !visibili) {
    return (
      <div data-vl="" data-vl-page="agenda" className="ag-pagina ag-pagina--caricamento">
        {errore ? (
          <div className="ag-vuoto">
            <AlertTriangle aria-hidden />
            <p>{errore.testo}</p>
            <button type="button" className="ag-btn" onClick={() => void caricaStato()}>Riprova</button>
          </div>
        ) : (
          <div className="ag-avvio">
            <div className="ag-vuoto-orb ag-vuoto-orb--pulsa" aria-hidden><CalendarDays /></div>
            <p>Apro il tuo Google Calendar…</p>
          </div>
        )}
      </div>
    )
  }

  const risultatiRicerca = risultati || cercando ? (
              <div className="ag-risultati">
                {cercando && !risultati ? <p className="ag-risultati-vuoto"><Loader2 className="animate-spin" aria-hidden /> Cerco su Google Calendar…</p> : null}
                {risultati && !risultati.length ? <p className="ag-risultati-vuoto">Nessun evento per «{ricerca}»</p> : null}
                {risultati?.slice(0, 40).map((r) => {
                  const ev = perVista(r, stato, calendariMap)
                  return (
                    <button
                      key={ev.chiave}
                      type="button"
                      className="ag-risultato"
                      style={{ '--c': ev.colore } as CSSProperties}
                      data-passato={ev.end < adesso || undefined}
                      onClick={() => {
                        setRicerca('')
                        setCercaMobile(false)
                        vai(vista === 'anno' || vista === 'elenco' ? 'settimana' : vista, ev.start)
                        setAperto({ evento: ev, ancora: null })
                      }}
                    >
                      <i aria-hidden />
                      <span>
                        <strong>{ev.titolo || '(Senza titolo)'}</strong>
                        <small>{quando(ev)}{ev.luogo ? ` · ${ev.luogo}` : ''}</small>
                      </span>
                    </button>
                  )
                })}
              </div>
  ) : null

  const nome = utente?.nome || stato.nome.split(' ')[0]
  const prossimo = oggi.inCorso ?? oggi.prossimo
  const viewTempo = vista === 'giorno' || vista === '3giorni' || vista === 'settimana'

  return (
    <div data-vl="" data-vl-page="agenda" className="ag-pagina" data-lato={lato || undefined} data-vista={vista}>
      {mobile ? (
        <>
          {cercaMobile ? (
            <div className="ag-mcerca">
              <form className="ag-cerca" role="search" onSubmit={(e) => e.preventDefault()}>
                <Search aria-hidden />
                <input
                  autoFocus
                  value={ricerca}
                  onChange={(e) => setRicerca(e.target.value)}
                  placeholder="Cerca eventi, persone, luoghi…"
                  aria-label="Cerca negli eventi"
                  enterKeyHint="search"
                />
                {ricerca ? <button type="button" className="ag-cerca-x" aria-label="Svuota" onClick={() => setRicerca('')}><X /></button> : null}
              </form>
              <button type="button" className="ag-mcerca-annulla" onClick={() => { setCercaMobile(false); setRicerca('') }}>Annulla</button>
              {risultatiRicerca}
            </div>
          ) : null}
          {prossimo && (oggi.inCorso || prossimo.start.getTime() - adesso.getTime() < 2 * 3_600_000) && !cercaMobile ? (
            <button type="button" className="ag-mprossimo" style={{ '--c': prossimo.colore } as CSSProperties} onClick={() => setAperto({ evento: prossimo, ancora: null })}>
              <i aria-hidden />
              <span className="ag-mprossimo-quando">{oggi.inCorso ? 'Adesso' : traQuanto(prossimo.start, adesso)}</span>
              <strong>{prossimo.titolo || '(Senza titolo)'}</strong>
              {prossimo.meet ? (
                <a href={prossimo.meet} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label="Partecipa con Meet"><Video /></a>
              ) : null}
              {oggi.inCorso ? (
                <span className="ag-prossimo-barra" aria-hidden>
                  <i style={{ width: `${Math.min(100, ((adesso.getTime() - prossimo.start.getTime()) / (prossimo.end.getTime() - prossimo.start.getTime())) * 100)}%` }} />
                </span>
              ) : null}
            </button>
          ) : null}
        </>
      ) : (
      <header className="ag-testa">
        <div className="ag-testa-luci" aria-hidden>
          <div className="ag-testa-aurora" />
          <div className="ag-testa-aurora ag-testa-aurora--2" />
        </div>
        <div className="ag-testa-sx">
          <div className="ag-eyebrow">
            <span className="vl-live-dot" aria-hidden />
            <span>{stato.email}</span>
            <span className="ag-sync" title="Ogni modifica va subito su Google; quelle fatte altrove arrivano qui in pochi secondi">
              {ultimaSync ? `sincronizzato ${Math.max(0, Math.round((adesso.getTime() - ultimaSync) / 60_000)) < 1 ? 'ora' : `${Math.round((adesso.getTime() - ultimaSync) / 60_000)} min fa`}` : 'collegato a Google'}
            </span>
            {stato.demo ? <span className="ag-demo">Calendario dimostrativo</span> : null}
          </div>
          <h1 className="ag-titolo">{saluto(adesso)}, {nome}</h1>
          <p className="ag-sottotitolo">
            {oggi.totale ? (
              <><strong>{oggi.totale}</strong> event{oggi.totale === 1 ? 'o' : 'i'} oggi{oggi.occupati ? <> · <strong>{durata(oggi.occupati)}</strong> occupate</> : null}</>
            ) : (
              <>Oggi la tua agenda è libera</>
            )}
          </p>
        </div>

        {prossimo ? (
          <button type="button" className="ag-prossimo" style={{ '--c': prossimo.colore } as CSSProperties} onClick={() => {
            vai(vista === 'anno' || vista === 'elenco' || vista === 'mese' ? 'settimana' : vista, prossimo.start)
            setAperto({ evento: prossimo, ancora: null })
          }}>
            <span className="ag-prossimo-etichetta">{oggi.inCorso ? 'Adesso' : traQuanto(prossimo.start, adesso)}</span>
            <strong>{prossimo.titolo || '(Senza titolo)'}</strong>
            <small>{quando(prossimo)}</small>
            {oggi.inCorso ? (
              <span className="ag-prossimo-barra" aria-hidden>
                <i style={{ width: `${Math.min(100, ((adesso.getTime() - prossimo.start.getTime()) / (prossimo.end.getTime() - prossimo.start.getTime())) * 100)}%` }} />
              </span>
            ) : null}
            {prossimo.meet ? (
              <a className="ag-prossimo-meet" href={prossimo.meet} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                <Video aria-hidden /> Partecipa
              </a>
            ) : null}
          </button>
        ) : null}

        <div className="ag-testa-dx">
          <form className="ag-cerca" role="search" onSubmit={(e) => e.preventDefault()}>
            <Search aria-hidden />
            <input
              ref={cercaRef}
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              placeholder="Cerca eventi, persone, luoghi…"
              aria-label="Cerca negli eventi"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setRicerca('')
                  e.currentTarget.blur()
                }
              }}
            />
            {ricerca ? (
              <button type="button" className="ag-cerca-x" aria-label="Annulla la ricerca" onClick={() => setRicerca('')}><X /></button>
            ) : <kbd>/</kbd>}
            {risultatiRicerca}
          </form>
          <button type="button" className="ag-testa-btn" onClick={() => setScorciatoie(true)} title="Scorciatoie (?)" aria-label="Scorciatoie da tastiera"><Keyboard /></button>
        </div>
      </header>
      )}

      <div className="ag-app">
        {lato && mobile ? <button type="button" className="ag-lato-velo" aria-label="Chiudi il pannello" onClick={() => setLato(false)} /> : null}
        {lato ? (
          <aside className="ag-lato">
            {mobile ? (
              <div className="ag-lato-testa">
                <strong>Agenda</strong>
                <button type="button" className="ag-icona-btn" onClick={() => setLato(false)} aria-label="Chiudi"><X /></button>
              </div>
            ) : null}
            <button type="button" className="ag-crea" onClick={() => { if (mobile) setLato(false); nuovoEvento() }}>
              <span className="ag-crea-icona"><Plus aria-hidden /></span> Crea <kbd>C</kbd>
            </button>
            <button type="button" className="ag-visita-btn" onClick={() => { if (mobile) setLato(false); azioni.nuovaVisita() }}>
              <Stethoscope aria-hidden /> Fissa una visita <kbd>V</kbd>
            </button>
            <MiniMese data={data} da={da} a={a} adesso={adesso} giorniConEventi={giorniConEventi} onScegli={(d) => { if (mobile) setLato(false); vai(vista === 'anno' ? 'giorno' : vista, d) }} />
            <ListaCalendari calendari={stato.calendari} visibili={visibili} onCambia={cambiaVisibili} />
            <button type="button" className="ag-solo-visite" role="switch" aria-checked={soloVisite} data-attivo={soloVisite || undefined} onClick={() => setSoloVisite((v) => !v)}>
              <span aria-hidden /> Solo le visite
            </button>
          </aside>
        ) : null}

        <main className="ag-principale">
          {mobile ? (
            <BarraMobile
              vista={vista}
              data={data}
              adesso={adesso}
              titolo={titoloMobile(vista, data)}
              miniAperto={miniAperto}
              giorniConEventi={giorniConEventi}
              onVista={(v) => {
                setArrivo(null)
                vai(v, data)
              }}
              onData={(d) => {
                setArrivo(d > data ? 'avanti' : d < data ? 'indietro' : null)
                vai(vista === 'elenco' ? 'giorno' : vista, d)
              }}
              onMenu={() => setLato(true)}
              onMini={() => setMiniAperto((v) => !v)}
              onCerca={() => setCercaMobile(true)}
              mini={
                <MiniMese data={data} da={da} a={a} adesso={adesso} giorniConEventi={giorniConEventi} onScegli={(d) => {
                  setMiniAperto(false)
                  vai(vista === 'elenco' ? 'giorno' : vista, d)
                }} />
              }
            />
          ) : (
          <div className="ag-barra-strumenti">
            <button type="button" className="ag-icona-btn ag-lato-toggle" onClick={() => {
              setLato((v) => {
                scrivi(`agenda-lato-${uid}`, !v)
                return !v
              })
            }} aria-label={lato ? 'Nascondi il pannello' : 'Mostra il pannello'}>
              {lato ? <PanelLeftClose /> : <PanelLeftOpen />}
            </button>
            <button type="button" className="ag-btn ag-oggi" onClick={() => vai(vista, new Date())} disabled={stessoGiorno(data, adesso) && vista !== 'mese'}>Oggi</button>
            <span className="ag-frecce">
              <button type="button" className="ag-icona-btn" aria-label="Precedente (K)" onClick={() => vai(vista, sposta(vista, data, -1))}><ChevronLeft /></button>
              <button type="button" className="ag-icona-btn" aria-label="Successivo (J)" onClick={() => vai(vista, sposta(vista, data, 1))}><ChevronRight /></button>
            </span>
            <h2 key={`${vista}-${da.getTime()}`} className="ag-periodo">{titoloFinestra(vista, data)}</h2>
            {caricando ? <Loader2 className="animate-spin ag-carica" aria-label="Carico" /> : null}
            {nonLetti.length ? (
              <span className="ag-chip ag-chip--avviso" title={nonLetti.join('\n')}><AlertTriangle aria-hidden /> {nonLetti.length} calendari non letti</span>
            ) : null}
            <span className="ag-spazio" />
            <button type="button" className="ag-icona-btn" onClick={() => void ricarica().then(() => toast('Sincronizzato con Google', { duration: 1500 }))} title="Sincronizza ora (R)" aria-label="Sincronizza ora">
              <RefreshCw />
            </button>
            <div className="ag-viste" role="tablist">
              {VISTE.map((v) => (
                <button key={v.id} type="button" role="tab" aria-selected={vista === v.id} data-attivo={vista === v.id || undefined} onClick={() => vai(v.id, data)} title={`${v.nome} (${v.tasto})`}>
                  {v.nome}
                </button>
              ))}
            </div>
          </div>
          )}

          <div className="ag-vista-wrap" ref={vistaRef} {...(mobile ? swipe : {})}>
          <div
            className="ag-vista"
            key={mobile ? `${vista}-${da.getTime()}` : vista}
            data-arrivo={mobile ? arrivo ?? undefined : undefined}
            onPointerDownCapture={viewTempo ? iniziaTrascinamento : undefined}
          >
            {!idsVisibili.length ? (
              <div className="ag-vuoto">
                <div className="ag-vuoto-orb" aria-hidden><CalendarDays /></div>
                <h3>Nessun calendario visibile</h3>
                <p>Accendine almeno uno dal pannello a sinistra.</p>
              </div>
            ) : viewTempo ? (
              <AgendaTempo
                giorni={giorni}
                eventi={eventi}
                adesso={adesso}
                selezionato={aperto?.evento.chiave ?? null}
                bozza={bozza?.bozza ?? null}
                oreLavoro={ORE_LAVORO}
                onApri={apri}
                onCrea={(b, el) => {
                  setAperto(null)
                  setBozza({ bozza: b, ancora: el?.getBoundingClientRect() ?? ancoraBozza(b, giorni) })
                }}
                onCambiaOrario={(ev, s, f) => void cambiaOrario(ev, s, f)}
                onVaiGiorno={(d) => vai('giorno', d)}
              />
            ) : vista === 'mese' && mobile ? (
              <AgendaMeseMobile
                giorni={giorni}
                scelto={data}
                eventi={eventi}
                adesso={adesso}
                selezionato={aperto?.evento.chiave ?? null}
                onScegli={(d) => {
                  setArrivo(d.getMonth() === data.getMonth() ? null : d > data ? 'avanti' : 'indietro')
                  vai('mese', d)
                }}
                onApri={apri}
                onCrea={(b) => nuovoEvento(b.start)}
              />
            ) : vista === 'mese' ? (
              <AgendaMese
                giorni={giorni}
                mese={data.getMonth()}
                eventi={eventi}
                adesso={adesso}
                selezionato={aperto?.evento.chiave ?? null}
                onApri={apri}
                onCrea={(b) => {
                  setAperto(null)
                  setBozza({ bozza: b, ancora: null })
                }}
                onCambiaOrario={(ev, s, f) => void cambiaOrario(ev, s, f)}
                onVaiGiorno={(d) => vai('giorno', d)}
              />
            ) : vista === 'anno' ? (
              <AgendaAnno anno={data.getFullYear()} eventi={eventi} adesso={adesso} onVaiGiorno={(d) => vai('giorno', d)} onVaiMese={(d) => vai('mese', d)} />
            ) : (
              <AgendaElenco giorni={giorni} eventi={eventi} adesso={adesso} selezionato={aperto?.evento.chiave ?? null} onApri={apri} onCrea={(b) => nuovoEvento(b.start)} />
            )}
          </div>
          </div>
        </main>
      </div>

      {aperto ? (
        <DettaglioEvento
          key={aperto.evento.chiave}
          evento={aperto.evento}
          dettaglio={dettaglio && dettaglio.id === aperto.evento.id ? dettaglio : null}
          calendario={calendariMap.get(aperto.evento.calendarioId)}
          ancora={aperto.ancora}
          adesso={adesso}
          onChiudi={() => setAperto(null)}
          onModifica={() => void modifica(aperto.evento)}
          onElimina={() => void elimina(aperto.evento)}
          onDuplica={() => duplica(aperto.evento)}
          onApriPaziente={(id) => { setAperto(null); azioni.apriPaziente(id) }}
          onRispondi={(r) => rispondi(aperto.evento, r)}
        />
      ) : null}

      {bozza ? (
        <CreazioneRapida
          bozza={bozza.bozza}
          ancora={bozza.ancora}
          stato={stato}
          calendarioPredefinito={calendarioPredefinito}
          onChiudi={() => setBozza(null)}
          onCambiaBozza={(b) => setBozza((x) => (x ? { ...x, bozza: b } : x))}
          onSalva={salvaNuovo}
          onAltreOpzioni={(m) => {
            setBozza(null)
            setEditor({ titolo: 'Nuovo evento', iniziale: m, prima: null, evento: null })
          }}
        />
      ) : null}

      {editor ? (
        <EditorEvento
          aperto
          titolo={editor.titolo}
          iniziale={editor.iniziale}
          prima={editor.prima}
          stato={stato}
          contatti={contatti}
          ricorrenteServer={!!editor.evento?.serieId}
          onChiudi={() => setEditor(null)}
          onSalva={editor.prima ? salvaModifica : salvaNuovo}
        />
      ) : null}


      {!lato ? <button type="button" className="ag-fab" onClick={() => nuovoEvento()} aria-label="Nuovo evento"><Plus /></button> : null}
      {conferma}
      <AgendaScorciatoie open={scorciatoie} onOpenChange={setScorciatoie} />
    </div>
  )
}

/** Dove ancorare la scheda di creazione: accanto al blocco appena disegnato nella griglia. */
function ancoraBozza(b: Bozza, giorni: Date[]): DOMRect | null {
  const colonne = document.querySelector('.ag-colonne') as HTMLElement | null
  if (!colonne || b.tuttoIlGiorno) return null
  const i = giorni.findIndex((g) => stessoGiorno(g, b.start))
  if (i < 0) return null
  const r = colonne.getBoundingClientRect()
  const w = r.width / giorni.length
  const altezzaOra = parseFloat(getComputedStyle(colonne.closest('.ag-tempo') as HTMLElement).getPropertyValue('--ag-ora')) || 56
  const top = r.top + ((b.start.getHours() * 60 + b.start.getMinutes()) / 60) * altezzaOra
  return new DOMRect(r.left + i * w, Math.max(80, top), w, (durataMinuti(b) / 60) * altezzaOra)
}
