import { ArrowDown, ArrowUp, Copy, MessageSquareText, Plus, Split, Trash2, X } from "lucide-react"
import type { KeyboardEvent, ReactNode } from "react"
import { nuovaOpzione, nuovoAlimento } from "@/lib/dieta"
import type { Alimento, OpzionePasto, Pasto } from "@/types"

const LETTERE = "ABCDEFGH"

function Icona({ etichetta, onClick, disabled, children, tono }: { etichetta: string; onClick: () => void; disabled?: boolean; children: ReactNode; tono?: "pericolo" }) {
  return (
    <button type="button" className="dt-icona" data-tono={tono} aria-label={etichetta} title={etichetta} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

let inAttesa: string | null = null

/**
 * Mette il cursore su un campo appena nato: l'editor si usa da tastiera, riga dopo riga.
 * Il fuoco arriva nel commit di React (ref su ogni campo), prima del tasto successivo: chi scrive veloce non perde lettere.
 */
export function focalizza(id: string) {
  inAttesa = id
  const gia = document.querySelector<HTMLElement>(`[data-focus="${id}"]`)
  if (gia) {
    inAttesa = null
    gia.focus()
  }
}

/** Da mettere come ref sui campi con data-focus. */
export function prendiFuoco(el: HTMLInputElement | HTMLTextAreaElement | null) {
  if (el && inAttesa != null && el.dataset.focus === inAttesa) {
    inAttesa = null
    el.focus()
  }
}

function RigaAlimento({ alimento, onChange, onElimina, onInvio, soloUna }: {
  alimento: Alimento
  onChange: (a: Alimento) => void
  onElimina: () => void
  onInvio: () => void
  soloUna: boolean
}) {
  const conNota = alimento.nota != null
  const invio = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      onInvio()
    }
  }
  return (
    <li className="dt-alimento">
      <div className="dt-alimento-riga">
        <input ref={prendiFuoco} className="dt-campo dt-alimento-nome" data-focus={alimento.id} list="dt-alimenti" value={alimento.nome} placeholder="Alimento"
          aria-label="Alimento" onChange={(e) => onChange({ ...alimento, nome: e.target.value })} onKeyDown={invio} />
        <input className="dt-campo dt-alimento-q" data-focus={`${alimento.id}-q`} list="dt-quantita" value={alimento.quantita ?? ""} placeholder="Quantità"
          aria-label="Quantità" onChange={(e) => onChange({ ...alimento, quantita: e.target.value || null })} onKeyDown={invio} />
        <div className="dt-alimento-azioni">
          <Icona etichetta={conNota ? "Togli la nota" : "Aggiungi una nota"} onClick={() => {
            onChange({ ...alimento, nota: conNota ? null : "" })
            if (!conNota) focalizza(`${alimento.id}-n`)
          }}><MessageSquareText aria-hidden /></Icona>
          <Icona etichetta="Togli alimento" onClick={onElimina} disabled={soloUna && !alimento.nome}><X aria-hidden /></Icona>
        </div>
      </div>
      {conNota ? (
        <input ref={prendiFuoco} className="dt-campo dt-alimento-nota" data-focus={`${alimento.id}-n`} value={alimento.nota ?? ""} placeholder="Nota: alternative, come cucinarlo…"
          aria-label="Nota sull'alimento" onChange={(e) => onChange({ ...alimento, nota: e.target.value })} onKeyDown={invio} />
      ) : null}
    </li>
  )
}

function EditorOpzione({ opzione, indice, totale, onChange, onElimina }: {
  opzione: OpzionePasto
  indice: number
  totale: number
  onChange: (o: OpzionePasto) => void
  onElimina: () => void
}) {
  const cambiaAlimento = (i: number, a: Alimento) => onChange({ ...opzione, alimenti: opzione.alimenti.map((x, j) => (j === i ? a : x)) })
  const aggiungiDopo = (i: number) => {
    const nuovo = nuovoAlimento()
    const alimenti = [...opzione.alimenti]
    alimenti.splice(i + 1, 0, nuovo)
    onChange({ ...opzione, alimenti })
    focalizza(nuovo.id)
  }
  const elimina = (i: number) => {
    const alimenti = opzione.alimenti.filter((_, j) => j !== i)
    onChange({ ...opzione, alimenti: alimenti.length ? alimenti : [nuovoAlimento()] })
  }
  return (
    <div className="dt-opzione">
      {totale > 1 ? (
        <div className="dt-opzione-testa">
          <span className="dt-lettera-op" aria-hidden>{LETTERE[indice] ?? "·"}</span>
          <input className="dt-campo dt-opzione-nome" value={opzione.nome ?? ""} placeholder={`Alternativa ${LETTERE[indice] ?? indice + 1}: nome facoltativo (dolce, salata…)`}
            aria-label="Nome dell'alternativa" onChange={(e) => onChange({ ...opzione, nome: e.target.value || null })} />
          <Icona etichetta="Elimina alternativa" tono="pericolo" onClick={onElimina}><Trash2 aria-hidden /></Icona>
        </div>
      ) : null}
      <ul className="dt-alimenti">
        {opzione.alimenti.map((a, i) => (
          <RigaAlimento key={a.id} alimento={a} soloUna={opzione.alimenti.length === 1} onChange={(x) => cambiaAlimento(i, x)}
            onElimina={() => elimina(i)} onInvio={() => aggiungiDopo(i)} />
        ))}
      </ul>
      <button type="button" className="dt-aggiungi-riga" onClick={() => aggiungiDopo(opzione.alimenti.length - 1)}>
        <Plus aria-hidden />Alimento <kbd>Invio</kbd>
      </button>
    </div>
  )
}

export function EditorPasto({ pasto, numero, totale, onChange, onSposta, onDuplica, onElimina }: {
  pasto: Pasto
  numero: number
  totale: number
  onChange: (p: Pasto) => void
  onSposta: (delta: -1 | 1) => void
  onDuplica: () => void
  onElimina: () => void
}) {
  const conNota = pasto.nota != null
  const alimenti = pasto.opzioni.reduce((s, o) => s + o.alimenti.filter((a) => a.nome.trim()).length, 0)
  const aggiungiAlternativa = () => {
    const nuova = nuovaOpzione()
    onChange({ ...pasto, opzioni: [...pasto.opzioni, nuova] })
    focalizza(nuova.alimenti[0].id)
  }
  return (
    <article className="dt-pasto" data-vuoto={alimenti === 0 ? "" : undefined}>
      <header className="dt-pasto-testa">
        <span className="dt-pasto-n" aria-hidden>{String(numero).padStart(2, "0")}</span>
        <input className="dt-campo dt-pasto-nome" value={pasto.nome} placeholder="Nome del pasto" aria-label="Nome del pasto"
          onChange={(e) => onChange({ ...pasto, nome: e.target.value })} />
        <input className="dt-campo dt-pasto-ora" type="time" value={pasto.orario ?? ""} aria-label="Orario"
          onChange={(e) => onChange({ ...pasto, orario: e.target.value || null })} />
        <div className="dt-pasto-azioni">
          <Icona etichetta="Sposta su" onClick={() => onSposta(-1)} disabled={numero === 1}><ArrowUp aria-hidden /></Icona>
          <Icona etichetta="Sposta giù" onClick={() => onSposta(1)} disabled={numero === totale}><ArrowDown aria-hidden /></Icona>
          <Icona etichetta="Duplica pasto" onClick={onDuplica}><Copy aria-hidden /></Icona>
          <Icona etichetta="Elimina pasto" tono="pericolo" onClick={onElimina}><Trash2 aria-hidden /></Icona>
        </div>
      </header>

      <div className="dt-opzioni">
        {pasto.opzioni.map((o, i) => (
          <div key={o.id}>
            {i > 0 ? <div className="dt-oppure"><span>oppure</span></div> : null}
            <EditorOpzione opzione={o} indice={i} totale={pasto.opzioni.length}
              onChange={(x) => onChange({ ...pasto, opzioni: pasto.opzioni.map((y, j) => (j === i ? x : y)) })}
              onElimina={() => onChange({ ...pasto, opzioni: pasto.opzioni.filter((_, j) => j !== i) })} />
          </div>
        ))}
      </div>

      {conNota ? (
        <div className="dt-pasto-nota">
          <textarea ref={prendiFuoco} className="dt-campo" data-focus={`${pasto.id}-nota`} rows={2} value={pasto.nota ?? ""} placeholder="Un consiglio per questo pasto, comparirà nel riquadro arancione"
            aria-label="Nota del pasto" onChange={(e) => onChange({ ...pasto, nota: e.target.value })} />
          <Icona etichetta="Togli la nota" onClick={() => onChange({ ...pasto, nota: null })}><X aria-hidden /></Icona>
        </div>
      ) : null}

      <footer className="dt-pasto-piede">
        <button type="button" className="dt-pillola" onClick={aggiungiAlternativa}><Split aria-hidden />Alternativa</button>
        {!conNota ? (
          <button type="button" className="dt-pillola" onClick={() => {
            onChange({ ...pasto, nota: "" })
            focalizza(`${pasto.id}-nota`)
          }}><MessageSquareText aria-hidden />Nota</button>
        ) : null}
        <span className="dt-pasto-conta">
          {pasto.opzioni.length > 1 ? `${pasto.opzioni.length} alternative · ` : ""}{alimenti} {alimenti === 1 ? "alimento" : "alimenti"}
        </span>
      </footer>
    </article>
  )
}
