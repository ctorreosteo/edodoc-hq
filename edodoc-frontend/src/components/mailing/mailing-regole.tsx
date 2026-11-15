import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { FolderPlus, Plus, Trash2, X } from 'lucide-react'
import type { MailingCatalogoCampo, MailingCondizione, MailingGruppoRegole } from '@/services/mailing-service'
import {
  MESI,
  OP_ETICHETTA,
  PROFONDITA_MASSIMA,
  condizioneCompleta,
  etichettaOpzione,
  isGruppo,
  normalizzaValoreOpzione,
  valoreIniziale,
} from './mailing-regole-logica'

/*
  Costruttore visuale delle regole di segmento (segmenti, pubblico campagna, condizioni delle automazioni).
  Si legge come una frase: "Contatti che soddisfano tutte / almeno una di queste condizioni: … e … ".
  La logica pura (descriviRegole, regoleVuote, validazione) sta in mailing-regole-logica.ts ed è riesportata qui.
*/

export { regoleVuote, descriviRegole, regoleValide, contaCondizioni, condizioneCompleta, isGruppo } from './mailing-regole-logica'

// ───────────────────────── Componente ─────────────────────────

type Props = {
  valore: MailingGruppoRegole
  onChange: (r: MailingGruppoRegole) => void
  catalogo: MailingCatalogoCampo[]
  compatto?: boolean
}

export function MailingCostruttoreRegole({ valore, onChange, catalogo, compatto }: Props) {
  const gruppi = useMemo(() => {
    const m = new Map<string, MailingCatalogoCampo[]>()
    catalogo.forEach((c) => {
      const g = c.gruppo || 'Altro'
      m.set(g, [...(m.get(g) ?? []), c])
    })
    return [...m.entries()]
  }, [catalogo])

  return (
    <div className="ml-regole" data-compatto={compatto ? '' : undefined}>
      <Gruppo
        gruppo={valore}
        onChange={onChange}
        catalogo={catalogo}
        gruppi={gruppi}
        profondita={1}
        compatto={!!compatto}
      />
    </div>
  )
}

function Gruppo({
  gruppo,
  onChange,
  onRimuovi,
  catalogo,
  gruppi,
  profondita,
  compatto,
}: {
  gruppo: MailingGruppoRegole
  onChange: (g: MailingGruppoRegole) => void
  onRimuovi?: () => void
  catalogo: MailingCatalogoCampo[]
  gruppi: [string, MailingCatalogoCampo[]][]
  profondita: number
  compatto: boolean
}) {
  const radice = profondita === 1
  const aggiorna = (i: number, nuovo: MailingCondizione | MailingGruppoRegole) =>
    onChange({ ...gruppo, condizioni: gruppo.condizioni.map((c, j) => (j === i ? nuovo : c)) })
  const rimuovi = (i: number) => onChange({ ...gruppo, condizioni: gruppo.condizioni.filter((_, j) => j !== i) })
  const aggiungiCondizione = () => {
    const primo = catalogo[0]
    const nuova: MailingCondizione = { campo: primo?.campo ?? '', op: primo?.operatori[0] ?? '', valore: valoreIniziale(primo) }
    onChange({ ...gruppo, condizioni: [...gruppo.condizioni, nuova] })
  }
  const aggiungiGruppo = () => {
    const primo = catalogo[0]
    const sotto: MailingGruppoRegole = {
      operatore: gruppo.operatore === 'E' ? 'O' : 'E',
      condizioni: [{ campo: primo?.campo ?? '', op: primo?.operatori[0] ?? '', valore: valoreIniziale(primo) }],
    }
    onChange({ ...gruppo, condizioni: [...gruppo.condizioni, sotto] })
  }
  const congiunzione = gruppo.operatore === 'E' ? 'e' : 'oppure'

  return (
    <div className="ml-regole-gruppo" data-radice={radice ? '' : undefined} data-op={gruppo.operatore}>
      <div className="ml-regole-intestazione">
        <span className="ml-regole-frase">{radice ? 'Contatti che soddisfano' : 'Soddisfano'}</span>
        <div className="ml-regole-op" role="radiogroup" aria-label="Come combinare le condizioni">
          <button type="button" role="radio" aria-checked={gruppo.operatore === 'E'} data-active={gruppo.operatore === 'E' ? '' : undefined} onClick={() => onChange({ ...gruppo, operatore: 'E' })}>
            tutte
          </button>
          <button type="button" role="radio" aria-checked={gruppo.operatore === 'O'} data-active={gruppo.operatore === 'O' ? '' : undefined} onClick={() => onChange({ ...gruppo, operatore: 'O' })}>
            almeno una
          </button>
        </div>
        <span className="ml-regole-frase">{radice ? 'di queste condizioni' : 'di queste'}</span>
        {onRimuovi ? (
          <button type="button" className="ml-regole-rimuovi ml-regole-rimuovi--gruppo" onClick={onRimuovi} aria-label="Rimuovi il gruppo" title="Rimuovi il gruppo">
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {gruppo.condizioni.length === 0 ? (
        <div className="ml-regole-vuoto">
          {radice ? 'Nessuna condizione: il pubblico è formato da tutti i contatti iscritti.' : 'Gruppo vuoto: aggiungi una condizione.'}
        </div>
      ) : (
        <ol className="ml-regole-lista">
          {gruppo.condizioni.map((c, i) => (
            <li key={i} className="ml-regole-voce">
              <span className="ml-regole-congiunzione" aria-hidden={i === 0}>
                {i === 0 ? (radice ? 'che' : '') : congiunzione}
              </span>
              {isGruppo(c) ? (
                <Gruppo
                  gruppo={c}
                  onChange={(g) => aggiorna(i, g)}
                  onRimuovi={() => rimuovi(i)}
                  catalogo={catalogo}
                  gruppi={gruppi}
                  profondita={profondita + 1}
                  compatto={compatto}
                />
              ) : (
                <Condizione condizione={c} onChange={(n) => aggiorna(i, n)} onRimuovi={() => rimuovi(i)} catalogo={catalogo} gruppi={gruppi} />
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="ml-regole-azioni">
        <button type="button" className="ml-regole-aggiungi" onClick={aggiungiCondizione} disabled={!catalogo.length}>
          <Plus className="size-3.5" aria-hidden /> Condizione
        </button>
        {profondita < PROFONDITA_MASSIMA ? (
          <button type="button" className="ml-regole-aggiungi ml-regole-aggiungi--gruppo" onClick={aggiungiGruppo} disabled={!catalogo.length}>
            <FolderPlus className="size-3.5" aria-hidden /> Gruppo
          </button>
        ) : null}
      </div>
    </div>
  )
}

function Condizione({
  condizione,
  onChange,
  onRimuovi,
  catalogo,
  gruppi,
}: {
  condizione: MailingCondizione
  onChange: (c: MailingCondizione) => void
  onRimuovi: () => void
  catalogo: MailingCatalogoCampo[]
  gruppi: [string, MailingCatalogoCampo[]][]
}) {
  const idBase = useId()
  const campo = catalogo.find((x) => x.campo === condizione.campo)
  const completa = condizioneCompleta(condizione, catalogo)
  const senzaValore = !campo || campo.tipoValore === 'NESSUNO' || condizione.op === 'VERO' || condizione.op === 'FALSO'

  const cambiaCampo = (nome: string) => {
    const nuovo = catalogo.find((x) => x.campo === nome)
    onChange({ campo: nome, op: nuovo?.operatori[0] ?? '', valore: valoreIniziale(nuovo) })
  }

  return (
    <div className="ml-regole-condizione" data-incompleta={completa ? undefined : ''}>
      <label className="sr-only" htmlFor={`${idBase}-campo`}>Campo</label>
      <select id={`${idBase}-campo`} className="ml-select ml-regole-campo" value={condizione.campo} onChange={(e) => cambiaCampo(e.target.value)} title={campo?.aiuto ?? undefined}>
        {!campo ? <option value={condizione.campo}>{condizione.campo || 'Scegli…'}</option> : null}
        {gruppi.map(([g, campi]) => (
          <optgroup key={g} label={g}>
            {campi.map((c) => (
              <option key={c.campo} value={c.campo}>
                {c.etichetta}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {campo && campo.operatori.length > 1 ? (
        <>
          <label className="sr-only" htmlFor={`${idBase}-op`}>Operatore</label>
          <select id={`${idBase}-op`} className="ml-select ml-regole-operatore" value={condizione.op} onChange={(e) => onChange({ ...condizione, op: e.target.value })}>
            {campo.operatori.map((op) => (
              <option key={op} value={op}>
                {OP_ETICHETTA[op] ?? op.toLowerCase()}
              </option>
            ))}
          </select>
        </>
      ) : campo ? (
        <span className="ml-regole-operatore-fisso">{OP_ETICHETTA[condizione.op] ?? condizione.op.toLowerCase()}</span>
      ) : null}

      {!senzaValore && campo ? <Valore campo={campo} valore={condizione.valore} onChange={(v) => onChange({ ...condizione, valore: v })} idBase={idBase} /> : null}

      {campo?.aiuto ? <span className="ml-regole-aiuto">{campo.aiuto}</span> : null}

      <button type="button" className="ml-regole-rimuovi" onClick={onRimuovi} aria-label="Rimuovi la condizione" title="Rimuovi">
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  )
}

function Valore({ campo, valore, onChange, idBase }: { campo: MailingCatalogoCampo; valore: unknown; onChange: (v: unknown) => void; idBase: string }) {
  const id = `${idBase}-valore`
  switch (campo.tipoValore) {
    case 'NUMERO':
      return (
        <>
          <label className="sr-only" htmlFor={id}>Valore</label>
          <input
            id={id}
            className="ml-input ml-regole-numero"
            type="number"
            inputMode="numeric"
            value={typeof valore === 'number' ? valore : ''}
            placeholder="0"
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </>
      )
    case 'TESTO':
      return (
        <>
          <label className="sr-only" htmlFor={id}>Valore</label>
          <input id={id} className="ml-input ml-regole-testo" type="text" value={typeof valore === 'string' ? valore : ''} placeholder="Scrivi…" onChange={(e) => onChange(e.target.value)} />
        </>
      )
    case 'SELECT':
      return (
        <>
          <label className="sr-only" htmlFor={id}>Valore</label>
          <select id={id} className="ml-select ml-regole-valore" value={valore == null ? '' : String(valore)} onChange={(e) => onChange(normalizzaValoreOpzione(e.target.value))}>
            {valore == null ? <option value="">Scegli…</option> : null}
            {(campo.opzioni ?? []).map((o) => (
              <option key={o.valore} value={o.valore}>
                {o.etichetta}
              </option>
            ))}
          </select>
        </>
      )
    case 'MESE':
      return (
        <>
          <label className="sr-only" htmlFor={id}>Mese</label>
          <select id={id} className="ml-select ml-regole-valore" value={valore == null ? 'CORRENTE' : String(valore)} onChange={(e) => onChange(e.target.value === 'CORRENTE' ? 'CORRENTE' : Number(e.target.value))}>
            <option value="CORRENTE">il mese corrente</option>
            {MESI.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </>
      )
    case 'INTERVALLO': {
      const [min, max] = Array.isArray(valore) ? (valore as (number | null)[]) : [null, null]
      const num = (s: string) => (s === '' ? null : Number(s))
      return (
        <span className="ml-regole-intervallo">
          <label className="sr-only" htmlFor={`${id}-min`}>Minimo</label>
          <input id={`${id}-min`} className="ml-input ml-regole-numero" type="number" inputMode="numeric" placeholder="min" value={min ?? ''} onChange={(e) => onChange([num(e.target.value), max ?? null])} />
          <span className="ml-regole-e">e</span>
          <label className="sr-only" htmlFor={`${id}-max`}>Massimo</label>
          <input id={`${id}-max`} className="ml-input ml-regole-numero" type="number" inputMode="numeric" placeholder="max" value={max ?? ''} onChange={(e) => onChange([min ?? null, num(e.target.value)])} />
        </span>
      )
    }
    case 'MULTI_SELECT':
      return <MultiSelezione campo={campo} valore={Array.isArray(valore) ? valore : []} onChange={onChange} id={id} />
    default:
      return null
  }
}

function MultiSelezione({ campo, valore, onChange, id }: { campo: MailingCatalogoCampo; valore: unknown[]; onChange: (v: unknown[]) => void; id: string }) {
  const [testo, setTesto] = useState('')
  const opzioni = campo.opzioni ?? null
  const scelti = new Set(valore.map(String))
  const rimanenti = (opzioni ?? []).filter((o) => !scelti.has(String(o.valore)))
  const togli = (v: unknown) => onChange(valore.filter((x) => String(x) !== String(v)))
  const aggiungiTesto = () => {
    const t = testo.trim()
    if (!t || scelti.has(t)) return
    onChange([...valore, t])
    setTesto('')
  }
  const suTasto = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      aggiungiTesto()
    } else if (e.key === 'Backspace' && !testo && valore.length) {
      onChange(valore.slice(0, -1))
    }
  }

  return (
    <span className="ml-regole-multi">
      {valore.map((v) => (
        <span key={String(v)} className="ml-chip ml-chip--attivo ml-regole-chip">
          {etichettaOpzione(campo, v)}
          <button type="button" onClick={() => togli(v)} aria-label={`Togli ${etichettaOpzione(campo, v)}`}>
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      {opzioni ? (
        rimanenti.length ? (
          <>
            <label className="sr-only" htmlFor={id}>Aggiungi valore</label>
            <select
              id={id}
              className="ml-select ml-regole-aggiungi-valore"
              value=""
              onChange={(e) => {
                if (e.target.value) onChange([...valore, normalizzaValoreOpzione(e.target.value)])
              }}
            >
              <option value="">{valore.length ? '+ altro' : 'Scegli…'}</option>
              {rimanenti.map((o) => (
                <option key={o.valore} value={o.valore}>
                  {o.etichetta}
                </option>
              ))}
            </select>
          </>
        ) : null
      ) : (
        <>
          <label className="sr-only" htmlFor={id}>Aggiungi valore</label>
          <input
            id={id}
            className="ml-input ml-regole-testo"
            value={testo}
            placeholder={valore.length ? '+ altro' : 'Scrivi e premi Invio'}
            onChange={(e) => setTesto(e.target.value)}
            onKeyDown={suTasto}
            onBlur={aggiungiTesto}
          />
        </>
      )}
    </span>
  )
}
