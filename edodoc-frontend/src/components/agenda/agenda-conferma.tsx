import { useCallback, useState, type CSSProperties } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ArrowRight, Mail, Repeat, Trash2, X } from 'lucide-react'
import type { AgendaAmbito, AgendaPersona } from '@/services/agenda-service'
import { Avatar } from './agenda-dettaglio'
import { elencoNomi } from './agenda-utils'

// ───────────────────────── Conferma (ricorrenze e invitati) ─────────────────────────

export interface RichiestaConferma {
  titolo: string
  ricorrente: boolean
  conInvitati: boolean
  /** "Elimina", "Salva"… */
  azione: string
  pericolosa?: boolean
  /** Ambiti proposti: senza "questo e successivi" per le risposte. */
  ambiti?: AgendaAmbito[]
  /** L'evento di cui si parla, mostrato in testa. */
  evento?: { titolo: string; colore: string; quando: string }
  /** Spostamento: orario di prima e di dopo. */
  cambio?: { da: string; a: string }
  /** Chi riceverebbe l'email. */
  persone?: Pick<AgendaPersona, 'email' | 'nome' | 'pazienteId'>[]
}

export interface EsitoConferma {
  ambito: AgendaAmbito
  notifica: boolean
}

export const NOMI_AMBITO: Record<AgendaAmbito, { nome: string; nota: string }> = {
  QUESTO: { nome: 'Solo questo', nota: 'Le altre date restano come sono' },
  SEGUENTI: { nome: 'Questo e i successivi', nota: 'Da questa data in avanti' },
  TUTTI: { nome: 'Tutta la serie', nota: 'Anche le date passate' },
}

/**
 * Chiede ambito della modifica (serie) e se avvisare gli invitati; risolve null se annullata.
 * Ha sfondo e livello propri, sopra qualsiasi scheda o dialogo dell'agenda.
 */
export function useConferma() {
  const [richiesta, setRichiesta] = useState<(RichiestaConferma & { risolvi: (v: EsitoConferma | null) => void }) | null>(null)
  const [ambito, setAmbito] = useState<AgendaAmbito>('QUESTO')
  const [notifica, setNotifica] = useState(true)

  const chiedi = useCallback((r: RichiestaConferma) => {
    if (!r.ricorrente && !r.conInvitati) return Promise.resolve<EsitoConferma | null>({ ambito: 'QUESTO', notifica: false })
    return new Promise<EsitoConferma | null>((risolvi) => {
      setAmbito('QUESTO')
      setNotifica(true)
      setRichiesta({ ...r, risolvi })
    })
  }, [])

  const chiudi = (v: EsitoConferma | null) => {
    richiesta?.risolvi(v)
    setRichiesta(null)
  }

  const persone = richiesta?.persone ?? []
  const descrizione = richiesta?.ricorrente
    ? 'Fa parte di una serie: scegli quali date cambiare.'
    : persone.length
      ? `Nell'evento ci sono anche ${elencoNomi(persone)}.`
      : 'Nell\'evento ci sono altri invitati.'

  const elemento = (
    <DialogPrimitive.Root open={!!richiesta} onOpenChange={(o) => !o && chiudi(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ag-conferma-velo" data-vl="" data-vl-page="agenda" />
        <DialogPrimitive.Content
          className="ag-conferma"
          data-vl=""
          data-vl-page="agenda"
          data-pericolosa={richiesta?.pericolosa || undefined}
          style={{ '--c': richiesta?.evento?.colore } as CSSProperties}
        >
          <div className="ag-conferma-testa">
            <span className="ag-conferma-icona" aria-hidden>
              {richiesta?.pericolosa ? <Trash2 /> : richiesta?.ricorrente ? <Repeat /> : <Mail />}
            </span>
            <div>
              <DialogPrimitive.Title className="ag-conferma-titolo">{richiesta?.titolo}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="ag-conferma-descr">{descrizione}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="ag-icona-btn ag-conferma-x" aria-label="Annulla"><X /></DialogPrimitive.Close>
          </div>

          {richiesta?.evento ? (
            <div className="ag-conferma-evento">
              <i aria-hidden />
              <div>
                <strong>{richiesta.evento.titolo || '(Senza titolo)'}</strong>
                {richiesta.cambio ? (
                  <span className="ag-conferma-cambio">
                    <s>{richiesta.cambio.da}</s>
                    <ArrowRight aria-hidden />
                    <b>{richiesta.cambio.a}</b>
                  </span>
                ) : (
                  <small>{richiesta.evento.quando}</small>
                )}
              </div>
            </div>
          ) : null}

          {richiesta?.ricorrente ? (
            <div className="ag-conferma-ambiti" role="radiogroup" aria-label="Quali date">
              {(richiesta.ambiti ?? (['QUESTO', 'SEGUENTI', 'TUTTI'] as AgendaAmbito[])).map((a) => (
                <label key={a} data-attivo={ambito === a || undefined}>
                  <input type="radio" name="ambito" checked={ambito === a} onChange={() => setAmbito(a)} />
                  <span>
                    <strong>{NOMI_AMBITO[a].nome}</strong>
                    <small>{NOMI_AMBITO[a].nota}</small>
                  </span>
                </label>
              ))}
            </div>
          ) : null}

          {richiesta?.conInvitati ? (
            <button
              type="button"
              role="switch"
              aria-checked={notifica}
              className="ag-avvisa"
              data-attivo={notifica || undefined}
              onClick={() => setNotifica((v) => !v)}
            >
              {persone.length ? (
                <span className="ag-faccine" aria-hidden>
                  {persone.slice(0, 4).map((p) => <Avatar key={p.email} persona={p} dimensione={26} />)}
                </span>
              ) : <Mail className="ag-avvisa-icona" aria-hidden />}
              <span className="ag-avvisa-testo">
                <strong>{notifica ? 'Avvisa gli invitati' : 'Non avvisare nessuno'}</strong>
                <small>
                  {notifica
                    ? `Google manda un'email ${richiesta.pericolosa ? "con l'annullamento" : 'con le modifiche'}${persone.length ? ` a ${elencoNomi(persone)}` : ''}.`
                    : 'Il loro calendario si aggiorna lo stesso, ma senza email.'}
                </small>
              </span>
              <i className="ag-interruttore" aria-hidden />
            </button>
          ) : null}

          <div className="ag-conferma-azioni">
            <button type="button" className="ag-btn" onClick={() => chiudi(null)}>Annulla</button>
            <button
              type="button"
              className={`ag-btn ${richiesta?.pericolosa ? 'ag-btn--pericolo' : 'ag-btn--primario'}`}
              autoFocus
              onClick={() => chiudi({ ambito: richiesta?.ricorrente ? ambito : 'QUESTO', notifica: !!richiesta?.conInvitati && notifica })}
            >
              {richiesta?.azione}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )

  return { chiedi, elemento }
}
