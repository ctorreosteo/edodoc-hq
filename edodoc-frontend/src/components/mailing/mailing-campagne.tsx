import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Copy,
  FileEdit,
  Loader2,
  MoreHorizontal,
  Pause,
  Plus,
  Search,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/lib/toast'
import { mailingService, messaggioErroreMailing, type MailingCampagnaRiga, type MailingStato, type MailingStatoCampagna } from '@/services/mailing-service'
import { usePollingMailing } from './mailing-contesto'
import { BadgeStatoCampagna, Vuoto } from './mailing-ui'
import { ConfermaMailing } from './mailing-dialog'
import { dataOra, formatCompatto, formatEuro, formatNumero, formatPercentuale, tempoFa, useAdesso } from './mailing-utils'
import { haReport, nomeNuovaCampagna, pubblicoVuoto, STATI_ELIMINABILI, STATI_IN_CORSO } from './mailing-campagna-dati'
import { CampagnaWizard } from './mailing-campagna-wizard'
import { CampagnaReport } from './mailing-campagna-report'
import '@/style/lux-mailing.css'
import '@/style/lux-mailing-editor.css'

/*
  Scheda Campagne: elenco per stato (bozze, programmate, in invio con barra di avanzamento aggiornata ogni 10 s,
  inviate con metriche), procedura guidata a tutto schermo per creare/modificare, report dedicato.
  ?campagna=ID apre direttamente la campagna (report se già partita, procedura se bozza); ?nuova=1 ne crea una.
*/

type Filtro = 'tutte' | 'bozze' | 'programmate' | 'incorso' | 'inviate'

const FILTRI: { k: Filtro; l: string; stati: MailingStatoCampagna[] | null }[] = [
  { k: 'tutte', l: 'Tutte', stati: null },
  { k: 'bozze', l: 'Bozze', stati: ['BOZZA'] },
  { k: 'programmate', l: 'Programmate', stati: ['PROGRAMMATA'] },
  { k: 'incorso', l: 'In invio', stati: STATI_IN_CORSO },
  { k: 'inviate', l: 'Inviate', stati: ['INVIATA', 'ANNULLATA'] },
]

type Vista = { tipo: 'elenco' } | { tipo: 'wizard'; id: number } | { tipo: 'report'; id: number }

function IconaStato({ stato }: { stato: MailingStatoCampagna }) {
  const I =
    stato === 'BOZZA' ? FileEdit : stato === 'PROGRAMMATA' ? CalendarClock : stato === 'IN_PAUSA' ? Pause : STATI_IN_CORSO.includes(stato) ? Send : stato === 'ANNULLATA' ? XCircle : CheckCircle2
  return (
    <span className="ml-cp-icona" data-stato={stato} aria-hidden>
      <I />
    </span>
  )
}

function Metrica({ etichetta, valore, sotto }: { etichetta: string; valore: string; sotto?: string }) {
  return (
    <div className="ml-cp-metrica">
      <span className="ml-cp-metrica-v">{valore}</span>
      <span className="ml-cp-metrica-e">{etichetta}</span>
      {sotto ? <span className="ml-cp-metrica-s">{sotto}</span> : null}
    </div>
  )
}

function RigaCampagna({
  c,
  onApri,
  onDuplica,
  onElimina,
  adesso,
}: {
  c: MailingCampagnaRiga
  onApri: () => void
  onDuplica: () => void
  onElimina: () => void
  adesso: number
}) {
  const m = c.metriche
  const inCorso = STATI_IN_CORSO.includes(c.stato)
  const totale = c.destinatariTotali ?? m.destinatari
  const inviati = m.inviati
  const pct = totale ? Math.min(100, (inviati / totale) * 100) : 0
  let destra: React.ReactNode
  if (inCorso) {
    destra = (
      <div className="ml-cp-progresso" aria-label={`Inviati ${inviati} di ${totale}`}>
        <div className="ml-cp-progresso-testa">
          <span>
            <strong>{formatNumero(inviati)}</strong> di {formatNumero(totale)}
          </span>
          <span>{formatPercentuale(pct, 0)}</span>
        </div>
        <div className="ml-barra ml-cp-barra" data-vivo={c.stato !== 'IN_PAUSA' ? '' : undefined}>
          <span className="ml-barra-valore" style={{ width: `${pct}%` }} />
        </div>
        <div className="ml-cp-progresso-piede">
          {c.stato === 'IN_PAUSA' ? 'In pausa' : c.stato === 'TEST_AB' ? 'Test A/B: in attesa del vincitore' : 'Invio in corso'}
          {m.apertureUniche ? ` · ${formatNumero(m.apertureUniche)} aperture` : ''}
        </div>
      </div>
    )
  } else if (c.stato === 'INVIATA') {
    destra = (
      <div className="ml-cp-metriche">
        <Metrica etichetta="Destinatari" valore={formatCompatto(c.destinatariTotali ?? m.inviati)} />
        <Metrica etichetta="Aperture" valore={formatPercentuale(m.tassoApertura)} />
        <Metrica etichetta="Click" valore={formatPercentuale(m.tassoClick)} />
        {c.stato === 'INVIATA' ? (
          <>
            <Metrica etichetta="Visite" valore={formatNumero(m.visiteGenerate)} />
            <Metrica etichetta="Fatturato" valore={m.fatturatoGenerato ? formatEuro(m.fatturatoGenerato) : '—'} />
          </>
        ) : null}
      </div>
    )
  } else if (c.stato === 'PROGRAMMATA') {
    destra = (
      <div className="ml-cp-quando">
        <CalendarClock />
        <div>
          <strong>{dataOra(c.programmataIl)}</strong>
          <span>{tempoFa(c.programmataIl, adesso)}{c.destinatariTotali ? ` · ${formatNumero(c.destinatariTotali)} destinatari` : ''}</span>
        </div>
      </div>
    )
  } else {
    destra = (
      <div className="ml-cp-quando">
        <div>
          <span>Modificata {tempoFa(c.aggiornatoIl, adesso) || 'di recente'}</span>
        </div>
        {c.stato === 'BOZZA' ? (
          <button type="button" className="ml-btn ml-btn--sm" onClick={onApri}>
            Continua
          </button>
        ) : null}
      </div>
    )
  }
  return (
    <div className="ml-cp-riga" data-stato={c.stato}>
      <button type="button" className="ml-cp-riga-apri" onClick={onApri} aria-label={`Apri ${c.nome}`} />
      <IconaStato stato={c.stato} />
      <div className="ml-cp-riga-testi">
        <div className="ml-cp-riga-nome">
          <span>{c.nome}</span>
          <BadgeStatoCampagna stato={c.stato} />
          {c.testAb ? <span className="ml-badge ml-badge--info">A/B</span> : null}
        </div>
        <div className="ml-cp-riga-oggetto">{c.oggetto || <em>Oggetto da scrivere</em>}</div>
        <div className="ml-cp-riga-meta">
          {c.mittente ? <span>{c.mittente}</span> : null}
          {c.invioIniziatoIl ? <span>Inviata {dataOra(c.invioIniziatoIl)}</span> : null}
        </div>
      </div>
      <div className="ml-cp-riga-destra">{destra}</div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="ml-ed-icona-btn ml-cp-riga-menu" aria-label={`Azioni per ${c.nome}`}>
            <MoreHorizontal />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="ml-ed-menu" data-vl="" data-vl-page="mailing">
          <DropdownMenuItem className="ml-ed-menu-voce ml-ed-menu-voce--riga" onSelect={onApri}>
            {haReport(c.stato) ? <BarChart3 /> : <FileEdit />} {haReport(c.stato) ? 'Vedi il report' : 'Modifica'}
          </DropdownMenuItem>
          <DropdownMenuItem className="ml-ed-menu-voce ml-ed-menu-voce--riga" onSelect={onDuplica}>
            <Copy /> Duplica
          </DropdownMenuItem>
          {STATI_ELIMINABILI.includes(c.stato) ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="ml-ed-menu-voce ml-ed-menu-voce--riga ml-ed-menu-voce--pericolo" onSelect={onElimina}>
                <Trash2 /> Elimina
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function MailingCampagneTab({ stato, campagnaIdIniziale }: { stato: MailingStato; campagnaIdIniziale?: number | null }) {
  const [righe, setRighe] = useState<MailingCampagnaRiga[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('tutte')
  const [q, setQ] = useState('')
  const [vista, setVista] = useState<Vista>({ tipo: 'elenco' })
  const [elimina, setElimina] = useState<MailingCampagnaRiga | null>(null)
  const [creando, setCreando] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const adesso = useAdesso()

  const carica = useCallback(() => {
    mailingService
      .campagne()
      .then((r) => {
        setRighe(r)
        setErrore(null)
      })
      .catch((e) => setErrore(messaggioErroreMailing(e, 'Campagne non disponibili')))
  }, [])
  useEffect(carica, [carica])

  // Niente realtime in EdoDoc: con una campagna in invio l'elenco si ricarica ogni 10 s (scheda visibile)
  const qualcosaInInvio = !!righe?.some((r) => STATI_IN_CORSO.includes(r.stato))
  usePollingMailing(qualcosaInInvio && vista.tipo === 'elenco', carica)

  // URL → vista (?campagna=ID, ?nuova=1)
  const impostaUrl = useCallback(
    (id: number | null) =>
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (id) p.set('campagna', String(id))
          else p.delete('campagna')
          p.delete('nuova')
          return p
        },
        { replace: true },
      ),
    [setSearchParams],
  )

  const apri = useCallback(
    async (id: number, statoNoto?: MailingStatoCampagna) => {
      let s = statoNoto
      if (!s) {
        try {
          s = (await mailingService.campagna(id)).stato
        } catch (e) {
          toast.error(messaggioErroreMailing(e, 'Campagna non trovata'))
          impostaUrl(null)
          return
        }
      }
      setVista(haReport(s) ? { tipo: 'report', id } : { tipo: 'wizard', id })
      impostaUrl(id)
    },
    [impostaUrl],
  )

  const nuova = useCallback(async () => {
    if (creando) return
    setCreando(true)
    try {
      const mittenti = await mailingService.mittenti().catch(() => [])
      const predefinito = mittenti.find((m) => m.predefinito && m.attivo) ?? mittenti.find((m) => m.attivo)
      const c = await mailingService.creaCampagna({ nome: nomeNuovaCampagna(), mittenteId: predefinito?.id ?? null, pubblico: pubblicoVuoto(), invioIntelligente: false })
      setVista({ tipo: 'wizard', id: c.id })
      impostaUrl(c.id)
      carica()
    } catch (e) {
      toast.error(messaggioErroreMailing(e, 'Campagna non creata'))
      impostaUrl(null)
    } finally {
      setCreando(false)
    }
  }, [carica, creando, impostaUrl])

  const iniziale = useRef<number | null>(null)
  useEffect(() => {
    if (campagnaIdIniziale && campagnaIdIniziale !== iniziale.current) {
      iniziale.current = campagnaIdIniziale
      if (vista.tipo === 'elenco' || vista.id !== campagnaIdIniziale) void apri(campagnaIdIniziale)
    }
    if (!campagnaIdIniziale) iniziale.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campagnaIdIniziale])
  const nuovaParam = searchParams.get('nuova')
  useEffect(() => {
    if (nuovaParam === '1') void nuova()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nuovaParam])

  const chiudi = () => {
    setVista({ tipo: 'elenco' })
    impostaUrl(null)
    carica()
  }

  const duplica = async (c: { id: number }) => {
    try {
      const copia = await mailingService.duplicaCampagna(c.id)
      toast.success('Campagna duplicata', { description: 'La trovi tra le bozze: aprila per rivederla.' })
      carica()
      return copia
    } catch (e) {
      toast.error(messaggioErroreMailing(e, 'Campagna non duplicata'))
      return null
    }
  }

  const conta = useMemo(() => {
    const out: Record<Filtro, number> = { tutte: 0, bozze: 0, programmate: 0, incorso: 0, inviate: 0 }
    for (const r of righe ?? []) {
      out.tutte++
      for (const f of FILTRI) if (f.stati?.includes(r.stato)) out[f.k]++
    }
    return out
  }, [righe])

  const testo = q.trim().toLowerCase()
  const visibili = (righe ?? [])
    .filter((r) => {
      const f = FILTRI.find((x) => x.k === filtro)!
      return (!f.stati || f.stati.includes(r.stato)) && (!testo || `${r.nome} ${r.oggetto ?? ''}`.toLowerCase().includes(testo))
    })
    .sort((a, b) => {
      const peso = (r: MailingCampagnaRiga) => (STATI_IN_CORSO.includes(r.stato) ? 0 : r.stato === 'PROGRAMMATA' ? 1 : r.stato === 'BOZZA' ? 2 : 3)
      const d = peso(a) - peso(b)
      if (d) return d
      const t = (r: MailingCampagnaRiga) => new Date(r.invioIniziatoIl ?? r.programmataIl ?? r.aggiornatoIl ?? 0).getTime()
      return t(b) - t(a)
    })

  if (vista.tipo === 'report') {
    return (
      <CampagnaReport
        id={vista.id}
        stato={stato}
        onIndietro={chiudi}
        onDuplicata={async () => {
          const copia = await duplica({ id: vista.id })
          if (copia) {
            setVista({ tipo: 'wizard', id: copia.id })
            impostaUrl(copia.id)
          }
        }}
      />
    )
  }

  return (
    <div className="ml-cp-pagina">
      <div className="ml-tpl-barra">
        <div className="ml-tpl-cerca">
          <Search aria-hidden />
          <input className="ml-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome o oggetto" aria-label="Cerca campagne" />
        </div>
        <div className="ml-seg ml-cp-filtri" role="tablist" aria-label="Stato">
          {FILTRI.filter((f) => f.k === 'tutte' || conta[f.k] > 0).map((f) => (
            <button key={f.k} type="button" role="tab" aria-selected={filtro === f.k} data-active={filtro === f.k ? '' : undefined} onClick={() => setFiltro(f.k)}>
              {f.l} <span className="ml-tpl-conta">{conta[f.k]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="ml-btn ml-btn--pieno ml-tpl-nuovo" onClick={() => void nuova()} disabled={creando}>
          {creando ? <Loader2 className="ml-ed-gira" /> : <Plus />} Nuova campagna
        </button>
      </div>

      {errore ? (
        <Vuoto icona={<Send />} titolo="Campagne non disponibili" testo={errore} azioni={<button className="ml-btn" onClick={carica}>Riprova</button>} />
      ) : righe == null ? (
        <div className="ml-cp-elenco" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ml-cp-riga ml-cp-riga--attesa">
              <span className="ml-skeleton ml-cp-icona" />
              <div className="ml-cp-riga-testi">
                <span className="ml-skeleton" style={{ height: 14, width: '40%', display: 'block' }} />
                <span className="ml-skeleton" style={{ height: 12, width: '65%', display: 'block', marginTop: 8 }} />
              </div>
              <span className="ml-skeleton" style={{ height: 36, width: 260, display: 'block' }} />
            </div>
          ))}
        </div>
      ) : visibili.length ? (
        <div className="ml-cp-elenco">
          {visibili.map((r) => (
            <RigaCampagna
              key={r.id}
              c={r}
              adesso={adesso}
              onApri={() => void apri(r.id, r.stato)}
              onDuplica={() => void duplica(r)}
              onElimina={() => setElimina(r)}
            />
          ))}
        </div>
      ) : righe.length ? (
        <Vuoto icona={<Search />} titolo="Nessuna campagna corrisponde" testo="Prova a cambiare la ricerca o il filtro." />
      ) : (
        <Vuoto
          className="ml-tpl-vuoto"
          icona={<Send />}
          titolo="La tua prima campagna"
          testo="Scegli un template, decidi a chi scrivere tra pazienti e lead e invia dalla casella del dottore. Dopo l'invio vedrai aperture, click e anche le visite prenotate grazie all'email."
          azioni={
            <button type="button" className="ml-btn ml-btn--pieno" onClick={() => void nuova()} disabled={creando}>
              <Plus /> Crea una campagna
            </button>
          }
        />
      )}

      {vista.tipo === 'wizard' ? (
        <CampagnaWizard
          id={vista.id}
          stato={stato}
          onChiudi={chiudi}
          onAvviata={(c) => {
            carica()
            if (haReport(c.stato)) {
              setVista({ tipo: 'report', id: c.id })
              impostaUrl(c.id)
            } else chiudi()
          }}
        />
      ) : null}

      <ConfermaMailing
        open={!!elimina}
        onOpenChange={(o) => !o && setElimina(null)}
        titolo="Eliminare la campagna?"
        icona={<Trash2 />}
        testo={elimina ? `"${elimina.nome}" verrà eliminata${elimina.stato === 'PROGRAMMATA' ? ' e non partirà' : ''}. Non si può annullare.` : ''}
        conferma="Elimina"
        pericolo
        onConferma={async () => {
          if (!elimina) return
          try {
            await mailingService.eliminaCampagna(elimina.id)
            toast.success('Campagna eliminata')
            carica()
          } catch (e) {
            toast.error(messaggioErroreMailing(e, 'Campagna non eliminata'))
            return false
          }
        }}
      />
    </div>
  )
}
