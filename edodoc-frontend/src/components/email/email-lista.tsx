import { Fragment, useEffect, useRef, type CSSProperties } from 'react'
import { Archive, Check, Loader2, Mail, MailOpen, Paperclip, Star, Trash2 } from 'lucide-react'
import { LuxAvatar } from '@/components/lux'
import type { EmailEtichetta, EmailThreadRiga } from '@/services/casella-service'
import { dataRiga, ETICHETTE_NASCOSTE, gruppoData, inizialiIndirizzo, nomeBreve } from './email-utils'

export type AzioneRiga = 'archivia' | 'cestina' | 'letto' | 'nonLetto' | 'speciale'

interface EmailListaProps {
  righe: EmailThreadRiga[]
  etichette: EmailEtichetta[]
  mia: string
  cartella: string
  apertoId: string | null
  selezione: Set<string>
  caricandoAltre: boolean
  haAltre: boolean
  onApri: (r: EmailThreadRiga) => void
  onSeleziona: (r: EmailThreadRiga) => void
  onAzione: (r: EmailThreadRiga, azione: AzioneRiga) => void
  onAltre: () => void
}

function Nomi({ r, mia, cartella }: { r: EmailThreadRiga; mia: string; cartella: string }) {
  const persone = r.partecipanti.length ? r.partecipanti : r.ultimoMittente ? [r.ultimoMittente] : []
  const nomi = persone.slice(0, 3).map((p) => nomeBreve(p, mia))
  const testo = persone.length === 1 ? (persone[0].nome?.trim() || persone[0].email) : nomi.join(', ') + (persone.length > 3 ? '…' : '')
  const prefisso = cartella === 'SENT' ? 'A: ' : ''
  return (
    <span className="em-riga-nomi">
      {r.bozza && cartella !== 'DRAFT' ? <span className="em-riga-bozza">Bozza</span> : null}
      <span className="truncate">{prefisso}{testo}</span>
      {r.messaggi > 1 ? <span className="em-riga-conta">{r.messaggi}</span> : null}
    </span>
  )
}

export function EmailLista({
  righe, etichette, mia, cartella, apertoId, selezione, caricandoAltre, haAltre, onApri, onSeleziona, onAzione, onAltre,
}: EmailListaProps) {
  const sentinella = useRef<HTMLDivElement>(null)
  const onAltreRef = useRef(onAltre)
  onAltreRef.current = onAltre
  const perId = new Map(etichette.map((e) => [e.id, e]))
  const ora = new Date()

  useEffect(() => {
    const el = sentinella.current
    if (!el || !haAltre) return
    const io = new IntersectionObserver((voci) => {
      if (voci.some((v) => v.isIntersecting)) onAltreRef.current()
    }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [haAltre, righe.length])

  let gruppoPrecedente: string | null = null

  return (
    <div className="em-lista" role="list" aria-label="Email">
      {righe.map((r) => {
        const gruppo = gruppoData(r.data, ora)
        const nuovoGruppo = gruppo !== gruppoPrecedente
        gruppoPrecedente = gruppo
        const persona = r.partecipanti.find((p) => p.email.toLowerCase() !== mia.toLowerCase()) ?? r.ultimoMittente
        const [i1, i2] = inizialiIndirizzo(persona)
        const selezionata = selezione.has(r.id)
        const chip = r.etichette
          .filter((id) => !ETICHETTE_NASCOSTE.has(id) && perId.get(id)?.tipo === 'USER' && id !== cartella)
          .map((id) => perId.get(id)!)
          .slice(0, 3)
        return (
          <Fragment key={r.id}>
            {nuovoGruppo ? <div className="em-gruppo" role="presentation">{gruppo}</div> : null}
            <div
              role="listitem"
              className="em-riga"
              data-em-riga={r.id}
              data-non-letta={r.nonLetto ? '' : undefined}
              data-aperta={apertoId === r.id ? '' : undefined}
              data-selezionata={selezionata ? '' : undefined}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) {
                  onSeleziona(r)
                  return
                }
                onApri(r)
              }}
            >
              <button
                type="button"
                className="em-riga-sel"
                aria-label={selezionata ? 'Deseleziona' : 'Seleziona'}
                aria-pressed={selezionata}
                onClick={(e) => {
                  e.stopPropagation()
                  onSeleziona(r)
                }}
              >
                <LuxAvatar first={i1} second={i2} className="em-riga-av" />
                <span className="em-riga-check" aria-hidden><Check /></span>
              </button>

              <div className="em-riga-corpo">
                <div className="em-riga-l1">
                  <Nomi r={r} mia={mia} cartella={cartella} />
                  <span className="em-riga-meta">
                    {r.allegati ? <Paperclip className="em-riga-ico" aria-label="Con allegati" /> : null}
                    {r.speciale ? <Star className="em-riga-ico em-riga-ico--star" aria-label="Speciale" /> : null}
                    <time className="em-riga-data" dateTime={new Date(r.data).toISOString()}>{dataRiga(r.data, ora)}</time>
                  </span>
                  <span className="em-riga-azioni" onClick={(e) => e.stopPropagation()}>
                    {cartella !== 'TRASH' ? (
                      <button type="button" title="Archivia" aria-label="Archivia" onClick={() => onAzione(r, 'archivia')}><Archive /></button>
                    ) : null}
                    <button type="button" title="Elimina" aria-label="Elimina" onClick={() => onAzione(r, 'cestina')}><Trash2 /></button>
                    <button
                      type="button"
                      title={r.nonLetto ? 'Segna come letta' : 'Segna come da leggere'}
                      aria-label={r.nonLetto ? 'Segna come letta' : 'Segna come da leggere'}
                      onClick={() => onAzione(r, r.nonLetto ? 'letto' : 'nonLetto')}
                    >
                      {r.nonLetto ? <MailOpen /> : <Mail />}
                    </button>
                  </span>
                </div>
                <div className="em-riga-oggetto">{r.oggetto?.trim() || '(nessun oggetto)'}</div>
                <div className="em-riga-l3">
                  <span className="em-riga-anteprima">{r.anteprima}</span>
                </div>
                {chip.length ? (
                  <div className="em-riga-chip">
                    {chip.map((e) => (
                      <span key={e.id} className="em-chip-etichetta" style={{ '--em-et': e.coloreSfondo ?? 'var(--vl-ink-3)' } as CSSProperties}>
                        {e.nome.split('/').pop()}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              {r.nonLetto ? <span className="em-riga-punto" aria-label="Da leggere" /> : null}
            </div>
          </Fragment>
        )
      })}
      <div ref={sentinella} className="em-lista-fine">
        {caricandoAltre ? <Loader2 className="animate-spin" aria-label="Carico altre email" /> : null}
      </div>
    </div>
  )
}
