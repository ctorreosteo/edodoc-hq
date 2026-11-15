import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarHeart, Loader2, MailOpen, MoreHorizontal, MousePointerClick, Pencil, Plus, RefreshCw, Stethoscope, Trash2, Users, Workflow, Zap } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/lib/toast'
import {
  mailingService,
  messaggioErroreMailing,
  type MailingAutomazioneRiga,
  type MailingModelloAutomazione,
  type MailingStato,
  type MailingStatoAutomazione,
} from '@/services/mailing-service'
import { autoLayout, descriviDurata, descriviTrigger, durataPercorso, type ContestoDescrizioni } from '@/lib/mailing-grafo'
import { ConfermaMailing } from './mailing-dialog'
import { Interruttore, Scheletro, Vuoto } from './mailing-ui'
import { formatCompatto, formatNumero, formatPercentuale, tempoFa, useAdesso, useNumeroAnimato } from './mailing-utils'
import { ICONA_TRIGGER, iconaModello, tintaModello } from './mailing-automazioni-meta'
import { MiniGrafo } from './mailing-automazioni-nodi'
import { BuilderAutomazione } from './mailing-automazioni-builder'
import '@/style/lux-mailing.css'
import '@/style/lux-mailing-automazioni.css'

/*
  Scheda Automazioni: elenco delle automazioni (si aggiorna ogni minuto),
  galleria dei modelli pronti, builder a tutto schermo (?tab=automazioni&automazione=ID, così il "indietro"
  del browser lo chiude e il link si può condividere).
*/

type Filtro = 'TUTTE' | MailingStatoAutomazione
const FILTRI: { id: Filtro; testo: string }[] = [
  { id: 'TUTTE', testo: 'Tutte' },
  { id: 'ATTIVA', testo: 'Attive' },
  { id: 'IN_PAUSA', testo: 'In pausa' },
  { id: 'BOZZA', testo: 'Bozze' },
]

const STATO_ETICHETTA: Record<MailingStatoAutomazione, string> = { BOZZA: 'Bozza', ATTIVA: 'Attiva', IN_PAUSA: 'In pausa', ARCHIVIATA: 'Archiviata' }
const STATO_TONO: Record<MailingStatoAutomazione, string> = { BOZZA: 'neutro', ATTIVA: 'ok', IN_PAUSA: 'avviso', ARCHIVIATA: 'neutro' }
const POLLING_MS = 60_000
const PARAM = 'automazione'

export function MailingAutomazioniTab({ stato }: { stato: MailingStato }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const aperta = Number(searchParams.get(PARAM)) || null
  const adesso = useAdesso()

  const [righe, setRighe] = useState<MailingAutomazioneRiga[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [modelli, setModelli] = useState<MailingModelloAutomazione[] | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('TUTTE')
  const [creando, setCreando] = useState<string | null>(null)
  const [serie, setSerie] = useState<Map<number, number[]>>(new Map())
  const [cambioStato, setCambioStato] = useState<MailingAutomazioneRiga | null>(null)
  const [daEliminare, setDaEliminare] = useState<MailingAutomazioneRiga | null>(null)

  const apri = useCallback(
    (id: number) => {
      setSearchParams((p) => {
        const n = new URLSearchParams(p)
        n.set(PARAM, String(id))
        return n
      })
    },
    [setSearchParams],
  )

  const carica = useCallback(async (silenziosa = false) => {
    try {
      const r = await mailingService.automazioni()
      setRighe(r)
      setErrore(null)
    } catch (err) {
      if (!silenziosa) setErrore(messaggioErroreMailing(err, 'Automazioni non disponibili'))
    }
  }, [])

  const chiudi = useCallback(() => {
    setSearchParams((p) => {
      const n = new URLSearchParams(p)
      n.delete(PARAM)
      return n
    })
    void carica(true)
  }, [setSearchParams, carica])

  useEffect(() => {
    void carica()
    mailingService
      .modelliAutomazione()
      .then(setModelli)
      .catch(() => setModelli([]))
  }, [carica])

  useEffect(() => {
    if (aperta) return
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carica(true)
    }, POLLING_MS)
    return () => window.clearInterval(t)
  }, [aperta, carica])

  // Sparkline: ingressi giornalieri dal report (il riepilogo non li ha), solo per le automazioni partite.
  const chiesti = useRef(new Set<number>())
  useEffect(() => {
    if (!righe) return
    const coda = righe.filter((r) => (r.stato === 'ATTIVA' || r.stato === 'IN_PAUSA') && !chiesti.current.has(r.id)).slice(0, 12)
    let vivo = true
    const lavora = async () => {
      while (coda.length && vivo) {
        const r = coda.shift()!
        if (chiesti.current.has(r.id)) continue
        chiesti.current.add(r.id)
        try {
          const rep = await mailingService.reportAutomazione(r.id)
          const valori = (rep.ingressiGiornalieri ?? []).map((p) => p.valori.ingressi ?? p.valori.entrati ?? Object.values(p.valori).reduce((t, v) => t + (Number(v) || 0), 0))
          setSerie((m) => new Map(m).set(r.id, valori))
        } catch {
          chiesti.current.delete(r.id) // si riprova al prossimo aggiornamento dell'elenco
        }
      }
    }
    void Promise.all([lavora(), lavora()])
    return () => {
      vivo = false
    }
  }, [righe])

  const creaDaModello = async (m: MailingModelloAutomazione | null) => {
    setCreando(m?.chiave ?? 'zero')
    try {
      const a = await mailingService.creaAutomazione(
        m
          ? { nome: m.nome, descrizione: m.descrizione, modello: m.chiave }
          : { nome: 'Nuova automazione', trigger: { tipo: 'NUOVO_LEAD', parametri: {} }, grafo: { nodi: [], archi: [] }, uscita: null, rientroConsentito: false, soloOrariLavorativi: true },
      )
      void carica(true)
      apri(a.id)
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Automazione non creata'))
    } finally {
      setCreando(null)
    }
  }

  const cambia = async () => {
    const r = cambioStato
    if (!r) return
    try {
      const a = r.stato === 'ATTIVA' ? await mailingService.pausaAutomazione(r.id) : await mailingService.attivaAutomazione(r.id)
      setRighe((l) => l?.map((x) => (x.id === r.id ? { ...x, stato: a.stato, attivataIl: a.attivataIl } : x)) ?? l)
      toast.success(a.stato === 'ATTIVA' ? `«${r.nome}» è attiva` : `«${r.nome}» è in pausa`)
      return true
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Non riuscito'), {
        description: r.stato !== 'ATTIVA' ? 'Aprila per vedere che cosa manca.' : undefined,
        action: r.stato !== 'ATTIVA' ? { label: 'Apri', onClick: () => apri(r.id) } : undefined,
      })
      return false
    }
  }

  const elimina = async () => {
    const r = daEliminare
    if (!r) return
    try {
      await mailingService.eliminaAutomazione(r.id)
      setRighe((l) => l?.filter((x) => x.id !== r.id) ?? l)
      toast.success(`«${r.nome}» eliminata`)
      return true
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Automazione non eliminata'))
      return false
    }
  }

  const visibili = useMemo(() => (righe ?? []).filter((r) => r.stato !== 'ARCHIVIATA' && (filtro === 'TUTTE' || r.stato === filtro)), [righe, filtro])
  const conteggi = useMemo(() => {
    const c = new Map<Filtro, number>([['TUTTE', 0]])
    for (const r of righe ?? []) {
      if (r.stato === 'ARCHIVIATA') continue
      c.set('TUTTE', (c.get('TUTTE') ?? 0) + 1)
      c.set(r.stato, (c.get(r.stato) ?? 0) + 1)
    }
    return c
  }, [righe])
  const totali = useMemo(() => {
    const r = righe ?? []
    return {
      inPercorso: r.reduce((t, x) => t + x.attivi, 0),
      attive: r.filter((x) => x.stato === 'ATTIVA').length,
      inviate: r.reduce((t, x) => t + (x.metriche?.inviati ?? 0), 0),
      visite: r.reduce((t, x) => t + (x.metriche?.visiteGenerate ?? 0), 0),
    }
  }, [righe])

  const vuoto = righe !== null && !conteggi.get('TUTTE')

  return (
    <div className="ml-au-scheda">
      {aperta ? <BuilderAutomazione automazioneId={aperta} stato={stato} onChiudi={chiudi} /> : null}

      <div className="ml-au-intestazione">
        <div className="min-w-0">
          <div className="ml-au-titolo-scheda">Automazioni</div>
          <div className="ml-au-sottotitolo-scheda">Percorsi che accompagnano pazienti e lead da soli, un’email alla volta, e si fermano quando prenotano.</div>
        </div>
        <div className="ml-au-intestazione-azioni">
          <button type="button" className="ml-btn ml-btn--ghost ml-btn--icona" onClick={() => void carica()} aria-label="Aggiorna" title="Aggiorna">
            <RefreshCw className="size-4" />
          </button>
          <button type="button" className="ml-btn ml-btn--pieno" onClick={() => void creaDaModello(null)} disabled={!!creando}>
            {creando === 'zero' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />} Nuova automazione
          </button>
        </div>
      </div>

      {righe && !vuoto ? (
        <div className="ml-au-totali">
          <Totale icona={<span className="ml-au-pallino-vivo" />} valore={totali.inPercorso} etichetta="persone nei percorsi ora" vivo />
          <Totale icona={<Zap className="size-4" />} valore={totali.attive} etichetta={totali.attive === 1 ? 'automazione attiva' : 'automazioni attive'} />
          <Totale icona={<MailOpen className="size-4" />} valore={totali.inviate} etichetta="email inviate" />
          <Totale icona={<Stethoscope className="size-4" />} valore={totali.visite} etichetta="visite generate" />
        </div>
      ) : null}

      {errore ? (
        <div className="ml-avviso" data-tono="errore">
          {errore}
          <button type="button" className="ml-link" onClick={() => void carica()}>Riprova</button>
        </div>
      ) : null}

      {righe === null && !errore ? (
        <div className="ml-au-griglia">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="ml-card ml-au-card">
              <Scheletro altezza={22} larghezza="60%" />
              <Scheletro altezza={14} larghezza="85%" className="mt-2" />
              <Scheletro altezza={54} className="mt-5" />
            </div>
          ))}
        </div>
      ) : null}

      {righe && !vuoto ? (
        <section aria-label="Le tue automazioni">
          <div className="ml-seg ml-au-filtri" role="tablist" aria-label="Filtra per stato">
            {FILTRI.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filtro === f.id} data-active={filtro === f.id ? '' : undefined} onClick={() => setFiltro(f.id)}>
                {f.testo}
                <span className="ml-au-filtro-conta">{conteggi.get(f.id) ?? 0}</span>
              </button>
            ))}
          </div>
          {visibili.length ? (
            <div className="ml-au-griglia">
              {visibili.map((r) => (
                <CardAutomazione
                  key={r.id}
                  r={r}
                  serie={serie.get(r.id) ?? null}
                  adesso={adesso}
                  onApri={() => apri(r.id)}
                  onCambiaStato={() => setCambioStato(r)}
                  onElimina={() => setDaEliminare(r)}
                />
              ))}
            </div>
          ) : (
            <div className="ml-au-nessuna">Nessuna automazione {filtro === 'ATTIVA' ? 'attiva' : filtro === 'IN_PAUSA' ? 'in pausa' : 'in bozza'}.</div>
          )}
        </section>
      ) : null}

      {vuoto ? (
        <Vuoto
          icona={<Workflow className="size-7" />}
          titolo="La prima automazione si costruisce in due minuti"
          testo="Scegli un modello qui sotto: è già pronto con le email scritte e le attese giuste. Lo adatti, lo attivi e lavora da solo."
          className="ml-au-vuoto"
        />
      ) : null}

      <section className="ml-au-galleria" aria-labelledby="ml-au-galleria-titolo">
        <div className="ml-au-galleria-testa">
          <div id="ml-au-galleria-titolo" className="ml-au-galleria-titolo">Inizia da un modello</div>
          <div className="ml-au-sottotitolo-scheda">Percorsi pensati per EdoDoc: si aprono già compilati, tu cambi solo quello che vuoi.</div>
        </div>
        <div className="ml-au-modelli">
          <button type="button" className="ml-au-modello ml-au-modello--zero" onClick={() => void creaDaModello(null)} disabled={!!creando}>
            <span className="ml-au-modello-illustrazione" aria-hidden>
              <span className="ml-au-modello-piu">{creando === 'zero' ? <Loader2 className="size-6 animate-spin" /> : <Plus className="size-6" />}</span>
            </span>
            <span className="ml-au-modello-nome">Parti da zero</span>
            <span className="ml-au-modello-desc">Una tela vuota: scegli tu da cosa parte e che cosa succede.</span>
          </button>
          {modelli === null
            ? Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="ml-au-modello" aria-hidden>
                  <Scheletro altezza={128} />
                  <Scheletro altezza={16} larghezza="70%" className="mt-3" />
                  <Scheletro altezza={12} larghezza="90%" className="mt-2" />
                </div>
              ))
            : modelli.map((m) => <CardModello key={m.chiave} m={m} inCorso={creando === m.chiave} disabilitato={!!creando} onUsa={() => void creaDaModello(m)} />)}
        </div>
      </section>

      <ConfermaMailing
        open={!!cambioStato}
        onOpenChange={(v) => !v && setCambioStato(null)}
        titolo={cambioStato?.stato === 'ATTIVA' ? `Mettere in pausa «${cambioStato?.nome}»?` : `Attivare «${cambioStato?.nome}»?`}
        testo={
          cambioStato?.stato === 'ATTIVA'
            ? `Non entra più nessuno e ${cambioStato.attivi ? `le ${formatNumero(cambioStato.attivi)} persone nel percorso restano ferme` : 'chi è nel percorso resta fermo'} finché non la riattivi.`
            : `${cambioStato?.triggerDescrizione ?? ''}: da adesso il contatto entra nel percorso e riceve le email.`
        }
        conferma={cambioStato?.stato === 'ATTIVA' ? 'Metti in pausa' : 'Attiva'}
        onConferma={cambia}
      />
      <ConfermaMailing
        open={!!daEliminare}
        onOpenChange={(v) => !v && setDaEliminare(null)}
        titolo={`Eliminare «${daEliminare?.nome}»?`}
        testo={daEliminare?.attivi ? `${formatNumero(daEliminare.attivi)} persone sono ancora nel percorso e ne usciranno. Le statistiche delle sue email restano nei report.` : 'Non si può annullare. Le statistiche delle sue email restano nei report.'}
        conferma="Elimina"
        pericolo
        onConferma={elimina}
      />
    </div>
  )
}

function Totale({ icona, valore, etichetta, vivo }: { icona: ReactNode; valore: number; etichetta: string; vivo?: boolean }) {
  const v = useNumeroAnimato(valore)
  return (
    <div className="ml-au-totale" data-vivo={vivo ? '' : undefined}>
      <span className="ml-au-totale-icona" aria-hidden>{icona}</span>
      <span className="ml-au-totale-valore">{formatCompatto(v)}</span>
      <span className="ml-au-totale-etichetta">{etichetta}</span>
    </div>
  )
}

function CardAutomazione({
  r,
  serie,
  adesso,
  onApri,
  onCambiaStato,
  onElimina,
}: {
  r: MailingAutomazioneRiga
  serie: number[] | null
  adesso: number
  onApri: () => void
  onCambiaStato: () => void
  onElimina: () => void
}) {
  const Icona = ICONA_TRIGGER[r.triggerTipo] ?? Zap
  const attivi = useNumeroAnimato(r.attivi)
  const m = r.metriche
  return (
    <article className="ml-card ml-au-card" data-stato={r.stato}>
      <div className="ml-au-card-testa">
        <span className="ml-au-card-icona" aria-hidden>
          <Icona className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <button type="button" className="ml-au-card-nome" onClick={onApri}>
            {r.nome}
          </button>
          <div className="ml-au-card-trigger">{r.triggerDescrizione}</div>
        </div>
        <Interruttore attivo={r.stato === 'ATTIVA'} onChange={onCambiaStato} etichetta={r.stato === 'ATTIVA' ? 'Metti in pausa' : 'Attiva'} tono="ok" />
      </div>

      <div className="ml-au-card-numeri">
        <div className="ml-au-card-numero" data-vivo={r.attivi > 0 && r.stato === 'ATTIVA' ? '' : undefined}>
          <span className="ml-au-card-valore">
            {r.attivi > 0 && r.stato === 'ATTIVA' ? <span className="ml-au-pallino-vivo" aria-hidden /> : null}
            {formatCompatto(attivi)}
          </span>
          <span className="ml-au-card-etichetta">nel percorso ora</span>
        </div>
        <div className="ml-au-card-numero">
          <span className="ml-au-card-valore">{formatCompatto(r.completati)}</span>
          <span className="ml-au-card-etichetta">completati</span>
        </div>
        <Sparkline valori={serie} />
      </div>

      <div className="ml-au-card-metriche">
        <span title="Tasso di apertura"><MailOpen className="size-3.5" aria-hidden /> {formatPercentuale(m?.tassoApertura, 0)} <span className="ml-muto">aperte</span></span>
        <span title="Tasso di click"><MousePointerClick className="size-3.5" aria-hidden /> {formatPercentuale(m?.tassoClick, 0)} <span className="ml-muto">click</span></span>
        <span title="Visite prenotate dopo un click"><CalendarHeart className="size-3.5" aria-hidden /> {formatNumero(m?.visiteGenerate ?? 0)} <span className="ml-muto">visite</span></span>
      </div>

      <div className="ml-au-card-piede">
        <span className={`ml-badge ml-badge--${STATO_TONO[r.stato]}`}>{STATO_ETICHETTA[r.stato]}</span>
        <span className="ml-muto ml-au-card-quando">
          <Users className="size-3.5" aria-hidden /> {formatCompatto(r.totaliIscritti)} in tutto
          {r.aggiornatoIl ? ` · modificata ${tempoFa(r.aggiornatoIl, adesso)}` : ''}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="ml-btn ml-btn--ghost ml-btn--icona ml-btn--sm" aria-label={`Altre azioni per ${r.nome}`}>
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" data-vl="" data-vl-page="mailing" className="ml-popover">
            <DropdownMenuItem onSelect={onApri}><Pencil className="size-4" /> Apri e modifica</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onElimina} className="ml-au-voce-pericolo"><Trash2 className="size-4" /> Elimina</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  )
}

function Sparkline({ valori }: { valori: number[] | null }) {
  if (!valori || valori.length < 2) return <span className="ml-au-sparkline ml-au-sparkline--vuota" aria-hidden />
  const L = 120
  const H = 40
  const max = Math.max(1, ...valori)
  const passo = L / (valori.length - 1)
  const punti = valori.map((v, i) => [i * passo, H - 3 - (v / max) * (H - 8)] as const)
  const linea = punti.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const totale = valori.reduce((t, v) => t + v, 0)
  const [ux, uy] = punti[punti.length - 1]
  return (
    <svg className="ml-au-sparkline" viewBox={`0 0 ${L} ${H}`} role="img" aria-label={`${totale} ingressi negli ultimi ${valori.length} giorni`}>
      <path d={`${linea} L${L},${H} L0,${H} Z`} className="ml-au-sparkline-area" />
      <path d={linea} className="ml-au-sparkline-linea" />
      <circle cx={ux} cy={uy} r={2.6} className="ml-au-sparkline-punto" />
    </svg>
  )
}

function CardModello({ m, inCorso, disabilitato, onUsa }: { m: MailingModelloAutomazione; inCorso: boolean; disabilitato: boolean; onUsa: () => void }) {
  const Icona = iconaModello(m.icona, m.chiave)
  const grafo = useMemo(() => {
    const g = { nodi: m.grafo?.nodi ?? [], archi: m.grafo?.archi ?? [] }
    const tutti0 = g.nodi.length > 1 && new Set(g.nodi.map((n) => `${n.x}:${n.y}`)).size < g.nodi.length
    return tutti0 ? autoLayout(g) : g
  }, [m.grafo])
  const nEmail = grafo.nodi.filter((n) => n.tipo === 'EMAIL').length || m.email?.length || 0
  const durata = durataPercorso(grafo)
  const contesto: ContestoDescrizioni = {}
  return (
    <button type="button" className="ml-au-modello" data-tinta={tintaModello(m.icona, m.chiave)} onClick={onUsa} disabled={disabilitato}>
      <span className="ml-au-modello-illustrazione" aria-hidden>
        <MiniGrafo grafo={grafo} className="ml-au-modello-mini" />
        <span className="ml-au-modello-icona">{inCorso ? <Loader2 className="size-5 animate-spin" /> : <Icona className="size-5" />}</span>
      </span>
      <span className="ml-au-modello-nome">{m.nome}</span>
      <span className="ml-au-modello-desc">{m.descrizione}</span>
      <span className="ml-au-modello-chips">
        <span className="ml-chip">{nEmail === 1 ? '1 email' : `${nEmail} email`}</span>
        {durata > 0 ? <span className="ml-chip">in {descriviDurata(durata)}</span> : null}
      </span>
      <span className="ml-au-modello-trigger">
        <Zap className="size-3.5 shrink-0" aria-hidden /> {descriviTrigger(m.trigger, contesto)}
      </span>
      <span className="ml-au-modello-usa">{inCorso ? 'Creo…' : 'Usa questo modello →'}</span>
    </button>
  )
}
