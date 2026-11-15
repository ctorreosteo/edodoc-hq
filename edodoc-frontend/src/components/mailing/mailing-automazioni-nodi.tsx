import { memo, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { LogOut, MailOpen, MousePointerClick, Zap } from 'lucide-react'
import type { MailingGrafo, MailingTipoNodo, MailingTipoTrigger } from '@/services/mailing-service'
import { ICONA_TRIGGER, META_NODO } from './mailing-automazioni-meta'
import { NODO_ALTEZZA, NODO_LARGHEZZA, ID_TRIGGER, nodoIniziale, posizioneTrigger, puntoIngresso, puntoUscita } from '@/lib/mailing-grafo'
import { formatCompatto, formatPercentuale } from './mailing-utils'

/* Mattoni visivi della tela automazioni: card dei nodi, card del trigger, menu "aggiungi passo", anteprima mini. */

// ───────────────────────── Card nodo ─────────────────────────

/**
 * Il focus col mouse farebbe scorrere la tela (overflow nascosto) per mostrare la card: lo diamo a mano senza scorrere.
 * Con Tab invece lo scorrimento avviene e la tela lo converte in pan (vedi onScroll in mailing-automazioni-tela).
 */
function evitaScorrimento(e: ReactMouseEvent<HTMLElement>) {
  if (e.button !== 0) return
  e.preventDefault()
  e.currentTarget.focus({ preventScroll: true })
}

export type ReportCard = {
  entrati: number
  inAttesa: number
  usciti: number
  tassoApertura: number | null
  tassoClick: number | null
}

type PropsNodo = {
  id: string
  tipo: MailingTipoNodo
  x: number
  y: number
  numero: number
  titolo: string
  dettaglio: string
  selezionato: boolean
  trascinato: boolean
  errori: number
  avvisi: number
  primoProblema: string | null
  report: ReportCard | null
  /** Contatore aumentato dall'ultimo aggiornamento: fa partire il guizzo. */
  guizzo: number
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>, id: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>, id: string) => void
}

export const CardNodo = memo(function CardNodo(p: PropsNodo) {
  const meta = META_NODO[p.tipo]
  const Icona = meta.icona
  const problemi = p.errori + p.avvisi
  const etichettaAria = `Passo ${p.numero}: ${meta.etichetta}. ${p.titolo}.${problemi ? ` ${p.primoProblema ?? ''}` : ''}`
  return (
    <div
      className="ml-au-nodo"
      data-tipo={p.tipo}
      data-au-nodo={p.id}
      data-selezionato={p.selezionato ? '' : undefined}
      data-trascinato={p.trascinato ? '' : undefined}
      data-errore={p.errori ? '' : undefined}
      data-avviso={!p.errori && p.avvisi ? '' : undefined}
      style={{ translate: `${p.x}px ${p.y}px`, width: NODO_LARGHEZZA, height: NODO_ALTEZZA }}
      role="button"
      tabIndex={0}
      aria-pressed={p.selezionato}
      aria-label={etichettaAria}
      onPointerDown={(e) => p.onPointerDown(e, p.id)}
      onMouseDown={evitaScorrimento}
      onKeyDown={(e) => p.onKeyDown(e, p.id)}
    >
      <div className="ml-au-nodo-testa">
        <span className="ml-au-nodo-icona" aria-hidden>
          <Icona className="size-3.5" />
        </span>
        <span className="ml-au-nodo-tipo">{meta.etichetta}</span>
        <span className="ml-au-nodo-num" aria-hidden>{p.numero}</span>
      </div>
      <div className="ml-au-nodo-titolo" title={p.titolo}>{p.titolo}</div>
      {p.report ? <StatisticheNodo tipo={p.tipo} r={p.report} /> : <div className="ml-au-nodo-dettaglio" title={p.dettaglio}>{p.dettaglio}</div>}
      {problemi ? (
        <span className="ml-au-nodo-problema" data-gravita={p.errori ? 'errore' : 'avviso'} title={p.primoProblema ?? undefined} aria-hidden>
          {problemi > 1 ? problemi : '!'}
        </span>
      ) : null}
      {p.report && p.report.inAttesa > 0 ? (
        <span className="ml-au-nodo-qui" key={p.guizzo} title={`${p.report.inAttesa} persone sono su questo passo adesso`}>
          <span className="ml-au-nodo-qui-punto" aria-hidden />
          {formatCompatto(p.report.inAttesa)} qui ora
        </span>
      ) : null}
    </div>
  )
})

function StatisticheNodo({ tipo, r }: { tipo: MailingTipoNodo; r: ReportCard }) {
  if (tipo === 'EMAIL') {
    return (
      <div className="ml-au-nodo-stat">
        <span title="Persone arrivate a questo passo"><b>{formatCompatto(r.entrati)}</b> inviate</span>
        <span title="Tasso di apertura (aperture umane)"><MailOpen className="size-3" aria-hidden /> <b>{formatPercentuale(r.tassoApertura, 0)}</b></span>
        <span title="Tasso di click"><MousePointerClick className="size-3" aria-hidden /> <b>{formatPercentuale(r.tassoClick, 0)}</b></span>
      </div>
    )
  }
  return (
    <div className="ml-au-nodo-stat">
      <span title="Persone arrivate a questo passo"><b>{formatCompatto(r.entrati)}</b> passate</span>
      {r.usciti ? (
        <span title="Uscite dal percorso su questo passo"><LogOut className="size-3" aria-hidden /> <b>{formatCompatto(r.usciti)}</b> uscite</span>
      ) : null}
    </div>
  )
}

// ───────────────────────── Card trigger ─────────────────────────

type PropsTrigger = {
  x: number
  y: number
  tipo: MailingTipoTrigger | null
  descrizione: string
  uscita: string
  selezionato: boolean
  errori: number
  entrati: number | null
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>, id: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>, id: string) => void
}

export const CardTrigger = memo(function CardTrigger(p: PropsTrigger) {
  const Icona = p.tipo ? ICONA_TRIGGER[p.tipo] ?? Zap : Zap
  return (
    <div
      className="ml-au-nodo ml-au-trigger"
      data-au-nodo={ID_TRIGGER}
      data-selezionato={p.selezionato ? '' : undefined}
      data-errore={p.errori ? '' : undefined}
      style={{ translate: `${p.x}px ${p.y}px`, width: NODO_LARGHEZZA, height: NODO_ALTEZZA }}
      role="button"
      tabIndex={0}
      aria-pressed={p.selezionato}
      aria-label={`Inizio: ${p.descrizione}. ${p.uscita}`}
      onPointerDown={(e) => p.onPointerDown(e, ID_TRIGGER)}
      onMouseDown={evitaScorrimento}
      onKeyDown={(e) => p.onKeyDown(e, ID_TRIGGER)}
    >
      <div className="ml-au-nodo-testa">
        <span className="ml-au-nodo-icona" aria-hidden>
          <Icona className="size-3.5" />
        </span>
        <span className="ml-au-nodo-tipo">Inizia</span>
        {p.entrati != null ? <span className="ml-au-trigger-entrati">{formatCompatto(p.entrati)} entrati</span> : <Zap className="ml-au-trigger-lampo size-3.5" aria-hidden />}
      </div>
      <div className="ml-au-nodo-titolo ml-au-trigger-frase" title={p.descrizione}>{p.descrizione}</div>
      <div className="ml-au-nodo-dettaglio ml-au-trigger-uscita" title={p.uscita}>
        <LogOut className="size-3" aria-hidden /> {p.uscita}
      </div>
      {p.errori ? <span className="ml-au-nodo-problema" data-gravita="errore" aria-hidden>!</span> : null}
    </div>
  )
})

// ───────────────────────── Menu "aggiungi passo" ─────────────────────────

const GRUPPI_MENU: { titolo: string; tipi: MailingTipoNodo[] }[] = [
  { titolo: 'Messaggi', tipi: ['EMAIL'] },
  { titolo: 'Tempo', tipi: ['ATTESA', 'ATTESA_FINO_A'] },
  { titolo: 'Logica', tipi: ['CONDIZIONE'] },
  { titolo: 'Azioni', tipi: ['AGGIUNGI_TAG', 'RIMUOVI_TAG', 'NOTIFICA_STAFF'] },
  { titolo: 'Fine', tipi: ['FINE'] },
]

export function MenuInserimento({ consentiFine, onScegli }: { consentiFine: boolean; onScegli: (tipo: MailingTipoNodo) => void }) {
  return (
    <div className="ml-au-menu" role="menu" aria-label="Aggiungi un passo">
      {GRUPPI_MENU.filter((g) => consentiFine || g.titolo !== 'Fine').map((g) => (
        <div key={g.titolo} className="ml-au-menu-gruppo" role="group" aria-label={g.titolo}>
          <div className="ml-au-menu-titolo" aria-hidden>{g.titolo}</div>
          {g.tipi.map((t) => {
            const m = META_NODO[t]
            const Icona = m.icona
            return (
              <button key={t} type="button" role="menuitem" className="ml-au-menu-voce" data-tipo={t} onClick={() => onScegli(t)}>
                <span className="ml-au-nodo-icona" aria-hidden><Icona className="size-4" /></span>
                <span className="min-w-0">
                  <span className="ml-au-menu-nome">{m.etichetta}</span>
                  <span className="ml-au-menu-desc">{m.descrizione}</span>
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ───────────────────────── Anteprima in miniatura (galleria modelli) ─────────────────────────

/** Il grafo disegnato in piccolo: card come pillole colorate, archi come curve. Solo decorativo. */
export function MiniGrafo({ grafo, className }: { grafo: MailingGrafo; className?: string }) {
  const inizio = nodoIniziale(grafo)
  const t = posizioneTrigger(grafo)
  const nodi = [...grafo.nodi.map((n) => ({ id: n.id, tipo: n.tipo as string, x: n.x, y: n.y })), ...(inizio ? [{ id: ID_TRIGGER, tipo: 'TRIGGER', x: t.x, y: t.y }] : [])]
  if (!nodi.length) return <svg className={className} aria-hidden />
  const minX = Math.min(...nodi.map((n) => n.x)) - 40
  const minY = Math.min(...nodi.map((n) => n.y)) - 40
  const maxX = Math.max(...nodi.map((n) => n.x)) + NODO_LARGHEZZA + 40
  const maxY = Math.max(...nodi.map((n) => n.y)) + NODO_ALTEZZA + 40
  const archi = grafo.archi
    .map((a) => {
      const da = grafo.nodi.find((n) => n.id === a.da)
      const verso = grafo.nodi.find((n) => n.id === a.a)
      if (!da || !verso) return null
      const p = puntoUscita(da, a.ramo)
      const q = puntoIngresso(verso)
      const c = Math.max(30, (q.y - p.y) / 2)
      return { k: `${a.da}-${a.a}-${a.ramo}`, d: `M${p.x},${p.y} C${p.x},${p.y + c} ${q.x},${q.y - c} ${q.x},${q.y}` }
    })
    .filter(Boolean) as { k: string; d: string }[]
  if (inizio) {
    const q = puntoIngresso(inizio)
    archi.push({ k: 'trigger', d: `M${t.x + NODO_LARGHEZZA / 2},${t.y + NODO_ALTEZZA} L${q.x},${q.y}` })
  }
  return (
    <svg className={className} viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      {archi.map((a) => (
        <path key={a.k} d={a.d} className="ml-au-mini-arco" />
      ))}
      {nodi.map((n) => (
        <rect key={n.id} x={n.x} y={n.y} width={NODO_LARGHEZZA} height={NODO_ALTEZZA} rx={28} className="ml-au-mini-nodo" data-tipo={n.tipo} />
      ))}
    </svg>
  )
}
