import type { CSSProperties, ReactNode } from 'react'
import type { MailingCoinvolgimento, MailingStatoCampagna, MailingStatoContatto, MailingTag } from '@/services/mailing-service'
import {
  COINVOLGIMENTO,
  coloreStatoContatto,
  coloreTag,
  nomeTag,
  etichettaStatoCampagna,
  etichettaStatoContatto,
  iniziali,
  tintaPer,
  toneStatoCampagna,
} from './mailing-utils'

/* Mattoni visivi della pagina Email Marketing (stile in style/lux-mailing.css). */

/** Freccia e percentuale colorate (verde su, rosso giù). Il segno è anche nel testo: mai solo colore. */
export function Delta({ valore, inverso, className = '' }: { valore: number | null; inverso?: boolean; className?: string }) {
  if (valore == null) return null
  const su = valore > 0.0005
  const giu = valore < -0.0005
  const buono = inverso ? giu : su
  const cattivo = inverso ? su : giu
  const tono = buono ? 'su' : cattivo ? 'giu' : 'piatto'
  const testo = `${su ? '▲' : giu ? '▼' : '■'} ${Math.abs(valore * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`
  return (
    <span className={`ml-delta ${className}`} data-tono={tono} title="Rispetto al periodo precedente">
      {testo}
    </span>
  )
}

export function Avatar({ nome, dimensione }: { nome: string | null | undefined; dimensione?: 'sm' | 'lg' }) {
  return (
    <span className="ml-avatar" data-dim={dimensione} style={{ '--ml-hue': tintaPer(nome) } as CSSProperties} aria-hidden>
      {iniziali(nome)}
    </span>
  )
}

export function TagPill({ tag, children }: { tag: Pick<MailingTag, 'nome' | 'colore' | 'sistema'>; children?: ReactNode }) {
  return (
    <span className="ml-tag" data-sistema={tag.sistema ? '' : undefined} style={{ '--ml-tag': coloreTag(tag) } as CSSProperties} title={tag.sistema ? `${tag.nome} (tag di sistema)` : tag.nome}>
      {nomeTag(tag)}
      {children}
    </span>
  )
}

export function BadgeStatoContatto({ stato }: { stato: MailingStatoContatto }) {
  return <span className={`ml-badge ml-badge--${coloreStatoContatto(stato)}`}>{etichettaStatoContatto(stato)}</span>
}

export function BadgeStatoCampagna({ stato }: { stato: MailingStatoCampagna }) {
  return (
    <span className={`ml-badge ml-badge--${toneStatoCampagna(stato)}`} data-vivo={stato === 'IN_INVIO' || stato === 'TEST_AB' ? '' : undefined}>
      {etichettaStatoCampagna(stato)}
    </span>
  )
}

export function PallinoCoinvolgimento({ valore, conTesto }: { valore: MailingCoinvolgimento; conTesto?: boolean }) {
  const info = COINVOLGIMENTO[valore]
  return (
    <span className="ml-pallino" data-c={valore} title={info?.descrizione}>
      <span className="ml-pallino-punto" aria-hidden />
      {conTesto ? info?.etichetta : <span className="sr-only">{info?.etichetta}</span>}
    </span>
  )
}

/** Punteggio 0–100 come mini barra a 5 tacche. */
export function BarraPunteggio({ valore }: { valore: number }) {
  const v = Math.max(0, Math.min(100, Math.round(valore)))
  const tacche = Math.ceil(v / 20)
  return (
    <span className="ml-punteggio" title={`Punteggio di coinvolgimento: ${v} su 100`} aria-label={`Punteggio ${v} su 100`}>
      <span className="ml-punteggio-tacche" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} data-on={i <= tacche ? '' : undefined} />
        ))}
      </span>
      <span className="ml-punteggio-numero">{v}</span>
    </span>
  )
}

export function Vuoto({ icona, titolo, testo, azioni, className = '' }: { icona: ReactNode; titolo: ReactNode; testo?: ReactNode; azioni?: ReactNode; className?: string }) {
  return (
    <div className={`ml-vuoto ${className}`}>
      <span className="ml-vuoto-illustrazione" aria-hidden>
        {icona}
      </span>
      <div className="ml-vuoto-titolo">{titolo}</div>
      {testo ? <div className="ml-vuoto-testo">{testo}</div> : null}
      {azioni ? <div className="ml-vuoto-azioni">{azioni}</div> : null}
    </div>
  )
}

export function Scheletro({ altezza = 16, larghezza = '100%', className = '' }: { altezza?: number | string; larghezza?: number | string; className?: string }) {
  return <span className={`ml-skeleton block ${className}`} style={{ height: altezza, width: larghezza }} aria-hidden />
}

export function Interruttore({
  attivo,
  onChange,
  etichetta,
  disabilitato,
  tono,
}: {
  attivo: boolean
  onChange: (v: boolean) => void
  etichetta: string
  disabilitato?: boolean
  tono?: 'ok'
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={attivo}
      aria-label={etichetta}
      title={etichetta}
      disabled={disabilitato}
      className={`ml-toggle${tono === 'ok' ? ' ml-toggle--ok' : ''}`}
      onClick={() => onChange(!attivo)}
    />
  )
}
