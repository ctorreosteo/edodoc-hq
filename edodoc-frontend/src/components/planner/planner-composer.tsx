import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  CircleCheck,
  Clock,
  Film,
  Hash,
  ImagePlus,
  Info,
  LayoutTemplate,
  Lightbulb,
  Link2,
  Loader2,
  MessageSquare,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smile,
  Sparkles,
  Star,
  Upload,
  Wand2,
  X,
  Zap,
} from 'lucide-react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { toast } from '@/lib/toast'
import { linkConUtm } from '@/lib/planner-utm'
import { socialService, type SocialCellaOrario } from '@/services/social-service'
import {
  CANALI,
  INFO_CANALE,
  NOME_FORMATO,
  PRIVACY_TIKTOK,
  PULSANTI_GOOGLE,
  chiaveDestinazione,
  controlla,
  formatoConsigliato,
  lunghezza,
  type Controllo,
} from '@/lib/planner-canali'
import { etichettaGiorno, giornoRoma, giornoSettimana, localeRoma, oggiRoma, piuGiorni } from '@/lib/planner-tempo'
import {
  messaggioErrorePlanner,
  plannerService,
  urlMedia,
  type PlannerAzione,
  type PlannerCanale,
  type PlannerDestinazione,
  type PlannerFormato,
  type PlannerHashtag,
  type PlannerMedia,
  type PlannerModalita,
  type PlannerModello,
  type PlannerOpzioni,
  type PlannerPost,
  type PlannerSlot,
  type PlannerStato,
  type PlannerConformita,
  type PlannerTestiAi,
  type PlannerTiktokCreatore,
  type PlannerTono,
} from '@/services/planner-service'
import { Anteprima } from './planner-anteprime'
import { PlannerLibreria } from './planner-libreria'
import { AvatarCanale, ChiudiFinestra, FinestraPlanner, IconaCanale } from './planner-ui'
import { durata } from '@/lib/planner-formato'

export type PresetComposer = {
  quando?: string | null
  testo?: string
  titolo?: string
  media?: PlannerMedia[]
}

type Selezione = {
  canale: PlannerCanale
  account: string | null
  formato: PlannerFormato
  modalita: PlannerModalita
  personalizzato: boolean
  testo: string
  titolo: string
  opzioni: PlannerOpzioni
}

type InCaricamento = { id: string; nome: string; frazione: number; anteprima: string | null }

const EMOJI = ['😊', '🙌', '💪', '✨', '🔥', '👉', '✅', '💚', '🙏', '📍', '📅', '🧘', '🦴', '💆', '🏃', '😴', '💡', '❤️', '👇', '⭐']
const RISCRITTURE = [
  { id: 'breve', etichetta: 'Più breve', istruzione: 'Rendilo più breve e diretto, tenendo il messaggio principale.' },
  { id: 'gancio', etichetta: 'Gancio più forte', istruzione: 'Riscrivi la prima riga con un gancio più forte che fermi lo scroll.' },
  { id: 'coinvolgente', etichetta: 'Più coinvolgente', istruzione: 'Rendilo più coinvolgente e vicino a chi legge, con una domanda finale.' },
  { id: 'professionale', etichetta: 'Più professionale', istruzione: 'Rendilo più professionale e autorevole, senza tecnicismi.' },
  { id: 'emoji', etichetta: 'Aggiungi emoji', istruzione: 'Aggiungi qualche emoji pertinente, con misura.' },
  { id: 'senza-emoji', etichetta: 'Togli le emoji', istruzione: 'Togli tutte le emoji.' },
  { id: 'correggi', etichetta: 'Correggi', istruzione: 'Correggi grammatica, punteggiatura e refusi, senza cambiare altro.' },
]
const TONI: { id: PlannerTono; etichetta: string }[] = [
  { id: 'CORDIALE', etichetta: 'Cordiale' },
  { id: 'PROFESSIONALE', etichetta: 'Professionale' },
  { id: 'EMPATICO', etichetta: 'Empatico' },
  { id: 'DIRETTO', etichetta: 'Diretto' },
  { id: 'IRONICO', etichetta: 'Leggero' },
]

const chiaveCanaliRicordati = (brandId: number) => `planner.canali.${brandId}`
const chiaveBozzaLocale = (brandId: number) => `planner.bozza.${brandId}`

function leggiJson<T>(chiave: string): T | null {
  try {
    const v = localStorage.getItem(chiave)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}

function scriviJson(chiave: string, valore: unknown) {
  try {
    if (valore == null) localStorage.removeItem(chiave)
    else localStorage.setItem(chiave, JSON.stringify(valore))
  } catch {
    /* storage non disponibile */
  }
}

function nomeGiorno(giorno: string): string {
  const oggi = oggiRoma()
  if (giorno === oggi) return 'oggi'
  if (giorno === piuGiorni(oggi, 1)) return 'domani'
  return etichettaGiorno(giorno)
}

/** Durata, dimensioni e un fotogramma (miniatura JPEG) di un video, letti nel browser prima di caricarlo. */
async function metadatiVideo(file: File): Promise<{ durata: number | null; larghezza: number | null; altezza: number | null; anteprima: Blob | null }> {
  const url = URL.createObjectURL(file)
  try {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    v.playsInline = true
    v.src = url
    await new Promise<void>((ok, ko) => {
      v.onloadedmetadata = () => ok()
      v.onerror = () => ko(new Error('video illeggibile'))
    })
    const durataS = Number.isFinite(v.duration) ? v.duration : null
    v.currentTime = Math.min(1, (durataS ?? 2) / 3)
    await new Promise<void>((ok) => {
      v.onseeked = () => ok()
      window.setTimeout(ok, 2500)
    })
    let anteprima: Blob | null = null
    if (v.videoWidth && v.videoHeight) {
      const c = document.createElement('canvas')
      const scala = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight))
      c.width = Math.round(v.videoWidth * scala)
      c.height = Math.round(v.videoHeight * scala)
      c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height)
      anteprima = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.85))
    }
    return { durata: durataS, larghezza: v.videoWidth || null, altezza: v.videoHeight || null, anteprima }
  } catch {
    return { durata: null, larghezza: null, altezza: null, anteprima: null }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function MediaOrdinabile({ m, onTogli, indice }: { m: PlannerMedia; onTogli: () => void; indice: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id })
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 2 : undefined }
  return (
    <div ref={setNodeRef} style={style} className="pl-media-tile" data-trascina={isDragging ? '' : undefined} {...attributes} {...listeners}>
      {m.tipo === 'VIDEO' ? (
        m.anteprimaUrl ? <img src={urlMedia(m.anteprimaUrl)} alt="" /> : <video src={urlMedia(m.url)} muted preload="metadata" />
      ) : (
        <img src={urlMedia(m.anteprimaUrl ?? m.url)} alt="" />
      )}
      <span className="pl-media-tile-n">{indice + 1}</span>
      {m.tipo === 'VIDEO' ? <span className="pl-media-tile-durata">{durata(m.durataSecondi) || 'Video'}</span> : null}
      <button
        type="button"
        className="pl-media-tile-togli"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onTogli}
        aria-label="Togli dal post"
        title="Togli dal post"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

export function PlannerComposer({
  aperto,
  onChiudi,
  stato,
  post,
  preset,
  onSalvato,
}: {
  aperto: boolean
  onChiudi: () => void
  stato: PlannerStato
  post: PlannerPost | null
  preset?: PresetComposer | null
  onSalvato: (p: PlannerPost, azione: PlannerAzione) => void
}) {
  const brandId = stato.brandId
  const spazio = stato.spazi.find((s) => s.id === brandId)
  const destinazioni = stato.destinazioni
  const perChiave = useMemo(() => new Map(destinazioni.map((d) => [chiaveDestinazione(d.canale, d.account), d])), [destinazioni])

  const [titolo, setTitolo] = useState('')
  const [testo, setTesto] = useState('')
  const [primoCommento, setPrimoCommento] = useState('')
  const [link, setLink] = useState('')
  const [utm, setUtm] = useState(true)
  const [modelli, setModelli] = useState<PlannerModello[] | null>(null)
  const [orariPubblico, setOrariPubblico] = useState<SocialCellaOrario[]>([])
  const [etichettaId, setEtichettaId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [responsabileId, setResponsabileId] = useState<number | null>(null)
  const [giorno, setGiorno] = useState('')
  const [ora, setOra] = useState('')
  const [media, setMedia] = useState<PlannerMedia[]>([])
  const [selezione, setSelezione] = useState<Record<string, Selezione>>({})
  const [attiva, setAttiva] = useState<string | null>(null)
  const [caricamenti, setCaricamenti] = useState<InCaricamento[]>([])
  const [salvando, setSalvando] = useState<PlannerAzione | null>(null)
  const [libreria, setLibreria] = useState(false)
  const [sporco, setSporco] = useState(false)
  const [mostraDettagli, setMostraDettagli] = useState(false)
  const [hashtag, setHashtag] = useState<PlannerHashtag[]>([])
  const [slot, setSlot] = useState<PlannerSlot[]>([])
  const [menu, setMenu] = useState<'emoji' | 'hashtag' | 'riscrivi' | 'modelli' | null>(null)
  const [riscrivendo, setRiscrivendo] = useState(false)
  const [ai, setAi] = useState({ aperto: false, idea: '', tono: 'CORDIALE' as PlannerTono, hashtag: true, emoji: true, caricamento: false, suggeriti: [] as string[] })
  const [daVideo, setDaVideo] = useState<{ caricamento: boolean; trascrizione: string | null }>({ caricamento: false, trascrizione: null })
  const [conformita, setConformita] = useState<{ esito: PlannerConformita; testo: string; chiave: string | null } | null>(null)
  const [controllando, setControllando] = useState(false)
  const [creatori, setCreatori] = useState<Record<string, PlannerTiktokCreatore | 'errore'>>({})
  const [bozzaLocale, setBozzaLocale] = useState<unknown>(null)
  const areaTesto = useRef<HTMLTextAreaElement>(null)
  const inputFile = useRef<HTMLInputElement>(null)

  // ── Apertura: dal post esistente, dal preset o dalla bozza vuota ──
  useEffect(() => {
    if (!aperto) return
    setSporco(false)
    setMenu(null)
    setAi((a) => ({ ...a, aperto: false, idea: '', suggeriti: [] }))
    setDaVideo({ caricamento: false, trascrizione: null })
    setConformita(null)
    if (post) {
      setTitolo(post.titolo ?? '')
      setTesto(post.testo ?? '')
      setPrimoCommento(post.primoCommento ?? '')
      setLink(post.link ?? '')
      setUtm(post.utm)
      setEtichettaId(post.etichettaId)
      setNote(post.note ?? '')
      setResponsabileId(post.responsabileId)
      setGiorno(post.programmatoAlle ? giornoRoma(post.programmatoAlle) : '')
      setOra(post.programmatoAlle ? localeRoma(post.programmatoAlle).slice(11) : '')
      setMedia(post.media)
      const sel: Record<string, Selezione> = {}
      for (const c of post.canali) {
        sel[chiaveDestinazione(c.canale, c.account)] = {
          canale: c.canale,
          account: c.account,
          formato: c.formato,
          modalita: c.modalita,
          personalizzato: !!c.testo,
          testo: c.testo ?? '',
          titolo: c.titolo ?? '',
          opzioni: c.opzioni ?? {},
        }
      }
      setSelezione(sel)
      setAttiva(Object.keys(sel)[0] ?? null)
      setMostraDettagli(!!(post.primoCommento || post.link || post.note || post.etichettaId || post.responsabileId))
      setBozzaLocale(null)
    } else {
      setTitolo(preset?.titolo ?? '')
      setTesto(preset?.testo ?? '')
      setPrimoCommento('')
      setLink('')
      setUtm(true)
      setEtichettaId(null)
      setNote('')
      setResponsabileId(null)
      const q = preset?.quando ?? null
      setGiorno(q ? q.slice(0, 10) : '')
      setOra(q && q.length > 10 ? q.slice(11, 16) : '')
      setMedia(preset?.media ?? [])
      const ricordati = leggiJson<string[]>(chiaveCanaliRicordati(brandId)) ?? []
      const iniziali = ricordati.filter((k) => perChiave.has(k))
      const chiavi = iniziali.length
        ? iniziali
        : destinazioni.filter((d) => d.automatica && (d.canale === 'INSTAGRAM' || d.canale === 'FACEBOOK')).map((d) => chiaveDestinazione(d.canale, d.account))
      const sel: Record<string, Selezione> = {}
      for (const k of chiavi) {
        const d = perChiave.get(k)
        if (d) sel[k] = nuovaSelezione(d, preset?.media ?? [])
      }
      setSelezione(sel)
      setAttiva(chiavi[0] ?? null)
      setMostraDettagli(false)
      setBozzaLocale(preset ? null : leggiJson(chiaveBozzaLocale(brandId)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperto, post?.id])

  useEffect(() => {
    if (!aperto) return
    void plannerService.hashtag().then(setHashtag).catch(() => undefined)
    void plannerService.slot().then(setSlot).catch(() => undefined)
    void plannerService.modelli(brandId).then(setModelli).catch(() => setModelli([]))
    // Orari migliori dal pubblico vero: le fasce in cui i contenuti della pagina Meta dello spazio rendono di più
    const pagina = destinazioni.find((d) => d.automatica && (d.canale === 'INSTAGRAM' || d.canale === 'FACEBOOK') && d.account)
    if (pagina?.account) {
      void socialService
        .panoramica(pagina.account, 28)
        .then((p) => setOrariPubblico(p.orariMigliori ?? []))
        .catch(() => setOrariPubblico([]))
    } else {
      setOrariPubblico([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperto, brandId])

  // Bozza locale dei post nuovi: se si chiude per sbaglio, la si ritrova
  useEffect(() => {
    if (!aperto || post || !sporco) return
    const id = window.setTimeout(() => {
      scriviJson(chiaveBozzaLocale(brandId), { titolo, testo, primoCommento, link, etichettaId, note, giorno, ora, media, selezione })
    }, 600)
    return () => window.clearTimeout(id)
  }, [aperto, post, sporco, brandId, titolo, testo, primoCommento, link, etichettaId, note, giorno, ora, media, selezione])

  const riprendiBozzaLocale = () => {
    const b = bozzaLocale as {
      titolo: string; testo: string; primoCommento: string; link: string; etichettaId: number | null; note: string
      giorno: string; ora: string; media: PlannerMedia[]; selezione: Record<string, Selezione>
    } | null
    if (!b) return
    setTitolo(b.titolo); setTesto(b.testo); setPrimoCommento(b.primoCommento); setLink(b.link); setEtichettaId(b.etichettaId)
    setNote(b.note); setGiorno(b.giorno); setOra(b.ora); setMedia(b.media ?? [])
    const sel = Object.fromEntries(Object.entries(b.selezione ?? {}).filter(([k]) => perChiave.has(k)))
    setSelezione(sel)
    setAttiva(Object.keys(sel)[0] ?? null)
    setBozzaLocale(null)
    setSporco(true)
  }

  const cambia = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setSporco(true)
  }

  // ── Canali ──

  function nuovaSelezione(d: PlannerDestinazione, m: PlannerMedia[]): Selezione {
    return {
      canale: d.canale,
      account: d.account,
      formato: formatoConsigliato(d.canale, m),
      modalita: d.automatica ? 'AUTOMATICA' : 'MANUALE',
      personalizzato: false,
      testo: '',
      titolo: d.canale === 'YOUTUBE' || d.canale === 'PINTEREST' ? titolo : '',
      opzioni: d.canale === 'YOUTUBE' ? { privacy: 'public' } : {},
    }
  }

  const alternaDestinazione = (d: PlannerDestinazione) => {
    const k = chiaveDestinazione(d.canale, d.account)
    setSporco(true)
    setSelezione((s) => {
      const n = { ...s }
      if (n[k]) {
        delete n[k]
        if (attiva === k) setAttiva(Object.keys(n)[0] ?? null)
      } else {
        n[k] = nuovaSelezione(d, media)
        setAttiva(k)
      }
      return n
    })
  }

  const aggiornaSel = (k: string, patch: Partial<Selezione>) => {
    setSporco(true)
    setSelezione((s) => (s[k] ? { ...s, [k]: { ...s[k], ...patch } } : s))
  }

  const aggiornaOpzione = (k: string, nome: string, valore: PlannerOpzioni[string]) => {
    setSporco(true)
    setSelezione((s) => (s[k] ? { ...s, [k]: { ...s[k], opzioni: { ...s[k].opzioni, [nome]: valore } } } : s))
  }

  // Se cambiano i media, i formati automatici si adeguano (un video su Instagram diventa reel…)
  const mediaFirma = media.map((m) => `${m.id}${m.tipo}`).join(',')
  useEffect(() => {
    setSelezione((s) => {
      let cambiato = false
      const n: Record<string, Selezione> = {}
      for (const [k, v] of Object.entries(s)) {
        const f = v.formato === 'STORIA' || v.formato === 'EVENTO' || v.formato === 'OFFERTA' ? v.formato : formatoConsigliato(v.canale, media)
        if (f !== v.formato) cambiato = true
        n[k] = f !== v.formato ? { ...v, formato: f } : v
      }
      return cambiato ? n : s
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaFirma])

  // TikTok collegato: cosa permette l'account (privacy, durata), da mostrare prima di pubblicare
  useEffect(() => {
    for (const s of Object.values(selezione)) {
      if (s.canale === 'TIKTOK' && s.modalita === 'AUTOMATICA' && s.account && !creatori[s.account]) {
        const id = s.account
        setCreatori((c) => ({ ...c, [id]: 'errore' }))
        void plannerService
          .creatoreTiktok(id)
          .then((info) => setCreatori((c) => ({ ...c, [id]: info })))
          .catch(() => setCreatori((c) => ({ ...c, [id]: 'errore' })))
      }
    }
  }, [selezione, creatori])

  const chiavi = Object.keys(selezione)
  const selAttiva = attiva ? selezione[attiva] : null
  const destAttiva = attiva ? perChiave.get(attiva) ?? null : null

  const testoDi = useCallback((s: Selezione) => (s.personalizzato ? s.testo : testo), [testo])

  const controlli = useMemo(() => {
    const out: Record<string, Controllo[]> = {}
    for (const [k, s] of Object.entries(selezione)) {
      const c = controlla({
        canale: s.canale,
        formato: s.formato,
        testo: testoDi(s),
        titolo: s.titolo,
        media,
        link,
        opzioni: s.opzioni,
        manuale: s.modalita === 'MANUALE',
      })
      if (s.canale === 'TIKTOK' && s.modalita === 'AUTOMATICA') {
        const info = s.account ? creatori[s.account] : undefined
        if (!s.opzioni.privacy) c.unshift({ livello: 'errore', testo: 'Scegli chi può vedere il post su TikTok.' })
        if (info && info !== 'errore' && info.durataMassimaSecondi && (media[0]?.durataSecondi ?? 0) > info.durataMassimaSecondi)
          c.unshift({ livello: 'errore', testo: `Questo account TikTok pubblica video fino a ${Math.round(info.durataMassimaSecondi / 60)} minuti.` })
      }
      out[k] = c
    }
    return out
  }, [selezione, testoDi, media, link, creatori])

  const errori = Object.entries(controlli).flatMap(([k, l]) =>
    l.filter((c) => c.livello === 'errore').map((c) => ({ chiave: k, testo: c.testo })),
  )
  const avvisi = Object.values(controlli).flat().filter((c) => c.livello === 'avviso').length

  // ── Media ──

  const sensori = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const suTrascinaMedia = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    setMedia((m) => {
      const da = m.findIndex((x) => x.id === e.active.id)
      const a = m.findIndex((x) => x.id === e.over!.id)
      return arrayMove(m, da, a)
    })
    setSporco(true)
  }

  const carica = async (files: FileList | File[]) => {
    const lista = [...files].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (!lista.length) {
      toast.error('Carica immagini (JPG, PNG) o video (MP4, MOV).')
      return
    }
    for (const f of lista) {
      const id = `${Date.now()}-${Math.random()}`
      const anteprimaLocale = f.type.startsWith('image/') ? URL.createObjectURL(f) : null
      setCaricamenti((c) => [...c, { id, nome: f.name, frazione: 0, anteprima: anteprimaLocale }])
      try {
        const extra = f.type.startsWith('video/') ? await metadatiVideo(f) : {}
        const m = await plannerService.caricaMedia(f, extra, (fr) =>
          setCaricamenti((c) => c.map((x) => (x.id === id ? { ...x, frazione: fr } : x))),
        )
        setMedia((cur) => [...cur, m])
        setSporco(true)
      } catch (err) {
        toast.error(`${f.name}: ${messaggioErrorePlanner(err, 'caricamento non riuscito')}`)
      } finally {
        if (anteprimaLocale) URL.revokeObjectURL(anteprimaLocale)
        setCaricamenti((c) => c.filter((x) => x.id !== id))
      }
    }
  }

  // ── Testo: emoji, hashtag, AI ──

  const inserisci = (frammento: string, inCoda = false) => {
    const k = selAttiva?.personalizzato ? attiva : null
    const attuale = k ? selezione[k].testo : testo
    const el = areaTesto.current
    let nuovo: string
    let cursore: number
    if (!inCoda && el && document.activeElement === el) {
      const a = el.selectionStart ?? attuale.length
      const b = el.selectionEnd ?? attuale.length
      nuovo = attuale.slice(0, a) + frammento + attuale.slice(b)
      cursore = a + frammento.length
    } else {
      nuovo = attuale.trimEnd() + (attuale.trim() ? (inCoda ? '\n\n' : ' ') : '') + frammento
      cursore = nuovo.length
    }
    if (k) aggiornaSel(k, { testo: nuovo })
    else cambia(setTesto)(nuovo)
    window.requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(cursore, cursore)
    })
  }

  const usaGruppo = (g: PlannerHashtag) => {
    inserisci(g.hashtag.split(/\s+/).filter(Boolean).map((h) => `#${h}`).join(' '), true)
    void plannerService.usaHashtag(g.id)
    setMenu(null)
  }

  const riscrivi = async (istruzione: string) => {
    const k = selAttiva?.personalizzato ? attiva : null
    const attuale = k ? selezione[k].testo : testo
    if (!attuale.trim()) {
      toast.error('Scrivi prima un testo da riscrivere.')
      return
    }
    setMenu(null)
    setRiscrivendo(true)
    try {
      const nuovo = await plannerService.riscriviAi({ testo: attuale, canale: k ? selezione[k].canale : null, istruzione })
      if (k) aggiornaSel(k, { testo: nuovo })
      else cambia(setTesto)(nuovo)
      toast.success('Testo riscritto', { description: 'Puoi annullare con ⌘Z / Ctrl+Z nel campo.' })
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Riscrittura non riuscita'))
    } finally {
      setRiscrivendo(false)
    }
  }

  const generaTesti = async () => {
    const canali = [...new Set(Object.values(selezione).map((s) => s.canale))]
    if (!canali.length) {
      toast.error('Scegli prima i canali.')
      return
    }
    if (!ai.idea.trim() && !testo.trim()) {
      toast.error("Descrivi l'idea del post.")
      return
    }
    setAi((a) => ({ ...a, caricamento: true }))
    try {
      const r = await plannerService.testiAi({ brandId, idea: ai.idea, testo, canali, tono: ai.tono, hashtag: ai.hashtag, emoji: ai.emoji })
      applicaTestiAi(r, canali)
      if (!titolo.trim() && ai.idea.trim()) setTitolo(ai.idea.trim().slice(0, 80))
      setAi((a) => ({ ...a, caricamento: false, suggeriti: r.hashtag }))
      toast.success('Testi pronti per ogni canale', { description: 'Rileggili: è pubblicità sanitaria, la responsabilità è nostra.' })
    } catch (err) {
      setAi((a) => ({ ...a, caricamento: false }))
      toast.error(messaggioErrorePlanner(err, 'Testi non generati'))
    }
  }

  // ── Modelli ──

  const applicaModello = (m: PlannerModello) => {
    const c = m.contenuto
    if (c.titolo != null) setTitolo(c.titolo ?? '')
    if (c.testo != null) setTesto(c.testo ?? '')
    if (c.primoCommento != null) setPrimoCommento(c.primoCommento ?? '')
    if (c.link != null) setLink(c.link ?? '')
    if (c.utm != null) setUtm(c.utm)
    if (c.etichettaId !== undefined && (c.etichettaId == null || stato.etichette.some((e) => e.id === c.etichettaId))) setEtichettaId(c.etichettaId ?? null)
    if (c.note != null) setNote(c.note ?? '')
    const sel: Record<string, Selezione> = {}
    for (const k of c.canali ?? []) {
      // Account del modello se è in questo spazio, altrimenti il primo account dello stesso canale
      const d = perChiave.get(chiaveDestinazione(k.canale, k.account)) ?? destinazioni.find((x) => x.canale === k.canale)
      if (!d) continue
      const chiave = chiaveDestinazione(d.canale, d.account)
      sel[chiave] = {
        canale: d.canale,
        account: d.account,
        formato: d.formati.includes(k.formato) ? k.formato : formatoConsigliato(d.canale, media),
        modalita: d.automatica && k.modalita !== 'MANUALE' ? 'AUTOMATICA' : 'MANUALE',
        personalizzato: !!k.testo,
        testo: k.testo ?? '',
        titolo: k.titolo ?? '',
        opzioni: k.opzioni ?? {},
      }
    }
    if (Object.keys(sel).length) {
      setSelezione(sel)
      setAttiva(Object.keys(sel)[0])
    }
    setMostraDettagli(!!(c.primoCommento || c.link || c.note || c.etichettaId))
    setMenu(null)
    setSporco(true)
    void plannerService.usaModello(m.id)
    toast.success(`Modello «${m.nome}» applicato`)
  }

  const salvaComeModello = async () => {
    const nome = window.prompt('Nome del modello (es. «Consiglio della settimana»)', titolo || '')
    if (!nome?.trim()) return
    const perTutti = window.confirm('Usarlo in tutti gli spazi? (Annulla = solo in questo spazio)')
    try {
      const m = await plannerService.salvaModello({
        brandId,
        nome: nome.trim(),
        perTuttiGliSpazi: perTutti,
        contenuto: {
          titolo: titolo || null,
          testo: testo || null,
          primoCommento: primoCommento || null,
          link: link || null,
          utm,
          etichettaId,
          note: note || null,
          canali: Object.values(selezione).map((x) => ({
            canale: x.canale,
            account: x.account,
            formato: x.formato,
            modalita: x.modalita,
            testo: x.personalizzato ? x.testo : null,
            titolo: x.titolo || null,
            opzioni: x.opzioni,
          })),
        },
      })
      setModelli((l) => [m, ...(l ?? [])])
      toast.success('Modello salvato', { description: 'Lo trovi nel menu Modelli del composer.' })
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Modello non salvato'))
    }
  }

  const eliminaModello = async (m: PlannerModello) => {
    if (!window.confirm(`Eliminare il modello «${m.nome}»?`)) return
    try {
      await plannerService.eliminaModello(m.id)
      setModelli((l) => (l ?? []).filter((x) => x.id !== m.id))
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Modello non eliminato'))
    }
  }

  /** Il testo base è quello del primo canale scelto; gli altri canali con un testo diverso diventano personalizzati. */
  function applicaTestiAi(r: PlannerTestiAi, canali: PlannerCanale[]) {
    const primo = canali.find((c) => r.testi[c]) ?? canali[0]
    const base = r.testi[primo] ?? ''
    setTesto(base)
    setSelezione((s) => {
      const n: Record<string, Selezione> = {}
      for (const [k, v] of Object.entries(s)) {
        const t = r.testi[v.canale]
        const tit = r.titoli[v.canale]
        n[k] = { ...v, personalizzato: !!t && t !== base, testo: t && t !== base ? t : v.testo, titolo: tit || v.titolo }
      }
      return n
    })
    setConformita(null)
    setSporco(true)
  }

  const videoDelPost = media.find((m) => m.tipo === 'VIDEO') ?? null

  /** Ascolta il video (trascrizione) e scrive i testi dei canali da quello che si dice. */
  const testiDalVideo = async () => {
    const canali = [...new Set(Object.values(selezione).map((x) => x.canale))]
    if (!videoDelPost || !canali.length) {
      toast.error(!videoDelPost ? 'Aggiungi prima un video.' : 'Scegli prima i canali.')
      return
    }
    setDaVideo({ caricamento: true, trascrizione: null })
    try {
      const r = await plannerService.testiDaVideo({ brandId, mediaId: videoDelPost.id, canali, tono: ai.tono, hashtag: ai.hashtag, emoji: ai.emoji })
      applicaTestiAi(r.testi, canali)
      setAi((a) => ({ ...a, suggeriti: r.testi.hashtag }))
      setDaVideo({ caricamento: false, trascrizione: r.trascrizione })
      toast.success('Testi scritti da quello che si dice nel video', { description: 'La trascrizione è sotto, se vuoi ricontrollarla.' })
    } catch (err) {
      setDaVideo({ caricamento: false, trascrizione: null })
      toast.error(messaggioErrorePlanner(err, 'Testi non generati dal video'))
    }
  }

  /** Controllo di conformità (pubblicità sanitaria) del testo che si sta guardando. */
  const controllaConformita = async () => {
    const k = selAttiva?.personalizzato ? attiva : null
    const t = k ? selezione[k].testo : testo
    if (!t.trim()) {
      toast.error('Scrivi prima il testo.')
      return
    }
    setControllando(true)
    try {
      const esito = await plannerService.conformita(t, k ? selezione[k].canale : null)
      setConformita({ esito, testo: t, chiave: k })
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Controllo non riuscito'))
    } finally {
      setControllando(false)
    }
  }

  const usaTestoCorretto = () => {
    if (!conformita?.esito.testoCorretto) return
    if (conformita.chiave) aggiornaSel(conformita.chiave, { testo: conformita.esito.testoCorretto })
    else cambia(setTesto)(conformita.esito.testoCorretto)
    setConformita({ ...conformita, esito: { ...conformita.esito, esito: 'OK', problemi: [], testoCorretto: null }, testo: conformita.esito.testoCorretto })
    toast.success('Testo corretto applicato')
  }

  // ── Orario ──

  const quando = giorno && ora ? `${giorno}T${ora}` : null
  const slotDelGiorno = giorno ? slot.filter((s) => s.giorno === giornoSettimana(giorno)).map((s) => s.ora) : []
  // Le 3 fasce che rendono di più (almeno 2 contenuti), alla prossima occorrenza da adesso
  const orariMigliori = useMemo(() => {
    const oggi = oggiRoma()
    const oraAdesso = localeRoma(new Date()).slice(11)
    return [...orariPubblico]
      .filter((c) => c.contenuti >= 2 && c.punteggio > 0)
      .sort((a, b) => b.punteggio - a.punteggio)
      .slice(0, 3)
      .map((c) => {
        let g = oggi
        const hh = `${String(c.ora).padStart(2, '0')}:00`
        while (giornoSettimana(g) !== c.giorno || (g === oggi && hh <= oraAdesso)) g = piuGiorni(g, 1)
        return { giorno: g, ora: hh, punteggio: c.punteggio }
      })
  }, [orariPubblico])
  const prossimoLibero = async () => {
    try {
      const q = await plannerService.prossimoSlot(brandId)
      cambia(setGiorno)(q.slice(0, 10))
      setOra(q.slice(11, 16))
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Nessun orario libero'))
    }
  }

  // ── Salvataggio ──

  const serveApprovazione = stato.approvazioneObbligatoria && !stato.puoApprovare && !post?.approvatoIl

  const salva = async (azione: PlannerAzione) => {
    if ((azione === 'PROGRAMMA' || azione === 'PUBBLICA_ORA' || azione === 'APPROVAZIONE') && errori.length) {
      setAttiva(errori[0].chiave)
      toast.error('Prima sistema i problemi segnalati', { description: errori[0].testo })
      return
    }
    if (
      (azione === 'PROGRAMMA' || azione === 'PUBBLICA_ORA') &&
      conformita?.esito.esito === 'RISCHIO' &&
      conformita.testo === (conformita.chiave ? selezione[conformita.chiave]?.testo : testo) &&
      !window.confirm('Il controllo di conformità dice che il testo non dovrebbe uscire così. Vuoi procedere comunque?')
    ) {
      return
    }
    if (azione === 'PROGRAMMA' && !quando) {
      toast.error('Scegli giorno e ora, o usa «Prossimo orario libero».')
      return
    }
    setSalvando(azione)
    try {
      const salvato = await plannerService.salva(post?.id ?? null, {
        brandId,
        titolo: titolo.trim() || null,
        testo: testo || null,
        primoCommento: primoCommento.trim() || null,
        link: link.trim() || null,
        utm,
        etichettaId,
        note: note.trim() || null,
        responsabileId,
        programmatoAlle: quando,
        azione,
        canali: Object.values(selezione).map((s) => ({
          canale: s.canale,
          account: s.account,
          formato: s.formato,
          modalita: s.modalita,
          testo: s.personalizzato && s.testo.trim() ? s.testo : null,
          titolo: s.titolo.trim() || null,
          opzioni: Object.keys(s.opzioni).length ? s.opzioni : null,
        })),
        mediaIds: media.map((m) => m.id),
      })
      scriviJson(chiaveCanaliRicordati(brandId), Object.keys(selezione))
      if (!post) scriviJson(chiaveBozzaLocale(brandId), null)
      setSporco(false)
      onSalvato(salvato, azione)
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Post non salvato'))
    } finally {
      setSalvando(null)
    }
  }

  const chiudi = () => {
    if (sporco && !window.confirm('Chiudere senza salvare? Le modifiche andranno perse.')) return
    if (!post) scriviJson(chiaveBozzaLocale(brandId), null)
    onChiudi()
  }

  // Scorciatoie: ⌘/Ctrl+Invio programma, ⌘/Ctrl+S salva bozza
  useEffect(() => {
    if (!aperto) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'Enter') {
        e.preventDefault()
        void salva(serveApprovazione ? 'APPROVAZIONE' : 'PROGRAMMA')
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault()
        void salva(post?.stato === 'IDEA' ? 'IDEA' : 'BOZZA')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const testoMostrato = selAttiva?.personalizzato ? selAttiva.testo : testo
  const canaliPerMisura = [...new Map(Object.values(selezione).map((s) => [s.canale, s])).values()]

  return (
    <FinestraPlanner aperta={aperto} onChiudi={chiudi} titolo={post ? 'Modifica post' : 'Nuovo post'} variante="piena" chiudiConEsc>
      <div className="pl-composer" onDragOver={(e) => e.preventDefault()}>
        {/* ── Testata ── */}
        <header className="pl-composer-testa">
          <div className="pl-composer-testa-sx">
            <span className="pl-spazio-pill" style={{ '--pl-spazio': spazio?.colore ?? '#19c463' } as CSSProperties}>
              <span className="pl-spazio-dot" />
              {spazio?.nome ?? 'Spazio'}
            </span>
            <input
              className="pl-composer-titolo"
              value={titolo}
              onChange={(e) => cambia(setTitolo)(e.target.value)}
              placeholder="Dai un nome al post (solo per il team)"
              maxLength={200}
              aria-label="Nome interno del post"
            />
          </div>
          <div className="pl-composer-testa-dx">
            {post?.motivoRifiuto ? (
              <span className="pl-chip" data-tono="danger" title={post.motivoRifiuto}>
                <span className="pl-chip-dot" /> Modifiche richieste
              </span>
            ) : null}
            <div className="pl-menu-ancora">
              <button type="button" className="pl-btn" data-variante="mini-ghost" onClick={() => setMenu(menu === 'modelli' ? null : 'modelli')} aria-expanded={menu === 'modelli'}>
                <LayoutTemplate className="size-4" /> Modelli
              </button>
              {menu === 'modelli' ? (
                <div className="pl-pop pl-pop-lista pl-pop-giu" role="menu">
                  <div className="pl-pop-titolo">Parti da un modello</div>
                  {modelli == null ? <div className="pl-pop-vuoto">Carico…</div> : null}
                  {modelli?.length === 0 ? <div className="pl-pop-vuoto">Nessun modello: salva questo post come primo.</div> : null}
                  {modelli?.map((m) => (
                    <div key={m.id} className="pl-pop-riga">
                      <button type="button" onClick={() => applicaModello(m)} role="menuitem">
                        <b>{m.nome}</b>
                        <span>
                          {(m.contenuto.canali ?? []).length} canali{m.brandId == null ? ' · tutti gli spazi' : ''}{m.usi ? ` · usato ${m.usi} volte` : ''}
                        </span>
                      </button>
                      <button type="button" className="pl-pop-x" onClick={() => void eliminaModello(m)} aria-label={`Elimina ${m.nome}`}>
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="pl-pop-azione" onClick={() => void salvaComeModello()} role="menuitem">
                    <b>+ Salva questo post come modello</b>
                  </button>
                </div>
              ) : null}
            </div>
            <span className="pl-kbd-hint" aria-hidden>
              <kbd>⌘</kbd>
              <kbd>↵</kbd> programma
            </span>
            <ChiudiFinestra onClick={chiudi} />
          </div>
        </header>

        {post?.motivoRifiuto ? (
          <div className="pl-banner" data-tono="danger">
            <AlertTriangle className="size-4" />
            <span>
              <b>Da rivedere:</b> {post.motivoRifiuto}
            </span>
          </div>
        ) : null}
        {bozzaLocale ? (
          <div className="pl-banner" data-tono="info">
            <Info className="size-4" />
            <span>C'è un post che stavi scrivendo e non hai salvato.</span>
            <button type="button" className="pl-btn" data-variante="mini" onClick={riprendiBozzaLocale}>
              Riprendilo
            </button>
            <button
              type="button"
              className="pl-btn"
              data-variante="mini-ghost"
              onClick={() => {
                scriviJson(chiaveBozzaLocale(brandId), null)
                setBozzaLocale(null)
              }}
            >
              Scarta
            </button>
          </div>
        ) : null}

        <div className="pl-composer-corpo">
          {/* ── Colonna editor ── */}
          <div className="pl-composer-editor">
            {/* Destinazioni */}
            <section className="pl-sezione">
              <div className="pl-sezione-testa">
                <span className="pl-sezione-titolo">Dove pubblicare</span>
                <span className="pl-sezione-nota">{chiavi.length ? `${chiavi.length} selezionati` : 'Scegli uno o più canali'}</span>
              </div>
              <div className="pl-destinazioni">
                {CANALI.flatMap((c) => destinazioni.filter((d) => d.canale === c)).map((d) => {
                  const k = chiaveDestinazione(d.canale, d.account)
                  const on = !!selezione[k]
                  return (
                    <button
                      key={k}
                      type="button"
                      className="pl-dest"
                      data-on={on ? '' : undefined}
                      data-manuale={!d.automatica ? '' : undefined}
                      style={{ '--pl-c': INFO_CANALE[d.canale].colore } as CSSProperties}
                      onClick={() => alternaDestinazione(d)}
                      aria-pressed={on}
                      title={d.automatica ? `${d.nome}: si pubblica da solo all'ora` : d.motivo ?? 'Si pubblica a mano'}
                    >
                      <AvatarCanale canale={d.canale} immagine={d.immagine} nome={d.nome} dimensione="sm" />
                      <span className="pl-dest-testi">
                        <span className="pl-dest-nome">{d.nome}</span>
                        <span className="pl-dest-tipo">{d.automatica ? 'Automatico' : 'A mano'}</span>
                      </span>
                      <span className="pl-dest-check" aria-hidden>
                        <Check className="size-3" />
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Editor del testo */}
            <section className="pl-sezione pl-editor-card">
              {chiavi.length > 0 ? (
                <div className="pl-editor-tabs" role="tablist" aria-label="Testo per canale">
                  <button type="button" role="tab" aria-selected={!selAttiva?.personalizzato} className="pl-editor-tab" data-on={!selAttiva?.personalizzato ? '' : undefined} onClick={() => {
                    const base = Object.entries(selezione).find(([, s]) => !s.personalizzato)?.[0]
                    if (base) setAttiva(base)
                    else if (attiva) aggiornaSel(attiva, { personalizzato: false })
                  }}>
                    Testo per tutti
                  </button>
                  {Object.entries(selezione).filter(([, s]) => s.personalizzato).map(([k, s]) => (
                    <button key={k} type="button" role="tab" aria-selected={attiva === k} className="pl-editor-tab" data-on={attiva === k ? '' : undefined} onClick={() => setAttiva(k)}>
                      <IconaCanale canale={s.canale} className="size-3" /> {perChiave.get(k)?.nome ?? INFO_CANALE[s.canale].nome}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="pl-editor-area" data-riscrive={riscrivendo ? '' : undefined}>
                <textarea
                  ref={areaTesto}
                  value={testoMostrato}
                  onChange={(e) => {
                    if (selAttiva?.personalizzato && attiva) aggiornaSel(attiva, { testo: e.target.value })
                    else cambia(setTesto)(e.target.value)
                  }}
                  onDrop={(e) => {
                    if (e.dataTransfer.files.length) {
                      e.preventDefault()
                      void carica(e.dataTransfer.files)
                    }
                  }}
                  placeholder={selAttiva?.personalizzato ? `Testo solo per ${destAttiva?.nome ?? ''}…` : 'Cosa vuoi raccontare? Scrivi qui, o fatti aiutare dall’AI.'}
                  rows={9}
                  aria-label="Testo del post"
                />
                {riscrivendo ? (
                  <div className="pl-editor-velo">
                    <Loader2 className="size-5 animate-spin" /> L'AI sta riscrivendo…
                  </div>
                ) : null}
              </div>
              <div className="pl-editor-barra">
                <div className="pl-editor-strumenti">
                  <div className="pl-menu-ancora">
                    <button type="button" className="pl-tool" onClick={() => setMenu(menu === 'emoji' ? null : 'emoji')} aria-expanded={menu === 'emoji'} title="Emoji">
                      <Smile className="size-4" />
                    </button>
                    {menu === 'emoji' ? (
                      <div className="pl-pop pl-pop-emoji" role="menu">
                        {EMOJI.map((e) => (
                          <button key={e} type="button" onClick={() => inserisci(e)} role="menuitem">
                            {e}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="pl-menu-ancora">
                    <button type="button" className="pl-tool" onClick={() => setMenu(menu === 'hashtag' ? null : 'hashtag')} aria-expanded={menu === 'hashtag'} title="Gruppi di hashtag">
                      <Hash className="size-4" />
                    </button>
                    {menu === 'hashtag' ? (
                      <div className="pl-pop pl-pop-lista" role="menu">
                        <div className="pl-pop-titolo">Gruppi di hashtag</div>
                        {hashtag.length === 0 ? <div className="pl-pop-vuoto">Nessun gruppo: creali nelle impostazioni.</div> : null}
                        {hashtag.map((g) => (
                          <button key={g.id} type="button" onClick={() => usaGruppo(g)} role="menuitem">
                            <b>{g.nome}</b>
                            <span>{g.hashtag.split(/\s+/).slice(0, 6).map((h) => `#${h}`).join(' ')}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {stato.aiDisponibile ? (
                    <div className="pl-menu-ancora">
                      <button type="button" className="pl-tool" data-ai="" onClick={() => setMenu(menu === 'riscrivi' ? null : 'riscrivi')} aria-expanded={menu === 'riscrivi'} title="Riscrivi con l'AI">
                        <Wand2 className="size-4" />
                        <span>Riscrivi</span>
                      </button>
                      {menu === 'riscrivi' ? (
                        <div className="pl-pop pl-pop-lista" role="menu">
                          {RISCRITTURE.map((r) => (
                            <button key={r.id} type="button" onClick={() => void riscrivi(r.istruzione)} role="menuitem">
                              <b>{r.etichetta}</b>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {stato.aiDisponibile ? (
                    <button type="button" className="pl-tool" onClick={() => void controllaConformita()} disabled={controllando} title="Controlla il testo con le regole della pubblicità sanitaria">
                      {controllando ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                      <span>Conformità</span>
                    </button>
                  ) : null}
                  {selAttiva && attiva ? (
                    <label className="pl-switch-mini" title="Un testo diverso solo per questo canale">
                      <input
                        type="checkbox"
                        checked={selAttiva.personalizzato}
                        onChange={(e) => aggiornaSel(attiva, { personalizzato: e.target.checked, testo: e.target.checked && !selAttiva.testo ? testo : selAttiva.testo })}
                      />
                      <span>Personalizza per {destAttiva?.nome ?? INFO_CANALE[selAttiva.canale].nome}</span>
                    </label>
                  ) : null}
                </div>
                <div className="pl-contatori" aria-label="Caratteri per canale">
                  {canaliPerMisura.map((s) => {
                    const max = INFO_CANALE[s.canale].maxTesto
                    const n = lunghezza(testoDi(s))
                    const frazione = Math.min(1, n / max)
                    return (
                      <span key={s.canale} className="pl-contatore" data-stato={n > max ? 'oltre' : frazione > 0.9 ? 'vicino' : undefined} title={`${INFO_CANALE[s.canale].nome}: ${n} / ${max.toLocaleString('it-IT')}`}>
                        <IconaCanale canale={s.canale} className="size-3" />
                        <span className="pl-contatore-anello" style={{ '--pl-frazione': frazione } as CSSProperties} />
                        {max < 10000 ? <span className="pl-contatore-n">{max - n}</span> : null}
                      </span>
                    )
                  })}
                </div>
              </div>
            </section>

            {conformita ? (
              <section className="pl-sezione pl-conformita" data-esito={conformita.esito.esito}>
                <div className="pl-conformita-testa">
                  {conformita.esito.esito === 'OK' ? <ShieldCheck className="size-5" /> : <ShieldAlert className="size-5" />}
                  <b>
                    {conformita.esito.esito === 'OK'
                      ? 'Il testo rispetta le regole della pubblicità sanitaria'
                      : conformita.esito.esito === 'RISCHIO'
                        ? 'Il testo non dovrebbe uscire così'
                        : 'Qualche formulazione da migliorare'}
                  </b>
                  {conformita.testo !== testoMostrato ? <span className="pl-sezione-nota">· il testo è cambiato dopo il controllo</span> : null}
                  <button type="button" className="pl-icon-btn" onClick={() => setConformita(null)} aria-label="Chiudi il controllo">
                    <X className="size-4" />
                  </button>
                </div>
                {conformita.esito.problemi.map((p, i) => (
                  <div key={i} className="pl-conformita-problema">
                    {p.frase ? <q>{p.frase}</q> : null}
                    <span>{p.motivo}</span>
                    {p.proposta ? (
                      <em>
                        Meglio: <b>{p.proposta}</b>
                      </em>
                    ) : null}
                  </div>
                ))}
                {conformita.esito.testoCorretto ? (
                  <div className="pl-form-riga">
                    <button type="button" className="pl-btn" data-variante="primario" onClick={usaTestoCorretto}>
                      <Check className="size-4" /> Usa il testo corretto
                    </button>
                    <span className="pl-sezione-nota">Cambia solo le frasi segnalate; puoi sempre annullare con ⌘Z nel campo.</span>
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* AI */}
            {stato.aiDisponibile ? (
              <section className="pl-sezione pl-ai" data-aperto={ai.aperto ? '' : undefined}>
                <button type="button" className="pl-ai-testa" onClick={() => setAi((a) => ({ ...a, aperto: !a.aperto }))} aria-expanded={ai.aperto}>
                  <span className="pl-ai-icona">
                    <Sparkles className="size-4" />
                  </span>
                  <span className="pl-ai-titoli">
                    <b>Scrivi con l'AI</b>
                    <span>Un'idea → il testo giusto per ogni canale scelto, con titoli e hashtag</span>
                  </span>
                  <ChevronDown className="size-4 pl-ai-freccia" />
                </button>
                {ai.aperto ? (
                  <div className="pl-ai-corpo">
                    <textarea
                      value={ai.idea}
                      onChange={(e) => setAi((a) => ({ ...a, idea: e.target.value }))}
                      rows={3}
                      placeholder="Es. 3 errori a colazione che ti fanno arrivare affamato a pranzo, con un consiglio per ciascuno"
                      aria-label="Idea del post"
                    />
                    <div className="pl-ai-opzioni">
                      <div className="pl-seg" role="radiogroup" aria-label="Tono">
                        {TONI.map((t) => (
                          <button key={t.id} type="button" role="radio" aria-checked={ai.tono === t.id} data-on={ai.tono === t.id ? '' : undefined} onClick={() => setAi((a) => ({ ...a, tono: t.id }))}>
                            {t.etichetta}
                          </button>
                        ))}
                      </div>
                      <label className="pl-switch-mini">
                        <input type="checkbox" checked={ai.hashtag} onChange={(e) => setAi((a) => ({ ...a, hashtag: e.target.checked }))} />
                        <span>Hashtag</span>
                      </label>
                      <label className="pl-switch-mini">
                        <input type="checkbox" checked={ai.emoji} onChange={(e) => setAi((a) => ({ ...a, emoji: e.target.checked }))} />
                        <span>Emoji</span>
                      </label>
                      {videoDelPost ? (
                        <button type="button" className="pl-btn" data-variante="secondario" onClick={() => void testiDalVideo()} disabled={daVideo.caricamento || ai.caricamento} title="L'AI ascolta il video e scrive i testi da quello che si dice">
                          {daVideo.caricamento ? <Loader2 className="size-4 animate-spin" /> : <Film className="size-4" />}
                          {daVideo.caricamento ? 'Ascolto il video…' : 'Dal video'}
                        </button>
                      ) : null}
                      <button type="button" className="pl-btn" data-variante="ai" onClick={() => void generaTesti()} disabled={ai.caricamento}>
                        {ai.caricamento ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                        {ai.caricamento ? 'Scrivo…' : testo.trim() ? 'Riscrivi per i canali' : 'Scrivi i testi'}
                      </button>
                    </div>
                    {daVideo.trascrizione ? (
                      <details className="pl-trascrizione">
                        <summary>Trascrizione del video</summary>
                        <p>{daVideo.trascrizione}</p>
                      </details>
                    ) : null}
                    {ai.suggeriti.length ? (
                      <div className="pl-ai-hashtag">
                        <span>Hashtag suggeriti:</span>
                        {ai.suggeriti.map((h) => (
                          <button key={h} type="button" className="pl-hashtag-chip" onClick={() => inserisci(`#${h}`)}>
                            #{h}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* Media */}
            <section
              className="pl-sezione"
              onDrop={(e) => {
                e.preventDefault()
                if (e.dataTransfer.files.length) void carica(e.dataTransfer.files)
              }}
            >
              <div className="pl-sezione-testa">
                <span className="pl-sezione-titolo">Immagini e video</span>
                <span className="pl-sezione-nota">{media.length ? `${media.length} · trascina per riordinare` : 'Trascina qui i file'}</span>
              </div>
              <div className="pl-media-riga">
                <DndContext sensors={sensori} collisionDetection={closestCenter} onDragEnd={suTrascinaMedia}>
                  <SortableContext items={media.map((m) => m.id)} strategy={horizontalListSortingStrategy}>
                    {media.map((m, i) => (
                      <MediaOrdinabile
                        key={m.id}
                        m={m}
                        indice={i}
                        onTogli={() => {
                          setMedia((cur) => cur.filter((x) => x.id !== m.id))
                          setSporco(true)
                        }}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                {caricamenti.map((c) => (
                  <div key={c.id} className="pl-media-tile" data-carica="">
                    {c.anteprima ? <img src={c.anteprima} alt="" /> : null}
                    <span className="pl-media-progresso">
                      <span style={{ width: `${Math.round(c.frazione * 100)}%` }} />
                    </span>
                    <span className="pl-media-tile-durata">{Math.round(c.frazione * 100)}%</span>
                  </div>
                ))}
                <button type="button" className="pl-media-aggiungi" onClick={() => inputFile.current?.click()}>
                  <Upload className="size-5" />
                  <span>Carica</span>
                </button>
                <button type="button" className="pl-media-aggiungi" onClick={() => setLibreria(true)}>
                  <ImagePlus className="size-5" />
                  <span>Libreria</span>
                </button>
                <input
                  ref={inputFile}
                  type="file"
                  accept="image/jpeg,image/png,video/mp4,video/quicktime"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files) void carica(e.target.files)
                    e.target.value = ''
                  }}
                />
              </div>
            </section>

            {/* Opzioni del canale attivo */}
            {selAttiva && attiva && destAttiva ? (
              <OpzioniCanale
                chiave={attiva}
                sel={selAttiva}
                dest={destAttiva}
                creatore={selAttiva.account ? creatori[selAttiva.account] : undefined}
                onSel={(patch) => aggiornaSel(attiva, patch)}
                onOpzione={(n, v) => aggiornaOpzione(attiva, n, v)}
                altri={Object.entries(selezione).filter(([k]) => k !== attiva).map(([k, s]) => ({ k, s, nome: perChiave.get(k)?.nome ?? INFO_CANALE[s.canale].nome }))}
                onAttiva={setAttiva}
              />
            ) : null}

            {/* Dettagli */}
            <section className="pl-sezione">
              <button type="button" className="pl-sezione-testa pl-sezione-testa--btn" onClick={() => setMostraDettagli((v) => !v)} aria-expanded={mostraDettagli}>
                <span className="pl-sezione-titolo">Dettagli</span>
                <span className="pl-sezione-nota">Rubrica, responsabile, link, primo commento, note</span>
                <ChevronDown className="size-4" data-giu={mostraDettagli ? '' : undefined} />
              </button>
              {mostraDettagli ? (
                <div className="pl-campi">
                  <label className="pl-campo">
                    <span>Rubrica</span>
                    <div className="pl-rubriche">
                      {stato.etichette.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          className="pl-rubrica"
                          data-on={etichettaId === e.id ? '' : undefined}
                          style={{ '--pl-r': e.colore } as CSSProperties}
                          onClick={() => cambia(setEtichettaId)(etichettaId === e.id ? null : e.id)}
                          title={e.descrizione ?? e.nome}
                        >
                          <span className="pl-rubrica-dot" />
                          {e.nome}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="pl-campo">
                    <span>Responsabile</span>
                    <select value={responsabileId ?? ''} onChange={(e) => cambia(setResponsabileId)(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Nessuno (chi lo crea)</option>
                      {stato.persone.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="pl-campo pl-campo--largo">
                    <span>
                      <Link2 className="inline size-3.5" /> Link
                    </span>
                    <input type="url" value={link} onChange={(e) => cambia(setLink)(e.target.value)} placeholder="https://www.edodoc.it/…" />
                  </label>
                  {link.trim() ? (
                    <div className="pl-campo pl-campo--largo">
                      <label className="pl-switch-mini" title="Le richieste arrivate da questo post si riconoscono nell'analisi funnel">
                        <input type="checkbox" checked={utm} onChange={(e) => cambia(setUtm)(e.target.checked)} />
                        <span>Traccia i clic con gli UTM (sorgente = canale)</span>
                      </label>
                      {utm && selAttiva ? (
                        <code className="pl-utm-anteprima" title="Il link come esce su questo canale">
                          {linkConUtm(link.trim(), selAttiva.canale, selAttiva.formato, titolo, post?.id ?? null, utm)}
                        </code>
                      ) : null}
                    </div>
                  ) : null}
                  <label className="pl-campo pl-campo--largo">
                    <span>
                      <MessageSquare className="inline size-3.5" /> Primo commento (Instagram e Facebook)
                    </span>
                    <textarea rows={2} value={primoCommento} onChange={(e) => cambia(setPrimoCommento)(e.target.value)} placeholder="Hashtag o link da mettere nel primo commento, subito dopo la pubblicazione" />
                  </label>
                  <label className="pl-campo pl-campo--largo">
                    <span>Note per il team</span>
                    <textarea rows={2} value={note} onChange={(e) => cambia(setNote)(e.target.value)} placeholder="Non si pubblicano" />
                  </label>
                </div>
              ) : null}
            </section>
          </div>

          {/* ── Colonna anteprima ── */}
          <aside className="pl-composer-anteprima" aria-label="Anteprima">
            {chiavi.length ? (
              <>
                <div className="pl-ap-tabs" role="tablist">
                  {Object.entries(selezione).map(([k, s]) => {
                    const err = (controlli[k] ?? []).some((c) => c.livello === 'errore')
                    return (
                      <button key={k} type="button" role="tab" aria-selected={attiva === k} className="pl-ap-tab" data-on={attiva === k ? '' : undefined} data-errore={err ? '' : undefined} onClick={() => setAttiva(k)} title={perChiave.get(k)?.nome}>
                        <IconaCanale canale={s.canale} className="size-4" />
                        {err ? <span className="pl-ap-tab-errore" aria-label="Da sistemare" /> : null}
                      </button>
                    )
                  })}
                </div>
                {selAttiva && destAttiva ? (
                  <div className="pl-ap-palco" key={attiva}>
                    <div className="pl-ap-etichetta">
                      {destAttiva.nome} · {NOME_FORMATO[selAttiva.formato]}
                    </div>
                    <Anteprima
                      d={{
                        canale: selAttiva.canale,
                        formato: selAttiva.formato,
                        testo: testoDi(selAttiva),
                        titolo: selAttiva.titolo,
                        media,
                        nome: destAttiva.nome,
                        immagine: destAttiva.immagine,
                        link,
                        primoCommento,
                        opzioni: selAttiva.opzioni,
                      }}
                    />
                  </div>
                ) : null}
                <div className="pl-controlli">
                  <div className="pl-controlli-testa">
                    {errori.length ? (
                      <>
                        <AlertTriangle className="size-4" data-tono="danger" /> {errori.length} {errori.length === 1 ? 'cosa da sistemare' : 'cose da sistemare'}
                      </>
                    ) : (
                      <>
                        <CircleCheck className="size-4" data-tono="ok" /> Pronto per tutti i canali{avvisi ? ` · ${avvisi} ${avvisi === 1 ? 'consiglio' : 'consigli'}` : ''}
                      </>
                    )}
                  </div>
                  {Object.entries(controlli).map(([k, l]) =>
                    l.length ? (
                      <div key={k} className="pl-controlli-gruppo">
                        <button type="button" className="pl-controlli-canale" onClick={() => setAttiva(k)}>
                          <IconaCanale canale={selezione[k].canale} className="size-3" /> {perChiave.get(k)?.nome}
                        </button>
                        {l.map((c, i) => (
                          <div key={i} className="pl-controllo" data-livello={c.livello}>
                            {c.livello === 'errore' ? <AlertTriangle className="size-3.5" /> : c.livello === 'avviso' ? <Lightbulb className="size-3.5" /> : <Info className="size-3.5" />}
                            <span>{c.testo}</span>
                          </div>
                        ))}
                      </div>
                    ) : null,
                  )}
                </div>
              </>
            ) : (
              <div className="pl-ap-nessuno">
                <Send className="size-6" />
                <b>Scegli dove pubblicare</b>
                <span>L'anteprima si aggiorna mentre scrivi, canale per canale.</span>
              </div>
            )}
          </aside>
        </div>

        {/* ── Piede: quando e azioni ── */}
        <footer className="pl-composer-piede">
          <div className="pl-quando">
            <CalendarClock className="size-4 pl-quando-icona" />
            <input type="date" value={giorno} min={oggiRoma()} onChange={(e) => cambia(setGiorno)(e.target.value)} aria-label="Giorno" />
            <input type="time" value={ora} onChange={(e) => cambia(setOra)(e.target.value)} aria-label="Ora" step={300} />
            <div className="pl-quando-chips">
              <button type="button" className="pl-quando-chip" data-forte="" onClick={() => void prossimoLibero()} title="Il primo orario libero della coda">
                <Zap className="size-3" /> Prossimo libero
              </button>
              {orariMigliori.map((m) => (
                <button
                  key={`${m.giorno}${m.ora}`}
                  type="button"
                  className="pl-quando-chip"
                  data-stella=""
                  data-on={giorno === m.giorno && ora === m.ora ? '' : undefined}
                  onClick={() => {
                    cambia(setGiorno)(m.giorno)
                    setOra(m.ora)
                  }}
                  title={`Il tuo pubblico interagisce di più in questa fascia: ${m.punteggio.toLocaleString('it-IT')} interazioni medie per contenuto`}
                >
                  <Star className="size-3" /> {nomeGiorno(m.giorno)} {m.ora}
                </button>
              ))}
              {slotDelGiorno.map((o) => (
                <button key={o} type="button" className="pl-quando-chip" data-on={ora === o ? '' : undefined} onClick={() => cambia(setOra)(o)}>
                  <Clock className="size-3" /> {o}
                </button>
              ))}
              {!giorno ? (
                <button
                  type="button"
                  className="pl-quando-chip"
                  onClick={() => {
                    cambia(setGiorno)(piuGiorni(oggiRoma(), 1))
                    setOra('12:30')
                  }}
                >
                  Domani 12:30
                </button>
              ) : null}
            </div>
            {quando ? <span className="pl-quando-riepilogo">{etichettaGiorno(giorno)} · {ora}</span> : <span className="pl-quando-riepilogo" data-vuoto="">Senza data: va fra le bozze</span>}
          </div>
          <div className="pl-azioni">
            {!post || post.stato === 'IDEA' || post.stato === 'BOZZA' ? (
              <button type="button" className="pl-btn" data-variante="ghost" onClick={() => void salva('IDEA')} disabled={!!salvando} title="Salva fra le idee, anche incompleto">
                {salvando === 'IDEA' ? <Loader2 className="size-4 animate-spin" /> : <Lightbulb className="size-4" />}
                Idea
              </button>
            ) : null}
            <button type="button" className="pl-btn" data-variante="secondario" onClick={() => void salva(post?.stato === 'IDEA' ? 'IDEA' : 'BOZZA')} disabled={!!salvando} title="⌘S">
              {salvando === 'BOZZA' ? <Loader2 className="size-4 animate-spin" /> : null}
              {post?.stato === 'PROGRAMMATO' ? 'Salva' : 'Salva bozza'}
            </button>
            {!serveApprovazione ? (
              <button type="button" className="pl-btn" data-variante="secondario" onClick={() => void salva('PUBBLICA_ORA')} disabled={!!salvando || errori.length > 0 || chiavi.length === 0}>
                {salvando === 'PUBBLICA_ORA' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Pubblica ora
              </button>
            ) : null}
            {!stato.puoApprovare ? (
              <button type="button" className="pl-btn" data-variante={serveApprovazione ? 'primario' : 'secondario'} onClick={() => void salva('APPROVAZIONE')} disabled={!!salvando || chiavi.length === 0}>
                {salvando === 'APPROVAZIONE' ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Chiedi approvazione
              </button>
            ) : null}
            {!serveApprovazione ? (
              <button type="button" className="pl-btn" data-variante="primario" onClick={() => void salva('PROGRAMMA')} disabled={!!salvando || chiavi.length === 0}>
                {salvando === 'PROGRAMMA' ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}
                {quando ? `Programma · ${nomeGiorno(giorno)} ${ora}` : 'Programma'}
              </button>
            ) : null}
          </div>
        </footer>
      </div>

      <PlannerLibreria
        modalitaScelta
        aperta={libreria}
        onChiudi={() => setLibreria(false)}
        giaScelti={media.map((m) => m.id)}
        onScegli={(scelti) => {
          setMedia((cur) => [...cur, ...scelti.filter((s) => !cur.some((c) => c.id === s.id))])
          setSporco(true)
          setLibreria(false)
        }}
      />
    </FinestraPlanner>
  )
}

/** Opzioni del canale attivo: formato, modalità, titolo e le impostazioni proprie della piattaforma. */
function OpzioniCanale({
  sel,
  dest,
  creatore,
  onSel,
  onOpzione,
  altri,
  onAttiva,
}: {
  chiave: string
  sel: Selezione
  dest: PlannerDestinazione
  creatore: PlannerTiktokCreatore | 'errore' | undefined
  onSel: (p: Partial<Selezione>) => void
  onOpzione: (nome: string, v: PlannerOpzioni[string]) => void
  altri: { k: string; s: Selezione; nome: string }[]
  onAttiva: (k: string) => void
}) {
  const info = INFO_CANALE[sel.canale]
  const o = sel.opzioni
  const testoO = (n: string) => (typeof o[n] === 'string' ? (o[n] as string) : '')
  return (
    <section className="pl-sezione pl-opzioni" style={{ '--pl-c': info.colore } as CSSProperties}>
      <div className="pl-opzioni-testa">
        <AvatarCanale canale={sel.canale} immagine={dest.immagine} nome={dest.nome} />
        <div>
          <div className="pl-sezione-titolo">{dest.nome}</div>
          <div className="pl-sezione-nota">{dest.automatica ? (sel.modalita === 'AUTOMATICA' ? 'Si pubblica da solo all’ora' : 'Scelto a mano') : dest.motivo}</div>
        </div>
        {altri.length ? (
          <div className="pl-opzioni-altri">
            {altri.map((a) => (
              <button key={a.k} type="button" onClick={() => onAttiva(a.k)} title={a.nome}>
                <IconaCanale canale={a.s.canale} className="size-3.5" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="pl-campi">
        {info.formati.length > 1 ? (
          <div className="pl-campo">
            <span>Formato</span>
            <div className="pl-seg" role="radiogroup" aria-label="Formato">
              {info.formati.map((f) => (
                <button key={f} type="button" role="radio" aria-checked={sel.formato === f} data-on={sel.formato === f ? '' : undefined} onClick={() => onSel({ formato: f })}>
                  {NOME_FORMATO[f]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {dest.automatica ? (
          <div className="pl-campo">
            <span>Pubblicazione</span>
            <div className="pl-seg" role="radiogroup" aria-label="Pubblicazione">
              <button type="button" role="radio" aria-checked={sel.modalita === 'AUTOMATICA'} data-on={sel.modalita === 'AUTOMATICA' ? '' : undefined} onClick={() => onSel({ modalita: 'AUTOMATICA' })}>
                Automatica
              </button>
              <button type="button" role="radio" aria-checked={sel.modalita === 'MANUALE'} data-on={sel.modalita === 'MANUALE' ? '' : undefined} onClick={() => onSel({ modalita: 'MANUALE' })} title="Es. per aggiungere musica o tag dall'app">
                A mano
              </button>
            </div>
          </div>
        ) : null}
        {info.titolo ? (
          <label className="pl-campo pl-campo--largo">
            <span>
              {info.titolo.etichetta}
              {info.titolo.obbligatorio ? ' *' : ''} <em>{lunghezza(sel.titolo)}/{info.titolo.max}</em>
            </span>
            <input value={sel.titolo} onChange={(e) => onSel({ titolo: e.target.value })} maxLength={info.titolo.max + 20} />
          </label>
        ) : null}

        {sel.canale === 'INSTAGRAM' && sel.formato !== 'STORIA' ? (
          <label className="pl-campo pl-campo--largo">
            <span>Collaboratori (fino a 3 username)</span>
            <input value={testoO('collaboratori')} onChange={(e) => onOpzione('collaboratori', e.target.value)} placeholder="@nome1 @nome2" />
          </label>
        ) : null}
        {sel.canale === 'INSTAGRAM' && sel.formato === 'REEL' ? (
          <label className="pl-switch-mini">
            <input type="checkbox" checked={!!o.soloReel} onChange={(e) => onOpzione('soloReel', e.target.checked)} />
            <span>Solo nella sezione Reel (non nel feed)</span>
          </label>
        ) : null}

        {sel.canale === 'YOUTUBE' ? (
          <>
            <div className="pl-campo">
              <span>Visibilità</span>
              <div className="pl-seg">
                {[
                  ['public', 'Pubblico'],
                  ['unlisted', 'Non in elenco'],
                  ['private', 'Privato'],
                ].map(([v, e]) => (
                  <button key={v} type="button" data-on={(o.privacy ?? 'public') === v ? '' : undefined} onClick={() => onOpzione('privacy', v)}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <label className="pl-campo pl-campo--largo">
              <span>Tag (separati da virgola)</span>
              <input value={testoO('tag')} onChange={(e) => onOpzione('tag', e.target.value)} placeholder="nutrizione, alimentazione, mental coaching" />
            </label>
            <label className="pl-switch-mini">
              <input type="checkbox" checked={!!o.perBambini} onChange={(e) => onOpzione('perBambini', e.target.checked)} />
              <span>Video destinato ai bambini</span>
            </label>
          </>
        ) : null}

        {sel.canale === 'GOOGLE_BUSINESS' ? (
          <>
            {sel.formato !== 'OFFERTA' ? (
              <label className="pl-campo">
                <span>Pulsante</span>
                <select value={testoO('pulsante')} onChange={(e) => onOpzione('pulsante', e.target.value || null)}>
                  <option value="">Nessuno</option>
                  {Object.entries(PULSANTI_GOOGLE).map(([v, e]) => (
                    <option key={v} value={v}>
                      {e}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {o.pulsante && o.pulsante !== 'CALL' && sel.formato !== 'OFFERTA' ? (
              <label className="pl-campo">
                <span>Link del pulsante</span>
                <input value={testoO('urlPulsante')} onChange={(e) => onOpzione('urlPulsante', e.target.value)} placeholder="Vuoto = il link del post" />
              </label>
            ) : null}
            {sel.formato !== 'AGGIORNAMENTO' ? (
              <>
                <label className="pl-campo pl-campo--largo">
                  <span>Titolo {sel.formato === 'OFFERTA' ? "dell'offerta" : "dell'evento"} *</span>
                  <input value={testoO('titoloEvento')} onChange={(e) => onOpzione('titoloEvento', e.target.value)} maxLength={58} />
                </label>
                <label className="pl-campo">
                  <span>Inizio *</span>
                  <input type="datetime-local" value={testoO('inizio')} onChange={(e) => onOpzione('inizio', e.target.value)} />
                </label>
                <label className="pl-campo">
                  <span>Fine *</span>
                  <input type="datetime-local" value={testoO('fine')} onChange={(e) => onOpzione('fine', e.target.value)} />
                </label>
              </>
            ) : null}
            {sel.formato === 'OFFERTA' ? (
              <>
                <label className="pl-campo">
                  <span>Codice sconto</span>
                  <input value={testoO('codice')} onChange={(e) => onOpzione('codice', e.target.value)} />
                </label>
                <label className="pl-campo">
                  <span>Link per riscattarla</span>
                  <input value={testoO('urlOfferta')} onChange={(e) => onOpzione('urlOfferta', e.target.value)} />
                </label>
                <label className="pl-campo pl-campo--largo">
                  <span>Termini e condizioni</span>
                  <textarea rows={2} value={testoO('condizioni')} onChange={(e) => onOpzione('condizioni', e.target.value)} />
                </label>
              </>
            ) : null}
          </>
        ) : null}

        {sel.canale === 'TIKTOK' && sel.modalita === 'AUTOMATICA' ? (
          <div className="pl-tiktok">
            {creatore && creatore !== 'errore' ? (
              <div className="pl-tiktok-account">
                {creatore.avatar ? <img src={creatore.avatar} alt="" referrerPolicy="no-referrer" /> : null}
                <span>
                  Pubblichi come <b>{creatore.nome}</b>
                  {creatore.username ? ` (@${creatore.username})` : ''}
                </span>
              </div>
            ) : creatore === 'errore' ? (
              <div className="pl-sezione-nota">Lettura dell'account TikTok in corso o non riuscita: le opzioni si verificano alla pubblicazione.</div>
            ) : null}
            <div className="pl-campo">
              <span>Chi può vederlo *</span>
              <div className="pl-seg">
                {(creatore && creatore !== 'errore' && creatore.privacy.length ? creatore.privacy : Object.keys(PRIVACY_TIKTOK)).map((p) => (
                  <button key={p} type="button" data-on={o.privacy === p ? '' : undefined} onClick={() => onOpzione('privacy', p)}>
                    {PRIVACY_TIKTOK[p] ?? p}
                  </button>
                ))}
              </div>
              {creatore && creatore !== 'errore' && creatore.privacy.length === 1 && creatore.privacy[0] === 'SELF_ONLY' ? (
                <em className="pl-nota-piccola">Finché TikTok non approva l'app del gestionale, i post escono solo privati.</em>
              ) : null}
            </div>
            <div className="pl-tiktok-switch">
              <label className="pl-switch-mini">
                <input type="checkbox" checked={!o.disattivaCommenti} disabled={creatore !== 'errore' && !!creatore?.commentiDisattivati} onChange={(e) => onOpzione('disattivaCommenti', !e.target.checked)} />
                <span>Commenti</span>
              </label>
              {sel.formato === 'VIDEO' ? (
                <>
                  <label className="pl-switch-mini">
                    <input type="checkbox" checked={!o.disattivaDuet} disabled={creatore !== 'errore' && !!creatore?.duetDisattivati} onChange={(e) => onOpzione('disattivaDuet', !e.target.checked)} />
                    <span>Duetti</span>
                  </label>
                  <label className="pl-switch-mini">
                    <input type="checkbox" checked={!o.disattivaStitch} disabled={creatore !== 'errore' && !!creatore?.stitchDisattivati} onChange={(e) => onOpzione('disattivaStitch', !e.target.checked)} />
                    <span>Stitch</span>
                  </label>
                </>
              ) : (
                <label className="pl-switch-mini">
                  <input type="checkbox" checked={o.musicaAutomatica !== false} onChange={(e) => onOpzione('musicaAutomatica', e.target.checked)} />
                  <span>Musica automatica</span>
                </label>
              )}
            </div>
            <div className="pl-tiktok-switch">
              <label className="pl-switch-mini">
                <input type="checkbox" checked={!!o.promuoveIlMioBrand} onChange={(e) => onOpzione('promuoveIlMioBrand', e.target.checked)} />
                <span>Promuove il mio brand</span>
              </label>
              <label className="pl-switch-mini">
                <input type="checkbox" checked={!!o.contenutoSponsorizzato} onChange={(e) => onOpzione('contenutoSponsorizzato', e.target.checked)} />
                <span>Contenuto sponsorizzato (per terzi)</span>
              </label>
            </div>
            <em className="pl-nota-piccola">
              Pubblicando accetti la{' '}
              <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">
                Music Usage Confirmation
              </a>{' '}
              di TikTok{o.contenutoSponsorizzato ? ' e la Branded Content Policy' : ''}.
            </em>
          </div>
        ) : null}
      </div>
      {dest.automatica === false && dest.motivo ? (
        <div className="pl-banner" data-tono="muted">
          <Info className="size-4" />
          <span>{dest.motivo}</span>
        </div>
      ) : null}
    </section>
  )
}
