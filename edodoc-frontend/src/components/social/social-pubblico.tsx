import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Globe2, MapPin, Users } from 'lucide-react'
import { messaggioErroreSocial, socialService, type SocialAccount, type SocialFetta, type SocialPubblico } from '@/services/social-service'
import { IconaPiattaforma } from './social-ui'
import { formatCompatto, formatNumero, formatPercentuale } from './social-utils'

/*
  Chi segue il profilo Instagram (follower_demographics di Meta). Facebook non espone più i dati demografici
  delle pagine, quindi qui c'è solo Instagram. Meta li fornisce solo sopra i 100 follower.
*/

export function SocialPubblicoTab({ account }: { account: SocialAccount }) {
  const [pubblico, setPubblico] = useState<SocialPubblico | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    let annullato = false
    setPubblico(null)
    setErrore(null)
    socialService
      .pubblico(account.pageId)
      .then((p) => !annullato && setPubblico(p))
      .catch((err) => !annullato && setErrore(messaggioErroreSocial(err, 'Pubblico non disponibile')))
    return () => {
      annullato = true
    }
  }, [account.pageId])

  if (errore || (pubblico && !pubblico.disponibile)) {
    return (
      <div className="so-avviso">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        <span>{errore ?? pubblico?.errore ?? 'Meta non fornisce i dati demografici per questo account (servono almeno 100 follower su Instagram).'}</span>
      </div>
    )
  }
  if (!pubblico) {
    return (
      <div className="so-due-colonne">
        <div className="so-card so-scheletro" style={{ height: 360 }} />
        <div className="so-card so-scheletro" style={{ height: 360 }} />
      </div>
    )
  }

  return (
    <div className="so-griglia-panoramica">
      <div className="so-due-colonne so-due-colonne--larga">
        <Piramide pubblico={pubblico} />
        <Genere fette={pubblico.genere} follower={pubblico.follower} username={account.instagramUsername} />
      </div>
      <div className="so-due-colonne">
        <ClassificaLuoghi titolo="Città principali" icona={<MapPin className="size-4" aria-hidden />} fette={pubblico.citta} />
        <ClassificaLuoghi titolo="Paesi" icona={<Globe2 className="size-4" aria-hidden />} fette={pubblico.paesi} />
      </div>
    </div>
  )
}

function Piramide({ pubblico }: { pubblico: SocialPubblico }) {
  const { righe, max, totale } = useMemo(() => {
    const r = pubblico.etaGenere
    const m = Math.max(1, ...r.map((x) => Math.max(x.donne, x.uomini)))
    const t = r.reduce((n, x) => n + x.donne + x.uomini + x.altro, 0)
    return { righe: r, max: m, totale: t }
  }, [pubblico.etaGenere])
  const fasciaTop = [...righe].sort((a, b) => b.donne + b.uomini + b.altro - (a.donne + a.uomini + a.altro))[0]

  return (
    <section className="so-card">
      <div className="so-card-head">
        <div>
          <div className="so-titolo">
            <IconaPiattaforma piattaforma="INSTAGRAM" /> Età e genere dei follower
          </div>
          <div className="so-sottotitolo">
            {fasciaTop ? (
              <>
                La fascia più numerosa è <strong>{fasciaTop.eta}</strong> ({formatPercentuale((fasciaTop.donne + fasciaTop.uomini + fasciaTop.altro) / Math.max(1, totale), 0)})
              </>
            ) : (
              'Distribuzione per fascia d’età'
            )}
          </div>
        </div>
        <div className="so-legenda">
          <span className="so-legenda-voce">
            <span className="so-tooltip-chiave" data-g="F" /> Donne
          </span>
          <span className="so-legenda-voce">
            <span className="so-tooltip-chiave" data-g="M" /> Uomini
          </span>
        </div>
      </div>
      <div className="so-piramide" role="table" aria-label="Follower per età e genere">
        {righe.map((r) => (
          <div key={r.eta} className="so-piramide-riga" role="row">
            <span className="so-piramide-val" role="cell">
              {formatNumero(r.donne)}
            </span>
            <span className="so-piramide-lato so-piramide-lato--sx" role="cell" title={`Donne ${r.eta}: ${formatNumero(r.donne)}`}>
              <span className="so-piramide-barra" data-g="F" style={{ width: `${(r.donne / max) * 100}%` }} />
            </span>
            <span className="so-piramide-eta" role="rowheader">
              {r.eta}
            </span>
            <span className="so-piramide-lato" role="cell" title={`Uomini ${r.eta}: ${formatNumero(r.uomini)}`}>
              <span className="so-piramide-barra" data-g="M" style={{ width: `${(r.uomini / max) * 100}%` }} />
            </span>
            <span className="so-piramide-val" role="cell">
              {formatNumero(r.uomini)}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function Genere({ fette, follower, username }: { fette: SocialFetta[]; follower: number | null; username: string | null }) {
  const totale = fette.reduce((n, f) => n + f.valore, 0)
  return (
    <section className="so-card so-genere">
      <div className="so-card-head">
        <div>
          <div className="so-titolo">
            <Users className="size-4" aria-hidden /> Chi ti segue
          </div>
          <div className="so-sottotitolo">{username ? `@${username}` : 'Instagram'}</div>
        </div>
      </div>
      <div className="so-genere-totale">
        <span className="so-numero-grande">{formatCompatto(follower)}</span>
        <span className="so-sottotitolo">follower</span>
      </div>
      <div className="so-genere-barra" aria-hidden>
        {fette.map((f) => (
          <span key={f.chiave} data-g={f.chiave} style={{ flexGrow: f.valore }} />
        ))}
      </div>
      <ul className="so-genere-lista">
        {fette.map((f) => (
          <li key={f.chiave}>
            <span className="so-tooltip-chiave" data-g={f.chiave} />
            <span>{f.etichetta}</span>
            <strong>{formatPercentuale(totale ? f.valore / totale : null, 0)}</strong>
            <em>{formatNumero(f.valore)}</em>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ClassificaLuoghi({ titolo, icona, fette }: { titolo: string; icona: React.ReactNode; fette: SocialFetta[] }) {
  const max = Math.max(1, ...fette.map((f) => f.valore))
  const totale = fette.reduce((n, f) => n + f.valore, 0)
  return (
    <section className="so-card">
      <div className="so-card-head">
        <div>
          <div className="so-titolo">
            {icona} {titolo}
          </div>
          <div className="so-sottotitolo">Dove vivono i follower di Instagram</div>
        </div>
      </div>
      {fette.length ? (
        <ol className="so-classifica-luoghi">
          {fette.map((f, i) => (
            <li key={f.chiave}>
              <span className="so-classifica-pos">{i + 1}</span>
              <span className="so-classifica-nome">{f.etichetta}</span>
              <span className="so-barre-tipo-traccia">
                <span className="so-barre-tipo-barra" data-p="INSTAGRAM" style={{ width: `${(f.valore / max) * 100}%` }} />
              </span>
              <span className="so-classifica-val">
                {formatNumero(f.valore)} <em>{formatPercentuale(totale ? f.valore / totale : null, 0)}</em>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="so-vuoto-testo">Dato non disponibile.</p>
      )}
    </section>
  )
}
