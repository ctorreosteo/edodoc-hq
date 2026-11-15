import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { addDays, addMonths, differenceInCalendarDays, format, startOfMonth, startOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'
import { AlertTriangle, ChevronRight, CircleCheck, Crosshair, Hourglass, Link2Off, Route, Sparkles, Wand2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { emitTaskChanged } from '@/hooks/use-task-cambi'
import { TaskAvatarStack, nomeCompleto, parseDataLocale, toIsoData } from '@/components/task/task-ui'
import {
  isStatoChiuso,
  messaggioErroreTask,
  taskService,
  type TaskConfig,
  type TaskDipendenza,
  type TaskPianificaVoce,
  type TaskRiga,
} from '@/services/task-service'
import { cascata, catenaCritica, spanDi, type Span } from '@/lib/task-gantt'
import { confrontaOrdine } from './task-pagina-utils'
import '@/style/lux-task-gantt.css'

/*
  Gantt dei task: la barra va dall'inizio alla scadenza (solo la scadenza = traguardo, un rombo). Si trascina per
  spostarla, dai bordi per allungarla, dal pallino a destra su un'altra barra per dire «quella aspetta questa».
  Le dipendenze sono fine → inizio: spostando un task, quelli che lo aspettano scorrono avanti con lui (e si vede
  mentre trascini). In rosso le frecce di chi inizia prima che l'altro sia finito; «Sistema» le rimette in fila.
*/

type Scala = 'giorni' | 'settimane' | 'mesi'
const PX_GIORNO: Record<Scala, number> = { giorni: 38, settimane: 16, mesi: 5 }
/** Quanto mostrare almeno, in giorni, oltre le date dei task */
const MINIMO: Record<Scala, number> = { giorni: 56, settimane: 182, mesi: 540 }
const RIGA = 38
const COLORE_PREDEFINITO = '#6366F1'
const CHIAVE_SCALA = 'tk-gantt-scala'

type Modo = 'sposta' | 'inizio' | 'fine' | 'disegna' | 'collega'

interface Trascinamento {
  id: number
  modo: Modo
  x0: number
  span0: Span | null
  giorno0: number
  mosso: boolean
}

type Voce =
  | { tipo: 'gruppo'; key: string; nome: string; colore: string; n: number }
  | { tipo: 'task'; key: string; r: TaskRiga; livello: 0 | 1; figli: number }

interface Props {
  config: TaskConfig
  righe: TaskRiga[]
  loading: boolean
  /** Raggruppa per lista (tutti i task, cartella) */
  mostraLista: boolean
  sostituisciRiga: (r: TaskRiga) => void
  onApri: (id: number) => void
  selezionatoId: number | null
  onNuovo: () => void
}

const leggiScala = (): Scala => {
  try {
    const v = localStorage.getItem(CHIAVE_SCALA)
    return v === 'giorni' || v === 'settimane' || v === 'mesi' ? v : 'settimane'
  } catch {
    return 'settimane'
  }
}

const chiuso = (r: TaskRiga) => isStatoChiuso(r.stato)

export function TaskGanttView({ config, righe, loading, mostraLista, sostituisciRiga, onApri, selezionatoId, onNuovo }: Props) {
  const [scala, setScala] = useState<Scala>(leggiScala)
  const px = PX_GIORNO[scala]
  const [dipendenze, setDipendenze] = useState<TaskDipendenza[]>([])
  const [chiusi, setChiusi] = useState<Set<number>>(new Set())
  const [critico, setCritico] = useState(false)
  const [anteprima, setAnteprima] = useState<Map<number, Span> | null>(null)
  const [filo, setFilo] = useState<{ da: number; x: number; y: number } | null>(null)
  const [frecciaScelta, setFrecciaScelta] = useState<{ p: number; s: number; x: number; y: number } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const sovra = useRef<HTMLDivElement>(null)
  const drag = useRef<Trascinamento | null>(null)

  const cambiaScala = (s: Scala) => {
    // Il giorno al centro dello schermo resta al centro
    const el = scroller.current
    const centro = el && sovra.current ? (el.scrollLeft + el.clientWidth / 2 - sovra.current.offsetLeft) / px : null
    setScala(s)
    try { localStorage.setItem(CHIAVE_SCALA, s) } catch { /* solo una comodità */ }
    if (el && centro != null) requestAnimationFrame(() => {
      el.scrollLeft = centro * PX_GIORNO[s] + (sovra.current?.offsetLeft ?? 0) - el.clientWidth / 2
    })
  }

  // ---------- Intervallo: dal lunedì prima della data più vecchia, almeno qualche mese; solo si allarga ----------
  const oggi = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const [limiti, setLimiti] = useState<{ base: Date; giorni: number } | null>(null)
  useLayoutEffect(() => {
    let min = oggi
    let max = oggi
    for (const r of righe) {
      for (const iso of [r.dataInizio, r.scadenza]) {
        const d = parseDataLocale(iso)
        if (!d) continue
        if (d < min) min = d
        if (d > max) max = d
      }
    }
    const desiderata = startOfWeek(addDays(min, -7), { weekStartsOn: 1 })
    const b = limiti && limiti.base < desiderata ? limiti.base : desiderata
    const g = Math.max(differenceInCalendarDays(addDays(max, 42), b) + 1, MINIMO[scala],
      limiti ? differenceInCalendarDays(addDays(limiti.base, limiti.giorni), b) : 0)
    if (limiti && limiti.base.getTime() === b.getTime() && limiti.giorni === g) return
    // Allargando a sinistra, quello che si stava guardando resta fermo
    if (limiti && b < limiti.base) {
      const diff = differenceInCalendarDays(limiti.base, b)
      requestAnimationFrame(() => { if (scroller.current) scroller.current.scrollLeft += diff * px })
    }
    setLimiti({ base: b, giorni: g })
  }, [righe, oggi, scala, px, limiti])
  const base = limiti?.base ?? startOfWeek(addDays(oggi, -7), { weekStartsOn: 1 })
  const giorni = limiti?.giorni ?? MINIMO[scala]
  const giornoOggi = differenceInCalendarDays(oggi, base)

  const vaiAOggi = useCallback((liscio = true) => {
    const el = scroller.current
    if (!el || !sovra.current) return
    el.scrollTo({ left: Math.max(0, giornoOggi * px - el.clientWidth * 0.25), behavior: liscio ? 'smooth' : 'auto' })
  }, [giornoOggi, px])
  // La prima volta si parte da oggi
  const centrato = useRef(false)
  useLayoutEffect(() => {
    if (centrato.current || loading || !limiti) return
    centrato.current = true
    vaiAOggi(false)
  }, [loading, limiti, vaiAOggi])

  // ---------- Dati ----------
  const perId = useMemo(() => new Map(righe.map((r) => [r.id, r])), [righe])
  const chiaveIds = useMemo(() => righe.map((r) => r.id).sort((a, b) => a - b).join(','), [righe])
  useEffect(() => {
    const ids = chiaveIds ? chiaveIds.split(',').map(Number) : []
    let vivo = true
    taskService.dipendenze(ids).then((d) => vivo && setDipendenze(d)).catch(() => undefined)
    return () => { vivo = false }
  }, [chiaveIds])

  const successori = useMemo(() => {
    const m = new Map<number, number[]>()
    for (const d of dipendenze) m.set(d.predecessoreId, [...(m.get(d.predecessoreId) ?? []), d.successoreId])
    return m
  }, [dipendenze])
  const predecessori = useMemo(() => {
    const m = new Map<number, number[]>()
    for (const d of dipendenze) m.set(d.successoreId, [...(m.get(d.successoreId) ?? []), d.predecessoreId])
    return m
  }, [dipendenze])

  const spansBase = useMemo(() => {
    const m = new Map<number, Span>()
    for (const r of righe) {
      const sp = spanDi(r, base)
      if (sp) m.set(r.id, sp)
    }
    return m
  }, [righe, base])
  const spanDiId = (id: number) => anteprima?.get(id) ?? spansBase.get(id) ?? null
  const spostabile = useCallback((id: number) => {
    const r = perId.get(id)
    return !!r && !chiuso(r)
  }, [perId])

  // ---------- Righe: gruppi per lista, sottotask sotto il principale ----------
  const voci = useMemo<Voce[]>(() => {
    const figli = new Map<number, TaskRiga[]>()
    for (const r of righe) if (r.parentId != null && perId.has(r.parentId)) figli.set(r.parentId, [...(figli.get(r.parentId) ?? []), r])
    const principali = righe.filter((r) => r.parentId == null || !perId.has(r.parentId)).sort(confrontaOrdine)
    const out: Voce[] = []
    const aggiungi = (lista: TaskRiga[]) => {
      for (const r of lista) {
        const sotto = (figli.get(r.id) ?? []).sort(confrontaOrdine)
        out.push({ tipo: 'task', key: `t${r.id}`, r, livello: 0, figli: sotto.length })
        if (!chiusi.has(r.id)) for (const s of sotto) out.push({ tipo: 'task', key: `t${s.id}`, r: s, livello: 1, figli: 0 })
      }
    }
    if (!mostraLista) {
      aggiungi(principali)
      return out
    }
    const ordineListe = new Map(config.liste.map((l, i) => [l.id, i]))
    const perLista = new Map<number, TaskRiga[]>()
    for (const r of principali) perLista.set(r.listaId, [...(perLista.get(r.listaId) ?? []), r])
    for (const [listaId, lista] of [...perLista].sort((a, b) => (ordineListe.get(a[0]) ?? 0) - (ordineListe.get(b[0]) ?? 0))) {
      const l = config.liste.find((x) => x.id === listaId)
      out.push({ tipo: 'gruppo', key: `l${listaId}`, nome: l?.nome ?? 'Lista', colore: l?.colore ?? COLORE_PREDEFINITO, n: lista.length })
      aggiungi(lista)
    }
    return out
  }, [righe, perId, chiusi, mostraLista, config.liste])

  const rigaDi = useMemo(() => {
    const m = new Map<number, number>()
    voci.forEach((v, i) => { if (v.tipo === 'task') m.set(v.r.id, i) })
    return m
  }, [voci])
  const coloreLista = useMemo(() => new Map(config.liste.map((l) => [l.id, l.colore])), [config.liste])

  // ---------- Conflitti e percorso critico ----------
  const conflitto = (d: TaskDipendenza) => {
    const p = perId.get(d.predecessoreId)
    const s = perId.get(d.successoreId)
    const sp = spanDiId(d.predecessoreId)
    const ss = spanDiId(d.successoreId)
    return !!p && !!s && !!sp && !!ss && !chiuso(p) && !chiuso(s) && ss.s <= sp.f
  }
  const conflitti = dipendenze.filter((d) => {
    const p = perId.get(d.predecessoreId)
    const s = perId.get(d.successoreId)
    const sp = spansBase.get(d.predecessoreId)
    const ss = spansBase.get(d.successoreId)
    return !!p && !!s && !!sp && !!ss && !chiuso(p) && !chiuso(s) && ss.s <= sp.f
  })
  const inConflitto = new Set(conflitti.map((d) => d.successoreId))

  const percorso = useMemo(
    () => (critico ? catenaCritica(spansBase, predecessori, (id) => { const r = perId.get(id); return !!r && !chiuso(r) }) : new Set<number>()),
    [critico, spansBase, predecessori, perId],
  )

  // ---------- Salvataggio delle date (con «Annulla») ----------
  const vociDa = (nuove: Map<number, Span>, modo: Modo, mossoId: number): TaskPianificaVoce[] =>
    [...nuove].flatMap(([id, sp]) => {
      const r = perId.get(id)
      if (!r) return []
      const proprio = id === mossoId
      // Un traguardo resta traguardo spostandolo; prende un inizio solo se lo si allunga o lo si disegna
      const conInizio = r.dataInizio != null || (proprio && (modo === 'inizio' || modo === 'disegna'))
      const conFine = r.scadenza != null || (proprio && (modo === 'fine' || modo === 'disegna'))
      const voce = { id, dataInizio: conInizio ? toIsoData(addDays(base, sp.s)) : null, scadenza: conFine ? toIsoData(addDays(base, sp.f)) : null }
      return voce.dataInizio === r.dataInizio && voce.scadenza === r.scadenza ? [] : [voce]
    })

  const salva = async (voci: TaskPianificaVoce[], messaggio: string | null) => {
    if (!voci.length) return
    const prima: TaskPianificaVoce[] = voci.map((v) => {
      const r = perId.get(v.id)!
      return { id: v.id, dataInizio: r.dataInizio, scadenza: r.scadenza }
    })
    const originali = voci.map((v) => perId.get(v.id)!).filter(Boolean)
    // Subito a schermo; il server conferma
    voci.forEach((v) => { const r = perId.get(v.id); if (r) sostituisciRiga({ ...r, dataInizio: v.dataInizio, scadenza: v.scadenza }) })
    setSalvando(true)
    try {
      const nuove = await taskService.pianifica(voci)
      nuove.forEach((r) => { sostituisciRiga(r); emitTaskChanged(r.id) })
      if (messaggio) toast(messaggio, {
        action: {
          label: 'Annulla',
          onClick: () => {
            void taskService.pianifica(prima).then((rr) => rr.forEach((r) => { sostituisciRiga(r); emitTaskChanged(r.id) }))
              .catch((e) => toast.error(messaggioErroreTask(e, 'Date non ripristinate')))
          },
        },
      })
    } catch (e) {
      originali.forEach(sostituisciRiga)
      toast.error(messaggioErroreTask(e, 'Date non salvate'))
    } finally {
      setSalvando(false)
    }
  }

  const sistemaTutto = () => {
    const ordine = [...spansBase.keys()]
    const nuove = cascata(new Map(), spansBase, successori, spostabile, ordine)
    const v = [...nuove].flatMap(([id, sp]) => {
      const r = perId.get(id)
      if (!r) return []
      return [{ id, dataInizio: r.dataInizio != null ? toIsoData(addDays(base, sp.s)) : null, scadenza: r.scadenza != null ? toIsoData(addDays(base, sp.f)) : null }]
    })
    if (!v.length) {
      toast('Questi conflitti riguardano task che non puoi spostare')
      return
    }
    void salva(v, v.length === 1 ? 'Spostato un task: ora parte dopo quello che aspetta' : `Rimessi in fila ${v.length} task`)
  }

  // ---------- Trascinamento ----------
  const giornoDa = (clientX: number) => {
    const r = sovra.current?.getBoundingClientRect()
    return r ? Math.floor((clientX - r.left) / px) : 0
  }

  const calcolaAnteprima = (t: Trascinamento, clientX: number): Map<number, Span> | null => {
    const d = Math.round((clientX - t.x0) / px)
    let sp: Span | null = null
    if (t.modo === 'disegna') {
      const g = giornoDa(clientX)
      sp = { s: Math.min(t.giorno0, g), f: Math.max(t.giorno0, g) }
    } else if (t.span0) {
      if (t.modo === 'sposta') sp = { s: t.span0.s + d, f: t.span0.f + d }
      if (t.modo === 'inizio') sp = { s: Math.min(t.span0.s + d, t.span0.f), f: t.span0.f }
      if (t.modo === 'fine') sp = { s: t.span0.s, f: Math.max(t.span0.f + d, t.span0.s) }
    }
    if (!sp) return null
    return cascata(new Map([[t.id, sp]]), spansBase, successori, spostabile)
  }

  const inizia = (e: ReactPointerEvent, r: TaskRiga, modo: Modo) => {
    if (e.button !== 0) return
    if (modo !== 'collega' && !spostabile(r.id)) {
      if (modo !== 'disegna') onApri(r.id)
      return
    }
    if (modo === 'disegna' && e.pointerType === 'touch') return
    e.preventDefault()
    e.stopPropagation()
    setFrecciaScelta(null)
    drag.current = { id: r.id, modo, x0: e.clientX, span0: spansBase.get(r.id) ?? null, giorno0: giornoDa(e.clientX), mosso: false }
    if (modo === 'disegna') setAnteprima(calcolaAnteprima(drag.current, e.clientX))
    document.body.dataset.tkgTrascina = modo
  }

  useEffect(() => {
    const muovi = (e: PointerEvent) => {
      const t = drag.current
      if (!t) return
      if (!t.mosso && Math.abs(e.clientX - t.x0) < 4 && t.modo !== 'collega') return
      t.mosso = true
      if (t.modo === 'collega') {
        const o = sovra.current?.getBoundingClientRect()
        if (o) setFilo({ da: t.id, x: e.clientX - o.left, y: e.clientY - o.top })
        return
      }
      setAnteprima(calcolaAnteprima(t, e.clientX))
    }
    const fine = (e: PointerEvent) => {
      const t = drag.current
      if (!t) return
      drag.current = null
      delete document.body.dataset.tkgTrascina
      const r = perId.get(t.id)
      if (t.modo === 'collega') {
        setFilo(null)
        const bersaglio = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-gantt-id]')
        const verso = bersaglio ? Number(bersaglio.dataset.ganttId) : null
        if (verso && verso !== t.id) void collega(t.id, verso)
        return
      }
      if (!t.mosso && t.modo !== 'disegna') {
        setAnteprima(null)
        onApri(t.id)
        return
      }
      const nuove = calcolaAnteprima(t, e.clientX)
      setAnteprima(null)
      if (!nuove || !r) return
      const v = vociDa(nuove, t.modo, t.id)
      const altri = v.filter((x) => x.id !== t.id).length
      void salva(v, t.modo === 'disegna' ? null
        : altri ? `Spostato «${r.titolo}» e ${altri === 1 ? 'il task che lo aspetta' : `i ${altri} task che lo aspettano`}` : null)
    }
    const annulla = () => {
      if (!drag.current) return
      drag.current = null
      delete document.body.dataset.tkgTrascina
      setAnteprima(null)
      setFilo(null)
    }
    window.addEventListener('pointermove', muovi)
    window.addEventListener('pointerup', fine)
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') annulla() }
    window.addEventListener('pointercancel', annulla)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointermove', muovi)
      window.removeEventListener('pointerup', fine)
      window.removeEventListener('pointercancel', annulla)
      window.removeEventListener('keydown', esc)
    }
  })

  const collega = async (da: number, verso: number) => {
    if (dipendenze.some((d) => d.predecessoreId === da && d.successoreId === verso)) return
    try {
      const det = await taskService.aggiungiDipendenza(verso, da)
      sostituisciRiga(det.task)
      emitTaskChanged(verso)
      setDipendenze((ds) => [...ds, { predecessoreId: da, successoreId: verso }])
      const p = spansBase.get(da)
      const s = spansBase.get(verso)
      const rp = perId.get(da)
      const rs = perId.get(verso)
      if (p && s && rp && rs && s.s <= p.f && spostabile(verso) && !chiuso(rp)) {
        const conNuova = new Map(successori)
        conNuova.set(da, [...(successori.get(da) ?? []), verso])
        const nuove = cascata(new Map(), spansBase, conNuova, spostabile, [da])
        toast(`Collegati: «${rs.titolo}» parte prima che «${rp.titolo}» sia finito`, {
          action: { label: 'Sposta dopo', onClick: () => void salva(vociDa(nuove, 'sposta', -1), null) },
        })
      } else {
        toast.success(`«${rs?.titolo ?? 'Il task'}» ora aspetta «${rp?.titolo ?? 'l\'altro'}»`)
      }
    } catch (e) {
      toast.error(messaggioErroreTask(e, 'Collegamento non riuscito'))
    }
  }

  const scollega = async (p: number, s: number) => {
    setFrecciaScelta(null)
    try {
      const det = await taskService.rimuoviDipendenza(s, p)
      sostituisciRiga(det.task)
      emitTaskChanged(s)
      setDipendenze((ds) => ds.filter((d) => !(d.predecessoreId === p && d.successoreId === s)))
    } catch (e) {
      toast.error(messaggioErroreTask(e, 'Collegamento non tolto'))
    }
  }

  // ---------- Scala del tempo ----------
  const fasce = useMemo(() => {
    const sopra: { k: string; da: number; a: number; testo: string }[] = []
    const sotto: { k: string; da: number; a: number; testo: string; weekend?: boolean; oggi?: boolean }[] = []
    const giorno = (i: number) => addDays(base, i)
    const fineMese = (d: Date) => Math.min(differenceInCalendarDays(startOfMonth(addMonths(d, 1)), base), giorni)
    if (scala === 'mesi') {
      for (let i = 0; i < giorni;) {
        const d = giorno(i)
        const a = fineMese(d)
        sotto.push({ k: `m${i}`, da: i, a, testo: format(d, 'MMM', { locale: it }), oggi: giornoOggi >= i && giornoOggi < a })
        const anno = format(d, 'yyyy')
        const ultimo = sopra[sopra.length - 1]
        if (ultimo?.testo === anno) ultimo.a = a
        else sopra.push({ k: `y${i}`, da: i, a, testo: anno })
        i = a
      }
    } else {
      for (let i = 0; i < giorni;) {
        const d = giorno(i)
        const a = fineMese(d)
        sopra.push({ k: `m${i}`, da: i, a, testo: format(d, scala === 'giorni' ? 'MMMM yyyy' : 'MMM yyyy', { locale: it }) })
        i = a
      }
      if (scala === 'giorni') {
        for (let j = 0; j < giorni; j++) {
          const d = giorno(j)
          sotto.push({ k: `d${j}`, da: j, a: j + 1, testo: `${format(d, 'EEEEE', { locale: it })} ${d.getDate()}`, weekend: d.getDay() === 0 || d.getDay() === 6, oggi: j === giornoOggi })
        }
      } else {
        for (let j = 0; j < giorni; j += 7) {
          const d = giorno(j)
          sotto.push({ k: `w${j}`, da: j, a: Math.min(j + 7, giorni), testo: `${d.getDate()}–${format(addDays(d, 6), 'd MMM', { locale: it })}`, oggi: giornoOggi >= j && giornoOggi < j + 7 })
        }
      }
    }
    return { sopra, sotto }
  }, [base, giorni, scala, giornoOggi])

  // ---------- Disegno ----------
  const larghezza = giorni * px
  const altezza = voci.length * RIGA
  const daPianificare = righe.filter((r) => !r.dataInizio && !r.scadenza && !chiuso(r)).length
  const yDi = (id: number) => (rigaDi.get(id) ?? 0) * RIGA + RIGA / 2

  /** Bordo destro e sinistro di una barra (il rombo del traguardo è largo 14px, al centro del giorno). */
  const bordi = (id: number, sp: Span) => {
    const r = perId.get(id)
    const traguardo = r && !r.dataInizio && sp.s === sp.f
    return traguardo
      ? { sx: sp.s * px + px / 2 - 8, dx: sp.f * px + px / 2 + 8 }
      : { sx: sp.s * px, dx: (sp.f + 1) * px }
  }

  const frecce = dipendenze.flatMap((d) => {
    if (!rigaDi.has(d.predecessoreId) || !rigaDi.has(d.successoreId)) return []
    const sp = spanDiId(d.predecessoreId)
    const ss = spanDiId(d.successoreId)
    if (!sp || !ss) return []
    const x1 = bordi(d.predecessoreId, sp).dx
    const x2 = bordi(d.successoreId, ss).sx
    const y1 = yDi(d.predecessoreId)
    const y2 = yDi(d.successoreId)
    const g = 9
    const giu = y2 > y1 ? 1 : -1
    const percorsoD = x2 - x1 >= 2 * g
      ? `M${x1},${y1} H${x1 + g} V${y2} H${x2 - 2}`
      : `M${x1},${y1} H${x1 + g} V${y2 - giu * RIGA / 2} H${x2 - g - 4} V${y2} H${x2 - 2}`
    const r1 = perId.get(d.predecessoreId)
    const r2 = perId.get(d.successoreId)
    const fatto = !!r1 && chiuso(r1)
    return [{
      key: `${d.predecessoreId}-${d.successoreId}`, d: percorsoD, p: d.predecessoreId, s: d.successoreId,
      x: x2, y: y2, rosso: conflitto(d), fatto, critica: percorso.has(d.predecessoreId) && percorso.has(d.successoreId),
      titolo: `«${r2?.titolo ?? ''}» aspetta «${r1?.titolo ?? ''}»`,
    }]
  })

  if (!loading && !righe.length) {
    return (
      <div className="tkg tkg--vuoto">
        <Sparkles aria-hidden />
        <p><b>Niente da mettere in fila, per ora</b><br />Crea i task del progetto, poi trascinali sul calendario e collegali fra loro.</p>
        <button type="button" className="tkg-btn tkg-btn--primario" onClick={onNuovo}>Nuovo task</button>
      </div>
    )
  }

  return (
    <div className="tkg" aria-busy={loading || salvando || undefined}>
      <div className="tkg-head">
        <div className="tkg-head-sx">
          <button type="button" className="tkg-btn" onClick={() => vaiAOggi()}><Crosshair aria-hidden /> Oggi</button>
          <div className="tkg-seg" role="tablist" aria-label="Scala del tempo">
            {(['giorni', 'settimane', 'mesi'] as Scala[]).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={scala === s} onClick={() => cambiaScala(s)}>
                {s === 'giorni' ? 'Giorni' : s === 'settimane' ? 'Settimane' : 'Mesi'}
              </button>
            ))}
          </div>
          <button type="button" className="tkg-btn" aria-pressed={critico} data-attivo={critico ? '' : undefined}
            onClick={() => setCritico((c) => !c)} title="La catena di task che decide quando si finisce">
            <Route aria-hidden /> Percorso critico
          </button>
        </div>
        <div className="tkg-head-dx">
          {conflitti.length ? (
            <button type="button" className="tkg-conflitti" onClick={sistemaTutto} disabled={salvando}
              title="Sposta avanti i task che partono prima di quelli che aspettano">
              <AlertTriangle aria-hidden />
              {conflitti.length === 1 ? '1 task parte troppo presto' : `${conflitti.length} task partono troppo presto`}
              <span><Wand2 aria-hidden /> Sistema</span>
            </button>
          ) : dipendenze.length ? (
            <span className="tkg-ok"><CircleCheck aria-hidden /> Tutto in ordine</span>
          ) : null}
          {daPianificare ? <span className="tkg-nota">{daPianificare === 1 ? '1 da pianificare' : `${daPianificare} da pianificare`}</span> : null}
          <span className="tkg-nota tkg-nota--aiuto">Trascina le barre · tira il pallino su un altro task per collegarli</span>
        </div>
      </div>

      <div ref={scroller} className="tkg-scroll" style={{ ['--d' as string]: `${px}px`, ['--riga' as string]: `${RIGA}px` }}
        data-scala={scala} onPointerDown={() => setFrecciaScelta(null)}>
        <div className="tkg-tela" style={{ width: `calc(var(--tkg-sx) + ${larghezza}px)` }}>
          <div className="tkg-testa">
            <div className="tkg-angolo">
              <span>Task</span>
              <small>{righe.length}</small>
            </div>
            <div className="tkg-scala" style={{ width: larghezza }}>
              <div className="tkg-scala-sopra">
                {fasce.sopra.map((f) => (
                  <span key={f.k} style={{ left: f.da * px, width: (f.a - f.da) * px }}><b>{f.testo}</b></span>
                ))}
              </div>
              <div className="tkg-scala-sotto">
                {fasce.sotto.map((f) => (
                  <span key={f.k} style={{ left: f.da * px, width: (f.a - f.da) * px }}
                    data-weekend={f.weekend ? '' : undefined} data-oggi={f.oggi ? '' : undefined}>{f.testo}</span>
                ))}
              </div>
              {giornoOggi >= 0 && giornoOggi < giorni ? (
                <span className="tkg-oggi-pill" style={{ left: (giornoOggi + 0.5) * px }}>Oggi</span>
              ) : null}
            </div>
          </div>

          <div className="tkg-corpo" style={{ height: altezza }}>
            {voci.map((v) => v.tipo === 'gruppo' ? (
              <div key={v.key} className="tkg-riga tkg-riga--gruppo" style={{ ['--tk-c' as string]: v.colore }}>
                <div className="tkg-sx"><span className="tkg-gruppo-dot" /> <b>{v.nome}</b> <small>{v.n}</small></div>
                <div className="tkg-dx" style={{ width: larghezza }} />
              </div>
            ) : (
              <RigaTask key={v.key} v={v} px={px} larghezza={larghezza} span={spanDiId(v.r.id)}
                colore={coloreLista.get(v.r.listaId) ?? COLORE_PREDEFINITO}
                riepilogo={v.figli ? riepilogoFigli(v.r.id, righe, spanDiId) : null}
                aperto={!chiusi.has(v.r.id)} selezionato={selezionatoId === v.r.id}
                critico={percorso.has(v.r.id)} conflitto={inConflitto.has(v.r.id)}
                inAnteprima={!!anteprima?.has(v.r.id)} oggi={giornoOggi}
                onEspandi={() => setChiusi((c) => { const n = new Set(c); if (n.has(v.r.id)) n.delete(v.r.id); else n.add(v.r.id); return n })}
                onApri={onApri} onInizia={inizia} />
            ))}

            <div ref={sovra} className="tkg-sovra" style={{ width: larghezza, height: altezza }}>
              {giornoOggi >= 0 && giornoOggi < giorni ? <div className="tkg-oggi" style={{ left: (giornoOggi + 0.5) * px }} /> : null}
              <svg width={larghezza} height={altezza} className="tkg-frecce" aria-hidden>
                <defs>
                  {(['normale', 'rosso', 'critico', 'scelta'] as const).map((k) => (
                    <marker key={k} id={`tkg-punta-${k}`} className="tkg-punta" data-tipo={k} viewBox="0 0 8 8" refX="7" refY="4"
                      markerWidth="7" markerHeight="7" orient="auto">
                      <path d="M0,0 L8,4 L0,8 z" />
                    </marker>
                  ))}
                </defs>
                {frecce.map((f) => (
                  <g key={f.key} data-rosso={f.rosso ? '' : undefined} data-fatto={f.fatto ? '' : undefined}
                    data-critica={f.critica ? '' : undefined}
                    data-scelta={frecciaScelta?.p === f.p && frecciaScelta?.s === f.s ? '' : undefined}>
                    <path className="tkg-freccia" d={f.d} markerEnd={`url(#tkg-punta-${
                      frecciaScelta?.p === f.p && frecciaScelta?.s === f.s ? 'scelta' : f.rosso ? 'rosso' : f.critica ? 'critico' : 'normale'})`} />
                    <path className="tkg-freccia-presa" d={f.d}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        const o = sovra.current?.getBoundingClientRect()
                        if (o) setFrecciaScelta({ p: f.p, s: f.s, x: e.clientX - o.left, y: e.clientY - o.top })
                      }}>
                      <title>{f.titolo}</title>
                    </path>
                  </g>
                ))}
                {filo ? (() => {
                  const sp = spanDiId(filo.da)
                  if (!sp) return null
                  const x1 = bordi(filo.da, sp).dx + 6
                  const y1 = yDi(filo.da)
                  return <path className="tkg-filo" d={`M${x1},${y1} C${x1 + 60},${y1} ${filo.x - 60},${filo.y} ${filo.x},${filo.y}`} />
                })() : null}
              </svg>
              {frecciaScelta ? (
                <button type="button" className="tkg-scollega" style={{ left: frecciaScelta.x, top: frecciaScelta.y }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => void scollega(frecciaScelta.p, frecciaScelta.s)}>
                  <Link2Off aria-hidden /> Scollega
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Dal primo inizio all'ultima fine dei sottotask: la parentesi sotto il task principale. */
function riepilogoFigli(id: number, righe: TaskRiga[], spanDiId: (id: number) => Span | null): (Span & { fatti: number; totale: number }) | null {
  let s = Infinity
  let f = -Infinity
  let fatti = 0
  let totale = 0
  for (const r of righe) {
    if (r.parentId !== id) continue
    totale++
    if (r.stato === 'COMPLETATO') fatti++
    const sp = spanDiId(r.id)
    if (!sp) continue
    s = Math.min(s, sp.s)
    f = Math.max(f, sp.f)
  }
  return Number.isFinite(s) ? { s, f, fatti, totale } : null
}

function RigaTask({ v, px, larghezza, span, colore, riepilogo, aperto, selezionato, critico, conflitto, inAnteprima, oggi, onEspandi, onApri, onInizia }: {
  v: Extract<Voce, { tipo: 'task' }>
  px: number
  larghezza: number
  span: Span | null
  colore: string
  riepilogo: (Span & { fatti: number; totale: number }) | null
  aperto: boolean
  selezionato: boolean
  critico: boolean
  conflitto: boolean
  inAnteprima: boolean
  oggi: number
  onEspandi: () => void
  onApri: (id: number) => void
  onInizia: (e: ReactPointerEvent, r: TaskRiga, modo: Modo) => void
}) {
  const r = v.r
  const fatto = chiuso(r)
  const traguardo = !!span && !r.dataInizio && span.s === span.f
  const durata = span ? span.f - span.s + 1 : 0
  const larga = span ? durata * px : 0
  const ritardo = !fatto && !!span && r.scadenza != null && span.f < oggi
  const etichettaDentro = !traguardo && larga >= 120
  const avanzamento = r.stato === 'COMPLETATO' ? 1 : r.sottotaskTotale ? r.sottotaskCompletati / r.sottotaskTotale : 0

  return (
    <div className="tkg-riga" data-gantt-id={r.id} data-livello={v.livello} data-selezionato={selezionato ? '' : undefined}
      style={{ ['--tk-c' as string]: colore }}>
      <div className="tkg-sx">
        {v.figli ? (
          <button type="button" className="tkg-espandi" aria-expanded={aperto} onClick={onEspandi}
            aria-label={aperto ? 'Nascondi i sottotask' : 'Mostra i sottotask'}><ChevronRight /></button>
        ) : <span className="tkg-espandi-vuoto" />}
        <span className="tkg-stato" data-stato={r.stato} aria-hidden />
        <button type="button" className="tkg-titolo" data-fatto={fatto ? '' : undefined} onClick={() => onApri(r.id)} title={r.titolo}>
          {r.titolo}
        </button>
        {r.inAttesaDi > 0 && !fatto ? <Hourglass className="tkg-attesa" aria-label="Aspetta un altro task" /> : null}
        {r.assegnatari.length ? <span className="tkg-avatar"><TaskAvatarStack persone={r.assegnatari} max={2} size="xs" /></span> : null}
      </div>
      <div className="tkg-dx" style={{ width: larghezza }}
        onPointerDown={!span && !fatto ? (e) => onInizia(e, r, 'disegna') : undefined}
        data-vuota={!span && !fatto ? '' : undefined}>
        {riepilogo ? (
          <div className="tkg-parentesi" style={{ left: riepilogo.s * px, width: (riepilogo.f - riepilogo.s + 1) * px }}
            title={`Sottotask: ${riepilogo.fatti} su ${riepilogo.totale} completati`} />
        ) : null}
        {span ? (
          <div className={traguardo ? 'tkg-traguardo' : 'tkg-barra'} data-gantt-id={r.id}
            data-fatto={fatto ? '' : undefined} data-critico={critico ? '' : undefined} data-conflitto={conflitto ? '' : undefined}
            data-ritardo={ritardo ? '' : undefined} data-anteprima={inAnteprima ? '' : undefined}
            data-modificabile={!fatto ? '' : undefined}
            style={traguardo ? { left: span.s * px + px / 2 } : { left: span.s * px, width: larga }}
            title={`${r.titolo}\n${descriviDate(r)}${r.assegnatari.length ? `\n${r.assegnatari.map(nomeCompleto).join(', ')}` : ''}`}
            onPointerDown={(e) => onInizia(e, r, 'sposta')}>
            {!traguardo ? <span className="tkg-avanza" style={{ width: `${avanzamento * 100}%` }} /> : null}
            {!fatto ? (
              <>
                <span className="tkg-maniglia" data-lato="inizio" onPointerDown={(e) => onInizia(e, r, 'inizio')} />
                {!traguardo ? <span className="tkg-maniglia" data-lato="fine" onPointerDown={(e) => onInizia(e, r, 'fine')} /> : null}
              </>
            ) : null}
            <span className="tkg-collega" title="Tira su un altro task: quello aspetterà questo"
              onPointerDown={(e) => onInizia(e, r, 'collega')} />
            {etichettaDentro ? <span className="tkg-etichetta-dentro">{r.titolo}</span> : null}
          </div>
        ) : (
          <span className="tkg-pianifica">Trascina qui per pianificare</span>
        )}
        {span && !etichettaDentro ? (
          <span className="tkg-etichetta" style={{ left: (traguardo ? span.s * px + px / 2 + 12 : (span.f + 1) * px + 8) }}>
            {r.titolo}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function descriviDate(r: TaskRiga): string {
  const g = (iso: string | null) => {
    const d = parseDataLocale(iso)
    return d ? format(d, 'EEE d MMM', { locale: it }) : null
  }
  const s = g(r.dataInizio)
  const f = g(r.scadenza)
  if (s && f) {
    const n = differenceInCalendarDays(parseDataLocale(r.scadenza)!, parseDataLocale(r.dataInizio)!) + 1
    return `${s} → ${f} · ${n === 1 ? '1 giorno' : `${n} giorni`}`
  }
  if (f) return `Scade ${f}`
  if (s) return `Inizia ${s}`
  return ''
}
