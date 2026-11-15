import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Clock, Globe, Hash, Layers, Link2, Loader2, Plus, ShieldCheck, Tags, Trash2, Unplug } from 'lucide-react'
import { toast } from '@/lib/toast'
import { CANALI, INFO_CANALE } from '@/lib/planner-canali'
import {
  messaggioErrorePlanner,
  plannerService,
  type PlannerAccountIntegrato,
  type PlannerCanale,
  type PlannerHashtag,
  type PlannerSlot,
  type PlannerStato,
} from '@/services/planner-service'
import { AvatarCanale } from './planner-ui'
import { PlannerBioEditor } from './planner-bio-editor'

const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
const COLORI = ['#19c463', '#3b82f6', '#8b5cf6', '#e1306c', '#f59e0b', '#0e9f8e', '#ef4444', '#64748b']
const MANUALI: PlannerCanale[] = ['LINKEDIN', 'X', 'THREADS', 'PINTEREST', 'TIKTOK', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE']

function Sezione({ icona, titolo, nota, children }: { icona: React.ReactNode; titolo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="pl-sezione pl-imp-sezione">
      <div className="pl-sezione-testa">
        <span className="pl-sezione-titolo">
          {icona} {titolo}
        </span>
        {nota ? <span className="pl-sezione-nota">{nota}</span> : null}
      </div>
      {children}
    </section>
  )
}

export function PlannerImpostazioni({ stato, onCambiato }: { stato: PlannerStato; onCambiato: () => void }) {
  const puo = stato.puoImpostare
  const [integrati, setIntegrati] = useState<PlannerAccountIntegrato[] | null>(null)
  const [slot, setSlot] = useState<PlannerSlot[]>([])
  const [slotModificati, setSlotModificati] = useState<{ giorno: number; ora: string }[] | null>(null)
  const [hashtag, setHashtag] = useState<PlannerHashtag[]>([])
  const [occupato, setOccupato] = useState<string | null>(null)
  const [nuovoSpazio, setNuovoSpazio] = useState({ nome: '', colore: COLORI[2], descrizione: '' })
  const [manuale, setManuale] = useState<{ brandId: number; canale: PlannerCanale; nome: string; url: string } | null>(null)
  const [nuovaRubrica, setNuovaRubrica] = useState({ nome: '', colore: COLORI[1], obiettivo: '' })
  const [nuovoGruppo, setNuovoGruppo] = useState({ nome: '', hashtag: '' })
  const [oraNuova, setOraNuova] = useState<Record<number, string>>({})

  const carica = useCallback(async () => {
    const [i, s, h] = await Promise.allSettled([plannerService.integrati(), plannerService.slot(), plannerService.hashtag()])
    if (i.status === 'fulfilled') setIntegrati(i.value)
    if (s.status === 'fulfilled') {
      setSlot(s.value)
      setSlotModificati(null)
    }
    if (h.status === 'fulfilled') setHashtag(h.value)
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  const esegui = async (nome: string, f: () => Promise<unknown>, ok: string) => {
    setOccupato(nome)
    try {
      await f()
      toast.success(ok)
      onCambiato()
      await carica()
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Operazione non riuscita'))
    } finally {
      setOccupato(null)
    }
  }

  const collegaTiktok = async (brandId: number) => {
    try {
      window.location.href = await plannerService.collegaTiktok(brandId)
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Collegamento non disponibile'))
    }
  }

  const slotCorrenti = slotModificati ?? slot.map((s) => ({ giorno: s.giorno, ora: s.ora }))

  return (
    <div className="pl-impostazioni">
      {!puo ? (
        <div className="pl-banner" data-tono="info">
          <ShieldCheck className="size-4" /> Spazi, rubriche, orari e approvazione li cambiano i responsabili del marketing. I gruppi di hashtag puoi gestirli tu.
        </div>
      ) : null}

      {/* Spazi */}
      <Sezione icona={<Layers className="inline size-4" />} titolo="Spazi e account" nota="Ogni spazio ha i suoi account, il suo calendario e le sue analisi">
        <div className="pl-spazi">
          {stato.spazi.map((s) => {
            const integratiQui = (integrati ?? []).filter((a) => a.brandId === s.id)
            return (
              <div key={s.id} className="pl-spazio-card" style={{ '--pl-spazio': s.colore } as CSSProperties}>
                <div className="pl-spazio-card-testa">
                  <span className="pl-spazio-dot" />
                  <b>{s.nome}</b>
                  {s.predefinito ? <span className="pl-chip" data-tono="muted">Predefinito</span> : null}
                  {puo ? (
                    <span className="pl-spazio-card-azioni">
                      <button
                        type="button"
                        className="pl-btn"
                        data-variante="mini-ghost"
                        onClick={() => {
                          const nome = window.prompt('Nome dello spazio', s.nome)
                          if (nome) void esegui('spazio', () => plannerService.salvaSpazio({ id: s.id, nome, colore: s.colore, descrizione: s.descrizione }), 'Spazio rinominato')
                        }}
                      >
                        Rinomina
                      </button>
                      {!s.predefinito ? (
                        <button
                          type="button"
                          className="pl-icon-btn"
                          data-pericolo=""
                          onClick={() => window.confirm(`Eliminare lo spazio «${s.nome}»?`) && void esegui('spazio-x', () => plannerService.eliminaSpazio(s.id), 'Spazio eliminato')}
                          aria-label="Elimina spazio"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </div>
                {s.descrizione ? <div className="pl-sezione-nota">{s.descrizione}</div> : null}
                <div className="pl-account-lista">
                  {integratiQui.map((a) => (
                    <div key={`${a.canale}|${a.account}`} className="pl-account">
                      <AvatarCanale canale={a.canale} immagine={a.immagine} nome={a.nome} dimensione="sm" />
                      <span className="pl-account-testi">
                        <b>{a.nome}</b>
                        <span>{INFO_CANALE[a.canale].nome} · collegato al gestionale</span>
                      </span>
                      {puo && stato.spazi.length > 1 ? (
                        <select
                          value={s.id}
                          onChange={(e) => void esegui('assegna', () => plannerService.assegna(a.canale, a.account, Number(e.target.value)), 'Account spostato')}
                          aria-label="Sposta in un altro spazio"
                        >
                          {stato.spazi.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.id === s.id ? 'In questo spazio' : `Sposta in ${x.nome}`}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  ))}
                  {s.account
                    .filter((a) => a.tipo !== 'INTEGRATO')
                    .map((a) => (
                      <div key={a.id} className="pl-account">
                        <AvatarCanale canale={a.canale} immagine={a.immagine} nome={a.nome} dimensione="sm" />
                        <span className="pl-account-testi">
                          <b>{a.nome}</b>
                          <span>
                            {INFO_CANALE[a.canale].nome} · {a.tipo === 'OAUTH' ? (a.collegato ? 'pubblicazione automatica' : 'accesso scaduto: ricollega') : 'a mano'}
                            {a.dettaglio ? ` · ${a.dettaglio}` : ''}
                          </span>
                        </span>
                        {a.urlProfilo ? (
                          <a className="pl-icon-btn" href={a.urlProfilo} target="_blank" rel="noreferrer" title="Apri il profilo">
                            <Link2 className="size-4" />
                          </a>
                        ) : null}
                        {puo ? (
                          <button
                            type="button"
                            className="pl-icon-btn"
                            data-pericolo=""
                            onClick={() => window.confirm(a.tipo === 'OAUTH' ? `Scollegare ${a.nome}?` : `Togliere ${a.nome} dallo spazio?`) && void esegui('acc-x', () => plannerService.eliminaAccount(a.id), 'Account tolto')}
                            title={a.tipo === 'OAUTH' ? 'Scollega' : 'Togli'}
                          >
                            {a.tipo === 'OAUTH' ? <Unplug className="size-4" /> : <Trash2 className="size-4" />}
                          </button>
                        ) : null}
                      </div>
                    ))}
                  {integrati == null ? <div className="pl-scheletro" style={{ height: 44 }} /> : null}
                  {integrati != null && integratiQui.length === 0 && s.account.length === 0 ? (
                    <div className="pl-sezione-nota">Nessun account: collegane uno o aggiungi un profilo da pubblicare a mano.</div>
                  ) : null}
                </div>
                {puo ? (
                  <div className="pl-spazio-card-piede">
                    <button
                      type="button"
                      className="pl-btn"
                      data-variante="mini"
                      onClick={() => void collegaTiktok(s.id)}
                      disabled={!stato.tiktokConfigurato}
                      title={stato.tiktokConfigurato ? 'Accedi con TikTok e autorizza la pubblicazione' : "Prima va configurata l'app TikTok sul gestionale (TIKTOK_CLIENT_KEY / SECRET)"}
                    >
                      <AvatarCanale canale="TIKTOK" dimensione="sm" /> Collega TikTok
                    </button>
                    <button type="button" className="pl-btn" data-variante="mini-ghost" onClick={() => setManuale({ brandId: s.id, canale: 'LINKEDIN', nome: '', url: '' })}>
                      <Plus className="size-3.5" /> Profilo a mano
                    </button>
                  </div>
                ) : null}
                {manuale?.brandId === s.id ? (
                  <form
                    className="pl-form-riga"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void esegui(
                        'manuale',
                        () => plannerService.aggiungiManuale(s.id, { canale: manuale.canale, nome: manuale.nome, dettaglio: null, urlProfilo: manuale.url || null }),
                        'Profilo aggiunto',
                      ).then(() => setManuale(null))
                    }}
                  >
                    <select value={manuale.canale} onChange={(e) => setManuale({ ...manuale, canale: e.target.value as PlannerCanale })} aria-label="Canale">
                      {MANUALI.map((c) => (
                        <option key={c} value={c}>
                          {INFO_CANALE[c].nome}
                        </option>
                      ))}
                    </select>
                    <input value={manuale.nome} onChange={(e) => setManuale({ ...manuale, nome: e.target.value })} placeholder="Nome (es. Edoardo Bo)" required />
                    <input value={manuale.url} onChange={(e) => setManuale({ ...manuale, url: e.target.value })} placeholder="Link al profilo" type="url" />
                    <button type="submit" className="pl-btn" data-variante="primario" disabled={occupato === 'manuale'}>
                      Aggiungi
                    </button>
                    <button type="button" className="pl-btn" data-variante="mini-ghost" onClick={() => setManuale(null)}>
                      Annulla
                    </button>
                  </form>
                ) : null}
              </div>
            )
          })}
        </div>
        {!stato.tiktokConfigurato && puo ? (
          <div className="pl-sezione-nota">
            TikTok automatico: serve l'app «TikTok for Developers» (Login Kit + Content Posting API) con le chiavi sul gestionale. Fino ad allora TikTok si pubblica a mano.
          </div>
        ) : null}
        {puo ? (
          <form
            className="pl-form-riga"
            onSubmit={(e) => {
              e.preventDefault()
              if (!nuovoSpazio.nome.trim()) return
              void esegui('spazio-n', () => plannerService.salvaSpazio({ nome: nuovoSpazio.nome.trim(), colore: nuovoSpazio.colore, descrizione: nuovoSpazio.descrizione || null }), 'Spazio creato').then(() =>
                setNuovoSpazio({ nome: '', colore: COLORI[2], descrizione: '' }),
              )
            }}
          >
            <input type="color" value={nuovoSpazio.colore} onChange={(e) => setNuovoSpazio({ ...nuovoSpazio, colore: e.target.value })} aria-label="Colore" />
            <input value={nuovoSpazio.nome} onChange={(e) => setNuovoSpazio({ ...nuovoSpazio, nome: e.target.value })} placeholder="Nuovo spazio (es. Mental coaching)" />
            <input value={nuovoSpazio.descrizione} onChange={(e) => setNuovoSpazio({ ...nuovoSpazio, descrizione: e.target.value })} placeholder="Descrizione (facoltativa)" />
            <button type="submit" className="pl-btn" data-variante="primario" disabled={!nuovoSpazio.nome.trim() || occupato === 'spazio-n'}>
              <Plus className="size-4" /> Crea spazio
            </button>
          </form>
        ) : null}
      </Sezione>

      <Sezione icona={<Globe className="inline size-4" />} titolo="Link in bio" nota="La pagina da mettere nel profilo Instagram di questo spazio: pulsanti, ultimi post, clic contati">
        <PlannerBioEditor stato={stato} />
      </Sezione>

      <div className="pl-imp-griglia">
        {/* Rubriche */}
        <Sezione icona={<Tags className="inline size-4" />} titolo="Rubriche" nota="I pilastri del piano: colorano il calendario, l'obiettivo è in post a settimana">
          <div className="pl-rubriche-lista">
            {stato.etichette.map((e) => (
              <div key={e.id} className="pl-rubrica-riga" style={{ '--pl-r': e.colore } as CSSProperties}>
                <input
                  type="color"
                  defaultValue={e.colore}
                  disabled={!puo}
                  onBlur={(x) => x.target.value !== e.colore && void esegui('rub', () => plannerService.salvaEtichetta({ ...e, colore: x.target.value }), 'Rubrica aggiornata')}
                  aria-label="Colore"
                />
                <input
                  defaultValue={e.nome}
                  disabled={!puo}
                  onBlur={(x) => x.target.value.trim() && x.target.value !== e.nome && void esegui('rub', () => plannerService.salvaEtichetta({ ...e, nome: x.target.value.trim() }), 'Rubrica aggiornata')}
                  aria-label="Nome"
                />
                <input
                  type="number"
                  min={1}
                  max={50}
                  defaultValue={e.obiettivoSettimanale ?? ''}
                  placeholder="—"
                  disabled={!puo}
                  title="Post a settimana"
                  onBlur={(x) => {
                    const v = x.target.value ? Number(x.target.value) : null
                    if (v !== e.obiettivoSettimanale) void esegui('rub', () => plannerService.salvaEtichetta({ ...e, obiettivoSettimanale: v }), 'Obiettivo aggiornato')
                  }}
                  aria-label="Obiettivo settimanale"
                />
                {puo ? (
                  <button type="button" className="pl-icon-btn" data-pericolo="" onClick={() => window.confirm(`Eliminare la rubrica «${e.nome}»? I post restano, senza rubrica.`) && void esegui('rub-x', () => plannerService.eliminaEtichetta(e.id), 'Rubrica eliminata')} aria-label="Elimina">
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {puo ? (
            <form
              className="pl-form-riga"
              onSubmit={(e) => {
                e.preventDefault()
                if (!nuovaRubrica.nome.trim()) return
                void esegui(
                  'rub-n',
                  () => plannerService.salvaEtichetta({ nome: nuovaRubrica.nome.trim(), colore: nuovaRubrica.colore, descrizione: null, obiettivoSettimanale: nuovaRubrica.obiettivo ? Number(nuovaRubrica.obiettivo) : null }),
                  'Rubrica creata',
                ).then(() => setNuovaRubrica({ nome: '', colore: COLORI[1], obiettivo: '' }))
              }}
            >
              <input type="color" value={nuovaRubrica.colore} onChange={(e) => setNuovaRubrica({ ...nuovaRubrica, colore: e.target.value })} aria-label="Colore" />
              <input value={nuovaRubrica.nome} onChange={(e) => setNuovaRubrica({ ...nuovaRubrica, nome: e.target.value })} placeholder="Nuova rubrica" />
              <input type="number" min={1} max={50} value={nuovaRubrica.obiettivo} onChange={(e) => setNuovaRubrica({ ...nuovaRubrica, obiettivo: e.target.value })} placeholder="A settimana" />
              <button type="submit" className="pl-btn" data-variante="primario" disabled={!nuovaRubrica.nome.trim()}>
                <Plus className="size-4" />
              </button>
            </form>
          ) : null}
        </Sezione>

        {/* Coda */}
        <Sezione icona={<Clock className="inline size-4" />} titolo="Orari della coda" nota="«Prossimo libero» e gli slot del calendario partono da qui">
          <div className="pl-coda">
            {GIORNI.map((g, i) => {
              const giorno = i + 1
              const ore = slotCorrenti.filter((s) => s.giorno === giorno).map((s) => s.ora).sort()
              return (
                <div key={g} className="pl-coda-giorno">
                  <span className="pl-coda-nome">{g}</span>
                  <span className="pl-coda-ore">
                    {ore.map((o) => (
                      <span key={o} className="pl-coda-ora">
                        {o}
                        {puo ? (
                          <button type="button" onClick={() => setSlotModificati(slotCorrenti.filter((s) => !(s.giorno === giorno && s.ora === o)))} aria-label={`Togli ${o}`}>
                            ×
                          </button>
                        ) : null}
                      </span>
                    ))}
                    {puo ? (
                      <span className="pl-coda-aggiungi">
                        <input type="time" value={oraNuova[giorno] ?? ''} onChange={(e) => setOraNuova({ ...oraNuova, [giorno]: e.target.value })} aria-label={`Nuovo orario ${g}`} />
                        <button
                          type="button"
                          disabled={!oraNuova[giorno]}
                          onClick={() => {
                            const o = oraNuova[giorno]
                            if (o && !ore.includes(o)) setSlotModificati([...slotCorrenti, { giorno, ora: o }])
                            setOraNuova({ ...oraNuova, [giorno]: '' })
                          }}
                          aria-label="Aggiungi orario"
                        >
                          <Plus className="size-3" />
                        </button>
                      </span>
                    ) : null}
                  </span>
                </div>
              )
            })}
          </div>
          {slotModificati ? (
            <div className="pl-form-riga">
              <button type="button" className="pl-btn" data-variante="primario" onClick={() => void esegui('slot', () => plannerService.salvaSlot(slotModificati), 'Orari salvati')} disabled={occupato === 'slot'}>
                {occupato === 'slot' ? <Loader2 className="size-4 animate-spin" /> : null} Salva gli orari
              </button>
              <button type="button" className="pl-btn" data-variante="mini-ghost" onClick={() => setSlotModificati(null)}>
                Annulla
              </button>
            </div>
          ) : null}
        </Sezione>

        {/* Hashtag */}
        <Sezione icona={<Hash className="inline size-4" />} titolo="Gruppi di hashtag" nota="Si inseriscono con un clic dal composer">
          <div className="pl-gruppi">
            {hashtag.map((h) => (
              <div key={h.id} className="pl-gruppo">
                <b>{h.nome}</b>
                <span>{h.hashtag.split(/\s+/).map((x) => `#${x}`).join(' ')}</span>
                <em>{h.usi ? `usato ${h.usi} volte` : 'mai usato'}</em>
                <button type="button" className="pl-icon-btn" data-pericolo="" onClick={() => window.confirm(`Eliminare «${h.nome}»?`) && void esegui('h-x', () => plannerService.eliminaHashtag(h.id), 'Gruppo eliminato')} aria-label="Elimina">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <form
            className="pl-form-riga"
            onSubmit={(e) => {
              e.preventDefault()
              if (!nuovoGruppo.nome.trim() || !nuovoGruppo.hashtag.trim()) return
              void esegui('h-n', () => plannerService.salvaHashtag(nuovoGruppo), 'Gruppo creato').then(() => setNuovoGruppo({ nome: '', hashtag: '' }))
            }}
          >
            <input value={nuovoGruppo.nome} onChange={(e) => setNuovoGruppo({ ...nuovoGruppo, nome: e.target.value })} placeholder="Nome del gruppo" />
            <input value={nuovoGruppo.hashtag} onChange={(e) => setNuovoGruppo({ ...nuovoGruppo, hashtag: e.target.value })} placeholder="#nutrizione #alimentazione #mentalcoaching …" />
            <button type="submit" className="pl-btn" data-variante="primario" disabled={!nuovoGruppo.nome.trim() || !nuovoGruppo.hashtag.trim()}>
              <Plus className="size-4" />
            </button>
          </form>
        </Sezione>

        {/* Approvazione */}
        <Sezione icona={<ShieldCheck className="inline size-4" />} titolo="Approvazione" nota="Chi approva: admin, CMO, manager e direttore marketing">
          <label className="pl-switch-grande">
            <input
              type="checkbox"
              checked={stato.approvazioneObbligatoria}
              disabled={!puo || occupato === 'appr'}
              onChange={(e) => void esegui('appr', () => plannerService.salvaImpostazioni(e.target.checked), e.target.checked ? 'Approvazione obbligatoria attiva' : 'Approvazione facoltativa')}
            />
            <span>
              <b>Approvazione obbligatoria</b>
              <em>I post di chi non approva passano da un responsabile prima di essere programmati. Se cambiano dopo l'approvazione, ripassano.</em>
            </span>
          </label>
          <div className="pl-sezione-nota">
            Canali con pubblicazione automatica in questo spazio:{' '}
            {CANALI.filter((c) => stato.destinazioni.some((d) => d.canale === c && d.automatica)).map((c) => INFO_CANALE[c].nome).join(', ') || 'nessuno'}.
          </div>
        </Sezione>
      </div>
    </div>
  )
}
