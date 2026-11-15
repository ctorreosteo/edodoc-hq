import { useEffect, useMemo, useState } from 'react'
import { useAzioni } from '@/contexts/azioni-context'
import {
  AlertTriangle,
  CalendarCheck,
  CircleSlash,
  Euro,
  ExternalLink,
  Loader2,
  MailOpen,
  MousePointerClick,
  Plus,
  Reply,
  Send,
  ShieldCheck,
  Stethoscope,
  Tag as TagIcon,
  UserCheck,
  Workflow,
  X,
} from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { toast } from '@/lib/toast'
import {
  mailingService,
  messaggioErroreMailing,
  type MailingCategoria,
  type MailingContattoDettaglio as Dettaglio,
  type MailingContattoRiga,
  type MailingInvioContatto,
  type MailingStatoContatto,
  type MailingTag,
} from '@/services/mailing-service'
import { Avatar, BadgeStatoContatto, BarraPunteggio, PallinoCoinvolgimento, Scheletro, TagPill } from './mailing-ui'
import {
  dataBreve,
  dataOra,
  etichettaBaseGiuridica,
  etichettaStatoPaziente,
  etichettaTipoContatto,
  formatEuro,
  formatNumero,
  formatPercentuale,
  nomeContatto,
  tempoFa,
} from './mailing-utils'

type Props = {
  contattoId: number | null
  tuttiTag: MailingTag[]
  onChiudi: () => void
  onCambiato: (riga: MailingContattoRiga) => void
}

export function MailingContattoDettaglio({ contattoId, tuttiTag, onChiudi, onCambiato }: Props) {
  const [dettaglio, setDettaglio] = useState<Dettaglio | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [categorie, setCategorie] = useState<MailingCategoria[] | null>(null)

  useEffect(() => {
    if (contattoId == null) return
    let vivo = true
    setDettaglio(null)
    setErrore(null)
    mailingService
      .contatto(contattoId)
      .then((d) => vivo && setDettaglio(d))
      .catch((err) => vivo && setErrore(messaggioErroreMailing(err, 'Contatto non trovato')))
    return () => {
      vivo = false
    }
  }, [contattoId])

  useEffect(() => {
    if (contattoId == null || categorie) return
    mailingService
      .categorie()
      .then(setCategorie)
      .catch(() => setCategorie([]))
  }, [contattoId, categorie])

  const aggiorna = (d: Dettaglio) => {
    setDettaglio(d)
    onCambiato(d.contatto)
  }

  return (
    <Sheet open={contattoId != null} onOpenChange={(v) => !v && onChiudi()}>
      <SheetContent side="right" className="ml-sheet" data-vl="" data-vl-page="mailing">
        <SheetTitle className="sr-only">{dettaglio ? nomeContatto(dettaglio.contatto) : 'Contatto'}</SheetTitle>
        <SheetDescription className="sr-only">Scheda del contatto Email Marketing</SheetDescription>
        <div className="ml-sheet-scorri">
          {errore ? (
            <div className="p-6">
              <div className="ml-avviso" data-tono="errore" role="alert">
                <AlertTriangle className="size-4" aria-hidden /> {errore}
              </div>
            </div>
          ) : !dettaglio ? (
            <ScheletroDettaglio />
          ) : (
            <Corpo dettaglio={dettaglio} tuttiTag={tuttiTag} categorie={categorie ?? []} onAggiornato={aggiorna} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ScheletroDettaglio() {
  return (
    <div className="ml-dettaglio" aria-busy>
      <div className="ml-dettaglio-testa">
        <Scheletro altezza={52} larghezza={52} className="rounded-full" />
        <div className="flex-1">
          <Scheletro altezza={18} larghezza="55%" />
          <Scheletro altezza={12} larghezza="70%" className="mt-2" />
        </div>
      </div>
      <div className="px-5 pb-6 sm:px-7">
        <Scheletro altezza={80} />
        <Scheletro altezza={140} className="mt-4" />
        <Scheletro altezza={200} className="mt-4" />
      </div>
    </div>
  )
}

function Corpo({
  dettaglio,
  tuttiTag,
  categorie,
  onAggiornato,
}: {
  dettaglio: Dettaglio
  tuttiTag: MailingTag[]
  categorie: MailingCategoria[]
  onAggiornato: (d: Dettaglio) => void
}) {
  const c = dettaglio.contatto
  const m = dettaglio.metriche
  const nome = nomeContatto(c)
  return (
    <div className="ml-dettaglio">
      <header className="ml-dettaglio-testa">
        <Avatar nome={nome} dimensione="lg" />
        <div className="min-w-0 flex-1">
          <div className="ml-dettaglio-nome">{nome}</div>
          <a className="ml-dettaglio-email" href={`mailto:${c.email}`}>
            {c.email}
          </a>
          <div className="ml-dettaglio-badge">
            <BadgeStatoContatto stato={c.stato} />
            <span className="ml-tipo" data-tipo={c.tipo}>
              {etichettaTipoContatto(c.tipo)}
            </span>
            <PallinoCoinvolgimento valore={c.coinvolgimento} conTesto />
            <BarraPunteggio valore={c.punteggio} />
          </div>
        </div>
      </header>

      <div className="ml-dettaglio-metriche">
        <Metrica icona={<Send className="size-3.5" />} etichetta="Ricevute" valore={formatNumero(m.inviati)} />
        <Metrica icona={<MailOpen className="size-3.5" />} etichetta="Apre" valore={formatPercentuale(m.tassoApertura, 0)} />
        <Metrica icona={<MousePointerClick className="size-3.5" />} etichetta="Clicca" valore={formatPercentuale(m.tassoClick, 0)} />
        <Metrica icona={<CalendarCheck className="size-3.5" />} etichetta="Visite" valore={formatNumero(m.visiteGenerate)} />
        {m.fatturatoGenerato ? <Metrica icona={<Euro className="size-3.5" />} etichetta="Fatturato" valore={formatEuro(m.fatturatoGenerato)} /> : null}
      </div>

      <SezioneStato dettaglio={dettaglio} onAggiornato={onAggiornato} />
      <SezioneTag dettaglio={dettaglio} tuttiTag={tuttiTag} onAggiornato={onAggiornato} />
      {dettaglio.paziente ? <SezionePaziente paziente={dettaglio.paziente} /> : null}
      {categorie.length ? <SezioneCategorie dettaglio={dettaglio} categorie={categorie} onAggiornato={onAggiornato} /> : null}
      {dettaglio.automazioni.length ? <SezioneAutomazioni dettaglio={dettaglio} /> : null}
      <SezioneTimeline dettaglio={dettaglio} />
    </div>
  )
}

function Metrica({ icona, etichetta, valore }: { icona: React.ReactNode; etichetta: string; valore: string }) {
  return (
    <div className="ml-metrica">
      <span className="ml-metrica-etichetta">
        {icona}
        {etichetta}
      </span>
      <span className="ml-metrica-valore">{valore}</span>
    </div>
  )
}

function Sezione({ titolo, icona, children, azione }: { titolo: string; icona: React.ReactNode; children: React.ReactNode; azione?: React.ReactNode }) {
  return (
    <section className="ml-dettaglio-sezione">
      <div className="ml-dettaglio-sezione-testa">
        <span className="ml-dettaglio-sezione-titolo">
          {icona}
          {titolo}
        </span>
        {azione}
      </div>
      {children}
    </section>
  )
}

// ───────────────────────── Stato e consenso ─────────────────────────

const RIENTRO: MailingStatoContatto[] = ['DISISCRITTO', 'RIMBALZATO', 'SEGNALATO_SPAM', 'ARCHIVIATO']

function SezioneStato({ dettaglio, onAggiornato }: { dettaglio: Dettaglio; onAggiornato: (d: Dettaglio) => void }) {
  const c = dettaglio.contatto
  const [modifica, setModifica] = useState<MailingStatoContatto | null>(null)
  const [motivo, setMotivo] = useState('')
  const [esplicito, setEsplicito] = useState(false)
  const [inCorso, setInCorso] = useState(false)
  const reiscrizione = modifica === 'ISCRITTO' && RIENTRO.includes(c.stato)
  const pronto = !!modifica && (!reiscrizione || (motivo.trim().length >= 5 && esplicito))

  const conferma = async () => {
    if (!modifica) return
    setInCorso(true)
    try {
      const d = await mailingService.cambiaStatoContatto(c.id, modifica, motivo.trim() || undefined)
      onAggiornato(d)
      toast.success(modifica === 'ISCRITTO' ? 'Contatto di nuovo iscritto' : modifica === 'DISISCRITTO' ? 'Contatto disiscritto' : 'Stato aggiornato')
      setModifica(null)
      setMotivo('')
      setEsplicito(false)
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Stato non aggiornato'))
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Sezione titolo="Stato e consenso" icona={<ShieldCheck className="size-4" aria-hidden />}>
      <dl className="ml-dl">
        <div>
          <dt>Perché possiamo scrivergli</dt>
          <dd>{etichettaBaseGiuridica(c.baseGiuridica)}</dd>
        </div>
        <div>
          <dt>Consenso dal</dt>
          <dd>{dettaglio.consensoIl ? dataBreve(dettaglio.consensoIl) : '—'}</dd>
        </div>
        <div>
          <dt>Provenienza</dt>
          <dd>{dettaglio.fonte ?? '—'}</dd>
        </div>
        <div>
          <dt>Nella lista dal</dt>
          <dd>{dataBreve(c.creatoIl)}</dd>
        </div>
        {dettaglio.disiscrittoIl ? (
          <div className="ml-dl-largo">
            <dt>Disiscritto</dt>
            <dd>
              {dataBreve(dettaglio.disiscrittoIl)}
              {dettaglio.motivoDisiscrizione ? <span className="ml-dl-nota">«{dettaglio.motivoDisiscrizione}»</span> : null}
            </dd>
          </div>
        ) : null}
      </dl>

      {!modifica ? (
        <div className="ml-azioni-riga">
          {c.stato === 'ISCRITTO' ? (
            <>
              <button type="button" className="ml-btn ml-btn--sm" onClick={() => setModifica('DISISCRITTO')}>
                <CircleSlash className="size-3.5" aria-hidden /> Disiscrivi
              </button>
              <button type="button" className="ml-btn ml-btn--sm ml-btn--ghost" onClick={() => setModifica('ARCHIVIATO')}>
                Archivia
              </button>
            </>
          ) : (
            <button type="button" className="ml-btn ml-btn--sm" onClick={() => setModifica('ISCRITTO')}>
              <UserCheck className="size-3.5" aria-hidden /> Iscrivi di nuovo
            </button>
          )}
        </div>
      ) : (
        <div className="ml-cambio-stato" data-reiscrizione={reiscrizione ? '' : undefined}>
          <div className="ml-cambio-stato-titolo">
            {modifica === 'ISCRITTO' ? 'Iscrivi di nuovo' : modifica === 'DISISCRITTO' ? 'Disiscrivi il contatto' : 'Archivia il contatto'}
          </div>
          {reiscrizione ? (
            <p className="ml-cambio-stato-testo">
              Si può fare solo se la persona l’ha chiesto in modo esplicito. Scrivi come e quando: resta nello storico del contatto.
            </p>
          ) : modifica === 'DISISCRITTO' ? (
            <p className="ml-cambio-stato-testo">Non riceverà più nessuna email, nemmeno dalle automazioni.</p>
          ) : (
            <p className="ml-cambio-stato-testo">Esce dalla lista attiva; lo storico resta consultabile.</p>
          )}
          <div className="ml-campo">
            <label htmlFor="ml-motivo">{reiscrizione ? 'Motivo (obbligatorio)' : 'Motivo (facoltativo)'}</label>
            <textarea
              id="ml-motivo"
              className="ml-textarea"
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={reiscrizione ? 'Es. ha chiesto in visita il 12/11 di ricevere di nuovo la newsletter' : 'Es. ha chiesto al telefono di non ricevere più email'}
            />
          </div>
          {reiscrizione ? (
            <label className="ml-spunta">
              <input type="checkbox" checked={esplicito} onChange={(e) => setEsplicito(e.target.checked)} />
              <span>La persona ha chiesto esplicitamente di tornare a ricevere le email.</span>
            </label>
          ) : null}
          <div className="ml-azioni-riga ml-azioni-riga--fine">
            <button type="button" className="ml-btn ml-btn--sm ml-btn--ghost" onClick={() => setModifica(null)} disabled={inCorso}>
              Annulla
            </button>
            <button type="button" className={`ml-btn ml-btn--sm ${modifica === 'ISCRITTO' ? 'ml-btn--pieno' : 'ml-btn--pericolo'}`} onClick={() => void conferma()} disabled={!pronto || inCorso}>
              {inCorso ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              Conferma
            </button>
          </div>
        </div>
      )}
    </Sezione>
  )
}

// ───────────────────────── Tag ─────────────────────────

function SezioneTag({ dettaglio, tuttiTag, onAggiornato }: { dettaglio: Dettaglio; tuttiTag: MailingTag[]; onAggiornato: (d: Dettaglio) => void }) {
  const c = dettaglio.contatto
  const [testo, setTesto] = useState('')
  const [aperto, setAperto] = useState(false)
  const [inCorso, setInCorso] = useState<number | 'nuovo' | null>(null)
  const presenti = new Set(c.tag.map((t) => t.id))
  const suggeriti = useMemo(() => {
    const q = testo.trim().toLowerCase()
    return tuttiTag.filter((t) => !presenti.has(t.id) && (!q || t.nome.toLowerCase().includes(q))).slice(0, 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tuttiTag, testo, c.tag])
  const esatto = tuttiTag.find((t) => t.nome.toLowerCase() === testo.trim().toLowerCase())

  const aggiungi = async (tag: { tagId?: number; nome?: string }) => {
    setInCorso(tag.tagId ?? 'nuovo')
    try {
      const d = await mailingService.aggiungiTag(c.id, tag)
      onAggiornato(d)
      setTesto('')
      setAperto(false)
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Tag non aggiunto'))
    } finally {
      setInCorso(null)
    }
  }

  const rimuovi = async (t: MailingTag) => {
    setInCorso(t.id)
    try {
      onAggiornato(await mailingService.rimuoviTag(c.id, t.id))
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Tag non rimosso'))
    } finally {
      setInCorso(null)
    }
  }

  return (
    <Sezione
      titolo="Tag"
      icona={<TagIcon className="size-4" aria-hidden />}
      azione={
        !aperto ? (
          <button type="button" className="ml-btn ml-btn--sm ml-btn--ghost" onClick={() => setAperto(true)}>
            <Plus className="size-3.5" aria-hidden /> Aggiungi
          </button>
        ) : null
      }
    >
      <div className="ml-tag-lista">
        {c.tag.length === 0 && !aperto ? <span className="ml-muto text-sm">Nessun tag.</span> : null}
        {c.tag.map((t) => (
          <TagPill key={t.id} tag={t}>
            {!t.sistema ? (
              <button type="button" className="ml-tag-x" onClick={() => void rimuovi(t)} aria-label={`Togli il tag ${t.nome}`} disabled={inCorso === t.id}>
                {inCorso === t.id ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <X className="size-3" aria-hidden />}
              </button>
            ) : null}
          </TagPill>
        ))}
      </div>
      {aperto ? (
        <div className="ml-tag-aggiungi">
          <label className="sr-only" htmlFor="ml-tag-nuovo">Cerca o crea un tag</label>
          <input
            id="ml-tag-nuovo"
            className="ml-input"
            value={testo}
            autoFocus
            placeholder="Cerca un tag o scrivine uno nuovo…"
            onChange={(e) => setTesto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setAperto(false)
              if (e.key === 'Enter') {
                e.preventDefault()
                if (esatto && !presenti.has(esatto.id)) void aggiungi({ tagId: esatto.id })
                else if (testo.trim() && !esatto) void aggiungi({ nome: testo.trim() })
                else if (suggeriti[0]) void aggiungi({ tagId: suggeriti[0].id })
              }
            }}
          />
          <div className="ml-tag-suggeriti" role="listbox" aria-label="Tag disponibili">
            {suggeriti.map((t) => (
              <button key={t.id} type="button" role="option" aria-selected={false} className="ml-tag-suggerito" onClick={() => void aggiungi({ tagId: t.id })} disabled={inCorso != null}>
                <TagPill tag={t} />
                {t.contatti != null ? <span className="ml-muto">{formatNumero(t.contatti)}</span> : null}
              </button>
            ))}
            {testo.trim() && !esatto ? (
              <button type="button" className="ml-tag-suggerito ml-tag-crea" onClick={() => void aggiungi({ nome: testo.trim() })} disabled={inCorso != null}>
                {inCorso === 'nuovo' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
                Crea «{testo.trim()}»
              </button>
            ) : null}
          </div>
          <div className="ml-azioni-riga ml-azioni-riga--fine">
            <button type="button" className="ml-btn ml-btn--sm ml-btn--ghost" onClick={() => setAperto(false)}>
              Chiudi
            </button>
          </div>
        </div>
      ) : null}
    </Sezione>
  )
}

// ───────────────────────── Paziente, categorie, automazioni ─────────────────────────

function SezionePaziente({ paziente }: { paziente: NonNullable<Dettaglio['paziente']> }) {
  const azioni = useAzioni()
  return (
    <Sezione
      titolo="Paziente"
      icona={<Stethoscope className="size-4" aria-hidden />}
      azione={
        <button type="button" className="ml-link" onClick={() => azioni.apriPaziente(paziente.id)}>
          Apri la scheda <ExternalLink className="size-3.5" aria-hidden />
        </button>
      }
    >
      <div className="ml-paziente">
        <div className="ml-paziente-nome">{paziente.nomeCompleto}</div>
        <dl className="ml-dl ml-dl--3">
          <div>
            <dt>Visite</dt>
            <dd>{formatNumero(paziente.numeroVisite)}</dd>
          </div>
          <div>
            <dt>Ultima visita</dt>
            <dd>{paziente.ultimaVisita ? dataBreve(paziente.ultimaVisita) : '—'}</dd>
          </div>
          <div>
            <dt>Prossima</dt>
            <dd>{paziente.prossimaVisita ? dataBreve(paziente.prossimaVisita) : 'Nessuna'}</dd>
          </div>
          <div>
            <dt>Stato</dt>
            <dd>{paziente.statoPaziente ? etichettaStatoPaziente(paziente.statoPaziente) : '—'}</dd>
          </div>
          <div>
            <dt>Speso in totale</dt>
            <dd>{formatEuro(paziente.spesaTotale)}</dd>
          </div>
          {paziente.cellulare ? (
            <div>
              <dt>Cellulare</dt>
              <dd>{paziente.cellulare}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </Sezione>
  )
}

function SezioneCategorie({ dettaglio, categorie, onAggiornato }: { dettaglio: Dettaglio; categorie: MailingCategoria[]; onAggiornato: (d: Dettaglio) => void }) {
  const c = dettaglio.contatto
  const [inCorso, setInCorso] = useState<number | null>(null)
  const escluse = new Set(dettaglio.categorieEscluse)
  const alterna = async (cat: MailingCategoria) => {
    const nuove = escluse.has(cat.id) ? dettaglio.categorieEscluse.filter((x) => x !== cat.id) : [...dettaglio.categorieEscluse, cat.id]
    setInCorso(cat.id)
    try {
      const d = await mailingService.aggiornaContatto(c.id, {
        email: c.email,
        nome: c.nome,
        cognome: c.cognome,
        note: dettaglio.note,
        tagIds: c.tag.map((t) => t.id),
        categorieEscluse: nuove,
      })
      onAggiornato(d)
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Preferenza non salvata'))
    } finally {
      setInCorso(null)
    }
  }
  return (
    <Sezione titolo="Cosa riceve" icona={<MailOpen className="size-4" aria-hidden />}>
      <ul className="ml-categorie-lista">
        {categorie
          .filter((cat) => cat.attiva)
          .map((cat) => {
            const riceve = !escluse.has(cat.id)
            return (
              <li key={cat.id}>
                <span className="min-w-0">
                  <span className="ml-riga-titolo">{cat.nome}</span>
                  {cat.descrizione ? <span className="ml-riga-sotto">{cat.descrizione}</span> : null}
                </span>
                {inCorso === cat.id ? <Loader2 className="size-4 animate-spin ml-muto" aria-hidden /> : null}
                <button
                  type="button"
                  role="switch"
                  aria-checked={riceve}
                  aria-label={`${riceve ? 'Riceve' : 'Non riceve'} ${cat.nome}`}
                  className="ml-toggle"
                  disabled={inCorso != null || c.stato !== 'ISCRITTO'}
                  onClick={() => void alterna(cat)}
                />
              </li>
            )
          })}
      </ul>
    </Sezione>
  )
}

const STATO_ISCRIZIONE: Record<string, { etichetta: string; tono: string }> = {
  ATTIVA: { etichetta: 'In corso', tono: 'info' },
  IN_ATTESA: { etichetta: 'In attesa', tono: 'info' },
  COMPLETATA: { etichetta: 'Completata', tono: 'ok' },
  USCITA: { etichetta: 'Uscita', tono: 'neutro' },
  ERRORE: { etichetta: 'Errore', tono: 'errore' },
}

function SezioneAutomazioni({ dettaglio }: { dettaglio: Dettaglio }) {
  return (
    <Sezione titolo="Automazioni" icona={<Workflow className="size-4" aria-hidden />}>
      <ul className="ml-lista ml-lista--compatta">
        {dettaglio.automazioni.map((a) => {
          const s = STATO_ISCRIZIONE[a.stato] ?? { etichetta: a.stato, tono: 'neutro' }
          return (
            <li key={a.id} className="ml-iscrizione">
              <span className="min-w-0 flex-1">
                <span className="ml-riga-titolo">{a.automazioneNome}</span>
                <span className="ml-riga-sotto">
                  Entrato {tempoFa(a.iniziataIl)}
                  {a.prossimaAzioneIl && (a.stato === 'ATTIVA' || a.stato === 'IN_ATTESA') ? ` · prossimo passo ${dataOra(a.prossimaAzioneIl)}` : ''}
                </span>
              </span>
              <span className={`ml-badge ml-badge--${s.tono}`} data-vivo={a.stato === 'ATTIVA' ? '' : undefined}>
                {s.etichetta}
              </span>
            </li>
          )
        })}
      </ul>
    </Sezione>
  )
}

// ───────────────────────── Timeline ─────────────────────────

function descriviInvio(i: MailingInvioContatto): { tono: string; testo: string } {
  if (i.stato === 'RIMBALZATO') return { tono: 'avviso', testo: 'Non consegnata' }
  if (i.stato === 'ERRORE') return { tono: 'errore', testo: 'Errore di invio' }
  if (i.stato === 'IN_CODA' || i.stato === 'IN_INVIO') return { tono: 'info', testo: 'In partenza' }
  if (i.stato === 'SALTATO' || i.stato === 'ANNULLATO') return { tono: 'neutro', testo: 'Non inviata' }
  return { tono: 'neutro', testo: 'Consegnata' }
}

function SezioneTimeline({ dettaglio }: { dettaglio: Dettaglio }) {
  const [vista, setVista] = useState<'email' | 'attivita'>('email')
  const eventi = dettaglio.eventi.filter((e) => e.tipo !== 'INVIATO')
  return (
    <Sezione
      titolo="Storico"
      icona={<Send className="size-4" aria-hidden />}
      azione={
        <div className="ml-seg ml-seg--piccolo" role="tablist" aria-label="Storico">
          <button type="button" role="tab" aria-selected={vista === 'email'} data-active={vista === 'email' ? '' : undefined} onClick={() => setVista('email')}>
            Email ({dettaglio.invii.length})
          </button>
          <button type="button" role="tab" aria-selected={vista === 'attivita'} data-active={vista === 'attivita' ? '' : undefined} onClick={() => setVista('attivita')}>
            Attività ({eventi.length})
          </button>
        </div>
      }
    >
      {vista === 'email' ? (
        dettaglio.invii.length === 0 ? (
          <p className="ml-vuoto-riga">Nessuna email inviata a questo contatto.</p>
        ) : (
          <ol className="ml-timeline">
            {dettaglio.invii.map((i) => {
              const d = descriviInvio(i)
              const aperta = i.aperture > 0
              return (
                <li key={i.id} className="ml-timeline-voce" data-aperta={aperta ? '' : undefined} data-click={i.click > 0 ? '' : undefined}>
                  <span className="ml-timeline-punto" aria-hidden />
                  <div className="ml-timeline-corpo">
                    <div className="ml-timeline-titolo">{i.oggetto ?? '(senza oggetto)'}</div>
                    <div className="ml-timeline-sotto">
                      {i.campagnaNome ? <>Campagna «{i.campagnaNome}»</> : i.automazioneNome ? <>Automazione «{i.automazioneNome}»</> : null}
                      {i.inviatoIl ? <> · {dataOra(i.inviatoIl)}</> : null}
                    </div>
                    <div className="ml-timeline-chip">
                      {i.stato !== 'INVIATO' ? <span className={`ml-badge ml-badge--${d.tono}`}>{d.testo}</span> : null}
                      {i.stato === 'INVIATO' ? (
                        aperta ? (
                          <span className="ml-badge ml-badge--info" title={i.primaAperturaIl ? `Prima apertura ${dataOra(i.primaAperturaIl)}` : undefined}>
                            Aperta{i.aperture > 1 ? ` ${i.aperture} volte` : ''}
                          </span>
                        ) : (
                          <span className="ml-badge ml-badge--neutro">Non aperta</span>
                        )
                      ) : null}
                      {i.click > 0 ? (
                        <span className="ml-badge ml-badge--ok" title={i.primoClickIl ? `Primo click ${dataOra(i.primoClickIl)}` : undefined}>
                          {i.click} click
                        </span>
                      ) : null}
                      {i.rispostoIl ? (
                        <span className="ml-badge ml-badge--info">
                          <Reply className="size-3" aria-hidden /> Ha risposto
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )
      ) : eventi.length === 0 ? (
        <p className="ml-vuoto-riga">Ancora nessuna attività.</p>
      ) : (
        <ol className="ml-timeline">
          {eventi.map((e) => (
            <li key={e.id} className="ml-timeline-voce" data-evento={e.tipo}>
              <span className="ml-timeline-punto" aria-hidden />
              <div className="ml-timeline-corpo">
                <div className="ml-timeline-titolo">
                  {e.messaggio}
                  {e.valore != null ? <strong className="ml-positivo"> · {formatEuro(e.valore)}</strong> : null}
                </div>
                <div className="ml-timeline-sotto">
                  {dataOra(e.avvenutoIl)}
                  {e.dispositivo ? ` · ${e.dispositivo}` : ''}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Sezione>
  )
}
