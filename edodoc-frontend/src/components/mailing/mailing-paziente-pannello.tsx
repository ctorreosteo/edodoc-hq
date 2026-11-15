import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, MailOpen, MailPlus, MousePointerClick, Reply } from 'lucide-react'
import { mailingService, messaggioErroreMailing, type MailingContattoDettaglio } from '@/services/mailing-service'
import { MailingDialog } from './mailing-dialog'
import { BadgeStatoContatto, PallinoCoinvolgimento, Scheletro, TagPill } from './mailing-ui'
import { MAILING_URL, formatPercentuale, tempoFa } from './mailing-utils'
import '@/style/lux-mailing.css'

/*
  Riquadro compatto "Email Marketing" del paziente: stato d'iscrizione, tag, ultime email con aperture e click,
  link alla scheda completa (?tab=contatti&contatto=ID). Si monta dentro un antenato qualsiasi: porta da sé
  data-vl + data-vl-page="mailing" per avere token e stili.
*/

/** onApri: chiamato quando si segue il link verso Email Marketing (es. per chiudere la scheda paziente). */
export function MailingPazientePannello({ pazienteId, onApri }: { pazienteId: number; onApri?: () => void }) {
  const [dettaglio, setDettaglio] = useState<MailingContattoDettaglio | null | undefined>(undefined)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setDettaglio(undefined)
    setErrore(null)
    mailingService
      .contattoDelPaziente(pazienteId)
      .then((d) => vivo && setDettaglio(d))
      .catch((err) => {
        if (!vivo) return
        setErrore(messaggioErroreMailing(err, 'Email Marketing non disponibile'))
        setDettaglio(null)
      })
    return () => {
      vivo = false
    }
  }, [pazienteId])

  return (
    <div data-vl="" data-vl-page="mailing" className="ml-paziente-pannello">
      <div className="ml-pp-testa">
        <span className="ml-pp-titolo">
          <MailPlus className="size-4" aria-hidden /> Email Marketing
        </span>
        {dettaglio ? (
          <Link className="ml-link" to={`${MAILING_URL}?tab=contatti&contatto=${dettaglio.contatto.id}`} onClick={onApri}>
            Apri in Email Marketing <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>

      {dettaglio === undefined ? (
        <div className="ml-pp-corpo">
          <Scheletro altezza={20} larghezza="50%" />
          <Scheletro altezza={14} larghezza="80%" className="mt-2" />
          <Scheletro altezza={56} className="mt-3" />
        </div>
      ) : errore ? (
        <p className="ml-pp-vuoto">{errore}</p>
      ) : !dettaglio ? (
        <p className="ml-pp-vuoto">Questo paziente non è nella lista email (manca l’indirizzo, oppure non è ancora stato sincronizzato).</p>
      ) : (
        <div className="ml-pp-corpo">
          <div className="ml-pp-riga">
            <BadgeStatoContatto stato={dettaglio.contatto.stato} />
            <PallinoCoinvolgimento valore={dettaglio.contatto.coinvolgimento} conTesto />
            <span className="ml-pp-metriche">
              <span title="Tasso di apertura">
                <MailOpen className="size-3.5" aria-hidden /> {formatPercentuale(dettaglio.metriche.tassoApertura, 0)}
              </span>
              <span title="Tasso di click">
                <MousePointerClick className="size-3.5" aria-hidden /> {formatPercentuale(dettaglio.metriche.tassoClick, 0)}
              </span>
            </span>
          </div>
          <div className="ml-pp-email">{dettaglio.contatto.email}</div>
          {dettaglio.contatto.tag.length ? (
            <div className="ml-tag-lista">
              {dettaglio.contatto.tag.map((t) => (
                <TagPill key={t.id} tag={t} />
              ))}
            </div>
          ) : null}
          {dettaglio.invii.length ? (
            <ul className="ml-pp-invii">
              {dettaglio.invii.slice(0, 5).map((i) => (
                <li key={i.id}>
                  <span className="ml-pp-invio-stato" data-aperta={i.aperture > 0 ? '' : undefined} data-click={i.click > 0 ? '' : undefined} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="ml-riga-titolo">{i.oggetto ?? '(senza oggetto)'}</span>
                    <span className="ml-riga-sotto">
                      {i.inviatoIl ? tempoFa(i.inviatoIl) : 'in coda'}
                      {i.aperture > 0 ? ` · aperta${i.aperture > 1 ? ` ${i.aperture} volte` : ''}` : i.stato === 'INVIATO' ? ' · non aperta' : ''}
                      {i.click > 0 ? ` · ${i.click} click` : ''}
                    </span>
                  </span>
                  {i.rispostoIl ? <Reply className="size-3.5 ml-muto" aria-label="Ha risposto" /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ml-pp-vuoto">Nessuna email inviata finora.</p>
          )}
        </div>
      )}
    </div>
  )
}

/** Il pannello dentro un dialog: usato dal menu contestuale del paziente. */
export function MailingPazienteDialog({ pazienteId, nome, onChiudi }: { pazienteId: number | null; nome?: string | null; onChiudi: () => void }) {
  return (
    <MailingDialog open={pazienteId != null} onOpenChange={(v) => !v && onChiudi()} larghezza="max-w-md" titolo={nome ? `Email Marketing · ${nome}` : 'Email Marketing'}>
      {pazienteId != null ? <MailingPazientePannello pazienteId={pazienteId} /> : null}
    </MailingDialog>
  )
}
