import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react'
import { Plus } from 'lucide-react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import type { MailingGrafo, MailingNodo, MailingTipoNodo, MailingTipoTrigger } from '@/services/mailing-service'
import {
  ID_TRIGGER,
  NODO_ALTEZZA,
  NODO_LARGHEZZA,
  limiti,
  nodoIniziale,
  percorsoArco,
  posizioneTrigger,
  puntoIngresso,
  puntoMedio,
  puntoUscita,
  usciteDi,
  type PuntoInserimento,
  type RiassuntoNodo,
  type Ramo,
} from '@/lib/mailing-grafo'
import { CardNodo, CardTrigger, MenuInserimento, type ReportCard } from './mailing-automazioni-nodi'
import { formatCompatto } from './mailing-utils'

/*
  Tela del builder: pan (trascina lo sfondo, rotellina/trackpad), zoom (ctrl/⌘ + rotellina, pinch, pulsanti),
  griglia a puntini, nodi HTML posizionati, archi SVG (Bézier) con frecce e rami Sì/No, "+" su archi e uscite,
  minimappa. Le coordinate del mondo sono quelle del grafo (zoom 1); schermo = mondo × k + (x, y).
*/

export type TelaApi = {
  adatta: (animato?: boolean, minimo?: number) => void
  centraSu: (id: string) => void
  zoom: (fattore: number) => void
}

export type ProblemiNodo = { errori: number; avvisi: number; primo: string | null }

type Vista = { x: number; y: number; k: number }

const ZOOM_MIN = 0.25
const ZOOM_MAX = 1.75
const GRIGLIA = 24
const AGGANCIO = 8
const STUB = 54

const limita = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const aggancia = (v: number) => Math.round(v / AGGANCIO) * AGGANCIO

type Props = {
  grafo: MailingGrafo
  numeri: Map<string, number>
  riassunti: Map<string, RiassuntoNodo>
  problemi: Map<string, ProblemiNodo>
  trigger: { tipo: MailingTipoTrigger | null; descrizione: string; uscita: string; errori: number }
  selezionato: string | null
  /** Modalità risultati: numeri sui nodi, archi proporzionali al flusso, editing spento. */
  report: Map<string, ReportCard> | null
  flussi: Map<string, number> | null
  entratiTotali: number | null
  guizzi: Map<string, number>
  minimappa: boolean
  controllo: Ref<TelaApi>
  onSeleziona: (id: string | null) => void
  onSposta: (id: string, x: number, y: number, unisci?: string) => void
  onInserisci: (punto: PuntoInserimento, tipo: MailingTipoNodo) => void
  onElimina: (id: string) => void
  onVista?: (zoom: number) => void
}

type Uscita = {
  chiave: string
  da: string
  ramo: Ramo
  p: { x: number; y: number }
  /** Arco esistente (se c'è). */
  a: string | null
  d: string
  medio: { x: number; y: number }
  /** Punto del "+" (metà arco, oppure fondo del moncone libero). */
  piu: { x: number; y: number }
  flusso: number
}

export function TelaAutomazione(props: Props) {
  const {
    grafo, numeri, riassunti, problemi, trigger, selezionato, report, flussi, entratiTotali, guizzi, minimappa, controllo,
  } = props
  const solaLettura = !!report
  const idMarker = useId().replace(/:/g, '')
  const contenitore = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState({ w: 0, h: 0 })
  const [vista, setVista] = useState<Vista>({ x: 0, y: 0, k: 1 })
  const [anima, setAnima] = useState(false)
  const [trascina, setTrascina] = useState<{ id: string; x: number; y: number } | null>(null)
  const [menu, setMenu] = useState<{ punto: PuntoInserimento; x: number; y: number; consentiFine: boolean } | null>(null)

  // Ref aggiornati per i gestori stabili (le card sono memo: i callback non devono cambiare).
  const vistaRef = useRef(vista)
  const grafoRef = useRef(grafo)
  const propsRef = useRef(props)
  useLayoutEffect(() => {
    vistaRef.current = vista
    grafoRef.current = grafo
    propsRef.current = props
  })

  const riduciMovimento = useMemo(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  // ── Misura ──
  useLayoutEffect(() => {
    const el = contenitore.current
    if (!el) return
    const aggiorna = () => setDim({ w: el.clientWidth, h: el.clientHeight })
    aggiorna()
    const oss = new ResizeObserver(aggiorna)
    oss.observe(el)
    return () => oss.disconnect()
  }, [])

  const conAnimazione = useCallback(
    (v: Vista) => {
      if (!riduciMovimento) {
        setAnima(true)
        window.setTimeout(() => setAnima(false), 380)
      }
      setVista(v)
    },
    [riduciMovimento],
  )

  /** Adatta il percorso alla finestra; con `minimo` non rimpicciolisce oltre (e allinea in alto se non ci sta). */
  const adatta = useCallback(
    (animato = true, minimo = ZOOM_MIN) => {
      const el = contenitore.current
      if (!el) return
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      const L = limiti(grafoRef.current)
      const margine = w < 640 ? 24 : 72
      const k = limita(Math.min((w - margine * 2) / L.larghezza, (h - margine * 2) / L.altezza, 1), minimo, 1)
      const x = (w - L.larghezza * k) / 2 - L.x * k
      const altezzaVista = L.altezza * k
      const y = altezzaVista + margine * 2 > h ? margine - L.y * k : (h - altezzaVista) / 2 - L.y * k
      const v = { x, y, k }
      if (animato) conAnimazione(v)
      else setVista(v)
    },
    [conAnimazione],
  )

  const zoomVerso = useCallback((cx: number, cy: number, fattore: number) => {
    setVista((v) => {
      const k = limita(v.k * fattore, ZOOM_MIN, ZOOM_MAX)
      const r = k / v.k
      return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r }
    })
  }, [])

  const centraSu = useCallback(
    (id: string) => {
      const el = contenitore.current
      if (!el) return
      const g = grafoRef.current
      const n = id === ID_TRIGGER ? posizioneTrigger(g) : g.nodi.find((x) => x.id === id)
      if (!n) return
      const v = vistaRef.current
      const k = Math.max(v.k, 0.8)
      // Se il pannello laterale copre la destra, il centro utile è un po' più a sinistra: ci pensa il chiamante col ridimensionamento.
      conAnimazione({ k, x: el.clientWidth / 2 - (n.x + NODO_LARGHEZZA / 2) * k, y: el.clientHeight / 2 - (n.y + NODO_ALTEZZA / 2) * k })
    },
    [conAnimazione],
  )

  useImperativeHandle(
    controllo,
    () => ({
      adatta,
      centraSu,
      zoom: (f: number) => {
        const el = contenitore.current
        if (!el) return
        if (!riduciMovimento) {
          setAnima(true)
          window.setTimeout(() => setAnima(false), 240)
        }
        zoomVerso(el.clientWidth / 2, el.clientHeight / 2, f)
      },
    }),
    [adatta, centraSu, zoomVerso, riduciMovimento],
  )

  // Primo adattamento appena la tela ha una dimensione.
  const adattata = useRef(false)
  useEffect(() => {
    if (adattata.current || !dim.w || !dim.h) return
    adattata.current = true
    adatta(false, 0.72)
  }, [dim, adatta])

  useEffect(() => {
    props.onVista?.(vista.k)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista.k])

  // ── Rotellina: pan; con ctrl/⌘ (o pinch del trackpad) zoom verso il cursore ──
  useEffect(() => {
    const el = contenitore.current
    if (!el) return
    const suRotella = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.ml-au-minimappa')) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        zoomVerso(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0035)))
      } else {
        const molt = e.deltaMode === 1 ? 16 : 1
        setVista((v) => ({ ...v, x: v.x - e.deltaX * molt, y: v.y - e.deltaY * molt }))
      }
    }
    el.addEventListener('wheel', suRotella, { passive: false })
    return () => el.removeEventListener('wheel', suRotella)
  }, [zoomVerso])

  // ── Pan e pinch sullo sfondo ──
  const puntatori = useRef(new Map<number, { x: number; y: number }>())
  const gesto = useRef<{ tipo: 'pan' | 'pinch'; x0: number; y0: number; d0: number; v0: Vista; mosso: boolean } | null>(null)

  const suSfondoGiu = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-au-nodo],[data-au-interattivo]')) return
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return
    e.currentTarget.setPointerCapture(e.pointerId)
    puntatori.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pp = [...puntatori.current.values()]
    if (pp.length === 1) {
      gesto.current = { tipo: 'pan', x0: e.clientX, y0: e.clientY, d0: 0, v0: vistaRef.current, mosso: false }
    } else if (pp.length === 2) {
      const [a, b] = pp
      gesto.current = { tipo: 'pinch', x0: (a.x + b.x) / 2, y0: (a.y + b.y) / 2, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, v0: vistaRef.current, mosso: true }
    }
  }

  const suSfondoMuovi = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!puntatori.current.has(e.pointerId) || !gesto.current) return
    puntatori.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesto.current
    if (g.tipo === 'pan') {
      const dx = e.clientX - g.x0
      const dy = e.clientY - g.y0
      if (!g.mosso && Math.hypot(dx, dy) < 3) return
      g.mosso = true
      setVista({ ...g.v0, x: g.v0.x + dx, y: g.v0.y + dy })
    } else {
      const pp = [...puntatori.current.values()]
      if (pp.length < 2) return
      const [a, b] = pp
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const r = contenitore.current!.getBoundingClientRect()
      const cx = (a.x + b.x) / 2 - r.left
      const cy = (a.y + b.y) / 2 - r.top
      const k = limita(g.v0.k * (d / g.d0), ZOOM_MIN, ZOOM_MAX)
      const rr = k / g.v0.k
      const cx0 = g.x0 - r.left
      const cy0 = g.y0 - r.top
      setVista({ k, x: cx - (cx0 - g.v0.x) * rr, y: cy - (cy0 - g.v0.y) * rr })
    }
  }

  const suSfondoSu = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!puntatori.current.has(e.pointerId)) return
    puntatori.current.delete(e.pointerId)
    const g = gesto.current
    if (puntatori.current.size === 0) {
      if (g && g.tipo === 'pan' && !g.mosso) propsRef.current.onSeleziona(null)
      gesto.current = null
    } else if (puntatori.current.size === 1 && g?.tipo === 'pinch') {
      const [rimasto] = [...puntatori.current.values()]
      gesto.current = { tipo: 'pan', x0: rimasto.x, y0: rimasto.y, d0: 0, v0: vistaRef.current, mosso: true }
    }
  }

  // ── Trascinamento dei nodi ──
  const suNodoGiu = useCallback((e: ReactPointerEvent<HTMLDivElement>, id: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.stopPropagation()
    const nodo = id === ID_TRIGGER ? null : grafoRef.current.nodi.find((n) => n.id === id) ?? null
    const modificabile = !!nodo && !propsRef.current.report
    const x0 = e.clientX
    const y0 = e.clientY
    const k = vistaRef.current.k
    let mosso = false
    let ultima: { x: number; y: number } | null = null
    const muovi = (ev: PointerEvent) => {
      if (!modificabile || !nodo) return
      if (!mosso && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return
      mosso = true
      ultima = { x: aggancia(nodo.x + (ev.clientX - x0) / k), y: aggancia(nodo.y + (ev.clientY - y0) / k) }
      setTrascina({ id, ...ultima })
    }
    const fine = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', muovi)
      window.removeEventListener('pointerup', fine)
      window.removeEventListener('pointercancel', fine)
      if (mosso && nodo && ultima) {
        setTrascina(null)
        if (ev.type !== 'pointercancel' && (ultima.x !== nodo.x || ultima.y !== nodo.y)) propsRef.current.onSposta(id, ultima.x, ultima.y)
      } else if (ev.type === 'pointerup') {
        propsRef.current.onSeleziona(id)
      }
    }
    window.addEventListener('pointermove', muovi)
    window.addEventListener('pointerup', fine)
    window.addEventListener('pointercancel', fine)
  }, [])

  const suNodoTasto = useCallback((e: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (e.target !== e.currentTarget) return
    const p = propsRef.current
    const modificabile = id !== ID_TRIGGER && !p.report
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        p.onSeleziona(id)
        return
      case 'Escape':
        p.onSeleziona(null)
        return
      case 'Delete':
      case 'Backspace':
        if (!modificabile) return
        e.preventDefault()
        p.onElimina(id)
        return
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (!modificabile) return
        e.preventDefault()
        const n = grafoRef.current.nodi.find((x) => x.id === id)
        if (!n) return
        const passo = e.shiftKey ? 64 : 16
        const dx = e.key === 'ArrowLeft' ? -passo : e.key === 'ArrowRight' ? passo : 0
        const dy = e.key === 'ArrowUp' ? -passo : e.key === 'ArrowDown' ? passo : 0
        p.onSposta(id, n.x + dx, n.y + dy, `tastiera:${id}`)
        return
      }
      default:
    }
  }, [])

  // ── Geometria: nodi (con quello trascinato), archi, uscite libere ──
  const posizionati = useMemo<MailingNodo[]>(
    () => (trascina ? grafo.nodi.map((n) => (n.id === trascina.id ? { ...n, x: trascina.x, y: trascina.y } : n)) : grafo.nodi),
    [grafo.nodi, trascina],
  )
  const perId = useMemo(() => new Map(posizionati.map((n) => [n.id, n])), [posizionati])
  const inizio = useMemo(() => nodoIniziale({ nodi: posizionati, archi: grafo.archi }), [posizionati, grafo.archi])
  const posTrigger = useMemo(() => posizioneTrigger({ nodi: posizionati, archi: grafo.archi }), [posizionati, grafo.archi])

  const uscite = useMemo<Uscita[]>(() => {
    const out: Uscita[] = []
    // Trigger → primo nodo (o moncone se vuoto).
    const pt = { x: posTrigger.x + NODO_LARGHEZZA / 2, y: posTrigger.y + NODO_ALTEZZA }
    if (inizio) {
      const q = puntoIngresso(inizio)
      out.push({ chiave: `${ID_TRIGGER}|`, da: ID_TRIGGER, ramo: null, p: pt, a: inizio.id, d: percorsoArco(pt, q), medio: puntoMedio(pt, q), piu: puntoMedio(pt, q), flusso: flussi?.get(`${ID_TRIGGER}|`) ?? 0 })
    } else {
      const q = { x: pt.x, y: pt.y + STUB }
      out.push({ chiave: `${ID_TRIGGER}|`, da: ID_TRIGGER, ramo: null, p: pt, a: null, d: `M${pt.x},${pt.y} L${q.x},${q.y}`, medio: q, piu: q, flusso: 0 })
    }
    for (const n of posizionati) {
      for (const ramo of usciteDi(n.tipo)) {
        const p = puntoUscita(n, ramo)
        const arco = grafo.archi.find((a) => a.da === n.id && (a.ramo ?? null) === ramo && perId.has(a.a))
        const chiave = `${n.id}|${ramo ?? ''}`
        if (arco) {
          const q = puntoIngresso(perId.get(arco.a)!)
          const medio = puntoMedio(p, q)
          // Per i rami della condizione il "+" sta vicino all'uscita, così non si confonde tra i due rami.
          const piu = ramo && q.y - p.y > 80 ? { x: p.x + (q.x - p.x) * 0.1, y: p.y + 40 } : medio
          out.push({ chiave, da: n.id, ramo, p, a: arco.a, d: percorsoArco(p, q), medio, piu, flusso: flussi?.get(chiave) ?? 0 })
        } else {
          const q = { x: p.x, y: p.y + STUB }
          out.push({ chiave, da: n.id, ramo, p, a: null, d: `M${p.x},${p.y} L${q.x},${q.y}`, medio: q, piu: q, flusso: 0 })
        }
      }
    }
    return out
  }, [posizionati, perId, grafo.archi, inizio, posTrigger, flussi])

  const flussoMax = useMemo(() => Math.max(1, ...uscite.map((u) => u.flusso)), [uscite])

  const apriMenu = (u: Uscita) => {
    setMenu({ punto: { da: u.da === ID_TRIGGER ? null : u.da, ramo: u.ramo }, x: u.piu.x, y: u.piu.y, consentiFine: !u.a })
  }

  const ordineNodi = useMemo(
    () => [...posizionati].sort((a, b) => (numeri.get(a.id) ?? 0) - (numeri.get(b.id) ?? 0)),
    [posizionati, numeri],
  )
  const uscitePerNodo = useMemo(() => {
    const m = new Map<string, Uscita[]>()
    for (const u of uscite) m.set(u.da, [...(m.get(u.da) ?? []), u])
    return m
  }, [uscite])

  const etichettaPiu = (u: Uscita) => {
    const dopo = u.da === ID_TRIGGER ? 'l’inizio' : `il passo ${numeri.get(u.da) ?? ''}`
    const ramo = u.ramo === 'SI' ? ', ramo Sì' : u.ramo === 'NO' ? ', ramo No' : ''
    return `Aggiungi un passo dopo ${dopo}${ramo}`
  }

  const bottoniPiu = (lista: Uscita[] | undefined) =>
    solaLettura
      ? null
      : (lista ?? []).map((u) => (
          <button
            key={`piu-${u.chiave}`}
            type="button"
            className="ml-au-piu"
            data-au-interattivo=""
            data-libero={u.a ? undefined : ''}
            data-aperto={menu && menu.punto.da === (u.da === ID_TRIGGER ? null : u.da) && menu.punto.ramo === u.ramo ? '' : undefined}
            style={{ translate: `${u.piu.x - 14}px ${u.piu.y - 14}px` }}
            aria-label={etichettaPiu(u)}
            title="Aggiungi un passo"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apriMenu(u)}
          >
            <Plus className="size-4" aria-hidden />
          </button>
        ))

  const sfondo = {
    backgroundSize: `${GRIGLIA * vista.k}px ${GRIGLIA * vista.k}px`,
    backgroundPosition: `${vista.x}px ${vista.y}px`,
  }

  return (
    <div
      ref={contenitore}
      className="ml-au-tela"
      data-report={solaLettura ? '' : undefined}
      style={sfondo}
      onPointerDown={suSfondoGiu}
      onPointerMove={suSfondoMuovi}
      onPointerUp={suSfondoSu}
      onPointerCancel={suSfondoSu}
      onFocusCapture={(e) => {
        // Tab su una card o un "+" fuori vista: pan minimo per mostrarlo.
        const t = (e.target as HTMLElement).closest('[data-au-nodo],.ml-au-piu')
        const c = contenitore.current
        if (!t || !c) return
        const r = t.getBoundingClientRect()
        const b = c.getBoundingClientRect()
        const m = 32
        const dx = r.left < b.left + m ? b.left + m - r.left : r.right > b.right - m ? b.right - m - r.right : 0
        const dy = r.top < b.top + m ? b.top + m - r.top : r.bottom > b.bottom - m ? b.bottom - m - r.bottom : 0
        if (dx || dy) setVista((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
      }}
      onScroll={(e) => {
        // Il browser scorre la tela per mostrare l'elemento che riceve il focus (Tab): lo trasformiamo in pan.
        const el = e.currentTarget
        if (!el.scrollLeft && !el.scrollTop) return
        const dx = el.scrollLeft
        const dy = el.scrollTop
        el.scrollLeft = 0
        el.scrollTop = 0
        setVista((v) => ({ ...v, x: v.x - dx, y: v.y - dy }))
      }}
    >
      <div
        className="ml-au-mondo"
        data-anima={anima ? '' : undefined}
        style={{ transform: `translate3d(${vista.x}px, ${vista.y}px, 0) scale(${vista.k})` }}
      >
        <svg className="ml-au-archi" width="1" height="1" aria-hidden>
          <defs>
            <marker id={`${idMarker}-f`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M0,1 L9,5 L0,9 z" className="ml-au-freccia" />
            </marker>
            <marker id={`${idMarker}-fa`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M0,1 L9,5 L0,9 z" className="ml-au-freccia ml-au-freccia--attiva" />
            </marker>
          </defs>
          {uscite.map((u) => {
            const attivo = !!selezionato && (u.da === selezionato || u.a === selezionato)
            const spessore = solaLettura && u.a ? 2 + 9 * Math.sqrt(u.flusso / flussoMax) : undefined
            return (
              <g key={u.chiave} className="ml-au-arco" data-libero={u.a ? undefined : ''} data-attivo={attivo ? '' : undefined} data-ramo={u.ramo ?? undefined}>
                <path
                  d={u.d}
                  className="ml-au-arco-linea"
                  style={spessore ? { strokeWidth: spessore } : undefined}
                  markerEnd={u.a ? `url(#${idMarker}-${attivo || solaLettura ? 'fa' : 'f'})` : undefined}
                />
                {solaLettura && u.a && u.flusso > 0 && !riduciMovimento ? <Particelle d={u.d} flusso={u.flusso} p={u.p} medio={u.medio} /> : null}
              </g>
            )
          })}
        </svg>

        {uscite
          .filter((u) => u.ramo)
          .map((u) => (
            <span
              key={`r-${u.chiave}`}
              className="ml-au-ramo"
              data-ramo={u.ramo ?? undefined}
              style={{ transform: `translate3d(${u.p.x}px, ${u.p.y + 12}px, 0) translateX(-50%)` }}
              aria-hidden
            >
              {u.ramo === 'SI' ? 'Sì' : 'No'}
            </span>
          ))}

        {solaLettura
          ? uscite
              .filter((u) => u.a)
              .map((u) => (
                <span
                  key={`fl-${u.chiave}`}
                  className="ml-au-flusso"
                  style={{ transform: `translate3d(${u.medio.x}px, ${u.medio.y}px, 0) translate(-50%, -50%)` }}
                  title={`${u.flusso} persone sono passate di qui`}
                >
                  {formatCompatto(u.flusso)}
                </span>
              ))
          : null}

        <Popover open={!!menu} onOpenChange={(o) => (!o ? setMenu(null) : undefined)}>
          <PopoverAnchor asChild>
            <span className="ml-au-ancora" style={{ transform: `translate3d(${(menu?.x ?? 0) - 14}px, ${(menu?.y ?? 0) - 14}px, 0)` }} />
          </PopoverAnchor>
          <PopoverContent
            data-vl=""
            data-vl-page="mailing"
            className="ml-popover ml-au-menu-popover"
            side="right"
            align="start"
            sideOffset={10}
            collisionPadding={12}
          >
            {menu ? (
              <MenuInserimento
                consentiFine={menu.consentiFine}
                onScegli={(tipo) => {
                  const punto = menu.punto
                  setMenu(null)
                  propsRef.current.onInserisci(punto, tipo)
                }}
              />
            ) : null}
          </PopoverContent>
        </Popover>

        <CardTrigger
          x={posTrigger.x}
          y={posTrigger.y}
          tipo={trigger.tipo}
          descrizione={trigger.descrizione}
          uscita={trigger.uscita}
          selezionato={selezionato === ID_TRIGGER}
          errori={trigger.errori}
          entrati={report ? entratiTotali ?? 0 : null}
          onPointerDown={suNodoGiu}
          onKeyDown={suNodoTasto}
        />
        {bottoniPiu(uscitePerNodo.get(ID_TRIGGER))}

        {ordineNodi.map((n) => {
          const r = riassunti.get(n.id)
          const pr = problemi.get(n.id)
          return [
            <CardNodo
              key={n.id}
              id={n.id}
              tipo={n.tipo}
              x={n.x}
              y={n.y}
              numero={numeri.get(n.id) ?? 0}
              titolo={r?.titolo ?? ''}
              dettaglio={r?.dettaglio ?? ''}
              selezionato={selezionato === n.id}
              trascinato={trascina?.id === n.id}
              errori={solaLettura ? 0 : pr?.errori ?? 0}
              avvisi={solaLettura ? 0 : pr?.avvisi ?? 0}
              primoProblema={pr?.primo ?? null}
              report={report ? report.get(n.id) ?? { entrati: 0, inAttesa: 0, usciti: 0, tassoApertura: null, tassoClick: null } : null}
              guizzo={guizzi.get(n.id) ?? 0}
              onPointerDown={suNodoGiu}
              onKeyDown={suNodoTasto}
            />,
            ...(bottoniPiu(uscitePerNodo.get(n.id)) ?? []),
          ]
        })}
      </div>

      {minimappa && dim.w > 0 ? <Minimappa grafo={{ nodi: posizionati, archi: grafo.archi }} vista={vista} dim={dim} onVai={(v) => setVista(v)} /> : null}
    </div>
  )
}

/** Puntini che scorrono lungo l'arco: più persone, più puntini. */
function Particelle({ d, flusso, p, medio }: { d: string; flusso: number; p: { x: number; y: number }; medio: { x: number; y: number } }) {
  const quanti = Math.min(4, 1 + Math.floor(Math.log10(Math.max(1, flusso))))
  const lunghezza = Math.hypot(medio.x - p.x, medio.y - p.y) * 2.2
  const durata = limita(lunghezza / 70, 1.8, 6)
  return (
    <>
      {Array.from({ length: quanti }, (_, i) => (
        <circle key={i} r={3.6} className="ml-au-particella">
          <animateMotion dur={`${durata.toFixed(2)}s`} begin={`${(-(durata * i) / quanti).toFixed(2)}s`} repeatCount="indefinite" path={d} />
        </circle>
      ))}
    </>
  )
}

const MINI_L = 168
const MINI_H = 112

function Minimappa({ grafo, vista, dim, onVai }: { grafo: MailingGrafo; vista: Vista; dim: { w: number; h: number }; onVai: (v: Vista) => void }) {
  const L = limiti(grafo)
  // Area: grafo ∪ porzione visibile, così il riquadro della vista non esce mai.
  const vis = { x: -vista.x / vista.k, y: -vista.y / vista.k, w: dim.w / vista.k, h: dim.h / vista.k }
  const minX = Math.min(L.x, vis.x) - 40
  const minY = Math.min(L.y, vis.y) - 40
  const maxX = Math.max(L.x + L.larghezza, vis.x + vis.w) + 40
  const maxY = Math.max(L.y + L.altezza, vis.y + vis.h) + 40
  const s = Math.min(MINI_L / (maxX - minX), MINI_H / (maxY - minY))
  const ox = (MINI_L - (maxX - minX) * s) / 2
  const oy = (MINI_H - (maxY - minY) * s) / 2
  const t = posizioneTrigger(grafo)
  const trascinando = useRef(false)

  const vai = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const mx = (e.clientX - r.left - ox) / s + minX
    const my = (e.clientY - r.top - oy) / s + minY
    onVai({ k: vista.k, x: dim.w / 2 - mx * vista.k, y: dim.h / 2 - my * vista.k })
  }

  return (
    <div className="ml-au-minimappa" data-au-interattivo="" aria-hidden>
      <svg
        width={MINI_L}
        height={MINI_H}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          trascinando.current = true
          vai(e)
        }}
        onPointerMove={(e) => trascinando.current && vai(e)}
        onPointerUp={() => (trascinando.current = false)}
      >
        <rect x={ox + (t.x - minX) * s} y={oy + (t.y - minY) * s} width={NODO_LARGHEZZA * s} height={NODO_ALTEZZA * s} rx={3} className="ml-au-mini-nodo" data-tipo="TRIGGER" />
        {grafo.nodi.map((n) => (
          <rect key={n.id} x={ox + (n.x - minX) * s} y={oy + (n.y - minY) * s} width={NODO_LARGHEZZA * s} height={NODO_ALTEZZA * s} rx={3} className="ml-au-mini-nodo" data-tipo={n.tipo} />
        ))}
        <rect x={ox + (vis.x - minX) * s} y={oy + (vis.y - minY) * s} width={vis.w * s} height={vis.h * s} rx={4} className="ml-au-mini-vista" />
      </svg>
    </div>
  )
}
