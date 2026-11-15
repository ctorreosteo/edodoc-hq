import { useCallback, useEffect, useMemo, useState } from 'react'
import { Heart, Loader2, MessageCircle, Plus, RefreshCw, Swords, Trash2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { compatto } from '@/lib/planner-formato'
import { relativo } from '@/lib/planner-tempo'
import { messaggioErrorePlanner, plannerService, type PlannerConcorrenti, type PlannerProfiloConcorrente, type PlannerStato } from '@/services/planner-service'
import { Vuoto } from './planner-ui'

const percento = (v: number | null) => (v == null ? '—' : `${(v * 100).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`)
const decimale = (v: number | null) => (v == null ? '—' : v.toLocaleString('it-IT', { maximumFractionDigits: 1 }))

/** Confronto con i profili Instagram dei concorrenti (Business Discovery di Meta): numeri, ritmo, interazioni, ultimi post. */
export function PlannerConcorrentiTab({ stato }: { stato: PlannerStato }) {
  const [dati, setDati] = useState<PlannerConcorrenti | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [nuovo, setNuovo] = useState('')
  const [occupato, setOccupato] = useState(false)

  const carica = useCallback(
    async (aggiorna = false) => {
      try {
        setErrore(null)
        setDati(await plannerService.concorrenti(stato.brandId, aggiorna))
      } catch (err) {
        setErrore(messaggioErrorePlanner(err, 'Concorrenti non disponibili'))
      }
    },
    [stato.brandId],
  )

  useEffect(() => {
    void carica()
  }, [carica])

  const aggiungi = async () => {
    if (!nuovo.trim()) return
    setOccupato(true)
    try {
      await plannerService.aggiungiConcorrente(stato.brandId, nuovo.trim())
      setNuovo('')
      await carica()
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Concorrente non aggiunto'))
    } finally {
      setOccupato(false)
    }
  }

  const togli = async (p: PlannerProfiloConcorrente) => {
    if (!p.id || !window.confirm(`Togliere @${p.username} dai concorrenti?`)) return
    try {
      await plannerService.eliminaConcorrente(p.id)
      setDati((d) => (d ? { ...d, profili: d.profili.filter((x) => x.id !== p.id) } : d))
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Non tolto'))
    }
  }

  const tuo = dati?.profili.find((p) => p.proprio)
  const maxTasso = useMemo(() => Math.max(0.0001, ...(dati?.profili ?? []).map((p) => p.tassoInterazione ?? 0)), [dati])
  const classifica = useMemo(
    () => [...(dati?.profili ?? [])].filter((p) => p.tassoInterazione != null).sort((a, b) => (b.tassoInterazione ?? 0) - (a.tassoInterazione ?? 0)),
    [dati],
  )

  return (
    <div className="pl-concorrenti">
      <form
        className="pl-barra"
        onSubmit={(e) => {
          e.preventDefault()
          void aggiungi()
        }}
      >
        <div className="pl-cerca">
          <span>@</span>
          <input value={nuovo} onChange={(e) => setNuovo(e.target.value)} placeholder="username Instagram o link al profilo" aria-label="Nuovo concorrente" />
        </div>
        <button type="submit" className="pl-btn" data-variante="primario" disabled={!nuovo.trim() || occupato}>
          {occupato ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Aggiungi
        </button>
        <button type="button" className="pl-btn" data-variante="ghost" onClick={() => void carica(true)} title="Rileggi da Meta (i numeri restano in memoria 3 ore)">
          <RefreshCw className="size-4" /> Aggiorna
        </button>
        <span className="pl-sezione-nota">
          Solo profili business o creator · Meta non dà copertura né visualizzazioni altrui{dati?.aggiornatoIl ? ` · letti ${relativo(dati.aggiornatoIl)}` : ''}
        </span>
      </form>

      {errore ? <div className="pl-banner" data-tono="danger">{errore}</div> : null}
      {dati?.motivo ? <div className="pl-banner" data-tono="info">{dati.motivo}</div> : null}
      {!dati && !errore ? <div className="pl-scheletro" style={{ height: 320 }} /> : null}

      {dati && dati.profili.filter((p) => !p.proprio).length === 0 && !dati.motivo ? (
        <Vuoto
          icona={<Swords className="size-6" />}
          titolo="Nessun concorrente da osservare"
          testo="Aggiungi i profili Instagram di altri studi o professionisti: vedi quanto pubblicano, quanto coinvolgono e quali post funzionano."
        />
      ) : null}

      {classifica.length > 1 ? (
        <section className="pl-sezione">
          <div className="pl-sezione-testa">
            <span className="pl-sezione-titolo">Tasso di interazione</span>
            <span className="pl-sezione-nota">(mi piace + commenti medi) / follower, sugli ultimi 12 post</span>
          </div>
          <div className="pl-barre-h">
            {classifica.map((p) => (
              <div key={p.username} className="pl-barra-h" data-proprio={p.proprio ? '' : undefined}>
                <span className="pl-barra-h-nome">
                  {p.immagine ? <img className="pl-mini-avatar" src={p.immagine} alt="" referrerPolicy="no-referrer" /> : null}@{p.username}
                  {p.proprio ? ' (tu)' : ''}
                </span>
                <span className="pl-barra-h-traccia">
                  <span className="pl-barra-h-fill" data-concorrente={p.proprio ? undefined : ''} style={{ width: `${((p.tassoInterazione ?? 0) / maxTasso) * 100}%` }} />
                </span>
                <span className="pl-barra-h-valore">{percento(p.tassoInterazione)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="pl-profili">
        {dati?.profili.map((p) => {
          const piu = (v: number | null, t: number | null | undefined) =>
            !p.proprio && v != null && t != null && t > 0 ? (v > t ? 'su' : v < t ? 'giu' : undefined) : undefined
          return (
            <section key={p.username + (p.id ?? 'tu')} className="pl-sezione pl-profilo" data-proprio={p.proprio ? '' : undefined}>
              <div className="pl-profilo-testa">
                {p.immagine ? <img src={p.immagine} alt="" referrerPolicy="no-referrer" /> : <span className="pl-profilo-vuoto">@</span>}
                <div>
                  <a href={`https://www.instagram.com/${p.username}/`} target="_blank" rel="noreferrer">
                    <b>@{p.username}</b>
                  </a>
                  <span>{p.proprio ? 'Il tuo profilo' : p.nome ?? ''}</span>
                </div>
                {!p.proprio && p.id ? (
                  <button type="button" className="pl-icon-btn" data-pericolo="" onClick={() => void togli(p)} aria-label="Togli">
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
              {p.errore ? (
                <div className="pl-canale-errore">{p.errore}</div>
              ) : (
                <>
                  <div className="pl-profilo-numeri">
                    <div data-confronto={piu(p.follower, tuo?.follower)}>
                      <b>{compatto(p.follower)}</b>
                      <span>follower</span>
                    </div>
                    <div data-confronto={piu(p.postSettimana, tuo?.postSettimana)}>
                      <b>{decimale(p.postSettimana)}</b>
                      <span>post a settimana</span>
                    </div>
                    <div data-confronto={piu(p.mediaMiPiace, tuo?.mediaMiPiace)}>
                      <b>{decimale(p.mediaMiPiace)}</b>
                      <span>mi piace medi</span>
                    </div>
                    <div data-confronto={piu(p.mediaCommenti, tuo?.mediaCommenti)}>
                      <b>{decimale(p.mediaCommenti)}</b>
                      <span>commenti medi</span>
                    </div>
                    <div data-confronto={piu(p.tassoInterazione, tuo?.tassoInterazione)}>
                      <b>{percento(p.tassoInterazione)}</b>
                      <span>interazione</span>
                    </div>
                  </div>
                  <div className="pl-profilo-post">
                    {p.ultimi.slice(0, 6).map((m, i) => (
                      <a key={i} href={m.permalink ?? undefined} target="_blank" rel="noreferrer" title={m.testo ?? ''}>
                        {m.immagine ? <img src={m.immagine} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>{m.tipo}</span>}
                        <em>
                          <Heart className="size-3" /> {compatto(m.miPiace)} <MessageCircle className="size-3" /> {compatto(m.commenti)}
                        </em>
                      </a>
                    ))}
                  </div>
                </>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
