import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ExternalLink, LayoutGrid, Rows3 } from 'lucide-react'
import { messaggioErroreSocial, socialService, type SocialAccount, type SocialContenuto, type SocialFiltroPiattaforma } from '@/services/social-service'
import { CardContenuto } from './social-panoramica'
import { IconaPiattaforma } from './social-ui'
import { formatCompatto, formatNumero, formatPercentuale, NOMI_PIATTAFORMA, tempoFa } from './social-utils'

type Ordine = 'RECENTI' | 'INTERAZIONI' | 'COPERTURA' | 'TASSO' | 'COMMENTI'

const ORDINI: { id: Ordine; label: string }[] = [
  { id: 'RECENTI', label: 'Più recenti' },
  { id: 'INTERAZIONI', label: 'Più interazioni' },
  { id: 'COPERTURA', label: 'Più copertura' },
  { id: 'TASSO', label: 'Tasso di interazione' },
  { id: 'COMMENTI', label: 'Più commentati' },
]

function valoreOrdine(c: SocialContenuto, o: Ordine): number {
  switch (o) {
    case 'INTERAZIONI':
      return c.interazioni ?? -1
    case 'COPERTURA':
      return c.copertura ?? c.visualizzazioni ?? -1
    case 'TASSO':
      return c.tassoInterazione ?? -1
    case 'COMMENTI':
      return c.commenti ?? -1
    default:
      return new Date(c.pubblicatoIl).getTime()
  }
}

export function SocialContenuti({ account, generazione }: { account: SocialAccount; generazione: number }) {
  const [contenuti, setContenuti] = useState<SocialContenuto[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [piattaforma, setPiattaforma] = useState<SocialFiltroPiattaforma>('TUTTE')
  const [ordine, setOrdine] = useState<Ordine>('RECENTI')
  const [vista, setVista] = useState<'GRIGLIA' | 'TABELLA'>('GRIGLIA')

  useEffect(() => {
    let annullato = false
    setErrore(null)
    socialService
      .contenuti(account.pageId, 'TUTTE', 50)
      .then((c) => !annullato && setContenuti(c))
      .catch((err) => !annullato && setErrore(messaggioErroreSocial(err, 'Contenuti non disponibili')))
    return () => {
      annullato = true
    }
  }, [account.pageId, generazione])

  const visibili = useMemo(() => {
    const lista = (contenuti ?? []).filter((c) => piattaforma === 'TUTTE' || c.piattaforma === piattaforma)
    return [...lista].sort((a, b) => valoreOrdine(b, ordine) - valoreOrdine(a, ordine))
  }, [contenuti, piattaforma, ordine])

  /** Rendimento medio per tipo di contenuto: aiuta a scegliere il formato del prossimo post. */
  const perTipo = useMemo(() => {
    const m = new Map<string, { n: number; interazioni: number; tasso: number; nTasso: number }>()
    visibili.forEach((c) => {
      const k = `${c.piattaforma}·${c.tipo}`
      const v = m.get(k) ?? { n: 0, interazioni: 0, tasso: 0, nTasso: 0 }
      v.n++
      v.interazioni += c.interazioni ?? 0
      if (c.tassoInterazione != null) {
        v.tasso += c.tassoInterazione
        v.nTasso++
      }
      m.set(k, v)
    })
    const righe = [...m.entries()].map(([k, v]) => {
      const [p, tipo] = k.split('·')
      return { p: p as SocialContenuto['piattaforma'], tipo, n: v.n, media: v.interazioni / v.n, tasso: v.nTasso ? v.tasso / v.nTasso : null }
    })
    righe.sort((a, b) => b.media - a.media)
    const max = Math.max(1, ...righe.map((r) => r.media))
    return { righe, max }
  }, [visibili])

  if (errore && !contenuti) {
    return (
      <div className="so-avviso">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        <span>{errore}</span>
      </div>
    )
  }

  return (
    <div className="so-griglia-panoramica">
      <div className="so-barra-filtri">
        <div className="so-pillole" role="radiogroup" aria-label="Piattaforma">
          {(['TUTTE', 'FACEBOOK', 'INSTAGRAM'] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={piattaforma === p} data-active={piattaforma === p ? '' : undefined} onClick={() => setPiattaforma(p)}>
              {p === 'TUTTE' ? 'Tutte' : (
                <>
                  <IconaPiattaforma piattaforma={p} /> {NOMI_PIATTAFORMA[p]}
                </>
              )}
            </button>
          ))}
        </div>
        <select className="so-select" value={ordine} onChange={(e) => setOrdine(e.target.value as Ordine)} aria-label="Ordina per">
          {ORDINI.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="so-pillole so-pillole--destra" role="radiogroup" aria-label="Vista">
          <button type="button" role="radio" aria-checked={vista === 'GRIGLIA'} data-active={vista === 'GRIGLIA' ? '' : undefined} onClick={() => setVista('GRIGLIA')} aria-label="Griglia">
            <LayoutGrid className="size-4" />
          </button>
          <button type="button" role="radio" aria-checked={vista === 'TABELLA'} data-active={vista === 'TABELLA' ? '' : undefined} onClick={() => setVista('TABELLA')} aria-label="Tabella">
            <Rows3 className="size-4" />
          </button>
        </div>
      </div>

      {perTipo.righe.length > 1 ? (
        <section className="so-card">
          <div className="so-card-head">
            <div>
              <div className="so-titolo">Quale formato funziona</div>
              <div className="so-sottotitolo">Interazioni medie per contenuto, per piattaforma e formato</div>
            </div>
          </div>
          <ul className="so-barre-tipo">
            {perTipo.righe.map((r) => (
              <li key={`${r.p}-${r.tipo}`}>
                <span className="so-barre-tipo-nome">
                  <IconaPiattaforma piattaforma={r.p} /> {r.tipo.toLowerCase()} <em>{r.n}</em>
                </span>
                <span className="so-barre-tipo-traccia">
                  <span className="so-barre-tipo-barra" data-p={r.p} style={{ width: `${(r.media / perTipo.max) * 100}%` }} />
                </span>
                <span className="so-barre-tipo-valore">
                  {formatCompatto(r.media)} <em>{formatPercentuale(r.tasso)}</em>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!contenuti ? (
        <div className="so-contenuti-griglia">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="so-contenuto so-scheletro" style={{ height: 320 }} />
          ))}
        </div>
      ) : visibili.length === 0 ? (
        <p className="so-vuoto-testo">Nessun contenuto pubblicato.</p>
      ) : vista === 'GRIGLIA' ? (
        <div className="so-contenuti-griglia">
          {visibili.map((c) => (
            <CardContenuto key={`${c.piattaforma}-${c.id}`} c={c} />
          ))}
        </div>
      ) : (
        <div className="so-card so-tabella-wrap">
          <table className="so-tabella">
            <thead>
              <tr>
                <th>Contenuto</th>
                <th>Pubblicato</th>
                <th className="so-num">Copertura</th>
                <th className="so-num">Mi piace</th>
                <th className="so-num">Commenti</th>
                <th className="so-num">Condivisioni</th>
                <th className="so-num">Salvataggi</th>
                <th className="so-num">Interazioni</th>
                <th className="so-num">Tasso</th>
              </tr>
            </thead>
            <tbody>
              {visibili.map((c) => (
                <tr key={`${c.piattaforma}-${c.id}`}>
                  <td>
                    <a className="so-tabella-contenuto" href={c.link ?? undefined} target="_blank" rel="noreferrer">
                      {c.immagine ? <img src={c.immagine} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span className="so-tabella-noimg" />}
                      <span className="min-w-0">
                        <span className="so-tabella-tipo">
                          <IconaPiattaforma piattaforma={c.piattaforma} className="size-3" /> {c.tipo.toLowerCase()}
                        </span>
                        <span className="so-tabella-testo">{c.testo || 'Senza testo'}</span>
                      </span>
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                    </a>
                  </td>
                  <td className="whitespace-nowrap">{tempoFa(c.pubblicatoIl)}</td>
                  <td className="so-num">{formatNumero(c.copertura ?? c.visualizzazioni)}</td>
                  <td className="so-num">{formatNumero(c.miPiace)}</td>
                  <td className="so-num">{formatNumero(c.commenti)}</td>
                  <td className="so-num">{formatNumero(c.condivisioni)}</td>
                  <td className="so-num">{formatNumero(c.salvataggi)}</td>
                  <td className="so-num">
                    <strong>{formatNumero(c.interazioni)}</strong>
                  </td>
                  <td className="so-num">{formatPercentuale(c.tassoInterazione)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
