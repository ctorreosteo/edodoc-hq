import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, FileText, Loader2, Send, Settings2, Users } from 'lucide-react'
import { toast } from '@/lib/toast'
import {
  mailingService,
  messaggioErroreMailing,
  type MailingCampagna,
  type MailingCatalogoCampo,
  type MailingCategoria,
  type MailingMittente,
  type MailingSegmento,
  type MailingStato,
  type MailingStimaPubblico,
  type MailingTag,
} from '@/services/mailing-service'
import { SchermoIntero, TornaIndietro } from './mailing-anteprima'
import { dettagliCompleti, haContenuto, inputDa, pubblicoVuoto } from './mailing-campagna-dati'
import { PassoDettagli } from './mailing-campagna-dettagli'
import { PassoPubblico } from './mailing-campagna-pubblico'
import { PassoContenuto } from './mailing-campagna-contenuto'
import { PassoInvio } from './mailing-campagna-invio'
import { Vuoto } from './mailing-ui'
import { dataOra, formatNumero, tempoFa } from './mailing-utils'

/*
  Procedura guidata della campagna, a tutto schermo: Dettagli → Pubblico → Contenuto → Controlli e invio.
  Salvataggio automatico della bozza (1,5 s dopo l'ultima modifica, e sempre prima dei controlli e all'uscita).
  La stima del pubblico è live per tutta la procedura (serve anche al riepilogo finale).
*/

export type Passo = 'dettagli' | 'pubblico' | 'contenuto' | 'invio'

export type Riferimenti = {
  mittenti: MailingMittente[]
  categorie: MailingCategoria[]
  segmenti: MailingSegmento[]
  tag: MailingTag[]
  catalogo: MailingCatalogoCampo[]
}

export type StatoSalvataggio = 'ok' | 'sporco' | 'salvo' | 'errore'

const PASSI: { k: Passo; l: string; icona: typeof Users }[] = [
  { k: 'dettagli', l: 'Dettagli', icona: Settings2 },
  { k: 'pubblico', l: 'Pubblico', icona: Users },
  { k: 'contenuto', l: 'Contenuto', icona: FileText },
  { k: 'invio', l: 'Controlli e invio', icona: Send },
]

export function CampagnaWizard({ id, stato, onChiudi, onAvviata }: { id: number; stato: MailingStato; onChiudi: () => void; onAvviata: (c: MailingCampagna) => void }) {
  const [c, setC] = useState<MailingCampagna | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [rif, setRif] = useState<Riferimenti>({ mittenti: [], categorie: [], segmenti: [], tag: [], catalogo: [] })
  const [passo, setPasso] = useState<Passo>('dettagli')
  const [salvataggio, setSalvataggio] = useState<StatoSalvataggio>('ok')
  const [salvatoIl, setSalvatoIl] = useState<number | null>(null)
  const [versione, setVersione] = useState(0)
  const [stima, setStima] = useState<MailingStimaPubblico | null>(null)
  const [stimaInCorso, setStimaInCorso] = useState(false)

  const cRef = useRef<MailingCampagna | null>(null)
  cRef.current = c
  const sporco = useRef(false)
  const inVolo = useRef<Promise<boolean> | null>(null)

  // Caricamento
  useEffect(() => {
    let vivo = true
    mailingService
      .campagna(id)
      .then((x) => {
        if (!vivo) return
        setC({ ...x, pubblico: x.pubblico ?? pubblicoVuoto() })
        if (x.oggetto && x.mittenteId) setPasso(haContenuto(x) ? 'invio' : 'contenuto')
      })
      .catch((e) => vivo && setErrore(messaggioErroreMailing(e, 'Campagna non trovata')))
    Promise.all([
      mailingService.mittenti().catch(() => []),
      mailingService.categorie().catch(() => []),
      mailingService.segmenti().catch(() => []),
      mailingService.tag().catch(() => []),
      mailingService.catalogoSegmenti().catch(() => []),
    ]).then(([mittenti, categorie, segmenti, tag, catalogo]) => vivo && setRif({ mittenti, categorie, segmenti, tag, catalogo }))
    return () => {
      vivo = false
    }
  }, [id])

  const aggiorna = useCallback((patch: Partial<MailingCampagna>) => {
    setC((prima) => (prima ? { ...prima, ...patch } : prima))
    sporco.current = true
    setSalvataggio('sporco')
    setVersione((v) => v + 1)
  }, [])

  const salva = useCallback(async (): Promise<boolean> => {
    if (inVolo.current) await inVolo.current
    const attuale = cRef.current
    if (!sporco.current || !attuale) return true
    sporco.current = false
    setSalvataggio('salvo')
    const p = mailingService
      .aggiornaCampagna(id, inputDa(attuale))
      .then((r) => {
        setSalvataggio(sporco.current ? 'sporco' : 'ok')
        setSalvatoIl(Date.now())
        setC((prima) => (prima ? { ...prima, stato: r.stato } : prima))
        return true
      })
      .catch((e) => {
        sporco.current = true
        setSalvataggio('errore')
        toast.error(messaggioErroreMailing(e, 'Bozza non salvata'), { id: 'ml-salva-bozza' })
        return false
      })
    inVolo.current = p
    const esito = await p
    inVolo.current = null
    return esito
  }, [id])

  useEffect(() => {
    if (!versione) return
    const t = window.setTimeout(() => void salva(), 1500)
    return () => window.clearTimeout(t)
  }, [versione, salva])

  useEffect(
    () => () => {
      if (sporco.current) void salva()
    },
    [salva],
  )

  useEffect(() => {
    const via = (e: BeforeUnloadEvent) => {
      if (sporco.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', via)
    return () => window.removeEventListener('beforeunload', via)
  }, [])

  // Stima del pubblico, live
  const chiaveStima = c ? JSON.stringify([c.pubblico, c.categoriaId, c.mittenteId]) : ''
  useEffect(() => {
    const attuale = cRef.current
    if (!attuale?.pubblico) return
    const ctrl = new AbortController()
    setStimaInCorso(true)
    const t = window.setTimeout(() => {
      mailingService
        .stimaPubblico(attuale.pubblico!, attuale.categoriaId, attuale.mittenteId, ctrl.signal)
        .then((s) => {
          setStima(s)
          setStimaInCorso(false)
        })
        .catch((e) => {
          if (ctrl.signal.aborted || (e as { name?: string })?.name === 'AbortError') return
          setStimaInCorso(false)
        })
    }, 450)
    return () => {
      window.clearTimeout(t)
      ctrl.abort()
    }
  }, [chiaveStima])

  const esci = async () => {
    await salva()
    onChiudi()
  }

  const indice = PASSI.findIndex((p) => p.k === passo)
  const completo: Record<Passo, boolean> = {
    dettagli: !!c && dettagliCompleti(c),
    pubblico: !!stima && stima.destinatari > 0,
    contenuto: !!c && haContenuto(c),
    invio: false,
  }
  const vai = async (p: Passo) => {
    if (p === 'invio') await salva()
    setPasso(p)
    document.querySelector('.ml-cp-wizard-corpo')?.scrollTo({ top: 0 })
  }

  const sottotitolo: Record<Passo, string> = {
    dettagli: c?.oggetto ? c.oggetto : 'Mittente e oggetto',
    pubblico: stima ? `${formatNumero(stima.destinatari)} destinatari` : 'A chi scrivere',
    contenuto: c && haContenuto(c) ? `${c.design?.blocchi.length ?? 1} blocchi` : 'Il messaggio',
    invio: 'Ultimo passo',
  }

  return (
    <SchermoIntero etichetta={`Campagna ${c?.nome ?? ''}`} onEsc={passo === 'contenuto' ? undefined : () => void esci()}>
      <header className="ml-schermo-testa ml-cp-wizard-testa">
        <TornaIndietro onClick={() => void esci()} etichetta="Campagne" />
        <div className="ml-schermo-titoli">
          <input
            className="ml-schermo-nome"
            value={c?.nome ?? ''}
            onChange={(e) => aggiorna({ nome: e.target.value })}
            placeholder="Nome della campagna (lo vedi solo tu)"
            aria-label="Nome della campagna"
            disabled={!c}
          />
        </div>
        <span className="ml-salvataggio" data-stato={salvataggio} aria-live="polite">
          {salvataggio === 'salvo' ? <Loader2 className="ml-ed-gira" /> : salvataggio === 'sporco' ? <span className="ml-salvataggio-punto" /> : salvataggio === 'errore' ? <AlertTriangle /> : <Check />}
          {salvataggio === 'salvo'
            ? 'Salvataggio…'
            : salvataggio === 'sporco'
              ? 'Modifiche in corso'
              : salvataggio === 'errore'
                ? 'Non salvata: riprovo'
                : salvatoIl
                  ? `Salvata ${tempoFa(new Date(salvatoIl).toISOString())}`
                  : 'Bozza salvata'}
        </span>
      </header>

      <nav className="ml-cp-stepper" aria-label="Passi della campagna">
        {PASSI.map((p, i) => {
          const I = p.icona
          return (
            <button
              key={p.k}
              type="button"
              className="ml-cp-passo"
              data-attivo={p.k === passo ? '' : undefined}
              data-fatto={completo[p.k] && p.k !== passo ? '' : undefined}
              aria-current={p.k === passo ? 'step' : undefined}
              onClick={() => void vai(p.k)}
              disabled={!c}
            >
              <span className="ml-cp-passo-num">{completo[p.k] && p.k !== passo ? <Check /> : <I />}</span>
              <span className="ml-cp-passo-testi">
                <span className="ml-cp-passo-nome">
                  <small>{i + 1}</small> {p.l}
                </span>
                <span className="ml-cp-passo-sotto">{sottotitolo[p.k]}</span>
              </span>
            </button>
          )
        })}
      </nav>

      {c?.stato === 'PROGRAMMATA' ? (
        <div className="ml-avviso ml-schermo-avviso" data-tono="info">
          Questa campagna è programmata per {dataOra(c.programmataIl)}: le modifiche che salvi valgono per l'invio.
        </div>
      ) : null}

      <div className="ml-cp-wizard-corpo" data-passo={passo}>
        {errore ? (
          <Vuoto icona={<Send />} titolo="Non riesco ad aprire la campagna" testo={errore} azioni={<button className="ml-btn" onClick={onChiudi}>Torna alle campagne</button>} />
        ) : !c ? (
          <div className="ml-schermo-attesa">
            <Loader2 className="ml-ed-gira" /> Apro la campagna…
          </div>
        ) : passo === 'dettagli' ? (
          <PassoDettagli c={c} rif={rif} aggiorna={aggiorna} aiDisponibile={stato.aiDisponibile} />
        ) : passo === 'pubblico' ? (
          <PassoPubblico c={c} rif={rif} aggiorna={aggiorna} stima={stima} stimaInCorso={stimaInCorso} />
        ) : passo === 'contenuto' ? (
          <PassoContenuto c={c} aggiorna={aggiorna} aiDisponibile={stato.aiDisponibile} />
        ) : (
          <PassoInvio
            c={c}
            rif={rif}
            stato={stato}
            aggiorna={aggiorna}
            stima={stima}
            salva={salva}
            completo={completo}
            onVai={(p) => void vai(p)}
            onAvviata={onAvviata}
          />
        )}
      </div>

      <footer className="ml-cp-wizard-piede">
        <button type="button" className="ml-btn ml-btn--ghost" onClick={() => (indice > 0 ? void vai(PASSI[indice - 1].k) : void esci())}>
          <ChevronLeft /> {indice > 0 ? PASSI[indice - 1].l : 'Esci'}
        </button>
        <div className="ml-cp-wizard-punti" aria-hidden>
          {PASSI.map((p) => (
            <span key={p.k} data-attivo={p.k === passo ? '' : undefined} />
          ))}
        </div>
        {indice < PASSI.length - 1 ? (
          <button type="button" className="ml-btn ml-btn--pieno" onClick={() => void vai(PASSI[indice + 1].k)} disabled={!c}>
            Avanti: {PASSI[indice + 1].l} <ChevronRight />
          </button>
        ) : (
          <span className="ml-cp-wizard-fine">Controlla tutto e invia quando sei pronto</span>
        )}
      </footer>
    </SchermoIntero>
  )
}
