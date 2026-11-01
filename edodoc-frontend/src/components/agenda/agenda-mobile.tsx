import { memo, type ReactNode } from 'react'
import { ChevronDown, Menu, Search } from 'lucide-react'
import { aggiungiGiorni, GIORNI_BREVI, inizioSettimana, stessoGiorno, VISTE_MOBILE, type Vista } from './agenda-utils'
import { useSwipeOrizzontale } from './agenda-swipe'

/*
  Telefono: al posto della testata grande e della barra strumenti, una barra compatta pensata per il pollice
  (titolo del mese che apre il mini calendario, Oggi, ricerca), le viste in un controllo segmentato
  e — nelle viste a giorni — la striscia della settimana che si sfoglia col dito.
*/

interface BarraProps {
  vista: Vista
  data: Date
  adesso: Date
  titolo: string
  miniAperto: boolean
  giorniConEventi: Set<number>
  onVista: (v: Vista) => void
  onData: (d: Date) => void
  onMenu: () => void
  onMini: () => void
  onCerca: () => void
  mini: ReactNode
}

export function BarraMobile({ vista, data, adesso, titolo, miniAperto, giorniConEventi, onVista, onData, onMenu, onMini, onCerca, mini }: BarraProps) {
  const giorniVista = vista === 'giorno' || vista === '3giorni'
  return (
    <div className="ag-mbarra">
      <div className="ag-mbarra-riga">
        <button type="button" className="ag-icona-btn" onClick={onMenu} aria-label="Calendari"><Menu /></button>
        <button type="button" className="ag-mbarra-titolo" onClick={onMini} aria-expanded={miniAperto}>
          <strong key={titolo}>{titolo}</strong>
          <ChevronDown data-aperto={miniAperto || undefined} aria-hidden />
        </button>
        <span className="ag-spazio" />
        <button type="button" className="ag-icona-btn" onClick={onCerca} aria-label="Cerca"><Search /></button>
        <button
          type="button"
          className="ag-mbarra-oggi"
          data-oggi={stessoGiorno(data, adesso) || undefined}
          onClick={() => onData(new Date())}
          aria-label="Vai a oggi"
        >
          <span>{GIORNI_BREVI[adesso.getDay()]}</span>
          <strong>{adesso.getDate()}</strong>
        </button>
      </div>
      {miniAperto ? <div className="ag-mbarra-mini">{mini}</div> : null}
      <div className="ag-viste ag-viste--m" role="tablist">
        {VISTE_MOBILE.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={vista === v.id} data-attivo={vista === v.id || undefined} onClick={() => onVista(v.id)}>
            {v.nome}
          </button>
        ))}
      </div>
      {giorniVista ? <StrisciaSettimana data={data} adesso={adesso} giorniConEventi={giorniConEventi} lunghezza={vista === '3giorni' ? 3 : 1} onData={onData} /> : null}
    </div>
  )
}

/** Sette giorni da toccare; si sfoglia di una settimana con uno swipe. */
const StrisciaSettimana = memo(function StrisciaSettimana({ data, adesso, giorniConEventi, lunghezza, onData }: {
  data: Date
  adesso: Date
  giorniConEventi: Set<number>
  lunghezza: number
  onData: (d: Date) => void
}) {
  const inizio = inizioSettimana(data)
  const giorni = Array.from({ length: 7 }, (_, i) => aggiungiGiorni(inizio, i))
  const fineSelezione = aggiungiGiorni(data, lunghezza)
  const swipe = useSwipeOrizzontale((verso) => onData(aggiungiGiorni(data, 7 * verso)))
  return (
    <div className="ag-msett" {...swipe} key={inizio.getTime()}>
      {giorni.map((g) => (
        <button
          key={g.getTime()}
          type="button"
          className="ag-msett-giorno"
          data-scelto={(g >= data && g < fineSelezione) || undefined}
          data-primo={stessoGiorno(g, data) || undefined}
          data-oggi={stessoGiorno(g, adesso) || undefined}
          data-weekend={g.getDay() === 0 || g.getDay() === 6 || undefined}
          onClick={() => onData(g)}
        >
          <span>{GIORNI_BREVI[g.getDay()].slice(0, 1).toUpperCase()}</span>
          <strong>{g.getDate()}</strong>
          <i data-pieno={giorniConEventi.has(g.getTime()) || undefined} aria-hidden />
        </button>
      ))}
    </div>
  )
})
