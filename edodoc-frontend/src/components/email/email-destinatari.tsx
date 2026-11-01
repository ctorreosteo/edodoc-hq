import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock, HeartPulse, X } from 'lucide-react'
import { LuxAvatar } from '@/components/lux'
import { casellaService, type EmailSuggerimento } from '@/services/casella-service'
import { indirizzoValido, inizialiIndirizzo, leggiRecenti, normEmail, soloEmail } from './email-utils'

/*
  Campo destinatari a chip: Invio, Tab, virgola o punto e virgola confermano; Backspace sul campo vuoto toglie
  l'ultimo; incollare una lista la spezza. Suggerimenti dai pazienti del gestionale e dai recenti.
*/

function nomeDaChip(s: string): { nome: string | null; email: string } {
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  return m ? { nome: m[1].trim() || null, email: m[2].trim() } : { nome: null, email: s.trim() }
}

export function EmailDestinatari({
  etichetta,
  valori,
  onChange,
  autoFocus,
  coda,
}: {
  etichetta: string
  valori: string[]
  onChange: (v: string[]) => void
  autoFocus?: boolean
  /** Contenuto a destra (es. pulsanti Cc/Ccn). */
  coda?: React.ReactNode
}) {
  const [testo, setTesto] = useState('')
  const [suggerimenti, setSuggerimenti] = useState<EmailSuggerimento[]>([])
  const [attivo, setAttivo] = useState(0)
  const [aperto, setAperto] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const recenti = useMemo<EmailSuggerimento[]>(() => {
    const q = testo.trim().toLowerCase()
    if (q.length < 1) return []
    return leggiRecenti()
      .filter((r) => r.toLowerCase().includes(q))
      .slice(0, 4)
      .map((r) => {
        const { nome, email } = nomeDaChip(r)
        return { nome: nome ?? email, email, fonte: 'RECENTE' as const, pazienteId: null }
      })
  }, [testo])

  useEffect(() => {
    const q = testo.trim()
    if (q.length < 2) {
      setSuggerimenti([])
      return
    }
    let attuale = true
    const t = setTimeout(() => {
      casellaService
        .suggerimenti(q)
        .then((risultati) => {
          if (attuale) setSuggerimenti(risultati)
        })
        .catch(() => {})
    }, 180)
    return () => {
      clearTimeout(t)
      attuale = false
    }
  }, [testo])

  const gia = new Set(valori.map((v) => normEmail(soloEmail(v))))
  const lista = [...recenti, ...suggerimenti]
    .filter((s, i, arr) => arr.findIndex((x) => normEmail(x.email) === normEmail(s.email) && x.pazienteId === s.pazienteId) === i)
    .filter((s) => !gia.has(normEmail(s.email)))
    .slice(0, 8)

  const aggiungi = (grezzi: string[]) => {
    const nuovi = grezzi
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !gia.has(normEmail(soloEmail(s))))
    if (nuovi.length) onChange([...valori, ...nuovi])
    setTesto('')
    setAttivo(0)
  }

  const scegli = (s: EmailSuggerimento) => {
    aggiungi([s.nome && s.nome !== s.email ? `${s.nome} <${s.email}>` : s.email])
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (aperto && lista.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAttivo((a) => (a + 1) % lista.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAttivo((a) => (a - 1 + lista.length) % lista.length)
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && testo.trim()) {
        e.preventDefault()
        scegli(lista[Math.min(attivo, lista.length - 1)])
        return
      }
    }
    if ((e.key === 'Enter' || e.key === ',' || e.key === ';' || (e.key === 'Tab' && testo.trim())) && testo.trim()) {
      e.preventDefault()
      aggiungi([testo])
      return
    }
    if (e.key === 'Backspace' && !testo && valori.length) {
      onChange(valori.slice(0, -1))
    }
  }

  return (
    <div className="em-dest" onClick={() => inputRef.current?.focus()}>
      <span className="em-dest-label">{etichetta}</span>
      <div className="em-dest-campo">
        {valori.map((v, i) => {
          const { nome, email } = nomeDaChip(v)
          const ok = indirizzoValido(v)
          return (
            <span key={`${v}-${i}`} className="em-chip" data-errore={ok ? undefined : ''} title={email}>
              <LuxAvatar first={inizialiIndirizzo({ nome, email })[0]} second={inizialiIndirizzo({ nome, email })[1]} className="em-chip-av" />
              <span className="em-chip-testo">{nome ?? email}</span>
              <button
                type="button"
                className="em-chip-x"
                aria-label={`Rimuovi ${email}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(valori.filter((_, j) => j !== i))
                }}
              >
                <X />
              </button>
            </span>
          )
        })}
        <div className="em-dest-input-wrap">
          <input
            ref={inputRef}
            className="em-dest-input"
            value={testo}
            autoFocus={autoFocus}
            onChange={(e) => {
              setTesto(e.target.value)
              setAperto(true)
              setAttivo(0)
            }}
            onFocus={() => setAperto(true)}
            onBlur={() => {
              setTimeout(() => setAperto(false), 120)
              if (testo.trim() && indirizzoValido(testo)) aggiungi([testo])
            }}
            onKeyDown={onKeyDown}
            onPaste={(e) => {
              const t = e.clipboardData.getData('text')
              if (/[,;\n]/.test(t)) {
                e.preventDefault()
                aggiungi(t.split(/[,;\n]+/))
              }
            }}
            aria-label={`Destinatari ${etichetta}`}
            aria-autocomplete="list"
            aria-expanded={aperto && lista.length > 0}
          />
          {aperto && lista.length > 0 ? (
            <ul className="em-sugg" role="listbox">
              {lista.map((s, i) => (
                <li
                  key={`${s.email}-${s.pazienteId ?? s.fonte}`}
                  role="option"
                  aria-selected={i === attivo}
                  data-attivo={i === attivo ? '' : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    scegli(s)
                  }}
                  onMouseEnter={() => setAttivo(i)}
                >
                  <LuxAvatar first={inizialiIndirizzo(s)[0]} second={inizialiIndirizzo(s)[1]} className="em-sugg-av" />
                  <span className="em-sugg-testo">
                    <strong>{s.nome}</strong>
                    <small>{s.email}</small>
                  </span>
                  <span className="em-sugg-fonte" data-fonte={s.fonte}>
                    {s.fonte === 'PAZIENTE' ? <HeartPulse /> : <Clock />}
                    {s.fonte === 'PAZIENTE' ? 'Paziente' : 'Recente'}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      {coda}
    </div>
  )
}
