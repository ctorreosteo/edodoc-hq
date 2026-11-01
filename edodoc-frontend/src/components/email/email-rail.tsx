import { AlertOctagon, ExternalLink, FileText, Inbox, PenLine, Send, Star, Trash2 } from 'lucide-react'
import { LuxAvatar } from '@/components/lux'
import type { EmailCasella, EmailEtichetta } from '@/services/casella-service'
import { CARTELLE_SISTEMA } from './email-utils'

const ICONE: Record<string, typeof Inbox> = {
  INBOX: Inbox,
  STARRED: Star,
  SENT: Send,
  DRAFT: FileText,
  SPAM: AlertOctagon,
  TRASH: Trash2,
}

const ORDINE = ['INBOX', 'STARRED', 'SENT', 'DRAFT', 'SPAM', 'TRASH']

/** Non letti per le cartelle di arrivo, totale per le bozze. */
function contatore(id: string, e: EmailEtichetta | undefined): number {
  if (!e) return 0
  if (id === 'DRAFT') return e.threadTotali
  if (id === 'SENT' || id === 'TRASH' || id === 'STARRED') return 0
  return e.threadNonLetti
}

export function EmailRail({ casella, cartella, onCartella, onScrivi }: {
  casella: EmailCasella
  cartella: string
  onCartella: (id: string) => void
  onScrivi: () => void
}) {
  const perId = new Map(casella.etichette.map((e) => [e.id, e]))
  const utente = casella.etichette.filter((e) => e.tipo === 'USER').sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  const parole = casella.nomeVisualizzato.replace(/^Dott\.?\s+/i, '').split(' ')

  return (
    <nav className="em-rail" aria-label="Cartelle email">
      <button type="button" className="em-scrivi" onClick={onScrivi}>
        <PenLine aria-hidden />
        <span>Scrivi</span>
      </button>

      <ul className="em-rail-lista">
        {ORDINE.filter((id) => perId.has(id)).map((id) => {
          const Icona = ICONE[id] ?? Inbox
          const n = contatore(id, perId.get(id))
          const attiva = cartella === id
          return (
            <li key={id}>
              <button
                type="button"
                className="em-rail-voce"
                data-attiva={attiva ? '' : undefined}
                data-forte={n > 0 && id === 'INBOX' ? '' : undefined}
                aria-current={attiva ? 'page' : undefined}
                onClick={() => onCartella(id)}
                title={CARTELLE_SISTEMA[id] ?? id}
              >
                <Icona aria-hidden />
                <span className="em-rail-nome">{CARTELLE_SISTEMA[id] ?? id}</span>
                {n > 0 ? <span className="em-rail-n">{n > 999 ? '999+' : n}</span> : null}
              </button>
            </li>
          )
        })}
      </ul>

      {utente.length > 0 ? (
        <>
          <div className="em-rail-sezione">Etichette</div>
          <ul className="em-rail-lista">
            {utente.map((e) => {
              const attiva = cartella === e.id
              return (
                <li key={e.id} className="em-rail-etichetta">
                  <button
                    type="button"
                    className="em-rail-voce"
                    data-attiva={attiva ? '' : undefined}
                    aria-current={attiva ? 'page' : undefined}
                    onClick={() => onCartella(e.id)}
                    title={e.nome}
                  >
                    <span className="em-etichetta-pallino" style={{ background: e.coloreSfondo ?? 'var(--vl-ink-3)' }} aria-hidden />
                    <span className="em-rail-nome">{e.nome.split('/').pop()}</span>
                    {e.threadNonLetti > 0 ? <span className="em-rail-n">{e.threadNonLetti}</span> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}

      <div className="em-rail-account">
        <LuxAvatar first={parole[0]} second={parole[parole.length - 1]} />
        <div className="em-rail-account-testo">
          <strong>{casella.nomeVisualizzato}</strong>
          <small>{casella.email}</small>
        </div>
        {!casella.demo ? (
          <a
            className="em-icon-btn"
            href={`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(casella.email)}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Apri in Gmail"
            aria-label="Apri in Gmail"
          >
            <ExternalLink />
          </a>
        ) : null}
      </div>
    </nav>
  )
}
