import { CalendarClock, Filter, Layers, ListChecks, Loader2, MinusCircle, UserX, Users } from 'lucide-react'
import type { MailingCampagna, MailingPubblico, MailingStimaPubblico } from '@/services/mailing-service'
import { MailingCostruttoreRegole, regoleVuote } from './mailing-regole'
import type { Riferimenti } from './mailing-campagna-wizard'
import { pubblicoVuoto } from './mailing-campagna-dati'
import { Avatar } from './mailing-ui'
import { dataOra, formatNumero, nomeContatto, useNumeroAnimato } from './mailing-utils'

/* Passo 2: a chi scrivere. Tutti, segmenti/tag, oppure regole su misura; esclusioni; stima live con spiegazione. */

type Modo = 'tutti' | 'liste' | 'regole'

function modoDi(p: MailingPubblico): Modo {
  if (p.tutti) return 'tutti'
  if (p.regole) return 'regole'
  return 'liste'
}

function Scelta({ attivo, onClick, icona, titolo, testo }: { attivo: boolean; onClick: () => void; icona: React.ReactNode; titolo: string; testo: string }) {
  return (
    <button type="button" className="ml-cp-scelta" data-attivo={attivo ? '' : undefined} aria-pressed={attivo} onClick={onClick}>
      <span className="ml-cp-scelta-icona">{icona}</span>
      <span className="ml-cp-scelta-titolo">{titolo}</span>
      <span className="ml-cp-scelta-testo">{testo}</span>
    </button>
  )
}

function Chips<T extends number>({ voci, scelti, onCambia, vuoto }: { voci: { id: T; nome: string; conta?: number | null; colore?: string | null }[]; scelti: T[]; onCambia: (v: T[]) => void; vuoto: string }) {
  if (!voci.length) return <div className="ml-ed-aiuto">{vuoto}</div>
  return (
    <div className="ml-cp-chips">
      {voci.map((v) => {
        const on = scelti.includes(v.id)
        return (
          <button
            key={v.id}
            type="button"
            className={`ml-chip${on ? ' ml-chip--attivo' : ''}`}
            aria-pressed={on}
            onClick={() => onCambia(on ? scelti.filter((x) => x !== v.id) : [...scelti, v.id])}
            style={v.colore ? ({ '--ml-chip-colore': v.colore } as React.CSSProperties) : undefined}
          >
            {v.colore ? <span className="ml-cp-chip-punto" /> : null}
            {v.nome}
            {v.conta != null ? <span className="ml-cp-chip-conta">{formatNumero(v.conta)}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

export function PassoPubblico({
  c,
  rif,
  aggiorna,
  stima,
  stimaInCorso,
}: {
  c: MailingCampagna
  rif: Riferimenti
  aggiorna: (p: Partial<MailingCampagna>) => void
  stima: MailingStimaPubblico | null
  stimaInCorso: boolean
}) {
  const p = c.pubblico ?? pubblicoVuoto()
  const modo = modoDi(p)
  const set = (patch: Partial<MailingPubblico>) => aggiorna({ pubblico: { ...p, ...patch } })
  const cambiaModo = (m: Modo) => {
    if (m === modo) return
    if (m === 'tutti') set({ tutti: true, regole: null })
    else if (m === 'liste') set({ tutti: false, regole: null })
    else set({ tutti: false, regole: p.regole ?? regoleVuote(), segmentiIds: [], tagIds: [] })
  }
  const numero = useNumeroAnimato(stima?.destinatari ?? null)
  const mittente = rif.mittenti.find((m) => m.id === c.mittenteId)
  const segmenti = rif.segmenti.map((s) => ({ id: s.id, nome: s.nome, conta: s.ultimoConteggio, colore: s.colore }))
  const tag = rif.tag.map((t) => ({ id: t.id, nome: t.nome, conta: t.contatti, colore: t.colore }))
  const esclusi = stima ? stima.disiscritti + stima.rimbalzati + stima.categoriaEsclusa + stima.senzaEmailValida : 0

  return (
    <div className="ml-cp-due">
      <div className="ml-cp-colonna">
        <section className="ml-card ml-cp-sezione">
          <div className="ml-cp-sezione-titolo">
            <Users /> A chi scrivere
          </div>
          <div className="ml-cp-scelte">
            <Scelta attivo={modo === 'tutti'} onClick={() => cambiaModo('tutti')} icona={<Users />} titolo="Tutti gli iscritti" testo="Pazienti e lead che ricevono le email" />
            <Scelta attivo={modo === 'liste'} onClick={() => cambiaModo('liste')} icona={<Layers />} titolo="Segmenti e tag" testo="Uno o più gruppi già pronti" />
            <Scelta attivo={modo === 'regole'} onClick={() => cambiaModo('regole')} icona={<Filter />} titolo="Su misura" testo="Regole sui dati veri del gestionale" />
          </div>

          {modo === 'liste' ? (
            <div className="ml-cp-liste">
              <div className="ml-ed-campo">
                <span className="ml-ed-etichetta">Segmenti</span>
                <Chips voci={segmenti} scelti={p.segmentiIds} onCambia={(v) => set({ segmentiIds: v })} vuoto="Nessun segmento: puoi crearli nella scheda Contatti." />
              </div>
              <div className="ml-ed-campo">
                <span className="ml-ed-etichetta">Tag</span>
                <Chips voci={tag} scelti={p.tagIds} onCambia={(v) => set({ tagIds: v })} vuoto="Nessun tag disponibile." />
              </div>
              <div className="ml-ed-aiuto">Riceve l'email chi appartiene ad almeno uno dei gruppi scelti, una volta sola.</div>
            </div>
          ) : null}

          {modo === 'regole' ? (
            <div className="ml-cp-regole">
              <MailingCostruttoreRegole valore={p.regole ?? regoleVuote()} onChange={(r) => set({ regole: r })} catalogo={rif.catalogo} />
            </div>
          ) : null}
        </section>

        <section className="ml-card ml-cp-sezione">
          <div className="ml-cp-sezione-titolo">
            <MinusCircle /> Escludi
          </div>
          <div className="ml-ed-campo">
            <span className="ml-ed-etichetta">Segmenti da escludere</span>
            <Chips voci={segmenti} scelti={p.esclusiSegmentiIds} onCambia={(v) => set({ esclusiSegmentiIds: v })} vuoto="Nessun segmento." />
          </div>
          <div className="ml-ed-campo">
            <span className="ml-ed-etichetta">Tag da escludere</span>
            <Chips voci={tag} scelti={p.esclusiTagIds} onCambia={(v) => set({ esclusiTagIds: v })} vuoto="Nessun tag." />
          </div>
          <div className="ml-ed-nota">Disiscritti, indirizzi che rimbalzano e segnalazioni di spam sono esclusi sempre, anche se fanno parte dei gruppi scelti.</div>
        </section>
      </div>

      <aside className="ml-cp-colonna ml-cp-colonna--anteprima">
        <div className="ml-cp-appiccicoso">
          <section className="ml-card ml-cp-stima" data-occupato={stimaInCorso ? '' : undefined} aria-live="polite">
            <div className="ml-etichetta">Riceveranno questa email</div>
            <div className="ml-cp-stima-numero">
              {numero == null ? <span className="ml-skeleton" style={{ width: 140, height: 52, display: 'inline-block' }} /> : formatNumero(numero)}
              {stimaInCorso ? <Loader2 className="ml-ed-gira" /> : null}
            </div>
            <div className="ml-cp-stima-sotto">persone, dopo i controlli di sicurezza</div>
            {stima ? (
              <>
                <ul className="ml-cp-esclusi">
                  <li>
                    <UserX />
                    <span>Disiscritti</span>
                    <strong>{formatNumero(stima.disiscritti)}</strong>
                  </li>
                  <li>
                    <MinusCircle />
                    <span>Indirizzi non validi o che rimbalzano</span>
                    <strong>{formatNumero(stima.rimbalzati + stima.senzaEmailValida)}</strong>
                  </li>
                  {c.categoriaId ? (
                    <li>
                      <ListChecks />
                      <span>Hanno escluso questa categoria</span>
                      <strong>{formatNumero(stima.categoriaEsclusa)}</strong>
                    </li>
                  ) : null}
                </ul>
                {esclusi ? <div className="ml-ed-aiuto">{formatNumero(esclusi)} contatti del gruppo non la riceveranno, per proteggere la reputazione della casella e rispettare chi ha detto no.</div> : null}
                {stima.giorniInvioStimati > 1 ? (
                  <div className="ml-avviso ml-cp-stima-giorni" data-tono="info">
                    <CalendarClock />
                    <span>
                      Supera la quota giornaliera{mittente ? ` di ${mittente.email} (${formatNumero(mittente.limiteGiornaliero)})` : ''}: l'invio durerà circa <strong>{stima.giorniInvioStimati} giorni</strong>
                      {stima.fineInvioStimata ? `, fine stimata ${dataOra(stima.fineInvioStimata)}` : ''}.
                    </span>
                  </div>
                ) : null}
                {stima.campione.length ? (
                  <div className="ml-cp-campione">
                    <div className="ml-etichetta">Per esempio</div>
                    {stima.campione.slice(0, 5).map((x) => (
                      <div key={x.id} className="ml-cp-campione-riga">
                        <Avatar nome={nomeContatto(x)} />
                        <div>
                          <strong>{nomeContatto(x)}</strong>
                          <small>{x.email}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
            {stima && stima.destinatari === 0 && !stimaInCorso ? <div className="ml-avviso" data-tono="errore">Con queste scelte nessuno riceverebbe l'email: allarga il pubblico.</div> : null}
          </section>
        </div>
      </aside>
    </div>
  )
}
