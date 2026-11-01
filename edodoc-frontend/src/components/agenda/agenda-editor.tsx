import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  AlarmClock, AlertTriangle, AlignLeft, Briefcase, CalendarDays, Check, ChevronDown, CircleHelp, Clock, Eye, Loader2, Mail, MapPin, Moon, Palette,
  Plus, Repeat, Sparkles, Users, Video, Wand2, X,
} from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  agendaService, isoConOffset, isoData, messaggioErroreAgenda, type AgendaAmbito, type AgendaCalendario, type AgendaContatto, type AgendaRisposta,
  type AgendaStato,
} from '@/services/agenda-service'
import { estremiModulo, modificaDaAvvisare, moduloDaBozza, type Invitato, type Modulo } from './agenda-modulo'
import { Avatar, Fluttuante } from './agenda-dettaglio'
import { NOMI_AMBITO, type EsitoConferma } from './agenda-conferma'
import {
  aggiungiGiorni, COLORI_EVENTO, coloreCalendario, conFine, daGoogle, dataLunga, descriviRicorrenza, durata, elencoNomi, nomePersona, oraPadded,
  presetDi, presetRicorrenza, scrivibile, testoPromemoria,
} from './agenda-utils'
import type { Bozza } from './agenda-tempo'

/** Cambiando l'inizio la durata resta la stessa (come in Google). */
function conInizio(m: Modulo, dataInizio: string, oraInizio: string): Modulo {
  const { start, end } = estremiModulo(m)
  const durataMs = end.getTime() - start.getTime()
  const nuovo = estremiModulo({ ...m, dataInizio, oraInizio })
  const fine = new Date(nuovo.start.getTime() + Math.max(m.tuttoIlGiorno ? 86_400_000 : 0, durataMs))
  return {
    ...m,
    dataInizio,
    oraInizio,
    dataFine: isoData(m.tuttoIlGiorno ? aggiungiGiorni(fine, -1) : fine),
    oraFine: m.tuttoIlGiorno ? m.oraFine : oraPadded(fine),
  }
}

const OPZIONI_PROMEMORIA = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080]

const ORARI = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`)

function SceltaOra({ valore, onCambia, da, etichetta }: { valore: string; onCambia: (v: string) => void; da?: string; etichetta: string }) {
  const opzioni = useMemo(() => {
    const base = ORARI.includes(valore) ? ORARI : [...ORARI, valore].sort()
    if (!da) return base.map((o) => ({ o, nota: '' }))
    const [h0, m0] = da.split(':').map(Number)
    const t0 = h0 * 60 + m0
    return base.filter((o) => {
      const [h, m] = o.split(':').map(Number)
      return h * 60 + m > t0
    }).map((o) => {
      const [h, m] = o.split(':').map(Number)
      return { o, nota: ` (${durata(h * 60 + m - t0)})` }
    })
  }, [valore, da])
  return (
    <span className="ag-select ag-select--ora">
      <select value={valore} onChange={(e) => onCambia(e.target.value)} aria-label={etichetta}>
        {opzioni.map(({ o, nota }) => (
          <option key={o} value={o}>{o}{nota}</option>
        ))}
      </select>
    </span>
  )
}

// ───────────────────────── Invitati ─────────────────────────

const RISPOSTA: Record<AgendaRisposta, { nome: string; icona: ReactNode }> = {
  accepted: { nome: 'Ci sarà', icona: <Check /> },
  tentative: { nome: 'Forse', icona: <CircleHelp /> },
  declined: { nome: 'Non c\'è', icona: <X /> },
  needsAction: { nome: 'Non ha risposto', icona: <span className="ag-risp-attesa" /> },
}

function CampoInvitati({ invitati, contatti, io, onCambia }: { invitati: Invitato[]; contatti: AgendaContatto[]; io: string; onCambia: (v: Invitato[]) => void }) {
  const [testo, setTesto] = useState('')
  const [indice, setIndice] = useState(0)
  const [aperto, setAperto] = useState(false)
  const q = testo.trim().toLowerCase()
  const suggerimenti = useMemo(() => {
    const presi = new Set(invitati.map((i) => i.email))
    return contatti
      .filter((c) => !presi.has(c.email) && c.email !== io)
      .filter((c) => !q || c.nome.toLowerCase().includes(q) || c.email.includes(q) || (c.ruolo ?? '').toLowerCase().includes(q))
      .slice(0, 7)
  }, [contatti, invitati, q, io])

  const aggiungi = (i: Invitato) => {
    if (!i.email.includes('@') || invitati.some((x) => x.email === i.email) || i.email === io) return
    onCambia([...invitati, i])
    setTesto('')
    setIndice(0)
  }
  const daTesto = () => {
    const parti = testo.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))
    if (!parti.length) return false
    onCambia([...invitati, ...parti.filter((p) => !invitati.some((x) => x.email === p) && p !== io).map((email) => {
      const c = contatti.find((x) => x.email === email)
      return { email, nome: c?.nome ?? null, facoltativo: false, pazienteId: c?.pazienteId ?? null }
    })])
    setTesto('')
    return true
  }

  return (
    <div className="ag-invitati">
      <div className="ag-invitati-campo">
        <Users aria-hidden />
        <input
          value={testo}
          placeholder="Aggiungi invitati: nome o email"
          onChange={(e) => {
            setTesto(e.target.value)
            setAperto(true)
            setIndice(0)
          }}
          onFocus={() => setAperto(true)}
          onBlur={() => setTimeout(() => setAperto(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndice((i) => Math.min(i + 1, suggerimenti.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndice((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
              if (!testo.trim() && e.key === 'Tab') return
              if (daTesto()) {
                e.preventDefault()
                return
              }
              const s = suggerimenti[indice]
              if (s && (e.key === 'Enter' || testo.trim())) {
                e.preventDefault()
                aggiungi({ email: s.email, nome: s.nome, facoltativo: false, pazienteId: s.pazienteId })
              }
            } else if (e.key === 'Backspace' && !testo && invitati.length) {
              onCambia(invitati.slice(0, -1))
            }
          }}
        />
        {aperto && suggerimenti.length ? (
          <ul className="ag-suggerimenti" role="listbox">
            {suggerimenti.map((s, i) => (
              <li key={s.email}>
                <button
                  type="button"
                  data-attivo={i === indice || undefined}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    aggiungi({ email: s.email, nome: s.nome, facoltativo: false, pazienteId: s.pazienteId })
                  }}
                >
                  <Avatar persona={{ nome: s.nome, email: s.email, pazienteId: s.pazienteId }} dimensione={26} />
                  <span><strong>{s.nome}</strong><small>{s.ruolo ? `${s.ruolo} · ` : ''}{s.email}</small></span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {invitati.length ? (
        <ul className="ag-invitati-lista">
          {invitati.map((i) => (
            <li key={i.email}>
              <span className="ag-det-avatar">
                <Avatar persona={i} dimensione={30} />
                {i.risposta !== undefined ? (
                  <span className="ag-det-risp" data-risposta={i.risposta ?? 'needsAction'} aria-hidden>{RISPOSTA[i.risposta ?? 'needsAction'].icona}</span>
                ) : null}
              </span>
              <span className="ag-invitati-nome">
                <strong>{nomePersona(i)}</strong>
                <small>{i.commento ? `«${i.commento}»` : i.email}</small>
              </span>
              <span className="ag-invitati-stato" data-risposta={i.risposta === undefined ? 'nuovo' : i.risposta ?? 'needsAction'}>
                {i.risposta === undefined ? 'Nuovo' : RISPOSTA[i.risposta ?? 'needsAction'].nome}
              </span>
              <button
                type="button"
                className="ag-invitati-facoltativo"
                data-attivo={i.facoltativo || undefined}
                onClick={() => onCambia(invitati.map((x) => (x.email === i.email ? { ...x, facoltativo: !x.facoltativo } : x)))}
                title={i.facoltativo ? 'Rendi la presenza necessaria' : 'Rendi la presenza facoltativa'}
                aria-pressed={i.facoltativo}
              >
                {i.facoltativo ? 'Facoltativo' : 'Necessario'}
              </button>
              <button type="button" className="ag-icona-btn" aria-label={`Togli ${nomePersona(i)}`} onClick={() => onCambia(invitati.filter((x) => x.email !== i.email))}>
                <X />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

// ───────────────────────── Disponibilità ─────────────────────────

const ORA_DA = 7
const ORA_A = 21

/**
 * Timeline del giorno con l'occupato di ogni invitato (e il proprio): cliccando si sposta l'evento, e
 * "Primo orario libero" trova lo spazio comune più vicino della stessa durata.
 */
function Disponibilita({ modulo, io, nomeIo, onSposta, onConflitti }: {
  modulo: Modulo
  io: string
  nomeIo: string
  onSposta: (dataInizio: string, oraInizio: string) => void
  onConflitti: (chi: string[]) => void
}) {
  const persone = useMemo(() => [{ email: io, nome: nomeIo, pazienteId: null as number | null }, ...modulo.invitati], [io, nomeIo, modulo.invitati])
  const chiave = `${modulo.dataInizio}|${persone.map((p) => p.email).join(',')}`
  const [dati, setDati] = useState<{ chiave: string; occupato: Record<string, { start: Date; end: Date }[]>; errori: Record<string, string> } | null>(null)
  const [cercando, setCercando] = useState(false)
  const { start, end } = estremiModulo(modulo)
  const durataMin = Math.max(15, (end.getTime() - start.getTime()) / 60_000)

  useEffect(() => {
    const giorno = daGoogle(modulo.dataInizio)
    const t = setTimeout(() => {
      agendaService
        .disponibilita(persone.map((p) => p.email), isoConOffset(giorno), isoConOffset(aggiungiGiorni(giorno, 1)))
        .then((r) => {
          const occupato: Record<string, { start: Date; end: Date }[]> = {}
          const errori: Record<string, string> = {}
          r.forEach((d) => {
            occupato[d.email] = d.occupato.map((x) => ({ start: new Date(x.inizio), end: new Date(x.fine) }))
            if (d.errore) errori[d.email] = d.errore
          })
          setDati({ chiave, occupato, errori })
        })
        .catch(() => setDati({ chiave, occupato: {}, errori: {} }))
    }, 350)
    return () => clearTimeout(t)
  }, [chiave]) // eslint-disable-line react-hooks/exhaustive-deps

  const giorno = daGoogle(modulo.dataInizio)
  const base = new Date(giorno.getFullYear(), giorno.getMonth(), giorno.getDate(), ORA_DA).getTime()
  const span = (ORA_A - ORA_DA) * 60
  const x = (d: Date) => Math.max(0, Math.min(100, ((d.getTime() - base) / 60_000 / span) * 100))
  const occupatoProprio = (email: string) =>
    (dati?.occupato[email] ?? []).filter((b) => !(Math.abs(b.start.getTime() - start.getTime()) < 60_000 && Math.abs(b.end.getTime() - end.getTime()) < 60_000))

  const conflitti = persone.filter((p) => occupatoProprio(p.email).some((b) => b.start < end && b.end > start))
  const chiaveConflitti = modulo.tuttoIlGiorno ? '' : conflitti.map((p) => (p.email === io ? 'Tu' : nomePersona(p).split(' ')[0])).join('|')
  useEffect(() => {
    onConflitti(chiaveConflitti ? chiaveConflitti.split('|') : [])
  }, [chiaveConflitti]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Primo spazio comune della stessa durata, a passi di 15 minuti, da adesso (o dall'orario attuale) in poi, fino a 14 giorni. */
  const trovaLibero = async () => {
    setCercando(true)
    try {
      const da = new Date(Math.max(Date.now(), start.getTime()))
      da.setMinutes(Math.ceil(da.getMinutes() / 15) * 15, 0, 0)
      const fino = aggiungiGiorni(da, 14)
      const r = await agendaService.disponibilita(persone.map((p) => p.email), isoConOffset(da), isoConOffset(fino))
      const tutti = r.flatMap((d) => d.occupato.map((b) => ({ s: new Date(b.inizio).getTime(), f: new Date(b.fine).getTime() })))
        .filter((b) => !(Math.abs(b.s - start.getTime()) < 60_000 && Math.abs(b.f - end.getTime()) < 60_000))
      for (let t = da.getTime(); t < fino.getTime(); t += 15 * 60_000) {
        const c = new Date(t)
        const h = c.getHours() + c.getMinutes() / 60
        const fineC = new Date(t + durataMin * 60_000)
        const hf = fineC.getHours() + fineC.getMinutes() / 60
        if (c.getDay() === 0 || c.getDay() === 6 || h < 8.5 || hf > 19.5 || fineC.getDate() !== c.getDate()) continue
        if (!tutti.some((b) => b.s < fineC.getTime() && b.f > t)) {
          onSposta(isoData(c), oraPadded(c))
          return
        }
      }
    } finally {
      setCercando(false)
    }
  }

  if (modulo.tuttoIlGiorno) return null
  return (
    <section className="ag-disp">
      <header>
        <div>
          <strong>Disponibilità</strong>
          <small>
            {dataLunga(giorno)} · {conflitti.length ? <span className="ag-disp-conflitto">{conflitti.length === 1 ? `${conflitti[0].email === io ? 'Hai' : `${nomePersona(conflitti[0])} ha`} già un impegno` : `${conflitti.length} persone hanno già un impegno`}</span> : dati ? <span className="ag-disp-ok"><Check aria-hidden /> tutti liberi</span> : 'controllo…'}
          </small>
        </div>
        <button type="button" className="ag-btn ag-btn--piccolo" onClick={() => void trovaLibero()} disabled={cercando}>
          {cercando ? <Loader2 className="animate-spin" aria-hidden /> : <Wand2 aria-hidden />} Primo orario libero
        </button>
      </header>
      <div className="ag-disp-griglia">
      <div className="ag-disp-ore" aria-hidden>
        {Array.from({ length: ORA_A - ORA_DA + 1 }, (_, i) => (
          <span key={i} style={{ left: `${(i / (ORA_A - ORA_DA)) * 100}%` }}>{ORA_DA + i}</span>
        ))}
      </div>
      <ul>
        {persone.map((p) => (
          <li key={p.email}>
            <span className="ag-disp-chi" title={p.email}>
              <Avatar persona={{ nome: p.nome, email: p.email, pazienteId: p.pazienteId }} dimensione={22} />
              <span>{p.email === io ? 'Tu' : nomePersona(p).split(' ')[0]}</span>
            </span>
            <div
              className="ag-disp-linea"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                const minuti = Math.round((((e.clientX - r.left) / r.width) * span) / 15) * 15 - durataMin / 2
                const t = new Date(base + Math.max(0, Math.round(minuti / 15) * 15) * 60_000)
                onSposta(isoData(t), oraPadded(t))
              }}
            >
              {dati?.errori[p.email] ? <em className="ag-disp-nd">calendario non visibile</em> : null}
              {occupatoProprio(p.email).map((b, i) => (
                <i key={`${b.start.getTime()}-${i}`} style={{ left: `${x(b.start)}%`, width: `${Math.max(0.6, x(b.end) - x(b.start))}%` }} />
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="ag-disp-slot" style={{ left: `calc(var(--ag-disp-chi) + (100% - var(--ag-disp-chi)) * ${x(start) / 100})`, width: `calc((100% - var(--ag-disp-chi)) * ${(x(end) - x(start)) / 100})` }} aria-hidden />
      </div>
    </section>
  )
}

// ───────────────────────── Anteprima dell'invito ─────────────────────────

/** Come apparirà l'evento: il biglietto che ricevono gli invitati, aggiornato mentre si scrive. */
function AnteprimaInvito({ modulo: m, colore, valido, start, end }: { modulo: Modulo; colore: string; valido: boolean; start: Date; end: Date }) {
  const titolo = m.titolo || (m.tipo === 'outOfOffice' ? 'Fuori sede' : m.tipo === 'focusTime' ? 'Concentrazione' : '(Senza titolo)')
  const ricorrenza = descriviRicorrenza(m.ricorrenza)
  const conto = m.invitati.reduce<Record<string, number>>((c, i) => {
    const k = i.risposta === undefined ? 'nuovo' : i.risposta ?? 'needsAction'
    return { ...c, [k]: (c[k] ?? 0) + 1 }
  }, {})
  return (
    <div className="ag-biglietto" style={{ '--c': colore } as CSSProperties}>
      <div className="ag-biglietto-data" aria-hidden>
        <span>{valido ? start.toLocaleDateString('it-IT', { month: 'short' }).replace('.', '') : '—'}</span>
        <strong>{valido ? start.getDate() : ''}</strong>
        <small>{valido ? start.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '') : ''}</small>
      </div>
      <div className="ag-biglietto-corpo">
        <small className="ag-biglietto-etichetta">Anteprima</small>
        <strong className="ag-biglietto-titolo">{titolo}</strong>
        <span>{valido ? (m.tuttoIlGiorno ? (m.dataFine !== m.dataInizio ? `${dataLunga(start)} – ${dataLunga(aggiungiGiorni(end, -1))}` : 'Tutto il giorno') : `${oraPadded(start)} – ${oraPadded(end)} · ${durata(Math.round((end.getTime() - start.getTime()) / 60_000))}`) : 'Controlla gli orari'}</span>
        {ricorrenza ? <span><Repeat className="ag-inline" aria-hidden /> {ricorrenza}</span> : null}
        {m.luogo ? <span><MapPin className="ag-inline" aria-hidden /> {m.luogo}</span> : null}
        {m.conMeet ? <span className="ag-biglietto-meet"><Video className="ag-inline" aria-hidden /> Google Meet</span> : null}
        {m.invitati.length ? (
          <div className="ag-biglietto-persone">
            <span className="ag-faccine">
              {m.invitati.slice(0, 7).map((i) => (
                <span key={i.email} title={nomePersona(i)} data-risposta={i.risposta === undefined ? 'nuovo' : i.risposta ?? 'needsAction'}>
                  <Avatar persona={i} dimensione={26} />
                </span>
              ))}
              {m.invitati.length > 7 ? <em>+{m.invitati.length - 7}</em> : null}
            </span>
            <small>
              {[
                conto.accepted ? `${conto.accepted} ci sono` : null,
                conto.tentative ? `${conto.tentative} forse` : null,
                conto.declined ? `${conto.declined} no` : null,
                conto.needsAction ? `${conto.needsAction} senza risposta` : null,
                conto.nuovo ? `${conto.nuovo} da invitare` : null,
              ].filter(Boolean).join(' · ')}
            </small>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ───────────────────────── Editor ─────────────────────────

interface EditorProps {
  aperto: boolean
  titolo: string
  iniziale: Modulo
  prima: Modulo | null
  stato: AgendaStato
  contatti: AgendaContatto[]
  ricorrenteServer: boolean
  onChiudi: () => void
  /** Salva su Google; l'esito (date della serie, email agli invitati) si sceglie nel piede dell'editor. */
  onSalva: (m: Modulo, esito: EsitoConferma) => Promise<void>
}

export function EditorEvento({ aperto, titolo, iniziale, prima, stato, contatti, ricorrenteServer, onChiudi, onSalva }: EditorProps) {
  const [m, setM] = useState<Modulo>(iniziale)
  const [salvando, setSalvando] = useState(false)
  const [avanzate, setAvanzate] = useState(false)
  const [ambito, setAmbito] = useState<AgendaAmbito>('QUESTO')
  /** null = decide l'editor (avvisa se la modifica riguarda gli invitati); true/false = scelto a mano. */
  const [notificaScelta, setNotificaScelta] = useState<boolean | null>(null)
  const [conflitti, setConflitti] = useState<string[]>([])
  const [guardia, setGuardia] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const titoloRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (aperto) {
      setM(iniziale)
      setAvanzate(false)
      setAmbito('QUESTO')
      setNotificaScelta(null)
      setGuardia(false)
      setErrore(null)
    }
  }, [aperto, iniziale])

  const cambia = (p: Partial<Modulo>) => setM((x) => ({ ...x, ...p }))
  const calendari = stato.calendari.filter((c) => scrivibile(c))
  const calendario = stato.calendari.find((c) => c.id === m.calendarioId)
  const { start, end } = estremiModulo(m)
  const valido = m.tuttoIlGiorno ? end > start : end > start
  const preset = presetDi(m.ricorrenza, start)
  const presets = presetRicorrenza(start)
  const regola = m.ricorrenza.find((r) => r.startsWith('RRULE:'))
  const fineSerie: 'mai' | 'data' | 'volte' = regola?.includes('UNTIL=') ? 'data' : regola?.includes('COUNT=') ? 'volte' : 'mai'
  const colore = m.colorId ? COLORI_EVENTO.find((c) => c.id === m.colorId)?.hex : coloreCalendario(calendario)
  const principale = m.calendarioId === 'primary'
  const nuovo = !prima
  const modificato = JSON.stringify(m) !== JSON.stringify(iniziale)

  // Chi riceve l'email: gli invitati di adesso più quelli tolti (ricevono l'annullamento).
  const daAvvisare = useMemo(() => {
    const tolti = (prima?.invitati ?? []).filter((p) => !m.invitati.some((i) => i.email === p.email))
    return [...m.invitati, ...tolti]
  }, [m.invitati, prima])
  const avvisoConsigliato = modificaDaAvvisare(m, prima)
  const notifica = daAvvisare.length > 0 && (notificaScelta ?? avvisoConsigliato)
  const serie = ricorrenteServer && !!prima && JSON.stringify(m.ricorrenza) === JSON.stringify(prima.ricorrenza)
  const nuoviInvitati = m.invitati.filter((i) => i.risposta === undefined).length

  const salva = async () => {
    if (!valido || salvando) return
    setSalvando(true)
    setErrore(null)
    try {
      await onSalva(m, { ambito: serie ? ambito : 'QUESTO', notifica })
    } catch (err) {
      setErrore(messaggioErroreAgenda(err, 'Non sono riuscito a salvare'))
    } finally {
      setSalvando(false)
    }
  }

  /** Chiudere (Esc, clic fuori, X, Annulla) con modifiche non salvate chiede prima conferma nel piede. */
  const chiudi = () => {
    if (modificato && !salvando) setGuardia(true)
    else onChiudi()
  }

  const etichettaSalva = nuovo
    ? notifica ? `Crea e invita ${m.invitati.length}` : 'Crea evento'
    : notifica ? 'Salva e avvisa' : 'Salva modifiche'

  return (
    <Dialog open={aperto} onOpenChange={(o) => !o && chiudi()}>
      <DialogContent
        className="ag-editor sm:max-w-5xl"
        data-guardia={guardia || undefined}
        data-vl=""
        data-vl-page="agenda"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          titoloRef.current?.focus()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void salva()
          }
        }}
        style={{ '--c': colore } as CSSProperties}
      >
        <DialogTitle className="sr-only">{titolo}</DialogTitle>
        <DialogDescription className="sr-only">Dettagli dell'evento su Google Calendar</DialogDescription>
        <div className="ag-editor-testa">
          <span className="ag-editor-colore" aria-hidden />
          <input
            ref={titoloRef}
            className="ag-editor-titolo"
            value={m.titolo}
            placeholder={m.tipo === 'outOfOffice' ? 'Fuori sede' : m.tipo === 'focusTime' ? 'Concentrazione' : 'Aggiungi un titolo'}
            onChange={(e) => cambia({ titolo: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault()
                void salva()
              }
            }}
          />
        </div>

        {nuovo && principale ? (
          <div className="ag-tipi" role="tablist">
            {([
              ['default', 'Evento', CalendarDays],
              ['focusTime', 'Concentrazione', Moon],
              ['outOfOffice', 'Fuori sede', Briefcase],
            ] as const).map(([id, nome, Icona]) => (
              <button key={id} type="button" role="tab" aria-selected={m.tipo === id} data-attivo={m.tipo === id || undefined} onClick={() => cambia({ tipo: id, ...(id !== 'default' ? { tuttoIlGiorno: false, invitati: [], conMeet: false } : {}) })}>
                <Icona aria-hidden /> {nome}
              </button>
            ))}
          </div>
        ) : null}

        <div className="ag-editor-griglia">
          <div className="ag-editor-form">
            <div className="ag-campo ag-campo--quando">
              <Clock aria-hidden />
              <div className="ag-quando">
                <div className="ag-quando-riga">
                  <input type="date" value={m.dataInizio} onChange={(e) => e.target.value && setM((x) => conInizio(x, e.target.value, x.oraInizio))} aria-label="Data di inizio" />
                  {!m.tuttoIlGiorno ? (
                    <>
                      <SceltaOra valore={m.oraInizio} onCambia={(v) => setM((x) => conInizio(x, x.dataInizio, v))} etichetta="Ora di inizio" />
                      <span className="ag-quando-trattino">–</span>
                      <SceltaOra valore={m.oraFine} da={m.dataFine === m.dataInizio ? m.oraInizio : undefined} onCambia={(v) => cambia({ oraFine: v })} etichetta="Ora di fine" />
                    </>
                  ) : <span className="ag-quando-trattino">–</span>}
                  {m.tuttoIlGiorno || m.dataFine !== m.dataInizio ? (
                    <input type="date" value={m.dataFine} min={m.dataInizio} onChange={(e) => e.target.value && cambia({ dataFine: e.target.value })} aria-label="Data di fine" />
                  ) : null}
                </div>
                <div className="ag-quando-opzioni">
                  {m.tipo !== 'focusTime' && m.tipo !== 'outOfOffice' ? (
                    <label className="ag-switch">
                      <input
                        type="checkbox"
                        checked={m.tuttoIlGiorno}
                        onChange={(e) => {
                          const t = e.target.checked
                          cambia({ tuttoIlGiorno: t, trasparenza: t ? 'transparent' : 'opaque', ...(t ? {} : { dataFine: m.dataInizio, oraInizio: m.oraInizio === '00:00' ? '09:00' : m.oraInizio, oraFine: m.oraFine === '00:00' ? '10:00' : m.oraFine }) })
                        }}
                      />
                      <i aria-hidden /> Tutto il giorno
                    </label>
                  ) : null}
                  {!m.tuttoIlGiorno && m.dataFine === m.dataInizio ? (
                    <button type="button" className="ag-link" onClick={() => cambia({ dataFine: isoData(aggiungiGiorni(daGoogle(m.dataInizio), 1)) })}>Su più giorni</button>
                  ) : null}
                  <span className="ag-quando-durata">{valido ? (m.tuttoIlGiorno ? `${Math.round((end.getTime() - start.getTime()) / 86_400_000)} g` : durata(Math.round((end.getTime() - start.getTime()) / 60_000))) : <em>La fine è prima dell'inizio</em>}</span>
                </div>
              </div>
            </div>

            {m.tipo === 'default' || m.tipo === 'focusTime' ? (
              <div className="ag-campo">
                <Repeat aria-hidden />
                <div className="ag-ricorrenza">
                  <span className="ag-select">
                    <select
                      value={preset}
                      onChange={(e) => {
                        const p = presets.find((x) => x.id === e.target.value)
                        if (p) cambia({ ricorrenza: [...p.regole, ...m.ricorrenza.filter((r) => !r.startsWith('RRULE:') && p.regole.length > 0)] })
                      }}
                      aria-label="Ripetizione"
                    >
                      {presets.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      {preset === 'personalizzata' ? <option value="personalizzata">{descriviRicorrenza(m.ricorrenza) ?? 'Personalizzata'}</option> : null}
                    </select>
                  </span>
                  {regola ? (
                    <span className="ag-ricorrenza-fine">
                      <span className="ag-select ag-select--compatta">
                        <select
                          value={fineSerie}
                          onChange={(e) => {
                            const v = e.target.value
                            const r = conFine(regola, v === 'data' ? { tipo: 'data', data: aggiungiGiorni(start, 90) } : v === 'volte' ? { tipo: 'volte', n: 10 } : { tipo: 'mai' })
                            cambia({ ricorrenza: m.ricorrenza.map((x) => (x === regola ? r : x)) })
                          }}
                          aria-label="Fine della ripetizione"
                        >
                          <option value="mai">per sempre</option>
                          <option value="data">fino al…</option>
                          <option value="volte">per … volte</option>
                        </select>
                      </span>
                      {fineSerie === 'data' ? (
                        <input
                          type="date"
                          value={(() => {
                            const u = regola.match(/UNTIL=(\d{8})/)?.[1]
                            return u ? `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}` : ''
                          })()}
                          min={m.dataInizio}
                          onChange={(e) => e.target.value && cambia({ ricorrenza: m.ricorrenza.map((x) => (x === regola ? conFine(regola, { tipo: 'data', data: daGoogle(e.target.value) }) : x)) })}
                          aria-label="Ultimo giorno"
                        />
                      ) : fineSerie === 'volte' ? (
                        <input
                          type="number"
                          min={1}
                          max={730}
                          className="ag-numero"
                          value={Number(regola.match(/COUNT=(\d+)/)?.[1] ?? 10)}
                          onChange={(e) => cambia({ ricorrenza: m.ricorrenza.map((x) => (x === regola ? conFine(regola, { tipo: 'volte', n: Number(e.target.value) || 1 }) : x)) })}
                          aria-label="Numero di ripetizioni"
                        />
                      ) : null}
                    </span>
                  ) : null}
                  {ricorrenteServer && prima && JSON.stringify(m.ricorrenza) !== JSON.stringify(prima.ricorrenza) ? (
                    <small className="ag-nota">Cambiare la ripetizione vale per tutta la serie.</small>
                  ) : null}
                </div>
              </div>
            ) : null}

            {m.tipo === 'default' ? (
              <>
                <div className="ag-campo">
                  <Users aria-hidden />
                  <CampoInvitati invitati={m.invitati} contatti={contatti} io={stato.email} onCambia={(invitati) => cambia({ invitati })} />
                </div>

                <div className="ag-campo">
                  <Video aria-hidden />
                  {m.conMeet ? (
                    <div className="ag-meet-on">
                      <span><strong>Google Meet</strong><small>{prima?.conMeet ? 'Videochiamata collegata' : 'Il link viene creato al salvataggio'}</small></span>
                      <button type="button" className="ag-icona-btn" onClick={() => cambia({ conMeet: false })} aria-label="Togli Meet"><X /></button>
                    </div>
                  ) : (
                    <button type="button" className="ag-btn ag-btn--meet-add" onClick={() => cambia({ conMeet: true })}>
                      Aggiungi videochiamata Google Meet
                    </button>
                  )}
                </div>

                <div className="ag-campo">
                  <MapPin aria-hidden />
                  <input className="ag-input" value={m.luogo} placeholder="Aggiungi luogo" onChange={(e) => cambia({ luogo: e.target.value })} />
                </div>
              </>
            ) : null}

            <div className="ag-campo ag-campo--alto">
              <AlignLeft aria-hidden />
              <textarea className="ag-input ag-textarea" value={m.descrizione} placeholder="Aggiungi descrizione, note, link…" rows={4} onChange={(e) => cambia({ descrizione: e.target.value })} />
            </div>

            <div className="ag-campo">
              <CalendarDays aria-hidden />
              <div className="ag-riga-campi">
                <span className="ag-select ag-select--cal" style={{ '--cc': coloreCalendario(calendario) } as CSSProperties}>
                  <select value={m.calendarioId} onChange={(e) => cambia({ calendarioId: e.target.value })} aria-label="Calendario">
                    {calendari.map((c) => <option key={c.id} value={c.id}>{c.principale ? `${c.nome} (il tuo)` : c.nome}</option>)}
                  </select>
                </span>
                <div className="ag-colori" role="radiogroup" aria-label="Colore">
                  <Palette aria-hidden />
                  <button type="button" role="radio" aria-checked={!m.colorId} data-attivo={!m.colorId || undefined} style={{ '--sw': coloreCalendario(calendario) } as CSSProperties} onClick={() => cambia({ colorId: '' })} title="Colore del calendario" />
                  {COLORI_EVENTO.map((c) => (
                    <button key={c.id} type="button" role="radio" aria-checked={m.colorId === c.id} data-attivo={m.colorId === c.id || undefined} style={{ '--sw': c.hex } as CSSProperties} onClick={() => cambia({ colorId: c.id })} title={c.nome} />
                  ))}
                </div>
              </div>
            </div>

            {!m.tuttoIlGiorno ? (
              <div className="ag-campo">
                <AlarmClock aria-hidden />
                <div className="ag-promemoria">
                  {m.promemoriaPredefiniti ? (
                    <span className="ag-chip">
                      {(calendario?.promemoriaPredefiniti ?? []).map((p) => testoPromemoria(p.minuti, p.metodo)).join(', ') || 'Nessun promemoria predefinito'}
                      <button type="button" className="ag-link" onClick={() => cambia({ promemoriaPredefiniti: false, promemoria: calendario?.promemoriaPredefiniti ?? [] })}>personalizza</button>
                    </span>
                  ) : (
                    <>
                      {m.promemoria.map((p, i) => (
                        <span key={i} className="ag-chip">
                          <span className="ag-select ag-select--chip">
                            <select value={p.minuti} onChange={(e) => cambia({ promemoria: m.promemoria.map((x, j) => (j === i ? { ...x, minuti: Number(e.target.value) } : x)) })}>
                              {[...new Set([...OPZIONI_PROMEMORIA, p.minuti])].sort((a, b) => a - b).map((o) => <option key={o} value={o}>{testoPromemoria(o, 'popup')}</option>)}
                            </select>
                          </span>
                          <button type="button" className="ag-link" onClick={() => cambia({ promemoria: m.promemoria.map((x, j) => (j === i ? { ...x, metodo: x.metodo === 'email' ? 'popup' : 'email' } : x)) })}>
                            {p.metodo === 'email' ? 'email' : 'notifica'}
                          </button>
                          <button type="button" className="ag-icona-btn" aria-label="Togli" onClick={() => cambia({ promemoria: m.promemoria.filter((_, j) => j !== i) })}><X /></button>
                        </span>
                      ))}
                      {m.promemoria.length < 5 ? (
                        <button type="button" className="ag-chip ag-chip--add" onClick={() => cambia({ promemoria: [...m.promemoria, { metodo: 'popup', minuti: 10 }] })}><Plus aria-hidden /> Promemoria</button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ) : null}

            <button type="button" className="ag-avanzate-toggle" onClick={() => setAvanzate((v) => !v)} data-aperto={avanzate || undefined}>
              <ChevronDown aria-hidden /> Visibilità e permessi
            </button>
            {avanzate ? (
              <div className="ag-avanzate">
                <div className="ag-campo">
                  <Eye aria-hidden />
                  <div className="ag-riga-campi">
                    <span className="ag-select">
                      <select value={m.trasparenza} onChange={(e) => cambia({ trasparenza: e.target.value as Modulo['trasparenza'] })} aria-label="Disponibilità">
                        <option value="opaque">Occupato</option>
                        <option value="transparent">Libero</option>
                      </select>
                    </span>
                    <span className="ag-select">
                      <select value={m.visibilita} onChange={(e) => cambia({ visibilita: e.target.value as Modulo['visibilita'] })} aria-label="Visibilità">
                        <option value="default">Visibilità predefinita</option>
                        <option value="public">Pubblico</option>
                        <option value="private">Privato</option>
                      </select>
                    </span>
                  </div>
                </div>
                {m.invitati.length ? (
                  <div className="ag-permessi">
                    <strong>Gli invitati possono</strong>
                    <label className="ag-check"><input type="checkbox" checked={m.ospitiPossonoModificare} onChange={(e) => cambia({ ospitiPossonoModificare: e.target.checked })} /> modificare l'evento</label>
                    <label className="ag-check"><input type="checkbox" checked={m.ospitiPossonoInvitare} onChange={(e) => cambia({ ospitiPossonoInvitare: e.target.checked })} /> invitare altre persone</label>
                    <label className="ag-check"><input type="checkbox" checked={m.ospitiVedonoAltri} onChange={(e) => cambia({ ospitiVedonoAltri: e.target.checked })} /> vedere l'elenco degli invitati</label>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <aside className="ag-editor-lato">
            <Disponibilita modulo={m} io={stato.email} nomeIo={stato.nome} onSposta={(d, o) => setM((x) => conInizio(x, d, o))} onConflitti={setConflitti} />
            <AnteprimaInvito modulo={m} colore={colore ?? 'var(--ag-accento)'} valido={valido} start={start} end={end} />
          </aside>
        </div>

        {serie && !guardia ? (
          <div className="ag-editor-serie" role="radiogroup" aria-label="Quali date modificare">
            <span><Repeat aria-hidden /> Evento ricorrente: applica a</span>
            <div className="ag-segmenti">
              {(['QUESTO', 'SEGUENTI', 'TUTTI'] as const).map((a) => (
                <button key={a} type="button" role="radio" aria-checked={ambito === a} data-attivo={ambito === a || undefined} onClick={() => setAmbito(a)} title={NOMI_AMBITO[a].nota}>
                  {NOMI_AMBITO[a].nome}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {guardia ? (
          <div className="ag-editor-piede ag-guardia" role="alertdialog" aria-label="Modifiche non salvate">
            <span className="ag-guardia-icona" aria-hidden><AlertTriangle /></span>
            <span className="ag-guardia-testo">
              <strong>Hai modifiche non salvate</strong>
              <small>Se chiudi adesso, le perdi.</small>
            </span>
            <button type="button" className="ag-btn" autoFocus onClick={() => setGuardia(false)}>Continua a modificare</button>
            <button type="button" className="ag-btn ag-btn--pericolo" onClick={onChiudi}>Scarta</button>
          </div>
        ) : (
          <div className="ag-editor-piede">
            <div className="ag-invio">
              {daAvvisare.length ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifica}
                  className="ag-avvisa"
                  data-attivo={notifica || undefined}
                  onClick={() => setNotificaScelta(!notifica)}
                >
                  <span className="ag-faccine" aria-hidden>
                    {daAvvisare.slice(0, 4).map((i) => <Avatar key={i.email} persona={i} dimensione={26} />)}
                    {daAvvisare.length > 4 ? <em>+{daAvvisare.length - 4}</em> : null}
                  </span>
                  <span className="ag-avvisa-testo">
                    <strong>
                      {notifica
                        ? nuovo ? `Invia l'invito a ${elencoNomi(daAvvisare)}` : `Avvisa ${elencoNomi(daAvvisare)}`
                        : nuovo ? 'Aggiungi senza mandare email' : 'Nessuna email agli invitati'}
                    </strong>
                    <small>
                      {notifica
                        ? nuovo ? 'Ricevono un\'email da Google e possono rispondere sì, no o forse.'
                          : nuoviInvitati ? `I nuovi ricevono l'invito, gli altri le modifiche.` : 'Ricevono un\'email con le modifiche.'
                        : !nuovo && !avvisoConsigliato && notificaScelta === null
                          ? 'Hai cambiato solo cose tue (colore, promemoria…).'
                          : 'Il loro calendario si aggiorna lo stesso, in silenzio.'}
                    </small>
                  </span>
                  <i className="ag-interruttore" aria-hidden />
                </button>
              ) : (
                <span className="ag-editor-sync"><Sparkles aria-hidden /> Salvato direttamente su Google Calendar</span>
              )}
              {errore ? (
                <span className="ag-invio-errore" role="alert"><AlertTriangle aria-hidden /> {errore}</span>
              ) : conflitti.length ? (
                <span className="ag-invio-conflitto"><AlertTriangle aria-hidden /> {conflitti.length === 1 ? (conflitti[0] === 'Tu' ? 'Hai già un impegno' : `${conflitti[0]} ha già un impegno`) : `${conflitti.length} persone hanno già un impegno`}</span>
              ) : null}
            </div>
            <button type="button" className="ag-btn" onClick={chiudi}>Annulla</button>
            <button type="button" className="ag-btn ag-btn--primario ag-salva" disabled={!valido || salvando} onClick={() => void salva()}>
              {salvando ? <Loader2 className="animate-spin" aria-hidden /> : notifica ? <Mail aria-hidden /> : <Check aria-hidden />} {etichettaSalva} <kbd>⌘↵</kbd>
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────── Creazione rapida ─────────────────────────

interface RapidaProps {
  bozza: Bozza
  ancora: DOMRect | null
  stato: AgendaStato
  calendarioPredefinito: string
  onChiudi: () => void
  onCambiaBozza: (b: Bozza) => void
  onSalva: (m: Modulo, esito: EsitoConferma) => Promise<void>
  onAltreOpzioni: (m: Modulo) => void
}

/** La scheda che appare dopo aver disegnato un evento: titolo e invio, il resto in "Altre opzioni". */
export function CreazioneRapida({ bozza, ancora, stato, calendarioPredefinito, onChiudi, onCambiaBozza, onSalva, onAltreOpzioni }: RapidaProps) {
  const [m, setM] = useState<Modulo>(() => moduloDaBozza(bozza, calendarioPredefinito))
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    setM((x) => ({ ...moduloDaBozza(bozza, x.calendarioId), titolo: x.titolo, tipo: x.tipo, conMeet: x.conMeet }))
  }, [bozza])
  const calendari = stato.calendari.filter((c: AgendaCalendario) => scrivibile(c))
  const { start, end } = estremiModulo(m)

  const salva = async () => {
    setSalvando(true)
    try {
      await onSalva(m, { ambito: 'QUESTO', notifica: false })
    } catch {
      // l'errore è già mostrato da chi salva; la scheda resta aperta per riprovare
    } finally {
      setSalvando(false)
    }
  }

  const imposta = (p: Partial<Modulo>) => {
    const nuovo = { ...m, ...p }
    setM(nuovo)
    const e = estremiModulo(nuovo)
    if (e.end > e.start) onCambiaBozza({ start: e.start, end: e.end, tuttoIlGiorno: nuovo.tuttoIlGiorno })
  }

  return (
    <Fluttuante ancora={ancora} onChiudi={onChiudi} larghezza={420} className="ag-rapida">
      <div className="ag-rapida-corpo">
        <button type="button" className="ag-det-chiudi" onClick={onChiudi} aria-label="Chiudi"><X /></button>
        <input
          autoFocus
          className="ag-rapida-titolo"
          value={m.titolo}
          placeholder="Aggiungi un titolo"
          onChange={(e) => setM({ ...m, titolo: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void salva()
            }
          }}
        />
        {m.calendarioId === 'primary' ? (
          <div className="ag-tipi ag-tipi--mini">
            {([
              ['default', 'Evento'],
              ['focusTime', 'Concentrazione'],
              ['outOfOffice', 'Fuori sede'],
            ] as const).map(([id, nome]) => (
              <button key={id} type="button" data-attivo={m.tipo === id || undefined} onClick={() => imposta({ tipo: id, ...(id !== 'default' && m.tuttoIlGiorno ? { tuttoIlGiorno: false, oraInizio: '09:00', oraFine: '10:00', dataFine: m.dataInizio } : {}) })}>{nome}</button>
            ))}
          </div>
        ) : null}
        <div className="ag-rapida-quando">
          <Clock aria-hidden />
          <div>
            <strong>{dataLunga(start)}</strong>
            {!m.tuttoIlGiorno ? (
              <span className="ag-rapida-ore">
                <SceltaOra valore={m.oraInizio} onCambia={(v) => imposta(conInizio(m, m.dataInizio, v))} etichetta="Inizio" />
                –
                <SceltaOra valore={m.oraFine} da={m.dataFine === m.dataInizio ? m.oraInizio : undefined} onCambia={(v) => imposta({ oraFine: v })} etichetta="Fine" />
              </span>
            ) : (
              <small>{m.dataFine !== m.dataInizio ? `fino a ${dataLunga(aggiungiGiorni(end, -1))}` : 'Tutto il giorno'}</small>
            )}
          </div>
        </div>
        {m.tipo === 'default' ? (
          <button type="button" className="ag-rapida-meet" data-attivo={m.conMeet || undefined} onClick={() => setM({ ...m, conMeet: !m.conMeet })}>
            <Video aria-hidden /> {m.conMeet ? 'Google Meet aggiunto' : 'Aggiungi Google Meet'}
            {m.conMeet ? <Check aria-hidden /> : null}
          </button>
        ) : null}
        {calendari.length > 1 ? (
          <div className="ag-rapida-cal">
            <CalendarDays aria-hidden />
            <span className="ag-select ag-select--cal" style={{ '--cc': coloreCalendario(stato.calendari.find((c) => c.id === m.calendarioId)) } as CSSProperties}>
              <select value={m.calendarioId} onChange={(e) => setM({ ...m, calendarioId: e.target.value, ...(e.target.value !== 'primary' ? { tipo: 'default' } : {}) })} aria-label="Calendario">
                {calendari.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </span>
          </div>
        ) : null}
      </div>
      <div className="ag-rapida-piede">
        <button type="button" className="ag-btn ag-btn--fantasma" onClick={() => onAltreOpzioni(m)}>Altre opzioni</button>
        <button type="button" className="ag-btn ag-btn--primario" disabled={salvando || end <= start} onClick={() => void salva()}>
          {salvando ? <Loader2 className="animate-spin" aria-hidden /> : null} Salva
        </button>
      </div>
    </Fluttuante>
  )
}
