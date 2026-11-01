import { memo, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import type { AgendaCalendario } from '@/services/agenda-service'
import {
  aggiungiGiorni, coloreCalendario, INIZIALI_LUN, inizioSettimana, maiuscola, nomeMese, scrivibile, stessoGiorno,
} from './agenda-utils'

// ───────────────────────── Mini mese ─────────────────────────

export const MiniMese = memo(function MiniMese({ data, da, a, adesso, giorniConEventi, onScegli }: {
  data: Date
  da: Date
  a: Date
  adesso: Date
  giorniConEventi: Set<number>
  onScegli: (d: Date) => void
}) {
  const [mese, setMese] = useState(() => new Date(data.getFullYear(), data.getMonth(), 1))
  const [seguito, setSeguito] = useState(data.getTime())
  // Navigando con le frecce in alto il mini mese segue la data, ma resta libero di sfogliare per conto suo.
  if (seguito !== data.getTime()) {
    setSeguito(data.getTime())
    if (data.getMonth() !== mese.getMonth() || data.getFullYear() !== mese.getFullYear()) setMese(new Date(data.getFullYear(), data.getMonth(), 1))
  }
  const inizio = inizioSettimana(mese)
  const celle = Array.from({ length: 42 }, (_, i) => aggiungiGiorni(inizio, i))
  return (
    <div className="ag-mini">
      <div className="ag-mini-testa">
        <strong>{maiuscola(nomeMese(mese.getMonth()))} {mese.getFullYear()}</strong>
        <span>
          <button type="button" aria-label="Mese precedente" onClick={() => setMese(new Date(mese.getFullYear(), mese.getMonth() - 1, 1))}><ChevronLeft /></button>
          <button type="button" aria-label="Mese successivo" onClick={() => setMese(new Date(mese.getFullYear(), mese.getMonth() + 1, 1))}><ChevronRight /></button>
        </span>
      </div>
      <div className="ag-mini-griglia">
        {INIZIALI_LUN.map((g, i) => <span key={`d${i}`} className="ag-mini-dow">{g}</span>)}
        {celle.map((c) => (
          <button
            key={c.getTime()}
            type="button"
            className="ag-mini-giorno"
            data-fuori={c.getMonth() !== mese.getMonth() || undefined}
            data-oggi={stessoGiorno(c, adesso) || undefined}
            data-scelto={stessoGiorno(c, data) || undefined}
            data-finestra={(c >= da && c < a) || undefined}
            data-eventi={giorniConEventi.has(c.getTime()) || undefined}
            onClick={() => onScegli(c)}
          >
            {c.getDate()}
          </button>
        ))}
      </div>
    </div>
  )
})

// ───────────────────────── Calendari ─────────────────────────

export function ListaCalendari({ calendari, visibili, onCambia }: {
  calendari: AgendaCalendario[]
  visibili: Set<string>
  onCambia: (v: Set<string>) => void
}) {
  const miei = calendari.filter((c) => c.principale || c.accesso === 'owner')
  const altri = calendari.filter((c) => !(c.principale || c.accesso === 'owner'))
  const voce = (c: AgendaCalendario) => {
    const on = visibili.has(c.id)
    return (
      <li key={c.id}>
        <button
          type="button"
          className="ag-cal"
          data-on={on || undefined}
          style={{ '--c': coloreCalendario(c) } as CSSProperties}
          onClick={(e) => {
            const v = new Set(visibili)
            if (e.altKey) {
              onCambia(new Set([c.id]))
              return
            }
            if (on) v.delete(c.id)
            else v.add(c.id)
            onCambia(v)
          }}
          title={`${c.nome}${c.descrizione ? ` — ${c.descrizione}` : ''}\n⌥ clic: mostra solo questo`}
        >
          <i aria-hidden />
          <span>{c.principale ? 'Il mio calendario' : c.nome}</span>
          {!scrivibile(c) ? <Lock className="ag-cal-lock" aria-label="Sola lettura" /> : null}
        </button>
      </li>
    )
  }
  return (
    <div className="ag-calendari">
      <h4>I miei calendari</h4>
      <ul>{miei.map(voce)}</ul>
      {altri.length ? (
        <>
          <h4>Altri calendari</h4>
          <ul>{altri.map(voce)}</ul>
        </>
      ) : null}
    </div>
  )
}
