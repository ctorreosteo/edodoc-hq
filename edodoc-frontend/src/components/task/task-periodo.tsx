import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { it } from 'date-fns/locale'
import { AlertCircle, ArrowRight, Clock3, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  DURATE_RAPIDE, ORARI_PERIODO, bozzaDa, conDurata, erroreBozza, giornoBreve, minutiBozza,
  periodoDaBozza, spostaInizio, type BozzaPeriodo, type Periodo,
} from '@/lib/task-periodo'
import { formatStima } from '@/lib/task-stima'
import { TASK_LAYER_Z, parseDataLocale, toIsoData } from './task-ui'

type Lato = 'da' | 'a'

/** Prossimo quarto d'ora pieno (per l'ora d'inizio proposta oggi), al più tardi 22:00; negli altri giorni le 9. */
function oraProposta(data: string): string {
  const adesso = new Date()
  if (data !== toIsoData(adesso)) return '09:00'
  const minuti = Math.min(22 * 60, Math.ceil((adesso.getHours() * 60 + adesso.getMinutes() + 1) / 15) * 15)
  return `${String(Math.floor(minuti / 60)).padStart(2, '0')}:${String(minuti % 60).padStart(2, '0')}`
}

/**
 * Orario del task in una vista sola: inizio → fine con giorno e ora, durate rapide e «Tutto il giorno».
 * Si modifica in bozza e si salva una volta, con «Salva» o Invio.
 */
export function TaskPeriodoPicker({
  valore,
  onChange,
  trigger,
  stimaMinuti,
  align = 'start',
}: {
  valore: Periodo
  onChange: (p: Periodo) => void
  trigger: ReactNode
  /** Durata proposta quando si sceglie solo l'inizio */
  stimaMinuti?: number | null
  align?: 'start' | 'center' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const [bozza, setBozza] = useState<BozzaPeriodo>(() => bozzaDa(valore, toIsoData(new Date())))
  const [lato, setLato] = useState<Lato>('da')

  const apri = (o: boolean) => {
    setOpen(o)
    if (o) {
      setBozza(bozzaDa(valore, toIsoData(new Date())))
      setLato('da')
    }
  }

  const durataStimata = stimaMinuti && stimaMinuti > 0 ? stimaMinuti : 60
  const tuttoIlGiorno = !bozza.daOra && !bozza.aOra
  const errore = erroreBozza(bozza)
  const minuti = minutiBozza(bozza)
  const risultato = periodoDaBozza(bozza, valore)
  const cambiato = JSON.stringify(risultato) !== JSON.stringify({
    dataInizio: valore.dataInizio, inizioOra: valore.inizioOra, scadenza: valore.scadenza, scadenzaOra: valore.scadenzaOra,
  })

  const salva = () => {
    if (errore) return
    if (cambiato) onChange(risultato)
    setOpen(false)
  }

  const scegliGiorno = (d: Date) => {
    const g = toIsoData(d)
    if (lato === 'da') {
      setBozza((b) => spostaInizio(b, g, b.daOra))
      setLato('a')
    } else {
      // Fine prima dell'inizio: diventa un giorno solo
      setBozza((b) => (g < b.da ? { ...b, da: g, a: g } : { ...b, a: g }))
    }
  }

  const cambiaOraInizio = (ora: string | null) =>
    setBozza((b) => {
      if (!ora) return { ...b, daOra: null }
      if (!b.daOra) return b.aOra && erroreBozza({ ...b, daOra: ora }) == null ? { ...b, daOra: ora } : conDurata({ ...b, daOra: ora }, durataStimata)
      return spostaInizio(b, b.da, ora)
    })

  const cambiaTuttoIlGiorno = (si: boolean) =>
    setBozza((b) => (si ? { ...b, daOra: null, aOra: null } : conDurata({ ...b, daOra: oraProposta(b.da) }, durataStimata)))

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLSelectElement)) {
      e.preventDefault()
      salva()
    }
  }

  const da = parseDataLocale(bozza.da) ?? new Date()
  const a = parseDataLocale(bozza.a) ?? da

  return (
    <Popover open={open} onOpenChange={apri}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} sideOffset={6} collisionPadding={8} data-vl="scope" data-vl-page="task" onKeyDown={onKeyDown} onOpenAutoFocus={(e) => e.preventDefault()}
        className={cn('tkb-pop tkp w-[min(36rem,calc(100vw-1rem))] p-0', TASK_LAYER_Z)}>
        <header className="tkp-head">
          <span className="tkp-titolo"><Clock3 className="size-4" />Orario</span>
          <label className="tkp-switch">
            <input type="checkbox" role="switch" checked={tuttoIlGiorno} onChange={(e) => cambiaTuttoIlGiorno(e.target.checked)} />
            <span aria-hidden className="tkp-switch-pista"><span /></span>
            <Sun className="size-3.5" />
            Tutto il giorno
          </label>
        </header>

        <div className="tkp-lati">
          <CampoLato etichetta="Inizio" attivo={lato === 'da'} onAttiva={() => setLato('da')} giorno={bozza.da}
            ora={bozza.daOra} tuttoIlGiorno={tuttoIlGiorno} onOra={cambiaOraInizio} />
          <ArrowRight className="tkp-freccia" aria-hidden />
          <CampoLato etichetta="Fine" attivo={lato === 'a'} onAttiva={() => setLato('a')} giorno={bozza.a}
            ora={bozza.aOra} tuttoIlGiorno={tuttoIlGiorno} errore={errore != null}
            onOra={(ora) => setBozza((b) => ({ ...b, aOra: ora }))} />
        </div>

        {!tuttoIlGiorno && bozza.daOra ? (
          <div className="tkp-durate" role="group" aria-label="Durata">
            <span>Durata</span>
            {DURATE_RAPIDE.map((m) => (
              <button key={m} type="button" className="tkp-durata" data-attivo={minuti === m ? '' : undefined}
                onClick={() => setBozza((b) => conDurata(b, m))}>
                {formatStima(m)}
              </button>
            ))}
            {minuti != null && minuti > 0 && !DURATE_RAPIDE.includes(minuti) ? (
              <span className="tkp-durata" data-attivo="">{formatStima(minuti)}</span>
            ) : null}
          </div>
        ) : null}

        <div className="tkp-corpo">
        <div className="tkp-cal">
          <p className="tkp-cal-aiuto">
            {lato === 'da' ? 'Scegli il giorno d\'inizio' : 'Scegli il giorno di fine'}
          </p>
          <Calendar mode="range" weekStartsOn={1} locale={it} selected={{ from: da, to: a }} defaultMonth={lato === 'a' ? a : da}
            onSelect={() => {}} onDayClick={scegliGiorno} />
        </div>

        {errore ? (
          <p className="tkp-errore" role="alert"><AlertCircle className="size-4" />{errore}</p>
        ) : null}
        </div>

        <footer className="tkp-piede">
          {valore.dataInizio || valore.inizioOra || valore.scadenzaOra ? (
            <button type="button" className="tkp-togli"
              onClick={() => {
                onChange({ dataInizio: null, inizioOra: null, scadenza: valore.scadenza, scadenzaOra: null })
                setOpen(false)
              }}>
              Togli l'orario
            </button>
          ) : <span />}
          <div className="tkp-azioni">
            <button type="button" className="tkp-annulla" onClick={() => setOpen(false)}>Annulla</button>
            <button type="button" className="tkb-btn-primario" disabled={errore != null} onClick={salva}>
              Salva
            </button>
          </div>
        </footer>
      </PopoverContent>
    </Popover>
  )
}

function CampoLato({ etichetta, attivo, onAttiva, giorno, ora, tuttoIlGiorno, errore, onOra }: {
  etichetta: string
  attivo: boolean
  onAttiva: () => void
  giorno: string
  ora: string | null
  tuttoIlGiorno: boolean
  errore?: boolean
  onOra: (ora: string | null) => void
}) {
  const orari = ora && !ORARI_PERIODO.includes(ora) ? [...ORARI_PERIODO, ora].sort() : ORARI_PERIODO
  return (
    <div className="tkp-lato" data-attivo={attivo ? '' : undefined} data-errore={errore ? '' : undefined}>
      <button type="button" className="tkp-lato-giorno" onClick={onAttiva} aria-pressed={attivo}>
        <small>{etichetta}</small>
        <b>{giornoBreve(giorno)}</b>
      </button>
      {tuttoIlGiorno ? null : (
        <select className="tkp-ora" value={ora ?? ''} onChange={(e) => onOra(e.target.value || null)}
          aria-label={`Ora di ${etichetta.toLowerCase()}`} onFocus={onAttiva}>
          <option value="">—</option>
          {orari.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
    </div>
  )
}
