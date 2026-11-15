import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { TaskAvatarStack, TaskEtichettaChip, TaskListaDot, TaskPrioritaIcon, TaskScadenzaLabel } from '@/components/task/task-ui'
import { isStatoChiuso, type TaskConfig, type TaskRiga } from '@/services/task-service'
import {
  GRUPPI_SCADENZA, gruppoScadenza, inFiltroKpi, ordina, tastiRiga, type GruppoScadenza, type TaskFiltroKpi,
} from './task-pagina-utils'
import { TaskContatori, TaskIdBadge, TaskPazienteTag, TaskPrincipaleTag, TaskRigaCheck, TaskRigaPosticipa } from './task-riga-meta'
import { TaskEmpty, TaskSkeletonRighe } from './task-empty'
import { TaskMenuRiga } from './task-menu-contestuale'

/** Quanto resta visibile (in uscita) una riga appena completata. */
const USCITA_MS = 650

interface Props {
  config: TaskConfig
  /** Task aperti miei o senza assegnatari, raggruppati per scadenza */
  righe: TaskRiga[]
  loading: boolean
  filtroKpi: TaskFiltroKpi
  onFiltroKpi: (f: TaskFiltroKpi) => void
  selezionatoId: number | null
  onApri: (id: number) => void
  onToggleCompleta: (riga: TaskRiga, el: HTMLButtonElement) => Promise<TaskRiga | null>
  onPosticipa: (riga: TaskRiga, scadenza: string | null, scadenzaOra: string | null) => void
  onNuovo: () => void
  cercando: boolean
}

export function TaskInbox({
  config, righe, loading, filtroKpi, onFiltroKpi, selezionatoId, onApri, onToggleCompleta, onPosticipa,
  onNuovo, cercando,
}: Props) {
  const [chiusi, setChiusi] = useState<Record<string, boolean>>({})
  /** Righe appena completate: restano al loro posto il tempo dell'animazione di uscita. */
  const [uscenti, setUscenti] = useState<Map<number, TaskRiga>>(new Map())
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const listaDi = useMemo(() => new Map(config.liste.map((l) => [l.id, l])), [config.liste])

  useEffect(() => {
    const t = timers.current
    return () => t.forEach(clearTimeout)
  }, [])

  const gruppi = useMemo(() => {
    const oggi = new Date()
    const per: Record<GruppoScadenza, TaskRiga[]> = { ritardo: [], oggi: [], domani: [], settimana: [], avanti: [], senza: [] }
    const visti = new Set<number>()
    const tutte = [...righe.filter((r) => !isStatoChiuso(r.stato) || uscenti.has(r.id))]
    // Una riga completata può sparire dall'elenco prima che finisca l'animazione
    uscenti.forEach((r, id) => {
      if (!righe.some((x) => x.id === id)) tutte.push(r)
    })
    for (const r of ordina(tutte, { campo: 'scadenza', dir: 'asc' })) {
      if (visti.has(r.id)) continue
      visti.add(r.id)
      const g = gruppoScadenza(uscenti.get(r.id) ?? r, oggi)
      per[g].push(r)
    }
    return per
  }, [righe, uscenti])

  const toggle = async (r: TaskRiga, el: HTMLButtonElement) => {
    const chiudendo = r.stato !== 'COMPLETATO'
    if (chiudendo) {
      setUscenti((m) => new Map(m).set(r.id, r))
      const vecchio = timers.current.get(r.id)
      if (vecchio) clearTimeout(vecchio)
      timers.current.set(r.id, setTimeout(() => {
        setUscenti((m) => {
          const n = new Map(m)
          n.delete(r.id)
          return n
        })
        timers.current.delete(r.id)
      }, USCITA_MS))
    }
    const salvata = await onToggleCompleta(r, el)
    if (!salvata) {
      setUscenti((m) => {
        const n = new Map(m)
        n.delete(r.id)
        return n
      })
    }
  }

  const visibili = (g: GruppoScadenza) => (inFiltroKpi(filtroKpi, g) ? gruppi[g] : [])
  const totaleVisibili = GRUPPI_SCADENZA.reduce((n, g) => n + visibili(g.key).length, 0)
  const urgenti = gruppi.ritardo.length + gruppi.oggi.length

  if (loading) return <TaskSkeletonRighe />

  if (totaleVisibili === 0) {
    if (cercando || filtroKpi) {
      return (
        <div className="tk-inbox">
          <TaskEmpty variante="filtri" />
          {filtroKpi ? <button type="button" className="tk-link tk-link--center" onClick={() => onFiltroKpi(null)}>Mostra tutti i miei task</button> : null}
        </div>
      )
    }
    return <TaskEmpty variante="inbox" onNuovo={onNuovo} />
  }

  return (
    <div className="tk-inbox">
      {urgenti === 0 && !filtroKpi && !cercando ? (
        <div className="tk-giornata" role="status">
          <span className="tk-giornata-icon" aria-hidden><Sparkles /></span>
          <span><b>Giornata chiusa ✨</b> Niente in ritardo, niente in scadenza oggi.</span>
        </div>
      ) : null}

      {GRUPPI_SCADENZA.map((g) => {
        const items = visibili(g.key)
        if (!items.length) return null
        const chiuso = chiusi[g.key] ?? false
        return (
          <section key={g.key} className="tk-gruppo" data-gruppo={g.key}>
            <button type="button" className="tk-gruppo-head" aria-expanded={!chiuso}
              onClick={() => setChiusi((c) => ({ ...c, [g.key]: !chiuso }))}>
              <ChevronDown className="tk-chevron" data-closed={chiuso ? '' : undefined} aria-hidden />
              <b>{g.label}</b>
              <em>{items.length}</em>
            </button>
            {!chiuso ? (
              <ul className="tk-righe">
                {items.map((r) => (
                  <InboxRiga key={r.id} riga={r} lista={listaDi.get(r.listaId)} attivo={r.id === selezionatoId}
                    uscente={uscenti.has(r.id)} onApri={onApri} onToggle={(el) => void toggle(r, el)}
                    onPosticipa={(s, o) => onPosticipa(r, s, o)} />
                ))}
              </ul>
            ) : null}
          </section>
        )
      })}

    </div>
  )
}

function InboxRiga({ riga, lista, attivo, uscente, onApri, onToggle, onPosticipa }: {
  riga: TaskRiga
  lista: TaskConfig['liste'][number] | undefined
  attivo: boolean
  uscente: boolean
  onApri: (id: number) => void
  onToggle: (el: HTMLButtonElement) => void
  onPosticipa: (scadenza: string | null, scadenzaOra: string | null) => void
}) {
  const chiuso = isStatoChiuso(riga.stato)
  const sub = lista || riga.paziente || riga.etichette.length || riga.parentId != null
  return (
    <li className="tk-riga-li" data-uscente={uscente ? '' : undefined}>
      <TaskMenuRiga riga={riga}>
        <div role="button" tabIndex={0} data-tk-riga="" className="tk-riga" data-active={attivo ? '' : undefined}
          data-chiuso={chiuso ? '' : undefined}
          aria-label={riga.titolo} onClick={() => onApri(riga.id)} onKeyDown={(e) => tastiRiga(e, () => onApri(riga.id))}>
          <TaskRigaCheck riga={riga} onToggle={onToggle} />
          <span className="tk-riga-main">
            <span className="tk-riga-title">
              <b>{riga.titolo}</b>
              <TaskIdBadge riga={riga} />
            </span>
            {sub ? (
              <span className="tk-riga-sub">
                <TaskListaDot lista={lista} />
                <TaskPrincipaleTag riga={riga} />
                <TaskPazienteTag riga={riga} />
                {riga.etichette.slice(0, 2).map((e) => <TaskEtichettaChip key={e.id} etichetta={e} />)}
              </span>
            ) : null}
          </span>
          <span className="tk-riga-side">
            <TaskContatori riga={riga} />
            {riga.priorita && riga.priorita !== 'NORMALE' ? <TaskPrioritaIcon priorita={riga.priorita} /> : null}
            <TaskRigaPosticipa riga={riga} onPosticipa={onPosticipa} />
            <span className="tk-riga-when"><TaskScadenzaLabel scadenza={riga.scadenza} scadenzaOra={riga.scadenzaOra} chiuso={chiuso} /></span>
            <TaskAvatarStack persone={riga.assegnatari} max={2} size="xs" />
          </span>
        </div>
      </TaskMenuRiga>
    </li>
  )
}
