import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  AlarmClock, AlignLeft, Briefcase, CalendarDays, Check, CircleHelp, Copy, CopyPlus, ExternalLink, Eye, Loader2, Lock, MapPin, Moon, Paperclip,
  Pencil, Repeat, Send, Stethoscope, Trash2, Users, Video, X,
} from 'lucide-react'
import type { AgendaCalendario, AgendaEvento, AgendaPersona, AgendaRisposta } from '@/services/agenda-service'
import {
  coloreCalendario, descriviRicorrenza, descrizioneSicura, durataMinuti, iniziali, mapsUrl, nomePersona, quando, testoPromemoria, traQuanto,
  type EventoVista,
} from './agenda-utils'

// ───────────────────────── Scheda fluttuante ─────────────────────────

/** Su telefono la scheda diventa un foglio che sale dal basso. */
const FOGLIO_SOTTO_PX = 768

/**
 * Scheda ancorata a un elemento (o a un punto), dentro la finestra, che si chiude cliccando fuori.
 * Su telefono è un foglio dal basso, con sfondo scurito, che si chiude anche trascinandolo giù.
 */
export function Fluttuante({ ancora, larghezza = 400, onChiudi, children, className }: {
  ancora: DOMRect | null
  larghezza?: number
  onChiudi: () => void
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const foglio = window.innerWidth < FOGLIO_SOTTO_PX
  const [pos, setPos] = useState<{ left: number; top: number; da: 'dx' | 'sx' | 'centro' } | null>(null)
  const trascina = useRef<{ y0: number; dy: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || foglio) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    // Limiti orizzontali: la pagina agenda, non la finestra, così la scheda non finisce sotto la barra laterale.
    const pagina = document.querySelector('.ag-pagina')?.getBoundingClientRect()
    const min = Math.max(12, (pagina?.left ?? 0) + 12)
    const max = Math.min(vw, pagina?.right ?? vw) - 12
    const w = Math.min(larghezza, vw - 24)
    const h = el.offsetHeight
    if (!ancora) {
      setPos({ left: Math.max(12, (min + max - w) / 2), top: Math.max(12, (vh - h) / 2), da: 'centro' })
      return
    }
    let left = ancora.right + 12
    let da: 'dx' | 'sx' | 'centro' = 'dx'
    if (left + w > max) {
      left = ancora.left - w - 12
      da = 'sx'
    }
    if (left < min) {
      left = Math.max(12, Math.min(max - w, ancora.left + ancora.width / 2 - w / 2))
      da = 'centro'
    }
    const top = Math.max(12, Math.min(vh - h - 12, ancora.top - 8))
    setPos({ left, top, da })
  }, [ancora, larghezza, children, foglio])

  useEffect(() => {
    const giu = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (ref.current?.contains(t)) return
      // Radix (select, popover) mette i contenuti in portali: cliccarli non deve chiudere la scheda.
      if (t.closest('[data-radix-popper-content-wrapper], [role="dialog"]:not(.ag-fluttuante), [role="listbox"], .ag-conferma')) return
      onChiudi()
    }
    const tasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]:not(.ag-fluttuante)')) onChiudi()
    }
    // Il clic che ha aperto la scheda non deve chiuderla subito.
    const id = window.setTimeout(() => document.addEventListener('pointerdown', giu), 0)
    document.addEventListener('keydown', tasto)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('pointerdown', giu)
      document.removeEventListener('keydown', tasto)
    }
  }, [onChiudi])

  // Foglio: si trascina giù dalla maniglia (o dal bordo alto) per chiuderlo.
  const giuManiglia = (e: React.TouchEvent) => {
    trascina.current = { y0: e.touches[0].clientY, dy: 0 }
    if (ref.current) ref.current.style.transition = 'none'
  }
  const muoviManiglia = (e: React.TouchEvent) => {
    const t = trascina.current
    if (!t || !ref.current) return
    t.dy = Math.max(0, e.touches[0].clientY - t.y0)
    ref.current.style.transform = `translateY(${t.dy}px)`
  }
  const suManiglia = () => {
    const t = trascina.current
    trascina.current = null
    const el = ref.current
    if (!t || !el) return
    el.style.transition = 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)'
    if (t.dy > Math.min(140, el.offsetHeight * 0.3)) {
      el.style.transform = 'translateY(110%)'
      window.setTimeout(onChiudi, 200)
    } else {
      el.style.transform = ''
    }
  }

  if (foglio) {
    return createPortal(
      <>
        <div data-vl="" data-vl-page="agenda" className="ag-foglio-velo" aria-hidden />
        <div
          ref={ref}
          data-vl=""
          data-vl-page="agenda"
          className={`ag-fluttuante ag-foglio ${className ?? ''}`}
          data-da="foglio"
          role="dialog"
          aria-modal="true"
        >
          <div className="ag-foglio-maniglia" onTouchStart={giuManiglia} onTouchMove={muoviManiglia} onTouchEnd={suManiglia} aria-hidden>
            <i />
          </div>
          {children}
        </div>
      </>,
      document.body,
    )
  }

  return createPortal(
    <div
      ref={ref}
      data-vl=""
      data-vl-page="agenda"
      className={`ag-fluttuante ${className ?? ''}`}
      data-da={pos?.da}
      style={{ width: Math.min(larghezza, window.innerWidth - 24), left: pos?.left ?? -9999, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      role="dialog"
      aria-modal="false"
    >
      {children}
    </div>,
    document.body,
  )
}

// ───────────────────────── Avatar ─────────────────────────

export function Avatar({ persona, dimensione = 30 }: { persona: Pick<AgendaPersona, 'nome' | 'email' | 'pazienteId'>; dimensione?: number }) {
  return (
    <span className="ag-avatar" style={{ width: dimensione, height: dimensione, fontSize: dimensione * 0.38 }}>
      {iniziali(persona.nome, persona.email)}
    </span>
  )
}

const RISPOSTE: Record<AgendaRisposta, { nome: string; icona: ReactNode }> = {
  accepted: { nome: 'Sì', icona: <Check aria-hidden /> },
  declined: { nome: 'No', icona: <X aria-hidden /> },
  tentative: { nome: 'Forse', icona: <CircleHelp aria-hidden /> },
  needsAction: { nome: 'In attesa', icona: <span className="ag-risp-attesa" aria-hidden /> },
}

// ───────────────────────── Dettaglio evento ─────────────────────────

interface DettaglioProps {
  evento: EventoVista
  dettaglio: AgendaEvento | null
  calendario: AgendaCalendario | undefined
  ancora: DOMRect | null
  adesso: Date
  onChiudi: () => void
  onModifica: () => void
  onElimina: () => void
  onDuplica: () => void
  onApriPaziente: (id: number) => void
  onRispondi: (r: Exclude<AgendaRisposta, 'needsAction'>) => Promise<void>
}

export function DettaglioEvento({ evento, dettaglio, calendario, ancora, adesso, onChiudi, onModifica, onElimina, onDuplica, onApriPaziente, onRispondi }: DettaglioProps) {
  const ev = { ...evento, ...(dettaglio ?? {}), start: evento.start, end: evento.end, colore: evento.colore, chiave: evento.chiave }
  const [rispondendo, setRispondendo] = useState<string | null>(null)
  const [copiato, setCopiato] = useState(false)
  const descrizione = useMemo(() => descrizioneSicura(ev.descrizione), [ev.descrizione])
  const invitati = ev.partecipanti.filter((p) => !p.risorsa)
  const sale = ev.partecipanti.filter((p) => p.risorsa)
  const conteggio = invitati.reduce<Record<string, number>>((m, p) => ({ ...m, [p.risposta ?? 'needsAction']: (m[p.risposta ?? 'needsAction'] ?? 0) + 1 }), {})
  const ioInvitato = invitati.some((p) => p.io) && !ev.organizzatore?.io
  const ricorrenza = descriviRicorrenza(ev.ricorrenza) ?? (ev.serieId ? 'Evento ricorrente' : null)
  const inCorso = ev.start <= adesso && ev.end > adesso
  const traPoco = !inCorso && ev.start > adesso && ev.start.getTime() - adesso.getTime() < 3 * 3_600_000

  const rispondi = async (r: Exclude<AgendaRisposta, 'needsAction'>) => {
    setRispondendo(r)
    try {
      await onRispondi(r)
    } finally {
      setRispondendo(null)
    }
  }

  return (
    <Fluttuante ancora={ancora} onChiudi={onChiudi} className="ag-dettaglio">
      <div className="ag-det-barra" style={{ '--c': ev.colore } as CSSProperties}>
        <div className="ag-det-azioni">
          {ev.modificabile ? (
            <button type="button" onClick={onModifica} title="Modifica (E)" aria-label="Modifica"><Pencil /></button>
          ) : null}
          {ev.modificabile ? (
            <button type="button" onClick={onElimina} title="Elimina (Canc)" aria-label="Elimina"><Trash2 /></button>
          ) : null}
          <button type="button" onClick={onDuplica} title="Duplica" aria-label="Duplica"><CopyPlus /></button>
          {ev.htmlLink ? (
            <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" title="Apri in Google Calendar" aria-label="Apri in Google Calendar"><ExternalLink /></a>
          ) : null}
        </div>
        <button type="button" className="ag-det-chiudi" onClick={onChiudi} aria-label="Chiudi"><X /></button>
      </div>

      <div className="ag-det-corpo">
        <div className="ag-det-titolo" style={{ '--c': ev.colore } as CSSProperties}>
          <i aria-hidden />
          <div>
            <h3>{ev.titolo || '(Senza titolo)'}</h3>
            <p>{quando(ev)}</p>
            {ricorrenza ? <p className="ag-det-sub"><Repeat aria-hidden /> {ricorrenza}</p> : null}
            {inCorso ? <span className="ag-chip ag-chip--live"><span className="vl-live-dot" aria-hidden /> In corso · finisce {traQuanto(ev.end, adesso)}</span> : null}
            {traPoco ? <span className="ag-chip">Inizia {traQuanto(ev.start, adesso)}</span> : null}
          </div>
        </div>

        {ev.pazienteId ? (
          <button type="button" className="ag-det-visita" onClick={() => onApriPaziente(ev.pazienteId!)}>
            <Stethoscope aria-hidden />
            <span><small>Visita</small><strong>{ev.pazienteNome}</strong></span>
            <em>Apri la scheda</em>
          </button>
        ) : null}

        {ev.tipo === 'outOfOffice' ? (
          <div className="ag-det-riga"><Briefcase aria-hidden /><span>Fuori sede: gli inviti in conflitto vengono rifiutati in automatico</span></div>
        ) : ev.tipo === 'focusTime' ? (
          <div className="ag-det-riga"><Moon aria-hidden /><span>Tempo di concentrazione: notifiche di Chat silenziate</span></div>
        ) : null}

        {ev.meet ? (
          <div className="ag-det-meet">
            <a className="ag-btn ag-btn--meet" href={ev.meet} target="_blank" rel="noopener noreferrer">
              <Video aria-hidden /> Partecipa con Google Meet
            </a>
            <button
              type="button"
              className="ag-det-copia"
              onClick={() => {
                void navigator.clipboard?.writeText(ev.meet!).then(() => {
                  setCopiato(true)
                  setTimeout(() => setCopiato(false), 1500)
                })
              }}
              title="Copia il link"
            >
              {copiato ? <Check aria-hidden /> : <Copy aria-hidden />}
              <span>{ev.meet.replace(/^https?:\/\//, '')}</span>
            </button>
          </div>
        ) : null}

        {ev.luogo ? (
          <a className="ag-det-riga ag-det-link" href={mapsUrl(ev.luogo)} target="_blank" rel="noopener noreferrer">
            <MapPin aria-hidden /><span>{ev.luogo}</span>
          </a>
        ) : null}
        {sale.length ? (
          <div className="ag-det-riga"><CalendarDays aria-hidden /><span>{sale.map((s) => s.nome || s.email).join(', ')}</span></div>
        ) : null}

        {invitati.length ? (
          <div className="ag-det-persone">
            <div className="ag-det-riga">
              <Users aria-hidden />
              <span>
                <strong>{invitati.length} invitat{invitati.length === 1 ? 'o' : 'i'}</strong>
                <small>
                  {[
                    conteggio.accepted ? `${conteggio.accepted} sì` : null,
                    conteggio.tentative ? `${conteggio.tentative} forse` : null,
                    conteggio.declined ? `${conteggio.declined} no` : null,
                    conteggio.needsAction ? `${conteggio.needsAction} in attesa` : null,
                  ].filter(Boolean).join(' · ')}
                </small>
              </span>
            </div>
            <ul>
              {[...invitati].sort((a, b) => Number(b.organizzatore) - Number(a.organizzatore)).map((p) => (
                <li key={p.email} data-risposta={p.risposta ?? 'needsAction'}>
                  <span className="ag-det-avatar">
                    <Avatar persona={p} />
                    <span className="ag-det-risp" title={RISPOSTE[p.risposta ?? 'needsAction'].nome}>{RISPOSTE[p.risposta ?? 'needsAction'].icona}</span>
                  </span>
                  <span className="ag-det-nome">
                    <strong>{nomePersona(p)}{p.io ? ' (tu)' : ''}</strong>
                    <small>{p.organizzatore ? 'Organizzatore' : p.facoltativo ? 'Facoltativo' : p.email}{p.commento ? ` · «${p.commento}»` : ''}</small>
                  </span>
                  <a href={`mailto:${p.email}`} className="ag-det-mail" aria-label={`Scrivi a ${nomePersona(p)}`}><Send /></a>
                </li>
              ))}
            </ul>
          </div>
        ) : ev.organizzatore && !ev.organizzatore.io ? (
          <div className="ag-det-riga"><Users aria-hidden /><span>Organizzato da {nomePersona(ev.organizzatore)}</span></div>
        ) : null}

        {descrizione ? (
          <div className="ag-det-riga ag-det-descr">
            <AlignLeft aria-hidden />
            <div dangerouslySetInnerHTML={{ __html: descrizione }} />
          </div>
        ) : null}

        {ev.allegati.length ? (
          <div className="ag-det-riga">
            <Paperclip aria-hidden />
            <span className="ag-det-allegati">
              {ev.allegati.map((a) => (
                <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer">
                  {a.icona ? <img src={a.icona} alt="" /> : null}
                  {a.titolo || 'Allegato'}
                </a>
              ))}
            </span>
          </div>
        ) : null}

        {!ev.tuttoIlGiorno && (ev.promemoria.length || ev.promemoriaPredefiniti) ? (
          <div className="ag-det-riga">
            <AlarmClock aria-hidden />
            <span>
              {ev.promemoriaPredefiniti
                ? (calendario?.promemoriaPredefiniti ?? []).map((p) => testoPromemoria(p.minuti, p.metodo)).join(', ') || 'Promemoria predefiniti'
                : ev.promemoria.map((p) => testoPromemoria(p.minuti, p.metodo)).join(', ')}
            </span>
          </div>
        ) : null}

        <div className="ag-det-riga ag-det-cal">
          <CalendarDays aria-hidden />
          <span>
            <i style={{ background: coloreCalendario(calendario) }} aria-hidden />
            {calendario?.nome ?? ev.calendarioId}
            <small>
              {ev.trasparenza === 'transparent' ? ' · Libero' : ' · Occupato'}
              {ev.visibilita === 'private' ? <> · <Lock className="ag-inline" aria-hidden /> Privato</> : ev.visibilita === 'public' ? <> · <Eye className="ag-inline" aria-hidden /> Pubblico</> : null}
              {!ev.tuttoIlGiorno ? ` · ${durataMinuti(ev)} min` : ''}
            </small>
          </span>
        </div>
        {!dettaglio ? <div className="ag-det-carica"><Loader2 className="animate-spin" aria-hidden /></div> : null}
      </div>

      {ioInvitato ? (
        <div className="ag-det-rsvp">
          <span>Partecipi?</span>
          {(['accepted', 'declined', 'tentative'] as const).map((r) => (
            <button
              key={r}
              type="button"
              data-attivo={ev.miaRisposta === r || undefined}
              data-r={r}
              disabled={!!rispondendo}
              onClick={() => void rispondi(r)}
            >
              {rispondendo === r ? <Loader2 className="animate-spin" aria-hidden /> : RISPOSTE[r].icona}
              {RISPOSTE[r].nome}
            </button>
          ))}
        </div>
      ) : null}
    </Fluttuante>
  )
}
