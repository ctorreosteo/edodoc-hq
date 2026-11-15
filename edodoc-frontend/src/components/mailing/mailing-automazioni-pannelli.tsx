import { useId, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Eye,
  Loader2,
  LogOut,
  Mail,
  MailOpen,
  MousePointerClick,
  PenLine,
  Plus,
  Trash2,
  UserMinus,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type {
  MailingAutomazioneEmail,
  MailingCatalogoCampo,
  MailingCategoria,
  MailingGrafo,
  MailingGruppoRegole,
  MailingMittente,
  MailingNodo,
  MailingReportAutomazione,
  MailingReportNodo,
  MailingSegmento,
  MailingTag,
  MailingTipoTrigger,
  MailingTrigger,
} from '@/services/mailing-service'
import {
  ETICHETTE_ESITO_CONOSCITIVA,
  ETICHETTE_TIPO_PERCORSO,
  ETICHETTE_TRIGGER,
  descriviAttesa,
  descriviGiorni,
  descriviTrigger,
  descriviUscita,
  emailAMonte,
  numeroDa,
  stringaDa,
  tipoCondizione,
  TIPO_USCITA_VISITA_PRENOTATA,
  type ContestoDescrizioni,
  type ProblemaGrafo,
  type UnitaAttesa,
} from '@/lib/mailing-grafo'
import { MailingCostruttoreRegole, regoleVuote } from './mailing-regole'
import { Interruttore } from './mailing-ui'
import { AzioniEmail } from './mailing-editor-strumenti'
import { ICONA_TRIGGER, META_NODO } from './mailing-automazioni-meta'
import { dataBreve, formatEuro, formatNumero, formatPercentuale, tempoFa, useColoriMailing } from './mailing-utils'

/* Pannello laterale del builder: proprietà del nodo selezionato, del trigger, risultati. */

export type ContestoBuilder = ContestoDescrizioni & {
  tag: MailingTag[]
  segmenti: MailingSegmento[]
  catalogo: MailingCatalogoCampo[]
  mittenti: MailingMittente[]
  categorie: MailingCategoria[]
  creaTag: (nome: string) => Promise<MailingTag | null>
}

// ───────────────────────── Mattoncini ─────────────────────────

function Campo({ etichetta, aiuto, children, id }: { etichetta: ReactNode; aiuto?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <div className="ml-campo">
      <label className="ml-campo-etichetta" htmlFor={id}>{etichetta}</label>
      {children}
      {aiuto ? <div className="ml-campo-aiuto">{aiuto}</div> : null}
    </div>
  )
}

function Sezione({ titolo, children, icona }: { titolo: ReactNode; children: ReactNode; icona?: ReactNode }) {
  return (
    <section className="ml-au-sezione">
      <div className="ml-au-sezione-titolo">
        {icona}
        {titolo}
      </div>
      {children}
    </section>
  )
}

function Problemi({ problemi }: { problemi: ProblemaGrafo[] }) {
  if (!problemi.length) return null
  return (
    <ul className="ml-au-problemi-nodo">
      {problemi.map((p, i) => (
        <li key={`${p.codice}-${i}`} data-gravita={p.gravita === 'ERRORE' ? 'errore' : 'avviso'}>
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <span>{p.messaggio}</span>
        </li>
      ))}
    </ul>
  )
}

function TestaPannello({ icona, tipo, titolo, numero, onChiudi, azioni, tono }: { icona: ReactNode; tipo: string; titolo: ReactNode; numero?: number; onChiudi: () => void; azioni?: ReactNode; tono?: string }) {
  return (
    <div className="ml-au-pannello-testa" data-tipo={tono}>
      <span className="ml-au-nodo-icona ml-au-pannello-icona" aria-hidden>{icona}</span>
      <div className="min-w-0 flex-1">
        <div className="ml-au-pannello-tipo">
          {tipo}
          {numero ? <span className="ml-au-pannello-passo">Passo {numero}</span> : null}
        </div>
        <div className="ml-au-pannello-titolo">{titolo}</div>
      </div>
      {azioni}
      <button type="button" className="ml-btn ml-btn--ghost ml-btn--icona" onClick={onChiudi} aria-label="Chiudi il pannello" title="Chiudi (Esc)">
        <X className="size-4" />
      </button>
    </div>
  )
}

/** Select dei tag con "crea al volo". */
function SceltaTag({ valore, onChange, contesto, id }: { valore: number | null; onChange: (id: number | null) => void; contesto: ContestoBuilder; id?: string }) {
  const [nuovo, setNuovo] = useState<string | null>(null)
  const [creo, setCreo] = useState(false)
  const crea = async () => {
    const nome = (nuovo ?? '').trim()
    if (!nome) return
    setCreo(true)
    try {
      const t = await contesto.creaTag(nome)
      if (t) {
        onChange(t.id)
        setNuovo(null)
      }
    } finally {
      setCreo(false)
    }
  }
  if (nuovo != null) {
    return (
      <div className="ml-au-riga">
        <input
          className="ml-input"
          autoFocus
          value={nuovo}
          placeholder="Nome del nuovo tag"
          maxLength={60}
          onChange={(e) => setNuovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void crea()
            if (e.key === 'Escape') setNuovo(null)
          }}
        />
        <button type="button" className="ml-btn ml-btn--pieno" onClick={() => void crea()} disabled={creo || !nuovo.trim()}>
          {creo ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Crea
        </button>
        <button type="button" className="ml-btn ml-btn--ghost ml-btn--icona" onClick={() => setNuovo(null)} aria-label="Annulla">
          <X className="size-4" />
        </button>
      </div>
    )
  }
  return (
    <div className="ml-au-riga">
      <select id={id} className="ml-select" value={valore ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Scegli un tag…</option>
        {contesto.tag.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nome}
            {t.contatti != null ? ` (${formatNumero(t.contatti)})` : ''}
          </option>
        ))}
      </select>
      <button type="button" className="ml-btn ml-btn--ghost" onClick={() => setNuovo('')} title="Crea un nuovo tag">
        <Plus className="size-4" aria-hidden /> Nuovo
      </button>
    </div>
  )
}

/** Select su un elenco fisso (esito della chiamata, tipo di percorso). */
function SceltaFissa({ opzioni, valore, onChange, vuoto, id }: { opzioni: Record<string, string>; valore: unknown; onChange: (v: string | null) => void; vuoto: string; id?: string }) {
  return (
    <select id={id} className="ml-select" value={valore == null ? '' : String(valore)} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{vuoto}</option>
      {Object.entries(opzioni).map(([k, v]) => (
        <option key={k} value={k}>{v}</option>
      ))}
    </select>
  )
}

/** Fonti del lead a scelta multipla (parametro `fonte`: una stringa o un elenco). Opzioni dal catalogo dei segmenti. */
function SceltaFonti({ valore, onChange, contesto }: { valore: unknown; onChange: (v: string[] | null) => void; contesto: ContestoBuilder }) {
  const opzioni = contesto.catalogo.find((c) => c.campo === 'fonte')?.opzioni ?? []
  const scelte = Array.isArray(valore) ? valore.map(String) : typeof valore === 'string' && valore ? [valore] : []
  if (!opzioni.length) return <span className="ml-campo-aiuto">Fonti non disponibili: parte con qualsiasi fonte.</span>
  return (
    <div className="ml-au-chips" role="group" aria-label="Fonti del lead">
      {opzioni.map((o) => {
        const attiva = scelte.includes(o.valore)
        return (
          <button
            key={o.valore}
            type="button"
            className="ml-chip"
            aria-pressed={attiva}
            onClick={() => {
              const nuove = attiva ? scelte.filter((x) => x !== o.valore) : [...scelte, o.valore]
              onChange(nuove.length ? nuove : null)
            }}
          >
            {o.etichetta}
          </button>
        )
      })}
    </div>
  )
}

function Numero({ valore, onChange, min = 0, max, id, placeholder }: { valore: unknown; onChange: (v: number | null) => void; min?: number; max?: number; id?: string; placeholder?: string }) {
  const n = numeroDa(valore)
  return (
    <input
      id={id}
      className="ml-input ml-au-numero"
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      placeholder={placeholder}
      value={n ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Math.max(min, Math.min(max ?? Infinity, Math.round(Number(e.target.value)))))}
    />
  )
}

// ───────────────────────── Pannello nodo ─────────────────────────

const GIORNI = [
  { n: 1, breve: 'L', nome: 'lunedì' },
  { n: 2, breve: 'M', nome: 'martedì' },
  { n: 3, breve: 'M', nome: 'mercoledì' },
  { n: 4, breve: 'G', nome: 'giovedì' },
  { n: 5, breve: 'V', nome: 'venerdì' },
  { n: 6, breve: 'S', nome: 'sabato' },
  { n: 7, breve: 'D', nome: 'domenica' },
]

const ATTESE_RAPIDE: { q: number; u: UnitaAttesa; testo: string }[] = [
  { q: 1, u: 'ORE', testo: '1 ora' },
  { q: 1, u: 'GIORNI', testo: '1 giorno' },
  { q: 3, u: 'GIORNI', testo: '3 giorni' },
  { q: 7, u: 'GIORNI', testo: '1 settimana' },
  { q: 30, u: 'GIORNI', testo: '1 mese' },
]

type PropsNodo = {
  nodo: MailingNodo
  numero: number
  grafo: MailingGrafo
  numeri: Map<string, number>
  email: MailingAutomazioneEmail | null
  /** Email in creazione (primo salvataggio dell'oggetto). */
  emailInCreazione: boolean
  problemi: ProblemaGrafo[]
  contesto: ContestoBuilder
  oggettiEmail: Map<string, string>
  /** Mittente e categoria dell'automazione, per l'invio di prova. */
  contestoProva: { mittenteId: number | null; categoriaId: number | null }
  onConfig: (config: Record<string, unknown>, unisci?: string) => void
  onEmail: (campi: { oggetto?: string; preheader?: string | null }) => void
  onApriEditor: () => void
  onElimina: () => void
  onChiudi: () => void
  onAggiungiRamo: (ramo: 'SI' | 'NO') => void
}

export function PannelloNodo(p: PropsNodo) {
  const meta = META_NODO[p.nodo.tipo]
  const Icona = meta.icona
  const c = p.nodo.config ?? {}
  const id = useId()
  const set = (chiave: string, valore: unknown, unisci?: string) => p.onConfig({ ...c, [chiave]: valore }, unisci)

  let corpo: ReactNode = null
  switch (p.nodo.tipo) {
    case 'EMAIL': {
      const e = p.email
      corpo = (
        <>
          <Campo etichetta="Oggetto" id={`${id}-o`} aiuto={e?.oggetto ? `${e.oggetto.length} caratteri · meglio sotto i 60` : 'È la prima cosa che si legge nella casella.'}>
            <input
              id={`${id}-o`}
              className="ml-input"
              value={e?.oggetto ?? ''}
              maxLength={150}
              placeholder="Es. {{nome}}, ecco come iniziare"
              onChange={(ev) => p.onEmail({ oggetto: ev.target.value })}
            />
          </Campo>
          <Campo etichetta="Testo di anteprima" id={`${id}-p`} aiuto="Le poche parole grigie che seguono l’oggetto in Gmail e sul telefono.">
            <input
              id={`${id}-p`}
              className="ml-input"
              value={e?.preheader ?? ''}
              maxLength={150}
              placeholder="Facoltativo"
              onChange={(ev) => p.onEmail({ preheader: ev.target.value || null })}
            />
          </Campo>
          <div className="ml-au-anteprima-email" data-vuota={!e?.html ? '' : undefined}>
            {e?.html ? <iframe title="Anteprima dell’email" srcDoc={e.html} sandbox="" tabIndex={-1} loading="lazy" /> : (
              <div className="ml-au-anteprima-vuota">
                <Mail className="size-6" aria-hidden />
                <span>Ancora nessun contenuto</span>
              </div>
            )}
            <button type="button" className="ml-btn ml-btn--pieno ml-au-anteprima-apri" onClick={p.onApriEditor} disabled={p.emailInCreazione}>
              {p.emailInCreazione ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PenLine className="size-4" aria-hidden />}
              {e?.html ? 'Modifica il contenuto' : 'Scrivi l’email'}
            </button>
          </div>
          <div className="ml-azioni-email">
            <AzioniEmail html={e?.html} contesto={{ oggetto: e?.oggetto, preheader: e?.preheader, ...p.contestoProva }} />
          </div>
        </>
      )
      break
    }
    case 'ATTESA': {
      const unita = (c.unita as UnitaAttesa) ?? 'GIORNI'
      corpo = (
        <>
          <Campo etichetta="Quanto aspettare" id={`${id}-q`}>
            <div className="ml-au-riga">
              <Numero id={`${id}-q`} valore={c.quantita} min={1} max={999} onChange={(v) => set('quantita', v, 'quantita')} />
              <div className="ml-seg" role="radiogroup" aria-label="Unità di tempo">
                {(['MINUTI', 'ORE', 'GIORNI'] as UnitaAttesa[]).map((u) => (
                  <button key={u} type="button" role="radio" aria-checked={unita === u} data-active={unita === u ? '' : undefined} onClick={() => set('unita', u)}>
                    {u === 'MINUTI' ? 'Minuti' : u === 'ORE' ? 'Ore' : 'Giorni'}
                  </button>
                ))}
              </div>
            </div>
          </Campo>
          <div className="ml-au-chips">
            {ATTESE_RAPIDE.map((a) => (
              <button key={a.testo} type="button" className="ml-chip" aria-pressed={numeroDa(c.quantita) === a.q && unita === a.u} onClick={() => p.onConfig({ ...c, quantita: a.q, unita: a.u })}>
                {a.testo}
              </button>
            ))}
          </div>
          <p className="ml-au-frase">Il contatto aspetta <b>{descriviAttesa(c)}</b>, poi passa al passo successivo.</p>
        </>
      )
      break
    }
    case 'ATTESA_FINO_A': {
      const giorni = Array.isArray(c.giorni) ? (c.giorni as number[]) : []
      const commuta = (n: number) => set('giorni', giorni.includes(n) ? giorni.filter((g) => g !== n) : [...giorni, n].sort())
      corpo = (
        <>
          <Campo etichetta="In quali giorni">
            <div className="ml-au-giorni" role="group" aria-label="Giorni della settimana">
              {GIORNI.map((g) => (
                <button key={g.n} type="button" aria-pressed={giorni.includes(g.n)} aria-label={g.nome} title={g.nome} onClick={() => commuta(g.n)}>
                  {g.breve}
                </button>
              ))}
            </div>
          </Campo>
          <div className="ml-au-chips">
            <button type="button" className="ml-chip" onClick={() => set('giorni', [1, 2, 3, 4, 5])}>Feriali</button>
            <button type="button" className="ml-chip" onClick={() => set('giorni', [6, 7])}>Fine settimana</button>
            <button type="button" className="ml-chip" onClick={() => set('giorni', [1, 2, 3, 4, 5, 6, 7])}>Tutti</button>
          </div>
          <Campo etichetta="A che ora" id={`${id}-h`}>
            <input id={`${id}-h`} className="ml-input ml-au-ora" type="time" step={900} value={String(c.ora ?? '09:00')} onChange={(e) => set('ora', e.target.value, 'ora')} />
          </Campo>
          <p className="ml-au-frase">Il contatto aspetta <b>{descriviGiorni(giorni)}</b> alle <b>{String(c.ora ?? '')}</b>, poi prosegue.</p>
        </>
      )
      break
    }
    case 'CONDIZIONE':
      corpo = <CorpoCondizione {...p} />
      break
    case 'AGGIUNGI_TAG':
    case 'RIMUOVI_TAG':
      corpo = (
        <Campo etichetta={p.nodo.tipo === 'AGGIUNGI_TAG' ? 'Tag da aggiungere' : 'Tag da togliere'} id={`${id}-t`}>
          <SceltaTag id={`${id}-t`} valore={numeroDa(c.tagId)} onChange={(v) => set('tagId', v)} contesto={p.contesto} />
        </Campo>
      )
      break
    case 'NOTIFICA_STAFF':
      // In EdoDoc il passo crea un task per il dottore (tipo NOTIFICA_STAFF lato API, config {testo} = titolo del task)
      corpo = (
        <Campo etichetta="Titolo del task" id={`${id}-m`} aiuto="Compare nella pagina Task, collegato al paziente del contatto.">
          <textarea id={`${id}-m`} className="ml-textarea" rows={3} maxLength={500} value={String(c.testo ?? '')} placeholder="Es. Ha aperto due email ma non ha prenotato: richiamalo" onChange={(e) => set('testo', e.target.value, 'testo')} />
        </Campo>
      )
      break
    case 'FINE':
      corpo = <p className="ml-au-frase">Qui il contatto completa l’automazione. Se il percorso finisce senza questo passo, è lo stesso: serve solo a renderlo evidente.</p>
      break
    default:
  }

  return (
    <div className="ml-au-pannello-dentro">
      <TestaPannello
        icona={<Icona className="size-4" />}
        tipo={meta.etichetta}
        numero={p.numero}
        tono={p.nodo.tipo}
        titolo={meta.descrizione}
        onChiudi={p.onChiudi}
        azioni={
          <button type="button" className="ml-btn ml-btn--ghost ml-btn--icona ml-au-elimina" onClick={p.onElimina} aria-label="Elimina questo passo" title="Elimina (Canc)">
            <Trash2 className="size-4" />
          </button>
        }
      />
      <div className="ml-au-pannello-corpo">
        <Problemi problemi={p.problemi} />
        {corpo}
      </div>
    </div>
  )
}

function CorpoCondizione(p: PropsNodo) {
  const c = p.nodo.config ?? {}
  const tipo = tipoCondizione(c) ?? 'APERTO'
  const id = useId()
  const sopra = useMemo(() => emailAMonte(p.grafo, p.nodo.id), [p.grafo, p.nodo.id])
  const rif = stringaDa(tipo === 'CLICCATO' ? c.haCliccato : c.haAperto)
  const scegli = (t: 'APERTO' | 'CLICCATO' | 'REGOLA') => {
    if (t === 'REGOLA') p.onConfig({ regole: c.regole ?? regoleVuote() })
    else {
      const email = rif ?? sopra[sopra.length - 1]?.id ?? null
      p.onConfig(t === 'APERTO' ? { haAperto: email } : { haCliccato: email })
    }
  }
  const haSi = p.grafo.archi.some((a) => a.da === p.nodo.id && a.ramo === 'SI')
  const haNo = p.grafo.archi.some((a) => a.da === p.nodo.id && a.ramo === 'NO')
  return (
    <>
      <Campo etichetta="Che cosa controllare">
        <div className="ml-seg ml-au-seg-pieno" role="radiogroup" aria-label="Tipo di condizione">
          {([
            ['APERTO', 'Ha aperto', MailOpen],
            ['CLICCATO', 'Ha cliccato', MousePointerClick],
            ['REGOLA', 'Dati', Users],
          ] as const).map(([t, testo, I]) => (
            <button key={t} type="button" role="radio" aria-checked={tipo === t} data-active={tipo === t ? '' : undefined} onClick={() => scegli(t)} title={t === 'REGOLA' ? 'Una regola sui dati del contatto (visite, tag, dolore…)' : undefined}>
              <I className="size-3.5" aria-hidden /> {testo}
            </button>
          ))}
        </div>
      </Campo>
      {tipo === 'REGOLA' ? (
        <div className="ml-au-regole">
          <MailingCostruttoreRegole
            valore={(c.regole as MailingGruppoRegole) ?? regoleVuote()}
            onChange={(r) => p.onConfig({ regole: r }, 'regole')}
            catalogo={p.contesto.catalogo}
            compatto
          />
        </div>
      ) : sopra.length ? (
        <Campo etichetta={tipo === 'APERTO' ? 'Ha aperto l’email' : 'Ha cliccato un link dell’email'} id={`${id}-e`} aiuto="Si controlla nel momento in cui il contatto arriva qui: lascia un’attesa prima, così ha tempo di leggerla.">
          <select id={`${id}-e`} className="ml-select" value={rif ?? ''} onChange={(e) => p.onConfig(tipo === 'APERTO' ? { haAperto: e.target.value || null } : { haCliccato: e.target.value || null })}>
            <option value="">Scegli l’email…</option>
            {sopra.map((n) => (
              <option key={n.id} value={n.id}>
                Passo {p.numeri.get(n.id)} · {p.oggettiEmail.get(n.id) || 'Email senza oggetto'}
              </option>
            ))}
          </select>
        </Campo>
      ) : (
        <div className="ml-avviso" data-tono="info">Prima di questa condizione non c’è nessuna email: aggiungine una sopra, oppure controlla i dati del contatto.</div>
      )}
      <div className="ml-au-rami">
        <div className="ml-au-ramo-riga" data-ramo="SI">
          <span className="ml-au-ramo" data-ramo="SI">Sì</span>
          {haSi ? <span>prosegue a sinistra</span> : (
            <button type="button" className="ml-link" onClick={() => p.onAggiungiRamo('SI')}>Aggiungi un passo sul ramo Sì</button>
          )}
        </div>
        <div className="ml-au-ramo-riga" data-ramo="NO">
          <span className="ml-au-ramo" data-ramo="NO">No</span>
          {haNo ? <span>prosegue a destra</span> : (
            <button type="button" className="ml-link" onClick={() => p.onAggiungiRamo('NO')}>Aggiungi un passo sul ramo No</button>
          )}
        </div>
      </div>
    </>
  )
}

// ───────────────────────── Pannello trigger e impostazioni ─────────────────────────

const DESCRIZIONI_TRIGGER: Record<MailingTipoTrigger, string> = {
  NUOVO_LEAD: 'Arriva un nuovo lead (YouTube, Instagram, masterclass, sito…)',
  CONOSCITIVA_PRENOTATA: 'Qualcuno prenota la chiamata conoscitiva',
  CONOSCITIVA_SVOLTA: 'La chiamata conoscitiva è stata fatta',
  ESITO_CONOSCITIVA: 'Viene registrato l’esito della chiamata',
  PRIMA_VISITA_PRENOTATA: 'Qualcuno prenota la prima visita',
  PRIMA_VISITA_EFFETTUATA: 'Un paziente ha fatto la prima visita',
  VISITA_EFFETTUATA: 'Dopo una visita (anche la 2ª, la 5ª…)',
  ACQUISTO: 'Un paziente acquista un percorso (Metodo Bussola, rinnovo, mantenimento)',
  TAG_AGGIUNTO: 'Un contatto riceve un tag',
  COMPLEANNO: 'Si avvicina il compleanno',
  INATTIVO_DA_GIORNI: 'Un paziente non viene da un po’',
  ENTRATA_SEGMENTO: 'Un contatto entra in un segmento (controllo ogni ora)',
  ISCRIZIONE: 'Qualcuno si iscrive alla newsletter',
  MANUALE: 'Lo iscrivi tu, a mano',
}

const TIPI_TRIGGER = Object.keys(ETICHETTE_TRIGGER) as MailingTipoTrigger[]

const USCITE: { tipo: MailingTipoTrigger | ''; testo: string }[] = [
  { tipo: '', testo: 'Mai: arriva fino in fondo' },
  { tipo: 'CONOSCITIVA_PRENOTATA', testo: 'Prenota la chiamata conoscitiva' },
  { tipo: 'PRIMA_VISITA_PRENOTATA', testo: 'Prenota la prima visita' },
  { tipo: TIPO_USCITA_VISITA_PRENOTATA as MailingTipoTrigger, testo: 'Prenota una visita' },
  { tipo: 'PRIMA_VISITA_EFFETTUATA', testo: 'Fa la prima visita' },
  { tipo: 'VISITA_EFFETTUATA', testo: 'Fa una visita' },
  { tipo: 'ACQUISTO', testo: 'Acquista un percorso' },
  { tipo: 'TAG_AGGIUNTO', testo: 'Riceve un tag' },
  { tipo: 'ENTRATA_SEGMENTO', testo: 'Entra in un segmento' },
]

export type ImpostazioniBozza = {
  trigger: MailingTrigger
  uscita: MailingTrigger | null
  rientroConsentito: boolean
  soloOrariLavorativi: boolean
  mittenteId: number | null
  categoriaId: number | null
  descrizione: string | null
}

function ParametriTrigger({ trigger, onChange, contesto, perUscita }: { trigger: MailingTrigger; onChange: (t: MailingTrigger, unisci?: string) => void; contesto: ContestoBuilder; perUscita?: boolean }) {
  const p = trigger.parametri ?? {}
  const id = useId()
  const set = (k: string, v: unknown, unisci?: string) => onChange({ ...trigger, parametri: { ...p, [k]: v } }, unisci)
  switch (trigger.tipo) {
    case 'NUOVO_LEAD':
      return (
        <div className="ml-au-griglia2">
          <Campo etichetta="Da quali fonti" aiuto="Nessuna scelta = qualsiasi fonte.">
            <SceltaFonti valore={p.fonte} onChange={(v) => set('fonte', v)} contesto={contesto} />
          </Campo>
        </div>
      )
    case 'ESITO_CONOSCITIVA':
      return (
        <Campo etichetta="Con quale esito" id={`${id}-e`}>
          <SceltaFissa id={`${id}-e`} opzioni={ETICHETTE_ESITO_CONOSCITIVA} valore={p.esito} onChange={(v) => set('esito', v)} vuoto="Qualsiasi esito" />
        </Campo>
      )
    case 'VISITA_EFFETTUATA':
      return perUscita ? null : (
        <Campo etichetta="Quale visita" id={`${id}-n`} aiuto="Lascia vuoto per partire dopo ogni visita.">
          <Numero id={`${id}-n`} valore={p.numero} min={1} max={100} placeholder="Ogni visita" onChange={(v) => set('numero', v, 'numero')} />
        </Campo>
      )
    case 'ACQUISTO':
      return (
        <Campo etichetta="Quale percorso" id={`${id}-s`}>
          <SceltaFissa id={`${id}-s`} opzioni={ETICHETTE_TIPO_PERCORSO} valore={p.tipoPercorso} onChange={(v) => set('tipoPercorso', v)} vuoto="Qualsiasi percorso" />
        </Campo>
      )
    case 'TAG_AGGIUNTO':
      return (
        <Campo etichetta="Quale tag" id={`${id}-t`}>
          <SceltaTag id={`${id}-t`} valore={numeroDa(p.tagId)} onChange={(v) => set('tagId', v)} contesto={contesto} />
        </Campo>
      )
    case 'COMPLEANNO':
      return (
        <Campo etichetta="Quanti giorni prima" id={`${id}-g`} aiuto="0 = il giorno stesso. Si controlla ogni mattina alle 7.">
          <Numero id={`${id}-g`} valore={p.giorniPrima ?? 0} min={0} max={60} onChange={(v) => set('giorniPrima', v ?? 0, 'giorni')} />
        </Campo>
      )
    case 'INATTIVO_DA_GIORNI': {
      const tutti = p.includiGiaInattivi === true
      return (
        <>
          <Campo etichetta="Giorni senza visite" id={`${id}-i`} aiuto="Si controlla una volta al giorno.">
            <Numero id={`${id}-i`} valore={p.giorni} min={1} max={1000} onChange={(v) => set('giorni', v, 'giorni')} />
          </Campo>
          <div className="ml-au-chips">
            {[60, 90, 180, 365].map((g) => (
              <button key={g} type="button" className="ml-chip" aria-pressed={numeroDa(p.giorni) === g} onClick={() => set('giorni', g)}>
                {g === 365 ? '1 anno' : `${g} giorni`}
              </button>
            ))}
          </div>
          {perUscita ? null : (
            <>
              <div className="ml-au-interruttore">
                <div className="min-w-0">
                  <div className="ml-au-interruttore-nome">Includi anche chi è già inattivo</div>
                  <div className="ml-campo-aiuto">
                    {tutti
                      ? 'Entrano anche i pazienti che hanno già superato la soglia, a scaglioni per non inviare tutto in un giorno.'
                      : 'Spento: entra solo chi supera la soglia da oggi in poi.'}
                  </div>
                </div>
                <Interruttore
                  attivo={tutti}
                  onChange={(v) => onChange({ ...trigger, parametri: { ...p, includiGiaInattivi: v, maxIniziali: v ? numeroDa(p.maxIniziali) ?? 300 : p.maxIniziali } })}
                  etichetta="Includi anche chi è già inattivo"
                />
              </div>
              {tutti ? (
                <Campo etichetta="Quanti al massimo al giorno" id={`${id}-mx`} aiuto="Tra quelli già inattivi: gli altri entrano nei giorni successivi.">
                  <Numero id={`${id}-mx`} valore={p.maxIniziali ?? 300} min={1} max={5000} onChange={(v) => set('maxIniziali', v, 'maxIniziali')} />
                </Campo>
              ) : null}
            </>
          )}
        </>
      )
    }
    case 'ENTRATA_SEGMENTO':
      return (
        <Campo etichetta="Quale segmento" id={`${id}-sg`}>
          <select id={`${id}-sg`} className="ml-select" value={numeroDa(p.segmentoId) ?? ''} onChange={(e) => set('segmentoId', e.target.value ? Number(e.target.value) : null)}>
            <option value="">Scegli un segmento…</option>
            {contesto.segmenti.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
                {s.ultimoConteggio != null ? ` (${formatNumero(s.ultimoConteggio)})` : ''}
              </option>
            ))}
          </select>
        </Campo>
      )
    default:
      return null
  }
}

type PropsTrigger = {
  valori: ImpostazioniBozza
  problemi: ProblemaGrafo[]
  contesto: ContestoBuilder
  onChange: (v: Partial<ImpostazioniBozza>, unisci?: string) => void
  onChiudi: () => void
}

export function PannelloTrigger({ valori, problemi, contesto, onChange, onChiudi }: PropsTrigger) {
  const [scegli, setScegli] = useState(false)
  const id = useId()
  const tipo = valori.trigger?.tipo ?? null
  const Icona = tipo ? ICONA_TRIGGER[tipo] : Zap
  return (
    <div className="ml-au-pannello-dentro">
      <TestaPannello icona={<Zap className="size-4" />} tipo="Inizio del percorso" tono="TRIGGER" titolo="Chi entra, chi esce, come si invia" onChiudi={onChiudi} />
      <div className="ml-au-pannello-corpo">
        <Problemi problemi={problemi} />
        <div className="ml-au-frase-grande">
          <Icona className="size-5 shrink-0" aria-hidden />
          <span>{descriviTrigger(valori.trigger, contesto)}</span>
        </div>

        <Sezione titolo="Chi entra" icona={<Zap className="size-4" aria-hidden />}>
          {scegli || !tipo ? (
            <div className="ml-au-trigger-scelte" role="radiogroup" aria-label="Che cosa fa partire l’automazione">
              {TIPI_TRIGGER.map((t) => {
                const I = ICONA_TRIGGER[t]
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={tipo === t}
                    className="ml-au-trigger-scelta"
                    onClick={() => {
                      onChange({ trigger: { tipo: t, parametri: t === 'COMPLEANNO' ? { giorniPrima: 0 } : t === 'INATTIVO_DA_GIORNI' ? { giorni: 180, includiGiaInattivi: false } : {} } })
                      setScegli(false)
                    }}
                  >
                    <I className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0">
                      <span className="ml-au-trigger-scelta-nome">{ETICHETTE_TRIGGER[t]}</span>
                      <span className="ml-au-trigger-scelta-desc">{DESCRIZIONI_TRIGGER[t]}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <button type="button" className="ml-au-trigger-scelta" aria-checked="true" onClick={() => setScegli(true)}>
              <Icona className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="ml-au-trigger-scelta-nome">{ETICHETTE_TRIGGER[tipo]}</span>
                <span className="ml-au-trigger-scelta-desc">{DESCRIZIONI_TRIGGER[tipo]}</span>
              </span>
              <span className="ml-au-cambia">Cambia <ChevronDown className="size-3.5" aria-hidden /></span>
            </button>
          )}
          {tipo ? <ParametriTrigger trigger={valori.trigger} onChange={(t, u) => onChange({ trigger: t }, u)} contesto={contesto} /> : null}
        </Sezione>

        <Sezione titolo="Chi esce prima" icona={<LogOut className="size-4" aria-hidden />}>
          <Campo etichetta="Il contatto esce dal percorso appena…" id={`${id}-u`}>
            <select
              id={`${id}-u`}
              className="ml-select"
              value={valori.uscita?.tipo ?? ''}
              onChange={(e) => onChange({ uscita: e.target.value ? { tipo: e.target.value as MailingTipoTrigger, parametri: {} } : null })}
            >
              {USCITE.map((u) => (
                <option key={u.tipo} value={u.tipo}>{u.testo}</option>
              ))}
            </select>
          </Campo>
          {valori.uscita ? <ParametriTrigger trigger={valori.uscita} onChange={(t, u) => onChange({ uscita: t }, u)} contesto={contesto} perUscita /> : null}
          <p className="ml-au-frase">
            <b>{descriviUscita(valori.uscita, contesto)}.</b> Chi si disiscrive o ha un indirizzo che rimbalza esce sempre, in qualsiasi punto.
          </p>
        </Sezione>

        <Sezione titolo="Come si invia" icona={<Mail className="size-4" aria-hidden />}>
          <Campo etichetta="Mittente" id={`${id}-m`}>
            <select id={`${id}-m`} className="ml-select" value={valori.mittenteId ?? ''} onChange={(e) => onChange({ mittenteId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Mittente predefinito</option>
              {contesto.mittenti.filter((m) => m.attivo).map((m) => (
                <option key={m.id} value={m.id}>{m.nomeVisualizzato} · {m.email}</option>
              ))}
            </select>
          </Campo>
          <Campo etichetta="Categoria" id={`${id}-c`} aiuto="Chi ha escluso questa categoria dal centro preferenze non riceve queste email.">
            <select id={`${id}-c`} className="ml-select" value={valori.categoriaId ?? ''} onChange={(e) => onChange({ categoriaId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Nessuna categoria</option>
              {contesto.categorie.filter((c) => c.attiva).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </Campo>
          <div className="ml-au-interruttore">
            <div className="min-w-0">
              <div className="ml-au-interruttore-nome">Solo in orario di lavoro</div>
              <div className="ml-campo-aiuto">Le email partono tra le 8 e le 20: di notte si aspetta la mattina.</div>
            </div>
            <Interruttore attivo={valori.soloOrariLavorativi} onChange={(v) => onChange({ soloOrariLavorativi: v })} etichetta="Solo in orario di lavoro" />
          </div>
          <div className="ml-au-interruttore">
            <div className="min-w-0">
              <div className="ml-au-interruttore-nome">Può rientrare</div>
              <div className="ml-campo-aiuto">Se succede di nuovo (es. un secondo acquisto), ricomincia il percorso da capo.</div>
            </div>
            <Interruttore attivo={valori.rientroConsentito} onChange={(v) => onChange({ rientroConsentito: v })} etichetta="Può rientrare" />
          </div>
        </Sezione>

        <Sezione titolo="Note per il team">
          <textarea
            className="ml-textarea"
            rows={3}
            maxLength={500}
            aria-label="Note per il team"
            value={valori.descrizione ?? ''}
            placeholder="A cosa serve questa automazione? (visibile solo a voi)"
            onChange={(e) => onChange({ descrizione: e.target.value || null }, 'descrizione')}
          />
        </Sezione>
      </div>
    </div>
  )
}

// ───────────────────────── Risultati ─────────────────────────

export type VoceLive = { id: number; testo: string; quando: string; tipo: string }

export function GraficoIngressi({ report, altezza = 160 }: { report: MailingReportAutomazione; altezza?: number }) {
  const colori = useColoriMailing()
  const dati = useMemo(
    () =>
      (report.ingressiGiornalieri ?? []).map((p) => ({
        giorno: p.giorno,
        valore: p.valori.ingressi ?? p.valori.entrati ?? Object.values(p.valori).reduce((t, v) => t + (Number(v) || 0), 0),
      })),
    [report.ingressiGiornalieri],
  )
  const idGrad = useId().replace(/:/g, '')
  if (!dati.length) return <div className="ml-au-grafico-vuoto">Nessun ingresso negli ultimi giorni</div>
  return (
    <div style={{ height: altezza }} role="img" aria-label={`Ingressi giornalieri: ${dati.reduce((t, d) => t + d.valore, 0)} in ${dati.length} giorni`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={dati} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id={idGrad} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colori.s1} stopOpacity={0.35} />
              <stop offset="100%" stopColor={colori.s1} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={colori.griglia} />
          <XAxis dataKey="giorno" tickFormatter={(g: string) => dataBreve(g).replace(/ \d{4}$/, '')} tick={{ fill: colori.testo, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fill: colori.testo, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            cursor={{ stroke: colori.griglia }}
            contentStyle={{ background: colori.superficie, border: `1px solid ${colori.griglia}`, borderRadius: 10, fontSize: 12 }}
            labelFormatter={(g) => dataBreve(String(g))}
            formatter={(v) => [formatNumero(Number(v)), 'Ingressi']}
          />
          <Area type="monotone" dataKey="valore" stroke={colori.s1} strokeWidth={2} fill={`url(#${idGrad})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function Kpi({ etichetta, valore, icona, tono }: { etichetta: string; valore: ReactNode; icona: ReactNode; tono?: string }) {
  return (
    <div className="ml-au-kpi" data-tono={tono}>
      <span className="ml-au-kpi-icona" aria-hidden>{icona}</span>
      <span className="ml-au-kpi-valore">{valore}</span>
      <span className="ml-au-kpi-etichetta">{etichetta}</span>
    </div>
  )
}

export function PannelloRisultati({ report, live, caricamento, onChiudi, adesso }: { report: MailingReportAutomazione | null; live: VoceLive[]; caricamento: boolean; onChiudi: () => void; adesso: number }) {
  const m = report?.metriche
  return (
    <div className="ml-au-pannello-dentro">
      <TestaPannello icona={<Eye className="size-4" />} tipo="Risultati" tono="REPORT" titolo="Chi è passato di qui, chi c’è adesso" onChiudi={onChiudi} />
      <div className="ml-au-pannello-corpo">
        {!report ? (
          <div className="ml-au-caricamento">{caricamento ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null} Carico i risultati…</div>
        ) : (
          <>
            <div className="ml-au-kpi-griglia">
              <Kpi etichetta="nel percorso ora" valore={formatNumero(report.attivi)} icona={<span className="ml-au-pallino-vivo" />} tono="vivo" />
              <Kpi etichetta="arrivati in fondo" valore={formatNumero(report.completati)} icona={<CheckCircle2 className="size-4" />} tono="ok" />
              <Kpi etichetta="usciti prima" valore={formatNumero(report.usciti)} icona={<UserMinus className="size-4" />} />
              <Kpi etichetta="con errori" valore={formatNumero(report.errori)} icona={<AlertTriangle className="size-4" />} tono={report.errori ? 'errore' : undefined} />
            </div>
            <Sezione titolo="Ingressi al giorno">
              <GraficoIngressi report={report} />
            </Sezione>
            {m ? (
              <Sezione titolo="Email del percorso">
                <dl className="ml-au-metriche">
                  <div><dt>Inviate</dt><dd>{formatNumero(m.inviati)}</dd></div>
                  <div><dt>Aperte</dt><dd>{formatPercentuale(m.tassoApertura)}</dd></div>
                  <div><dt>Cliccate</dt><dd>{formatPercentuale(m.tassoClick)}</dd></div>
                  <div><dt>Disiscritti</dt><dd>{formatNumero(m.disiscrizioni)}</dd></div>
                  <div><dt>Visite generate</dt><dd>{formatNumero(m.visiteGenerate)}</dd></div>
                  <div><dt>Fatturato</dt><dd>{formatEuro(m.fatturatoGenerato)}</dd></div>
                </dl>
              </Sezione>
            ) : null}
          </>
        )}
        <Sezione titolo="In diretta">
          {live.length ? (
            <ul className="ml-au-live">
              {live.map((v) => (
                <li key={v.id} data-tipo={v.tipo}>
                  <span className="ml-au-live-punto" aria-hidden />
                  <span className="min-w-0 flex-1">{v.testo}</span>
                  <time className="ml-muto">{tempoFa(v.quando, adesso)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ml-campo-aiuto">Qui compaiono aperture e click mentre succedono.</p>
          )}
        </Sezione>
      </div>
    </div>
  )
}

export function PannelloRisultatiNodo({ nodo, numero, r, titolo, onChiudi }: { nodo: MailingNodo; numero: number; r: MailingReportNodo | null; titolo: string; onChiudi: () => void }) {
  const meta = META_NODO[nodo.tipo]
  const Icona = meta.icona
  const m = r?.metriche
  return (
    <div className="ml-au-pannello-dentro">
      <TestaPannello icona={<Icona className="size-4" />} tipo={meta.etichetta} numero={numero} tono={nodo.tipo} titolo={titolo} onChiudi={onChiudi} />
      <div className="ml-au-pannello-corpo">
        <div className="ml-au-kpi-griglia">
          <Kpi etichetta="passati di qui" valore={formatNumero(r?.entrati ?? 0)} icona={<Users className="size-4" />} />
          <Kpi etichetta="qui adesso" valore={formatNumero(r?.inAttesa ?? 0)} icona={<span className="ml-au-pallino-vivo" />} tono="vivo" />
          <Kpi etichetta="usciti qui" valore={formatNumero(r?.usciti ?? 0)} icona={<UserMinus className="size-4" />} />
        </div>
        {m ? (
          <dl className="ml-au-metriche">
            <div><dt>Inviate</dt><dd>{formatNumero(m.inviati)}</dd></div>
            <div><dt>Aperte</dt><dd>{formatPercentuale(m.tassoApertura)}</dd></div>
            <div><dt>Cliccate</dt><dd>{formatPercentuale(m.tassoClick)}</dd></div>
            <div><dt>Click su aperte</dt><dd>{formatPercentuale(m.tassoClickSuAperture)}</dd></div>
            <div><dt>Disiscritti</dt><dd>{formatNumero(m.disiscrizioni)}</dd></div>
            <div><dt>Visite generate</dt><dd>{formatNumero(m.visiteGenerate)}</dd></div>
          </dl>
        ) : null}
        <p className="ml-campo-aiuto">Per modificare questo passo spegni «Mostra risultati».</p>
      </div>
    </div>
  )
}

