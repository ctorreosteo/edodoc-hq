import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Film, Heart, Images, List, MessageSquare, Plus, Rows3, Sparkles, Youtube } from 'lucide-react'
import { toast } from '@/lib/toast'
import { CANALI, INFO_CANALE } from '@/lib/planner-canali'
import { giornateNelPeriodo, type Giornata } from '@/lib/planner-giornate'
import {
  etichettaGiornoLunga,
  etichettaMese,
  giorniNelMese,
  giornoRoma,
  giornoSettimana,
  inizioMese,
  inizioSettimana,
  localeRoma,
  oggiRoma,
  oraRoma,
  piuGiorni,
  piuMesi,
} from '@/lib/planner-tempo'
import {
  messaggioErrorePlanner,
  plannerService,
  urlMedia,
  type PlannerCalendario,
  type PlannerCanale,
  type PlannerPost,
  type PlannerSlot,
  type PlannerStato,
} from '@/services/planner-service'
import { ChipStato, IconaCanale } from './planner-ui'
import { compatto } from '@/lib/planner-formato'
import type { PresetComposer } from './planner-composer'

export type VistaCalendario = 'mese' | 'settimana' | 'lista'

const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const ORA_INIZIO = 7
const ORA_FINE = 23
const ALTEZZA_ORA = 56
const SPOSTABILI = new Set(['IDEA', 'BOZZA', 'IN_APPROVAZIONE', 'PROGRAMMATO'])
const CHIAVE_VISTA = 'planner.vista'

function leggiVista(): VistaCalendario {
  try {
    const v = localStorage.getItem(CHIAVE_VISTA)
    return v === 'settimana' || v === 'lista' ? v : 'mese'
  } catch {
    return 'mese'
  }
}

function interazioni(p: PlannerPost): number | null {
  let tot: number | null = null
  for (const c of p.canali) {
    const m = c.metriche
    if (!m) continue
    tot = (tot ?? 0) + (m.miPiace ?? 0) + (m.commenti ?? 0) + (m.condivisioni ?? 0) + (m.salvataggi ?? 0)
  }
  return tot
}

function canaliUnici(p: PlannerPost): PlannerCanale[] {
  return [...new Set(p.canali.map((c) => c.canale))].sort((a, b) => CANALI.indexOf(a) - CANALI.indexOf(b))
}

/** Scheda di un post nel calendario: miniatura, ora, canali, rubrica, stato. Trascinabile se non è ancora partito. */
function ChipPost({
  p,
  colore,
  compatta,
  onApri,
  stile,
  onSopra,
}: {
  p: PlannerPost
  colore: string | null
  compatta?: boolean
  onApri: (p: PlannerPost) => void
  stile?: CSSProperties
  onSopra?: (p: PlannerPost | null, el?: HTMLElement) => void
}) {
  const spostabile = SPOSTABILI.has(p.stato)
  const m = p.media[0]
  const num = interazioni(p)
  return (
    <button
      type="button"
      className="pl-cal-post"
      data-stato={p.stato}
      data-compatta={compatta ? '' : undefined}
      draggable={spostabile}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/planner-post', String(p.id))
        e.dataTransfer.effectAllowed = 'copyMove'
        onSopra?.(null)
      }}
      onMouseEnter={(e) => onSopra?.(p, e.currentTarget)}
      onMouseLeave={() => onSopra?.(null)}
      onClick={(e) => {
        e.stopPropagation()
        onApri(p)
      }}
      style={{ ...(colore ? ({ '--pl-r': colore } as CSSProperties) : {}), ...stile }}
      aria-label={`${p.titolo ?? p.testo ?? 'Post'}${spostabile ? ' · trascina per spostare, con Alt per duplicare' : ''}`}
    >
      {m ? (
        <span className="pl-cal-post-mini">
          <img src={urlMedia(m.anteprimaUrl ?? (m.tipo === 'IMMAGINE' ? m.url : null))} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
          {m.tipo === 'VIDEO' ? <Film className="size-2.5" /> : p.media.length > 1 ? <Images className="size-2.5" /> : null}
        </span>
      ) : null}
      <span className="pl-cal-post-testi">
        <span className="pl-cal-post-riga">
          {p.programmatoAlle ? <span className="pl-cal-post-ora">{oraRoma(p.programmatoAlle)}</span> : null}
          <span className="pl-cal-post-icone">
            {canaliUnici(p).slice(0, 5).map((c) => (
              <IconaCanale key={c} canale={c} className="size-2.5" />
            ))}
          </span>
          {p.commenti ? (
            <span className="pl-cal-post-commenti">
              <MessageSquare className="size-2.5" />
              {p.commenti}
            </span>
          ) : null}
        </span>
        {!compatta ? <span className="pl-cal-post-titolo">{p.titolo || p.testo || 'Senza testo'}</span> : null}
        {!compatta && num != null ? (
          <span className="pl-cal-post-num">
            <Heart className="size-2.5" /> {compatto(num)}
          </span>
        ) : null}
      </span>
      <span className="pl-cal-post-stato" aria-label={p.stato} />
    </button>
  )
}

/** Anteprima al passaggio del mouse: immagine, testo, canali e stato, senza aprire il post. */
function SchedaSopra({ p, rect, colore }: { p: PlannerPost; rect: DOMRect; colore: string | null }) {
  const larghezza = 300
  const destra = rect.right + 10 + larghezza < window.innerWidth
  const left = destra ? rect.right + 10 : Math.max(8, rect.left - larghezza - 10)
  const top = Math.min(Math.max(8, rect.top - 10), window.innerHeight - 340)
  const m = p.media[0]
  return (
    <div className="pl-scheda-sopra" style={{ left, top, width: larghezza, '--pl-r': colore ?? 'transparent' } as CSSProperties} role="tooltip">
      {m ? <img src={urlMedia(m.anteprimaUrl ?? m.url)} alt="" /> : null}
      <div className="pl-scheda-sopra-corpo">
        <div className="pl-scheda-sopra-riga">
          <ChipStato stato={p.stato} compatto />
          {p.programmatoAlle ? <span>{oraRoma(p.programmatoAlle)}</span> : null}
        </div>
        <b>{p.titolo || 'Post senza titolo'}</b>
        {p.testo ? <p>{p.testo.length > 220 ? `${p.testo.slice(0, 220)}…` : p.testo}</p> : null}
        <div className="pl-scheda-sopra-canali">
          {p.canali.map((c) => (
            <span key={c.id} data-stato={c.stato} title={c.accountNome ?? ''}>
              <IconaCanale canale={c.canale} className="size-3" />
            </span>
          ))}
          {p.media.length > 1 ? <em>{p.media.length} media</em> : null}
          {p.commenti ? <em>{p.commenti} commenti</em> : null}
        </div>
      </div>
    </div>
  )
}

export function PlannerCalendario({
  stato,
  generazione,
  onApri,
  onNuovo,
  onCambiato,
}: {
  stato: PlannerStato
  generazione: number
  onApri: (p: PlannerPost) => void
  onNuovo: (preset: PresetComposer) => void
  onCambiato: () => void
}) {
  const brandId = stato.brandId
  const [vista, setVista] = useState<VistaCalendario>(leggiVista)
  const [riferimento, setRiferimento] = useState(oggiRoma())
  const [dati, setDati] = useState<PlannerCalendario | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [caricamento, setCaricamento] = useState(false)
  const [slot, setSlot] = useState<PlannerSlot[]>([])
  const [filtroCanali, setFiltroCanali] = useState<PlannerCanale[]>([])
  const [filtroRubrica, setFiltroRubrica] = useState<number | null>(null)
  const [mostraGiornate, setMostraGiornate] = useState(true)
  const [sopra, setSopra] = useState<string | null>(null)
  const [schedaSopra, setSchedaSopra] = useState<{ p: PlannerPost; rect: DOMRect } | null>(null)
  const timerSopra = useRef<number | null>(null)
  const suSopra = useCallback((p: PlannerPost | null, el?: HTMLElement) => {
    if (timerSopra.current) window.clearTimeout(timerSopra.current)
    if (!p || !el) {
      setSchedaSopra(null)
      return
    }
    timerSopra.current = window.setTimeout(() => setSchedaSopra({ p, rect: el.getBoundingClientRect() }), 380)
  }, [])
  const richiesta = useRef(0)

  const cambiaVista = (v: VistaCalendario) => {
    setVista(v)
    try {
      localStorage.setItem(CHIAVE_VISTA, v)
    } catch {
      /* storage non disponibile */
    }
  }

  const [dal, al] = useMemo(() => {
    if (vista === 'settimana') {
      const s = inizioSettimana(riferimento)
      return [s, piuGiorni(s, 6)]
    }
    if (vista === 'lista') return [oggiRoma() > riferimento ? riferimento : oggiRoma(), piuGiorni(oggiRoma() > riferimento ? riferimento : oggiRoma(), 41)]
    const m = inizioMese(riferimento)
    const s = inizioSettimana(m)
    return [s, piuGiorni(s, 41)]
  }, [vista, riferimento])

  const carica = useCallback(
    async (silenzioso = false) => {
      const n = ++richiesta.current
      if (!silenzioso) setCaricamento(true)
      try {
        const c = await plannerService.calendario(brandId, dal, al)
        if (n !== richiesta.current) return
        setDati(c)
        setErrore(null)
      } catch (err) {
        if (n === richiesta.current) setErrore(messaggioErrorePlanner(err, 'Calendario non disponibile'))
      } finally {
        if (n === richiesta.current) setCaricamento(false)
      }
    },
    [brandId, dal, al],
  )

  useEffect(() => {
    void carica(dati != null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carica, generazione])

  useEffect(() => {
    void plannerService.slot().then(setSlot).catch(() => undefined)
  }, [generazione])

  const colori = useMemo(() => new Map(stato.etichette.map((e) => [e.id, e.colore])), [stato.etichette])

  const postFiltrati = useMemo(() => {
    const p = dati?.post ?? []
    return p.filter(
      (x) =>
        (!filtroCanali.length || x.canali.some((c) => filtroCanali.includes(c.canale))) &&
        (filtroRubrica == null || x.etichettaId === filtroRubrica),
    )
  }, [dati, filtroCanali, filtroRubrica])

  const perGiorno = useMemo(() => {
    const m = new Map<string, PlannerPost[]>()
    for (const p of postFiltrati) {
      if (!p.programmatoAlle) continue
      const g = giornoRoma(p.programmatoAlle)
      m.set(g, [...(m.get(g) ?? []), p])
    }
    return m
  }, [postFiltrati])

  const giornate = useMemo(() => {
    const m = new Map<string, Giornata[]>()
    if (!mostraGiornate) return m
    for (const g of giornateNelPeriodo(dal, al)) m.set(g.giorno, [...(m.get(g.giorno) ?? []), g])
    return m
  }, [dal, al, mostraGiornate])

  const youtube = useMemo(() => {
    const m = new Map<string, PlannerCalendario['youtube']>()
    for (const v of dati?.youtube ?? []) m.set(v.data, [...(m.get(v.data) ?? []), v])
    return m
  }, [dati])

  const naviga = (verso: -1 | 1) => {
    if (vista === 'settimana') setRiferimento(piuGiorni(riferimento, 7 * verso))
    else if (vista === 'lista') setRiferimento(piuGiorni(riferimento, 42 * verso))
    else setRiferimento(piuMesi(inizioMese(riferimento), verso))
  }

  // ── Trascinamento ──

  const sposta = async (postId: number, nuovoQuando: string) => {
    const p = dati?.post.find((x) => x.id === postId)
    if (!p) return
    if (p.programmatoAlle && localeRoma(p.programmatoAlle) === nuovoQuando) return
    if (p.stato === 'PROGRAMMATO' && nuovoQuando < localeRoma(new Date())) {
      toast.error('Un post programmato va spostato nel futuro.')
      return
    }
    // Ottimista: il post si sposta subito; se il backend dice no torna dov'era
    const prima = dati
    setDati((d) =>
      d ? { ...d, post: d.post.map((x) => (x.id === postId ? { ...x, programmatoAlle: `${nuovoQuando}:00${offset(nuovoQuando)}` } : x)) } : d,
    )
    const vecchioQuando = p.programmatoAlle ? localeRoma(p.programmatoAlle) : null
    try {
      await plannerService.sposta(postId, nuovoQuando)
      toast.success('Post spostato', {
        description: `${etichettaGiornoLunga(nuovoQuando.slice(0, 10))} alle ${nuovoQuando.slice(11)}`,
        action: vecchioQuando
          ? {
              label: 'Annulla',
              onClick: () =>
                void plannerService
                  .sposta(postId, vecchioQuando)
                  .then(() => {
                    toast.success('Spostamento annullato')
                    onCambiato()
                    void carica(true)
                  })
                  .catch((err) => toast.error(messaggioErrorePlanner(err, 'Non annullato'))),
            }
          : undefined,
      })
      onCambiato()
    } catch (err) {
      setDati(prima)
      toast.error(messaggioErrorePlanner(err, 'Post non spostato'))
    }
  }

  const suDrop = (e: DragEvent, giorno: string, ora?: number) => {
    e.preventDefault()
    setSopra(null)
    const id = Number(e.dataTransfer.getData('text/planner-post'))
    if (!id) return
    const p = dati?.post.find((x) => x.id === id)
    const oraOriginale = p?.programmatoAlle ? oraRoma(p.programmatoAlle) : '12:30'
    const o = ora != null ? `${String(ora).padStart(2, '0')}:${oraOriginale.slice(3)}` : oraOriginale
    if (e.altKey) void duplicaIn(id, `${giorno}T${o}`)
    else void sposta(id, `${giorno}T${o}`)
  }

  /** Alt + trascina: una copia del post (bozza) nel giorno e all'ora di arrivo. */
  const duplicaIn = async (postId: number, quando: string) => {
    try {
      const copia = await plannerService.duplica(postId)
      await plannerService.sposta(copia.id, quando)
      toast.success('Copia creata fra le bozze', { description: `${etichettaGiornoLunga(quando.slice(0, 10))} alle ${quando.slice(11)}` })
      onCambiato()
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Copia non creata'))
    }
  }

  const suDragOver = (e: DragEvent, chiave: string) => {
    if (!e.dataTransfer.types.includes('text/planner-post')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move'
    if (sopra !== chiave) setSopra(chiave)
  }

  const oggi = oggiRoma()
  // Le settimane che il mese tocca davvero (5 o 6)
  const celleMese = Math.ceil((giornoSettimana(inizioMese(riferimento)) - 1 + giorniNelMese(riferimento)) / 7) * 7
  const slotDi = (giorno: string) => slot.filter((s) => s.giorno === giornoSettimana(giorno)).map((s) => s.ora)

  const nuovoNelGiorno = (giorno: string) => {
    const liberi = slotDi(giorno).filter((o) => !(perGiorno.get(giorno) ?? []).some((p) => p.programmatoAlle && oraRoma(p.programmatoAlle) === o))
    const ora = liberi.find((o) => giorno !== oggi || o > oraRoma(new Date())) ?? '12:30'
    onNuovo({ quando: `${giorno}T${ora}` })
  }

  const titoloPeriodo =
    vista === 'mese'
      ? etichettaMese(riferimento)
      : vista === 'settimana'
        ? `${etichettaGiornoLunga(dal).replace(/^\w+ /, '')} – ${etichettaGiornoLunga(al).replace(/^\w+ /, '')}`
        : 'Prossime sei settimane'

  // Riepilogo del periodo visibile (solo il mese/settimana vero, non i giorni di contorno)
  const riepilogo = useMemo(() => {
    const dentro = postFiltrati.filter((p) => {
      if (!p.programmatoAlle) return false
      const g = giornoRoma(p.programmatoAlle)
      return vista !== 'mese' || g.slice(0, 7) === riferimento.slice(0, 7)
    })
    return {
      totale: dentro.length,
      programmati: dentro.filter((p) => p.stato === 'PROGRAMMATO').length,
      pubblicati: dentro.filter((p) => ['PUBBLICATO', 'DA_COMPLETARE', 'PARZIALE'].includes(p.stato)).length,
      idee: dentro.filter((p) => p.stato === 'IDEA' || p.stato === 'BOZZA').length,
    }
  }, [postFiltrati, vista, riferimento])

  return (
    <div className="pl-cal" data-vista={vista}>
      <div className="pl-cal-barra">
        <div className="pl-cal-nav">
          <button type="button" className="pl-icon-btn" onClick={() => naviga(-1)} aria-label="Periodo precedente">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" className="pl-btn" data-variante="mini-ghost" onClick={() => setRiferimento(oggiRoma())}>
            Oggi
          </button>
          <button type="button" className="pl-icon-btn" onClick={() => naviga(1)} aria-label="Periodo successivo">
            <ChevronRight className="size-4" />
          </button>
          <div className="pl-cal-titolo">
            {titoloPeriodo}
            {caricamento ? <span className="pl-cal-carica" aria-hidden /> : null}
          </div>
        </div>
        <div className="pl-cal-riepilogo" aria-label="Riepilogo del periodo">
          <span>
            <b>{riepilogo.totale}</b> post
          </span>
          <span data-tono="info">
            <b>{riepilogo.programmati}</b> programmati
          </span>
          <span data-tono="ok">
            <b>{riepilogo.pubblicati}</b> usciti
          </span>
          <span data-tono="violet">
            <b>{riepilogo.idee}</b> idee e bozze
          </span>
        </div>
        <div className="pl-seg" role="radiogroup" aria-label="Vista">
          {(
            [
              ['mese', 'Mese', CalendarDays],
              ['settimana', 'Settimana', Rows3],
              ['lista', 'Lista', List],
            ] as const
          ).map(([v, e, Icona]) => (
            <button key={v} type="button" role="radio" aria-checked={vista === v} data-on={vista === v ? '' : undefined} onClick={() => cambiaVista(v)}>
              <Icona className="size-3.5" /> {e}
            </button>
          ))}
        </div>
      </div>

      <div className="pl-cal-filtri">
        <div className="pl-filtro-canali" role="group" aria-label="Filtra per canale">
          {CANALI.map((c) => {
            const on = filtroCanali.includes(c)
            return (
              <button
                key={c}
                type="button"
                className="pl-filtro-canale"
                data-on={on ? '' : undefined}
                aria-pressed={on}
                style={{ '--pl-c': INFO_CANALE[c].colore } as CSSProperties}
                onClick={() => setFiltroCanali((f) => (on ? f.filter((x) => x !== c) : [...f, c]))}
                title={INFO_CANALE[c].nome}
              >
                <IconaCanale canale={c} className="size-3.5" />
              </button>
            )
          })}
        </div>
        <div className="pl-rubriche" role="group" aria-label="Filtra per rubrica">
          {stato.etichette.map((e) => (
            <button
              key={e.id}
              type="button"
              className="pl-rubrica"
              data-on={filtroRubrica === e.id ? '' : undefined}
              style={{ '--pl-r': e.colore } as CSSProperties}
              onClick={() => setFiltroRubrica(filtroRubrica === e.id ? null : e.id)}
            >
              <span className="pl-rubrica-dot" />
              {e.nome}
            </button>
          ))}
        </div>
        <label className="pl-switch-mini">
          <input type="checkbox" checked={mostraGiornate} onChange={(e) => setMostraGiornate(e.target.checked)} />
          <span>Giornate e ricorrenze</span>
        </label>
      </div>

      {errore ? (
        <div className="pl-banner" data-tono="danger">
          {errore}
          <button type="button" className="pl-btn" data-variante="mini" onClick={() => void carica()}>
            Riprova
          </button>
        </div>
      ) : null}

      {vista === 'mese' ? (
        <div className="pl-mese" role="grid" aria-label="Calendario del mese">
          {GIORNI.map((g) => (
            <div key={g} className="pl-mese-intestazione" role="columnheader">
              {g}
            </div>
          ))}
          {Array.from({ length: celleMese }, (_, i) => {
            const g = piuGiorni(dal, i)
            const fuori = g.slice(0, 7) !== riferimento.slice(0, 7)
            const post = perGiorno.get(g) ?? []
            const gio = giornate.get(g) ?? []
            const yt = youtube.get(g) ?? []
            const passato = g < oggi
            const visibili = post.slice(0, 4)
            return (
              <div
                key={g}
                role="gridcell"
                className="pl-mese-giorno"
                data-fuori={fuori ? '' : undefined}
                data-oggi={g === oggi ? '' : undefined}
                data-passato={passato ? '' : undefined}
                data-sopra={sopra === g ? '' : undefined}
                onDragOver={(e) => suDragOver(e, g)}
                onDragLeave={() => setSopra((s) => (s === g ? null : s))}
                onDrop={(e) => suDrop(e, g)}
                onDoubleClick={() => !passato && nuovoNelGiorno(g)}
              >
                <div className="pl-mese-giorno-testa">
                  <span className="pl-mese-numero">{Number(g.slice(8))}</span>
                  {!passato ? (
                    <button type="button" className="pl-mese-aggiungi" onClick={() => nuovoNelGiorno(g)} aria-label={`Nuovo post ${etichettaGiornoLunga(g)}`}>
                      <Plus className="size-3" />
                    </button>
                  ) : null}
                </div>
                {gio.map((x) => (
                  <button
                    key={x.nome}
                    type="button"
                    className="pl-giornata"
                    data-tipo={x.tipo}
                    title={`${x.nome}${!passato ? ' · clicca per creare un post' : ''}`}
                    onClick={() => !passato && onNuovo({ quando: `${g}T12:30`, titolo: x.nome })}
                  >
                    {x.tipo === 'salute' ? <Sparkles className="size-2.5" /> : null}
                    <span>{x.nome}</span>
                  </button>
                ))}
                {yt.map((v) => (
                  <a key={v.id} className="pl-cal-yt" href="/youtube?tab=piano" title={`Piano YouTube: ${v.titolo} (${v.stato.toLowerCase()})`}>
                    <Youtube className="size-3" />
                    <span>{v.titolo}</span>
                  </a>
                ))}
                <div className="pl-mese-post">
                  {visibili.map((p) => (
                    <ChipPost key={p.id} p={p} colore={p.etichettaId ? colori.get(p.etichettaId) ?? null : null} onApri={onApri} compatta={post.length > 2} onSopra={suSopra} />
                  ))}
                  {post.length > visibili.length ? (
                    <button type="button" className="pl-mese-altri" onClick={() => { setRiferimento(g); cambiaVista('settimana') }}>
                      +{post.length - visibili.length} altri
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {vista === 'settimana' ? (
        <div className="pl-settimana">
          <div className="pl-settimana-testa">
            <div />
            {Array.from({ length: 7 }, (_, i) => {
              const g = piuGiorni(dal, i)
              const gio = giornate.get(g) ?? []
              return (
                <div key={g} className="pl-settimana-giorno" data-oggi={g === oggi ? '' : undefined}>
                  <span>{GIORNI[i]}</span>
                  <b>{Number(g.slice(8))}</b>
                  {gio.length ? (
                    <span className="pl-giornata" data-tipo={gio[0].tipo} title={gio.map((x) => x.nome).join(' · ')}>
                      <span>{gio[0].nome}</span>
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
          <div className="pl-settimana-corpo" style={{ '--pl-ora-h': `${ALTEZZA_ORA}px` } as CSSProperties}>
            <div className="pl-settimana-ore">
              {Array.from({ length: ORA_FINE - ORA_INIZIO }, (_, i) => (
                <div key={i} className="pl-settimana-ora">
                  {String(ORA_INIZIO + i).padStart(2, '0')}:00
                </div>
              ))}
            </div>
            {Array.from({ length: 7 }, (_, i) => {
              const g = piuGiorni(dal, i)
              const post = perGiorno.get(g) ?? []
              const adesso = new Date()
              const minAdesso = Number(oraRoma(adesso).slice(0, 2)) * 60 + Number(oraRoma(adesso).slice(3))
              return (
                <div key={g} className="pl-settimana-colonna" data-oggi={g === oggi ? '' : undefined} data-passato={g < oggi ? '' : undefined}>
                  {Array.from({ length: ORA_FINE - ORA_INIZIO }, (_, h) => {
                    const ora = ORA_INIZIO + h
                    const chiave = `${g}|${ora}`
                    return (
                      <div
                        key={h}
                        className="pl-settimana-cella"
                        data-sopra={sopra === chiave ? '' : undefined}
                        onDragOver={(e) => suDragOver(e, chiave)}
                        onDragLeave={() => setSopra((s) => (s === chiave ? null : s))}
                        onDrop={(e) => suDrop(e, g, ora)}
                        onDoubleClick={() => g >= oggi && onNuovo({ quando: `${g}T${String(ora).padStart(2, '0')}:00` })}
                      />
                    )
                  })}
                  {slotDi(g).map((o) => {
                    const min = Number(o.slice(0, 2)) * 60 + Number(o.slice(3))
                    const occupato = post.some((p) => p.programmatoAlle && oraRoma(p.programmatoAlle) === o)
                    if (occupato || min < ORA_INIZIO * 60 || (g === oggi && min < minAdesso) || g < oggi) return null
                    return (
                      <button
                        key={o}
                        type="button"
                        className="pl-slot-libero"
                        style={{ top: ((min - ORA_INIZIO * 60) / 60) * ALTEZZA_ORA }}
                        onClick={() => onNuovo({ quando: `${g}T${o}` })}
                        title="Orario della coda libero: clicca per un nuovo post"
                      >
                        <Plus className="size-3" /> {o}
                      </button>
                    )
                  })}
                  {post.map((p) => {
                    const o = oraRoma(p.programmatoAlle!)
                    const min = Math.max(ORA_INIZIO * 60, Number(o.slice(0, 2)) * 60 + Number(o.slice(3)))
                    return (
                      <ChipPost
                        key={p.id}
                        p={p}
                        colore={p.etichettaId ? colori.get(p.etichettaId) ?? null : null}
                        onApri={onApri}
                        onSopra={suSopra}
                        stile={{ position: 'absolute', top: ((min - ORA_INIZIO * 60) / 60) * ALTEZZA_ORA + 2, left: 4, right: 4 }}
                      />
                    )
                  })}
                  {g === oggi && minAdesso >= ORA_INIZIO * 60 && minAdesso < ORA_FINE * 60 ? (
                    <div className="pl-adesso" style={{ top: ((minAdesso - ORA_INIZIO * 60) / 60) * ALTEZZA_ORA }} aria-hidden />
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {schedaSopra ? (
        <SchedaSopra p={schedaSopra.p} rect={schedaSopra.rect} colore={schedaSopra.p.etichettaId ? colori.get(schedaSopra.p.etichettaId) ?? null : null} />
      ) : null}

      {vista === 'lista' ? (
        <div className="pl-lista">
          {Array.from({ length: 42 }, (_, i) => piuGiorni(dal, i))
            .filter((g) => (perGiorno.get(g) ?? []).length || (giornate.get(g) ?? []).some((x) => x.tipo === 'salute'))
            .map((g) => (
              <div key={g} className="pl-lista-giorno">
                <div className="pl-lista-data" data-oggi={g === oggi ? '' : undefined}>
                  <b>{Number(g.slice(8))}</b>
                  <span>{etichettaGiornoLunga(g).split(' ')[0]}</span>
                </div>
                <div className="pl-lista-voci">
                  {(giornate.get(g) ?? []).map((x) => (
                    <button key={x.nome} type="button" className="pl-giornata" data-tipo={x.tipo} onClick={() => onNuovo({ quando: `${g}T12:30`, titolo: x.nome })}>
                      <Sparkles className="size-2.5" /> <span>{x.nome}</span>
                    </button>
                  ))}
                  {(perGiorno.get(g) ?? []).map((p) => (
                    <button key={p.id} type="button" className="pl-lista-post" onClick={() => onApri(p)} style={{ '--pl-r': p.etichettaId ? colori.get(p.etichettaId) : undefined } as CSSProperties}>
                      <span className="pl-lista-ora">{oraRoma(p.programmatoAlle!)}</span>
                      {p.media[0] ? <img src={urlMedia(p.media[0].anteprimaUrl ?? p.media[0].url)} alt="" className="pl-lista-mini" /> : <span className="pl-lista-mini" data-vuota="" />}
                      <span className="pl-lista-testi">
                        <b>{p.titolo || 'Senza titolo'}</b>
                        <span>{p.testo || '—'}</span>
                      </span>
                      <span className="pl-cal-post-icone">
                        {canaliUnici(p).map((c) => (
                          <IconaCanale key={c} canale={c} className="size-3.5" />
                        ))}
                      </span>
                      <ChipStato stato={p.stato} compatto />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          {postFiltrati.length === 0 ? (
            <div className="pl-lista-vuota">
              Niente in programma nelle prossime sei settimane.{' '}
              <button type="button" className="pl-link" onClick={() => onNuovo({})}>
                Crea il primo post
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Offset di Roma in quel momento ("+01:00" o "+02:00"), per gli aggiornamenti ottimisti. */
function offset(locale: string): string {
  const d = new Date(`${locale}:00Z`)
  const roma = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
  const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }))
  const ore = Math.round((roma.getTime() - utc.getTime()) / 3600000)
  return `+${String(ore).padStart(2, '0')}:00`
}
