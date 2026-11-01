import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react'
import { Ban, Briefcase, Lock, MapPin, Moon, Repeat, Stethoscope, Users, Video } from 'lucide-react'
import {
  aggiungiGiorni, conMinuti, disponi, durataMinuti, eventiDelGiorno, GIORNI_BREVI, giorniTra, inizioGiorno, inStriscia, minutiDelGiorno, ora,
  righeStriscia, scatta, stessoGiorno, type EventoVista,
} from './agenda-utils'

export interface Bozza {
  start: Date
  end: Date
  tuttoIlGiorno: boolean
}

interface Props {
  giorni: Date[]
  eventi: EventoVista[]
  adesso: Date
  selezionato: string | null
  bozza: Bozza | null
  oreLavoro: [number, number]
  onApri: (e: EventoVista, el: HTMLElement) => void
  onCrea: (b: Bozza, el: HTMLElement | null) => void
  onCambiaOrario: (e: EventoVista, start: Date, end: Date) => void
  onVaiGiorno: (d: Date) => void
}

type Trascina =
  | { tipo: 'crea'; giorno: number; ancora: number; da: number; a: number; mosso: boolean }
  | { tipo: 'sposta'; evento: EventoVista; offset: number; giorno: number; minuto: number; mosso: boolean; x0: number; y0: number; el: HTMLElement; bloccato: boolean }
  | { tipo: 'ridimensiona'; evento: EventoVista; giorno: number; minuto: number }
  | { tipo: 'striscia-crea'; da: number; a: number }
  | { tipo: 'striscia-sposta'; evento: EventoVista; giorno0: number; giorno: number; mosso: boolean; x0: number; el: HTMLElement }

const CHIAVE_ZOOM = 'agenda-altezza-ora'
const RICORDO_SCROLL_MS = 20 * 60_000
/** Ultima ora guardata nella griglia (vale per tutta la sessione della pagina). */
let minutoVisto: { minuto: number; t: number } | null = null
const ALTEZZA_MIN = 32
const ALTEZZA_MAX = 132
const SOGLIA_PX = 5
/** Col dito: sotto questa distanza è un tocco, sopra è uno scorrimento. */
const SOGLIA_TOCCO_PX = 9
/** Pressione lunga che "solleva" l'evento per spostarlo. */
const PRESSIONE_LUNGA_MS = 380

function leggiZoom(): number {
  try {
    const v = Number(localStorage.getItem(CHIAVE_ZOOM))
    return v >= ALTEZZA_MIN && v <= ALTEZZA_MAX ? v : 56
  } catch {
    return 56
  }
}

export const AgendaTempo = memo(function AgendaTempo(props: Props) {
  const { giorni, eventi, adesso, selezionato, bozza, oreLavoro, onApri, onCrea, onCambiaOrario, onVaiGiorno } = props
  const n = giorni.length
  const scrollRef = useRef<HTMLDivElement>(null)
  const colonneRef = useRef<HTMLDivElement>(null)
  const strisciaRef = useRef<HTMLDivElement>(null)
  const [altezzaOra, setAltezzaOra] = useState(leggiZoom)
  const [trascina, setTrascina] = useState<Trascina | null>(null)
  const trascinaRef = useRef<Trascina | null>(null)
  const [passaggio, setPassaggio] = useState<{ giorno: number; minuto: number } | null>(null)
  const autoScroll = useRef<{ v: number; raf: number } | null>(null)
  /** Col dito non si disegna: un tocco su uno spazio vuoto crea un evento di un'ora, il resto è scorrimento. */
  const toccoVuoto = useRef<{ x: number; y: number; giorno: number; minuto: number; striscia: boolean } | null>(null)
  const pressione = useRef<{ id: number; x: number; y: number; timer: number; ev: EventoVista; el: HTMLElement } | null>(null)
  const barraTocco = useRef(false)
  const altezzaRef = useRef(altezzaOra)
  altezzaRef.current = altezzaOra

  const pxMin = altezzaOra / 60
  const imposta = (t: Trascina | null) => {
    trascinaRef.current = t
    setTrascina(t)
  }

  const conOrario = useMemo(() => eventi.filter((e) => !inStriscia(e)), [eventi])
  const lunghi = useMemo(() => eventi.filter(inStriscia), [eventi])
  const barre = useMemo(() => righeStriscia(lunghi, giorni), [lunghi, giorni])
  const righe = barre.reduce((m, b) => Math.max(m, b.riga + 1), 0)
  const [strisciaAperta, setStrisciaAperta] = useState(false)
  const righeVisibili = strisciaAperta ? righe : Math.min(righe, 3)
  const posizioni = useMemo(() => giorni.map((g) => disponi(eventiDelGiorno(conOrario, g), g)), [giorni, conOrario])
  const iOggi = giorni.findIndex((g) => stessoGiorno(g, adesso))

  // Scroll iniziale: un'ora prima di adesso se oggi è visibile, altrimenti l'inizio della giornata lavorativa.
  // Passando da un periodo all'altro (frecce, swipe) si resta invece alla stessa ora.
  const primoGiorno = giorni[0]?.getTime()
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ricordo = minutoVisto && Date.now() - minutoVisto.t < RICORDO_SCROLL_MS ? minutoVisto.minuto : null
    const minuto = ricordo ?? (iOggi >= 0 ? Math.max(0, minutiDelGiorno(new Date()) - 90) : oreLavoro[0] * 60 - 30)
    el.scrollTop = Math.max(0, minuto * pxMin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primoGiorno, n])

  // Zoom con ⌘/Ctrl + rotellina (o pinch sul trackpad), ancorato al punto sotto il puntatore.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setAltezzaOra((h) => {
        const nuova = Math.max(ALTEZZA_MIN, Math.min(ALTEZZA_MAX, h * (e.deltaY > 0 ? 0.92 : 1.08)))
        const rect = el.getBoundingClientRect()
        const y = e.clientY - rect.top
        const minuto = (el.scrollTop + y) / (h / 60)
        requestAnimationFrame(() => {
          el.scrollTop = minuto * (nuova / 60) - y
        })
        try {
          localStorage.setItem(CHIAVE_ZOOM, String(Math.round(nuova)))
        } catch {
          // solo comodità
        }
        return nuova
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Telefono: pizzico a due dita per lo zoom delle ore; mentre si trascina un evento la griglia non scorre.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let pizzico: { d: number; h: number; y: number; minuto: number } | null = null
    const distanza = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const inizio = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      annullaPressione()
      toccoVuoto.current = null
      const rect = el.getBoundingClientRect()
      const y = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
      pizzico = { d: distanza(e.touches), h: altezzaRef.current, y, minuto: (el.scrollTop + y) / (altezzaRef.current / 60) }
    }
    const muovi = (e: TouchEvent) => {
      const t = trascinaRef.current
      if (t && (t.tipo === 'sposta' || t.tipo === 'ridimensiona')) {
        e.preventDefault()
        return
      }
      if (!pizzico || e.touches.length !== 2) return
      e.preventDefault()
      const nuova = Math.max(ALTEZZA_MIN, Math.min(ALTEZZA_MAX, pizzico.h * (distanza(e.touches) / pizzico.d)))
      setAltezzaOra(nuova)
      el.scrollTop = pizzico.minuto * (nuova / 60) - pizzico.y
    }
    const fine = (e: TouchEvent) => {
      if (pizzico && e.touches.length < 2) {
        try {
          localStorage.setItem(CHIAVE_ZOOM, String(Math.round(altezzaRef.current)))
        } catch {
          // solo comodità
        }
        pizzico = null
      }
    }
    const gesto = (e: Event) => e.preventDefault()
    el.addEventListener('touchstart', inizio, { passive: true })
    el.addEventListener('touchmove', muovi, { passive: false })
    el.addEventListener('touchend', fine)
    el.addEventListener('touchcancel', fine)
    el.addEventListener('gesturestart', gesto)
    return () => {
      el.removeEventListener('touchstart', inizio)
      el.removeEventListener('touchmove', muovi)
      el.removeEventListener('touchend', fine)
      el.removeEventListener('touchcancel', fine)
      el.removeEventListener('gesturestart', gesto)
    }
  }, [])

  const annullaPressione = () => {
    if (pressione.current) window.clearTimeout(pressione.current.timer)
    pressione.current = null
  }

  const puntoGriglia = useCallback(
    (x: number, y: number) => {
      const r = colonneRef.current!.getBoundingClientRect()
      const giorno = Math.max(0, Math.min(n - 1, Math.floor(((x - r.left) / r.width) * n)))
      const minuto = Math.max(0, Math.min(24 * 60, (y - r.top) / pxMin))
      return { giorno, minuto }
    },
    [n, pxMin],
  )

  const giornoStriscia = useCallback(
    (x: number) => {
      const r = strisciaRef.current!.getBoundingClientRect()
      return Math.max(0, Math.min(n - 1, Math.floor(((x - r.left) / r.width) * n)))
    },
    [n],
  )

  // Scorrimento automatico quando si trascina vicino ai bordi.
  const gestisciBordi = (y: number) => {
    const el = scrollRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const v = y < r.top + 48 ? -Math.ceil((r.top + 48 - y) / 4) : y > r.bottom - 48 ? Math.ceil((y - (r.bottom - 48)) / 4) : 0
    if (!v) {
      if (autoScroll.current) cancelAnimationFrame(autoScroll.current.raf)
      autoScroll.current = null
      return
    }
    if (autoScroll.current) {
      autoScroll.current.v = v
      return
    }
    const passo = () => {
      if (!autoScroll.current) return
      el.scrollTop += autoScroll.current.v
      autoScroll.current.raf = requestAnimationFrame(passo)
    }
    autoScroll.current = { v, raf: requestAnimationFrame(passo) }
  }
  const fermaBordi = () => {
    if (autoScroll.current) cancelAnimationFrame(autoScroll.current.raf)
    autoScroll.current = null
  }

  // ── Griglia oraria ──

  const giuSuGriglia = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.ag-ev')) return
    const { giorno, minuto } = puntoGriglia(e.clientX, e.clientY)
    if (e.pointerType === 'touch') {
      toccoVuoto.current = { x: e.clientX, y: e.clientY, giorno, minuto: Math.floor(minuto / 30) * 30, striscia: false }
      return
    }
    const da = Math.floor(minuto / 15) * 15
    e.currentTarget.setPointerCapture(e.pointerId)
    imposta({ tipo: 'crea', giorno, ancora: da, da, a: da + 15, mosso: false })
  }

  const giuSuEvento = (e: RPointerEvent<HTMLElement>, ev: EventoVista, ridimensiona: boolean) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const el = (e.currentTarget.closest('.ag-ev') as HTMLElement | null) ?? e.currentTarget
    if (e.pointerType === 'touch') {
      // Col dito: tocco = apri; pressione lunga = solleva l'evento (o il suo bordo) e trascinalo.
      annullaPressione()
      const { clientX, clientY, pointerId } = e
      const timer = window.setTimeout(() => {
        if (!pressione.current) return
        pressione.current = null
        if (!ev.modificabile) return
        navigator.vibrate?.(12)
        try {
          colonneRef.current?.setPointerCapture(pointerId)
        } catch {
          // il dito è già stato rilasciato
        }
        avvia(ev, ridimensiona, clientX, clientY, el, true)
      }, PRESSIONE_LUNGA_MS)
      pressione.current = { id: pointerId, x: clientX, y: clientY, timer, ev, el }
      return
    }
    colonneRef.current?.setPointerCapture(e.pointerId)
    avvia(ev, ridimensiona, e.clientX, e.clientY, el, false)
  }

  const avvia = (ev: EventoVista, ridimensiona: boolean, x: number, y: number, el: HTMLElement, sollevato: boolean) => {
    const { giorno, minuto } = puntoGriglia(x, y)
    if (ridimensiona && ev.modificabile) {
      imposta({ tipo: 'ridimensiona', evento: ev, giorno, minuto })
      return
    }
    const inizioMin = (ev.start.getTime() - giorni[giorno].getTime()) / 60_000
    imposta({ tipo: 'sposta', evento: ev, offset: minuto - inizioMin, giorno, minuto, mosso: sollevato, x0: x, y0: y, el, bloccato: !ev.modificabile })
  }

  const muoviSuGriglia = (e: RPointerEvent<HTMLDivElement>) => {
    const p = pressione.current
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SOGLIA_TOCCO_PX) annullaPressione()
    const v = toccoVuoto.current
    if (v && Math.hypot(e.clientX - v.x, e.clientY - v.y) > SOGLIA_TOCCO_PX) toccoVuoto.current = null
    const t = trascinaRef.current
    if (!t) {
      if ((e.target as HTMLElement).closest('.ag-ev') || e.pointerType !== 'mouse') {
        if (passaggio) setPassaggio(null)
        return
      }
      const { giorno, minuto } = puntoGriglia(e.clientX, e.clientY)
      const m = Math.floor(minuto / 30) * 30
      if (!passaggio || passaggio.giorno !== giorno || passaggio.minuto !== m) setPassaggio({ giorno, minuto: m })
      return
    }
    const { giorno, minuto } = puntoGriglia(e.clientX, e.clientY)
    gestisciBordi(e.clientY)
    if (t.tipo === 'crea') {
      const da = Math.min(t.ancora, Math.floor(minuto / 15) * 15)
      const a = Math.max(t.ancora + 15, Math.ceil(minuto / 15) * 15)
      if (a !== t.a || da !== t.da) imposta({ ...t, da, a, mosso: true })
    } else if (t.tipo === 'sposta') {
      if (t.bloccato) return
      const mosso = t.mosso || Math.hypot(e.clientX - t.x0, e.clientY - t.y0) > SOGLIA_PX
      if (mosso !== t.mosso || giorno !== t.giorno || Math.abs(minuto - t.minuto) >= 1) imposta({ ...t, giorno, minuto, mosso })
    } else if (t.tipo === 'ridimensiona') {
      imposta({ ...t, giorno, minuto })
    }
  }

  const suSuGriglia = () => {
    fermaBordi()
    const p = pressione.current
    if (p) {
      annullaPressione()
      onApri(p.ev, p.el)
      return
    }
    const v = toccoVuoto.current
    toccoVuoto.current = null
    if (v && !v.striscia) {
      const g = giorni[v.giorno]
      onCrea({ start: conMinuti(g, v.minuto), end: conMinuti(g, v.minuto + 60), tuttoIlGiorno: false }, null)
      return
    }
    const t = trascinaRef.current
    imposta(null)
    if (!t) return
    if (t.tipo === 'crea') {
      const giorno = giorni[t.giorno]
      const start = conMinuti(giorno, t.da)
      const end = t.mosso ? conMinuti(giorno, t.a) : conMinuti(giorno, t.da + 60)
      onCrea({ start, end, tuttoIlGiorno: false }, null)
      return
    }
    if (t.tipo === 'sposta') {
      if (!t.mosso) {
        onApri(t.evento, t.el)
        return
      }
      const { start, end } = anteprimaSposta(t)
      if (start.getTime() !== t.evento.start.getTime()) onCambiaOrario(t.evento, start, end)
      return
    }
    if (t.tipo === 'ridimensiona') {
      const end = anteprimaRidimensiona(t)
      if (end.getTime() !== t.evento.end.getTime()) onCambiaOrario(t.evento, t.evento.start, end)
    }
  }

  const anteprimaSposta = (t: Extract<Trascina, { tipo: 'sposta' }>) => {
    const inizio = scatta(t.minuto - t.offset)
    const start = conMinuti(giorni[t.giorno], inizio)
    return { start, end: new Date(start.getTime() + durataMinuti(t.evento) * 60_000) }
  }
  const anteprimaRidimensiona = (t: Extract<Trascina, { tipo: 'ridimensiona' }>) => {
    const end = conMinuti(giorni[t.giorno], scatta(t.minuto))
    return end.getTime() - t.evento.start.getTime() < 15 * 60_000 ? new Date(t.evento.start.getTime() + 15 * 60_000) : end
  }

  // ── Striscia tutto il giorno ──

  const giuSuStriscia = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.ag-barra, .ag-striscia-altri')) return
    const g = giornoStriscia(e.clientX)
    if (e.pointerType === 'touch') {
      toccoVuoto.current = { x: e.clientX, y: e.clientY, giorno: g, minuto: 0, striscia: true }
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    imposta({ tipo: 'striscia-crea', da: g, a: g })
  }
  const giuSuBarra = (e: RPointerEvent<HTMLElement>, ev: EventoVista) => {
    if (e.button !== 0) return
    e.stopPropagation()
    // Col dito le barre si aprono e basta (si spostano dall'editor): sulla striscia stretta il trascinamento sbaglierebbe giorno.
    if (!ev.modificabile || e.pointerType === 'touch') {
      barraTocco.current = e.pointerType === 'touch'
      imposta(null)
      return
    }
    strisciaRef.current?.setPointerCapture(e.pointerId)
    const g = giornoStriscia(e.clientX)
    imposta({ tipo: 'striscia-sposta', evento: ev, giorno0: g, giorno: g, mosso: false, x0: e.clientX, el: e.currentTarget })
  }
  const muoviSuStriscia = (e: RPointerEvent<HTMLDivElement>) => {
    const v = toccoVuoto.current
    if (v && Math.hypot(e.clientX - v.x, e.clientY - v.y) > SOGLIA_TOCCO_PX) toccoVuoto.current = null
    const t = trascinaRef.current
    if (!t) return
    const g = giornoStriscia(e.clientX)
    if (t.tipo === 'striscia-crea' && g !== t.a) imposta({ ...t, a: g })
    if (t.tipo === 'striscia-sposta') {
      const mosso = t.mosso || Math.abs(e.clientX - t.x0) > SOGLIA_PX
      if (g !== t.giorno || mosso !== t.mosso) imposta({ ...t, giorno: g, mosso })
    }
  }
  const suSuStriscia = () => {
    const v = toccoVuoto.current
    toccoVuoto.current = null
    if (v?.striscia) {
      onCrea({ start: giorni[v.giorno], end: aggiungiGiorni(giorni[v.giorno], 1), tuttoIlGiorno: true }, null)
      return
    }
    const t = trascinaRef.current
    imposta(null)
    if (!t) return
    if (t.tipo === 'striscia-crea') {
      const da = Math.min(t.da, t.a)
      const a = Math.max(t.da, t.a)
      onCrea({ start: giorni[da], end: aggiungiGiorni(giorni[a], 1), tuttoIlGiorno: true }, null)
    }
    if (t.tipo === 'striscia-sposta') {
      if (!t.mosso) {
        onApri(t.evento, t.el)
        return
      }
      const delta = t.giorno - t.giorno0
      if (delta) onCambiaOrario(t.evento, aggiungiGiorni(t.evento.start, delta), aggiungiGiorni(t.evento.end, delta))
    }
  }

  const tastiera = (e: React.KeyboardEvent<HTMLElement>, ev: EventoVista) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onApri(ev, e.currentTarget)
    }
  }

  // ── Render ──

  const inMovimento =
    trascina?.tipo === 'sposta' && trascina.mosso ? trascina.evento.chiave : trascina?.tipo === 'ridimensiona' ? trascina.evento.chiave : null
  const strisciaMovimento = trascina?.tipo === 'striscia-sposta' && trascina.mosso ? trascina : null

  const stile = { '--ag-ora': `${altezzaOra}px`, '--ag-n': n } as CSSProperties

  return (
    <div className="ag-tempo" style={stile} data-giorni={n} data-trascina={trascina ? trascina.tipo : undefined}>
      <div className="ag-tempo-testa">
        <div className="ag-tempo-gutter ag-fuso">{fusoBreve()}</div>
        {giorni.map((g, i) => {
          const passato = g < inizioGiorno(adesso)
          return (
            <button
              key={g.getTime()}
              type="button"
              className="ag-testa-giorno"
              data-oggi={i === iOggi || undefined}
              data-passato={passato || undefined}
              data-weekend={g.getDay() === 0 || g.getDay() === 6 || undefined}
              onClick={() => onVaiGiorno(g)}
              title="Apri il giorno"
            >
              <span className="ag-testa-dow">{GIORNI_BREVI[g.getDay()]}</span>
              <span className="ag-testa-num">{g.getDate()}</span>
            </button>
          )
        })}
      </div>

      <div className="ag-striscia-wrap">
        <div className="ag-tempo-gutter ag-striscia-etichetta">
          {righe > 3 ? (
            <button type="button" className="ag-striscia-toggle" onClick={() => setStrisciaAperta((v) => !v)}>
              {strisciaAperta ? 'meno' : `+${righe - 3}`}
            </button>
          ) : (
            <span>tutto il<br />giorno</span>
          )}
        </div>
        <div
          ref={strisciaRef}
          className="ag-striscia"
          style={{ '--ag-righe': Math.max(1, righeVisibili) + (righe > righeVisibili ? 1 : 0) } as CSSProperties}
          onPointerDown={giuSuStriscia}
          onPointerMove={muoviSuStriscia}
          onPointerUp={suSuStriscia}
          onPointerCancel={() => {
            toccoVuoto.current = null
            imposta(null)
          }}
        >
          {giorni.map((g, i) => (
            <div key={g.getTime()} className="ag-striscia-cella" style={{ gridColumn: i + 1 }} data-oggi={i === iOggi || undefined} />
          ))}
          {barre.filter((b) => b.riga < righeVisibili).map((b) => {
            const sposta = strisciaMovimento?.evento.chiave === b.evento.chiave ? strisciaMovimento.giorno - strisciaMovimento.giorno0 : 0
            const da = Math.max(0, Math.min(n - 1, b.da + sposta))
            const a = Math.max(0, Math.min(n - 1, b.a + sposta))
            const continua = giorniTra(giorni[0], b.evento.start) < 0
            const prosegue = giorniTra(giorni[0], b.evento.tuttoIlGiorno ? aggiungiGiorni(b.evento.end, -1) : b.evento.end) > n - 1
            return (
              <div
                key={b.evento.chiave}
                role="button"
                tabIndex={0}
                className="ag-barra"
                data-sel={selezionato === b.evento.chiave || undefined}
                data-risposta={b.evento.miaRisposta ?? undefined}
                data-tipo={b.evento.tipo}
                data-movimento={sposta ? true : undefined}
                data-continua={continua || undefined}
                data-prosegue={prosegue || undefined}
                style={{ gridColumn: `${da + 1} / ${a + 2}`, gridRow: b.riga + 1, '--c': b.evento.colore } as CSSProperties}
                onPointerDown={(e) => giuSuBarra(e, b.evento)}
                onClick={(e) => {
                  if (!b.evento.modificabile || barraTocco.current) {
                    barraTocco.current = false
                    onApri(b.evento, e.currentTarget)
                  }
                }}
                onKeyDown={(e) => tastiera(e, b.evento)}
              >
                {b.evento.tipo === 'outOfOffice' ? <Briefcase aria-hidden /> : null}
                <span>{b.evento.titolo || '(Senza titolo)'}</span>
                {!b.evento.tuttoIlGiorno ? <em>{ora(b.evento.start)}</em> : null}
              </div>
            )
          })}
          {righe > righeVisibili
            ? giorni.map((g, i) => {
                const nascosti = barre.filter((b) => b.riga >= righeVisibili && b.da <= i && b.a >= i).length
                return nascosti ? (
                  <button
                    key={`altri-${g.getTime()}`}
                    type="button"
                    className="ag-striscia-altri"
                    style={{ gridColumn: i + 1, gridRow: righeVisibili + 1 }}
                    onClick={() => setStrisciaAperta(true)}
                  >
                    +{nascosti} altri
                  </button>
                ) : null
              })
            : null}
          {trascina?.tipo === 'striscia-crea' ? (
            <div
              className="ag-barra ag-barra--bozza"
              style={{ gridColumn: `${Math.min(trascina.da, trascina.a) + 1} / ${Math.max(trascina.da, trascina.a) + 2}`, gridRow: 1 }}
            >
              Nuovo evento
            </div>
          ) : bozza?.tuttoIlGiorno ? (
            (() => {
              const da = giorniTra(giorni[0], bozza.start)
              const a = giorniTra(giorni[0], aggiungiGiorni(bozza.end, -1))
              if (a < 0 || da > n - 1) return null
              return (
                <div className="ag-barra ag-barra--bozza" style={{ gridColumn: `${Math.max(0, da) + 1} / ${Math.min(n - 1, a) + 2}`, gridRow: 1 }}>
                  Nuovo evento
                </div>
              )
            })()
          ) : null}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="ag-tempo-scroll"
        onScroll={(e) => {
          minutoVisto = { minuto: e.currentTarget.scrollTop / pxMin, t: Date.now() }
        }}
      >
        <div className="ag-tempo-corpo" style={{ height: 24 * altezzaOra }}>
          <div className="ag-tempo-gutter ag-ore" aria-hidden>
            {Array.from({ length: 23 }, (_, i) => (
              <span key={i} style={{ top: (i + 1) * altezzaOra }}>{`${String(i + 1).padStart(2, '0')}:00`}</span>
            ))}
            {iOggi >= 0 ? (
              <span className="ag-ore-adesso" style={{ top: minutiDelGiorno(adesso) * pxMin }}>{ora(adesso)}</span>
            ) : null}
          </div>
          <div
            ref={colonneRef}
            className="ag-colonne"
            onPointerDown={giuSuGriglia}
            onPointerMove={muoviSuGriglia}
            onPointerUp={suSuGriglia}
            onPointerLeave={() => setPassaggio(null)}
            onPointerCancel={() => {
              fermaBordi()
              annullaPressione()
              toccoVuoto.current = null
              imposta(null)
            }}
          >
            {giorni.map((g, i) => (
              <Colonna
                key={g.getTime()}
                giorno={g}
                indice={i}
                oggi={i === iOggi}
                adesso={adesso}
                pxMin={pxMin}
                posizioni={posizioni[i]}
                oreLavoro={oreLavoro}
                selezionato={selezionato}
                inMovimento={inMovimento}
                onGiuEvento={giuSuEvento}
                onTastiera={tastiera}
              />
            ))}

            {/* Fantasma al passaggio del mouse: dove nascerebbe un evento con un clic */}
            {passaggio && !trascina && !bozza ? (
              <div
                className="ag-fantasma"
                style={{ left: `calc(${passaggio.giorno} * 100% / var(--ag-n))`, top: passaggio.minuto * pxMin, height: 30 * pxMin }}
                aria-hidden
              >
                <span>{ora(conMinuti(giorni[passaggio.giorno], passaggio.minuto))}</span>
              </div>
            ) : null}

            {trascina?.tipo === 'crea' ? (
              <AnteprimaBlocco giorno={trascina.giorno} start={conMinuti(giorni[trascina.giorno], trascina.da)} end={conMinuti(giorni[trascina.giorno], trascina.mosso ? trascina.a : trascina.da + 60)} pxMin={pxMin} giorni={giorni} titolo="Nuovo evento" />
            ) : null}
            {trascina?.tipo === 'sposta' && trascina.mosso ? (
              (() => {
                const { start, end } = anteprimaSposta(trascina)
                return <AnteprimaBlocco giorno={trascina.giorno} start={start} end={end} pxMin={pxMin} giorni={giorni} titolo={trascina.evento.titolo || '(Senza titolo)'} colore={trascina.evento.colore} />
              })()
            ) : null}
            {trascina?.tipo === 'ridimensiona' ? (
              <AnteprimaBlocco
                giorno={Math.max(0, giorniTra(giorni[0], trascina.evento.start))}
                start={trascina.evento.start}
                end={anteprimaRidimensiona(trascina)}
                pxMin={pxMin}
                giorni={giorni}
                titolo={trascina.evento.titolo || '(Senza titolo)'}
                colore={trascina.evento.colore}
              />
            ) : null}
            {bozza && !bozza.tuttoIlGiorno && !trascina ? (
              <AnteprimaBlocco giorno={giorniTra(giorni[0], bozza.start)} start={bozza.start} end={bozza.end} pxMin={pxMin} giorni={giorni} titolo="Nuovo evento" bozza />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
})

function fusoBreve(): string {
  const off = -new Date().getTimezoneOffset() / 60
  return `GMT${off >= 0 ? '+' : ''}${off}`
}

interface ColonnaProps {
  giorno: Date
  indice: number
  oggi: boolean
  adesso: Date
  pxMin: number
  posizioni: ReturnType<typeof disponi>
  oreLavoro: [number, number]
  selezionato: string | null
  inMovimento: string | null
  onGiuEvento: (e: RPointerEvent<HTMLElement>, ev: EventoVista, ridimensiona: boolean) => void
  onTastiera: (e: React.KeyboardEvent<HTMLElement>, ev: EventoVista) => void
}

const Colonna = memo(function Colonna({ giorno, oggi, adesso, pxMin, posizioni, oreLavoro, selezionato, inMovimento, onGiuEvento, onTastiera }: ColonnaProps) {
  const g0 = giorno.getTime()
  const g1 = aggiungiGiorni(giorno, 1).getTime()
  const weekend = giorno.getDay() === 0 || giorno.getDay() === 6
  const passato = g1 <= adesso.getTime()
  return (
    <div
      className="ag-colonna"
      data-oggi={oggi || undefined}
      data-weekend={weekend || undefined}
      data-passato={passato || undefined}
      style={{ '--ag-lav-da': `${oreLavoro[0] * 60 * pxMin}px`, '--ag-lav-a': `${oreLavoro[1] * 60 * pxMin}px` } as CSSProperties}
    >
      {oggi ? <div className="ag-passato-oggi" style={{ height: minutiDelGiorno(adesso) * pxMin }} aria-hidden /> : null}

      {posizioni.map((p) => {
        const ev = p.evento
        const top = p.top * pxMin
        const altezza = Math.max(18, p.altezza * pxMin - 2)
        const compatto = altezza < 38
        const basso = altezza < 58
        const finito = ev.end.getTime() <= adesso.getTime()
        const inCorso = ev.start.getTime() <= adesso.getTime() && ev.end.getTime() > adesso.getTime()
        const altri = ev.partecipanti.filter((x) => !x.io && !x.risorsa).length
        const continuaPrima = ev.start.getTime() < g0
        return (
          <div
            key={ev.chiave}
            role="button"
            tabIndex={0}
            aria-label={`${ev.titolo || 'Senza titolo'}, ${ora(ev.start)} – ${ora(ev.end)}`}
            className="ag-ev"
            data-visita={ev.visitaId ? true : undefined}
            data-sel={selezionato === ev.chiave || undefined}
            data-compatto={compatto || undefined}
            data-basso={basso || undefined}
            data-finito={finito || undefined}
            data-in-corso={inCorso || undefined}
            data-risposta={ev.miaRisposta ?? undefined}
            data-libero={ev.trasparenza === 'transparent' || undefined}
            data-tipo={ev.tipo}
            data-movimento={inMovimento === ev.chiave || undefined}
            data-bloccato={!ev.modificabile || undefined}
            style={{
              top,
              height: altezza,
              left: `calc(${p.sinistra * 100}% + 1px)`,
              width: `calc(${p.larghezza * 100}% - ${p.colonne > 1 ? 3 : 6}px)`,
              zIndex: 2 + Math.round(p.sinistra * 10),
              '--c': ev.colore,
            } as CSSProperties}
            onPointerDown={(e) => onGiuEvento(e, ev, false)}
            onKeyDown={(e) => onTastiera(e, ev)}
          >
            <div className="ag-ev-corpo">
              <strong className="ag-ev-titolo">
                {ev.visitaId ? <Stethoscope className="ag-ev-visita" aria-label="Visita" /> : null}
                {ev.tipo === 'focusTime' ? <Moon aria-hidden /> : ev.tipo === 'outOfOffice' ? <Briefcase aria-hidden /> : null}
                {ev.miaRisposta === 'declined' ? <Ban aria-hidden /> : null}
                {ev.visibilita === 'private' ? <Lock aria-hidden /> : null}
                {ev.titolo || '(Senza titolo)'}
                {compatto ? <em>, {ora(ev.start)}</em> : null}
              </strong>
              {!compatto ? (
                <span className="ag-ev-ora">
                  {continuaPrima ? '… ' : ''}
                  {ora(ev.start)} – {ora(ev.end)}
                  {ev.serieId ? <Repeat aria-label="Ricorrente" /> : null}
                  {ev.meet ? <Video aria-label="Con Meet" /> : null}
                  {altri > 0 ? <span className="ag-ev-persone"><Users aria-hidden />{altri + 1}</span> : null}
                </span>
              ) : null}
              {!compatto && altezza > 64 && ev.luogo ? (
                <span className="ag-ev-luogo"><MapPin aria-hidden />{ev.luogo}</span>
              ) : null}
            </div>
            {ev.modificabile && !compatto ? (
              <span className="ag-ev-maniglia" onPointerDown={(e) => onGiuEvento(e, ev, true)} aria-hidden />
            ) : ev.modificabile ? (
              <span className="ag-ev-maniglia ag-ev-maniglia--mini" onPointerDown={(e) => onGiuEvento(e, ev, true)} aria-hidden />
            ) : null}
          </div>
        )
      })}

      {oggi ? (
        <div className="ag-adesso" style={{ top: minutiDelGiorno(adesso) * pxMin }} aria-hidden>
          <span className="ag-adesso-punto" />
        </div>
      ) : null}
    </div>
  )
})

function AnteprimaBlocco({ giorno, start, end, pxMin, giorni, titolo, colore, bozza }: {
  giorno: number
  start: Date
  end: Date
  pxMin: number
  giorni: Date[]
  titolo: string
  colore?: string
  bozza?: boolean
}) {
  if (giorno < 0 || giorno >= giorni.length) return null
  const g0 = giorni[giorno].getTime()
  const s = Math.max(0, (start.getTime() - g0) / 60_000)
  const f = Math.min(24 * 60, Math.max(s + 15, (end.getTime() - g0) / 60_000))
  return (
    <div
      className="ag-anteprima"
      data-bozza={bozza || undefined}
      data-basso={(f - s) * pxMin < 44 || undefined}
      style={{ left: `calc(${giorno} * 100% / var(--ag-n) + 2px)`, top: s * pxMin, height: Math.max(18, (f - s) * pxMin - 2), '--c': colore ?? 'var(--ag-accento)' } as CSSProperties}
    >
      <strong>{titolo}</strong>
      <span>{ora(start)} – {ora(end)} · {Math.round((end.getTime() - start.getTime()) / 60_000)} min</span>
    </div>
  )
}
