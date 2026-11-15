import type { ReactNode } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { CheckSquare, ListTree, MessageSquare, Paperclip, Plus, Tags, User, UserPlus, Waypoints } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  TaskEtichettePicker, TaskOperatoriPicker, TaskPazientePicker, TaskScadenzaPicker,
} from '@/components/task/task-pickers'
import { TaskStimaLabel, TaskStimaPicker } from '@/components/task/task-stima'
import {
  TASK_LAYER_Z, TaskAvatar, TaskAvatarStack, TaskEtichettaChip, TaskListaDot, TaskPrioritaIcon, TaskPrioritaSelect,
  TaskScadenzaLabel, TaskStatoBadge, TaskStatoSelect, formatScadenza, isScaduto,
} from '@/components/task/task-ui'
import { invalidateTaskConfig } from '@/hooks/use-task-config'
import { nomeCompleto } from '@/lib/task-nomi'
import {
  avanzamento, etichettaOrigine, durataGiorni, etichettaGiorni, focus, giorniDa, salute, tempoRimasto, tonoFermo,
  type TaskColonnaId,
} from '@/lib/task-colonne'
import {
  isStatoChiuso, taskService, type AggiornaTaskValori, type TaskConfig, type TaskRiga,
} from '@/services/task-service'
import { TaskIdBadge } from './task-riga-meta'

export interface ContestoCella {
  config: TaskConfig
  lista: TaskConfig['liste'][number] | undefined
  aggiornaRiga: (id: number, v: AggiornaTaskValori) => Promise<TaskRiga | null>
  onToggleCompleta: (riga: TaskRiga, el: HTMLButtonElement) => Promise<TaskRiga | null>
}

const VUOTO = <span className="tk-muted">—</span>

const PALETTE_ETICHETTE = ['#0EA5E9', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#6366F1']

const creaEtichetta = async (nome: string) => {
  const nuova = await taskService.creaEtichetta(nome, PALETTE_ETICHETTE[Math.floor(Math.random() * PALETTE_ETICHETTE.length)])
  void invalidateTaskConfig()
  return nuova
}

const dataBreve = (iso: string | null | undefined) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : format(d, d.getFullYear() === new Date().getFullYear() ? 'd MMM' : 'd MMM yy', { locale: it })
}

/** Spiegazione al passaggio: il perché di un valore calcolato. */
function ConPerche({ titolo, righe, children }: { titolo: string; righe: string[]; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className={`tk-cc-tip ${TASK_LAYER_Z}`}>
        <b>{titolo}</b>
        <ul>{righe.map((r) => <li key={r}>{r}</li>)}</ul>
      </TooltipContent>
    </Tooltip>
  )
}

function Pillola({ tono, children, titolo }: { tono: string; children: ReactNode; titolo?: string }) {
  return <span className="tk-cc-pill" data-tono={tono} title={titolo}>{children}</span>
}

function Frazione({ fatto, totale, icona }: { fatto: number; totale: number; icona: ReactNode }) {
  if (!totale) return VUOTO
  return (
    <span className="tk-cc-frazione" data-done={fatto === totale ? '' : undefined}>
      {icona}{fatto}/{totale}
    </span>
  )
}

function Contatore({ n, icona, titolo }: { n: number; icona: ReactNode; titolo: string }) {
  if (!n) return VUOTO
  return <span className="tk-cc-conta" title={titolo}>{icona}{n}</span>
}

/** Contenuto della cella di una colonna: i valori modificabili hanno il loro controllo. */
export function CellaColonna({ id, riga, ctx }: { id: TaskColonnaId; riga: TaskRiga; ctx: ContestoCella }): ReactNode {
  const chiuso = isStatoChiuso(riga.stato)
  // Un solo utente: ogni valore si cambia dalla cella
  const modifica = true
  const aggiorna = (v: AggiornaTaskValori) => void ctx.aggiornaRiga(riga.id, v)

  switch (id) {
    case 'assegnatari':
      return modifica ? (
        <TaskOperatoriPicker operatori={ctx.config.operatori} value={riga.assegnatari.map((p) => p.id)}
          onChange={(ids) => aggiorna({ assegnatariIds: ids })}
          trigger={
            <button type="button" className="tk-cell-btn" aria-label="Assegnatari">
              {riga.assegnatari.length ? <TaskAvatarStack persone={riga.assegnatari} max={3} size="sm" />
                : <span className="tk-cell-placeholder"><UserPlus aria-hidden /></span>}
            </button>
          } />
      ) : riga.assegnatari.length ? <TaskAvatarStack persone={riga.assegnatari} max={3} size="sm" /> : VUOTO

    case 'scadenza':
      return modifica ? (
        <TaskScadenzaPicker scadenza={riga.scadenza} scadenzaOra={riga.scadenzaOra} placeholder="—"
          className={!chiuso && isScaduto(riga) ? 'tk-cell-picker tk-cell-scaduta' : 'tk-cell-picker'}
          onChange={(v) => aggiorna({ scadenza: v.scadenza, scadenzaOra: v.scadenzaOra })} />
      ) : riga.scadenza ? <TaskScadenzaLabel scadenza={riga.scadenza} scadenzaOra={riga.scadenzaOra} chiuso={chiuso} /> : VUOTO

    case 'stima':
      return modifica ? (
        <TaskStimaPicker value={riga.stimaMinuti} onChange={(m) => aggiorna({ stimaMinuti: m })}
          trigger={
            <button type="button" className="tk-cell-btn tk-stima-btn" aria-label="Stima di durata">
              {riga.stimaMinuti ? <TaskStimaLabel minuti={riga.stimaMinuti} /> : <span className="tk-cell-placeholder">+ stima</span>}
            </button>
          } />
      ) : riga.stimaMinuti ? <TaskStimaLabel minuti={riga.stimaMinuti} /> : VUOTO

    case 'priorita':
      return modifica
        ? <TaskPrioritaSelect value={riga.priorita} onChange={(p) => aggiorna({ priorita: p })} />
        : riga.priorita ? <TaskPrioritaIcon priorita={riga.priorita} showLabel /> : VUOTO

    case 'stato':
      return modifica ? (
        <TaskStatoSelect value={riga.stato} title="Cambia stato"
          onChange={(s) => {
            if (s === riga.stato) return
            // Completare passa dalla stessa strada del cerchio: conferma dei sottotask, festa e «Annulla»
            if (s === 'COMPLETATO') void ctx.onToggleCompleta(riga, document.activeElement as HTMLButtonElement)
            else aggiorna({ stato: s })
          }} />
      ) : <TaskStatoBadge stato={riga.stato} />

    case 'lista':
      return ctx.lista ? <TaskListaDot lista={ctx.lista} /> : VUOTO

    case 'inizio':
      return modifica ? (
        <TaskScadenzaPicker scadenza={riga.dataInizio} scadenzaOra={null} senzaOra placeholder="—" className="tk-cell-picker"
          onChange={(v) => aggiorna({ dataInizio: v.scadenza })} />
      ) : riga.dataInizio ? <span className="tk-cc-testo">{formatScadenza(riga.dataInizio)}</span> : VUOTO

    case 'tempoRimasto': {
      const t = tempoRimasto(riga)
      return t ? <Pillola tono={t.tono} titolo={riga.scadenza ? `Scade ${formatScadenza(riga.scadenza, riga.scadenzaOra).toLowerCase()}` : undefined}>{t.testo}</Pillola> : VUOTO
    }

    case 'durata': {
      const g = durataGiorni(riga)
      return g ? <span className="tk-cc-testo" title={`Dal ${formatScadenza(riga.dataInizio)} al ${formatScadenza(riga.scadenza)}`}>{g === 1 ? '1 giorno' : `${g} giorni`}</span> : VUOTO
    }

    case 'focus': {
      const f = focus(riga)
      if (!f) return VUOTO
      const tono = f.punteggio >= 70 ? 'critico' : f.punteggio >= 45 ? 'attenzione' : f.punteggio >= 25 ? 'info' : 'neutro'
      return (
        <ConPerche titolo={`Focus ${f.punteggio} su 100`} righe={f.motivi.length ? f.motivi : ['Niente di urgente: può aspettare']}>
          <span className="tk-cc-focus" data-tono={tono} tabIndex={0}>
            <span className="tk-cc-focus-bar"><i style={{ width: `${f.punteggio}%` }} /></span>
            <b>{f.punteggio}</b>
          </span>
        </ConPerche>
      )
    }

    case 'salute': {
      const s = salute(riga)
      if (!s) return VUOTO
      return (
        <ConPerche titolo={s.testo} righe={s.motivi}>
          <span className="tk-cc-salute" data-livello={s.livello} tabIndex={0}>
            <span className="tk-cc-salute-dot" aria-hidden />
            {s.testo}
            {s.livello !== 'ok' && s.motivi.length > 1 ? <em>{s.motivi.length}</em> : null}
          </span>
        </ConPerche>
      )
    }

    case 'fermo': {
      const g = giorniDa(riga.aggiornatoIl)
      return <Pillola tono={tonoFermo(g, chiuso)} titolo={`Ultima modifica: ${dataBreve(riga.aggiornatoIl) ?? '—'}`}>{etichettaGiorni(g)}</Pillola>
    }

    case 'avanzamento': {
      const a = avanzamento(riga)
      if (!a) return VUOTO
      const indietro = a.atteso != null && a.atteso - a.percentuale >= 30
      return (
        <span className="tk-cc-avanza" data-done={a.percentuale === 100 ? '' : undefined} data-indietro={indietro ? '' : undefined}
          title={`${a.fatto} di ${a.totale} fatti${a.atteso != null ? ` · tempo trascorso ${a.atteso}%` : ''}`}>
          <span className="tk-cc-avanza-bar">
            <i style={{ width: `${a.percentuale}%` }} />
            {a.atteso != null ? <s style={{ left: `${a.atteso}%` }} aria-hidden /> : null}
          </span>
          <b>{a.percentuale}%</b>
        </span>
      )
    }

    case 'checklist':
      return <Frazione fatto={riga.checklistCompletati} totale={riga.checklistTotale} icona={<CheckSquare aria-hidden />} />

    case 'sottotask':
      return <Frazione fatto={riga.sottotaskCompletati} totale={riga.sottotaskTotale} icona={<ListTree aria-hidden />} />

    case 'dipendenze':
      return riga.inAttesaDi
        ? <Pillola tono="attenzione" titolo="Task da finire prima che questo possa partire"><Waypoints aria-hidden />{riga.inAttesaDi === 1 ? '1 task' : `${riga.inAttesaDi} task`}</Pillola>
        : VUOTO

    case 'etichette': {
      const chips = riga.etichette.length
        ? <span className="tk-cc-chips">{riga.etichette.map((e) => <TaskEtichettaChip key={e.id} etichetta={e} />)}</span>
        : null
      return modifica ? (
        <TaskEtichettePicker etichette={ctx.config.etichette} value={riga.etichette.map((e) => e.id)} onCreate={creaEtichetta}
          onChange={(ids) => aggiorna({ etichettaIds: ids })}
          trigger={
            <button type="button" className="tk-cell-btn tk-cc-wide" aria-label="Etichette">
              {chips ?? <span className="tk-cell-placeholder"><Tags aria-hidden /><Plus aria-hidden /></span>}
            </button>
          } />
      ) : chips ?? VUOTO
    }

    case 'paziente': {
      const nome = riga.paziente ? <span className="tk-cc-persona"><User aria-hidden /><span>{nomeCompleto(riga.paziente)}</span></span> : null
      return modifica ? (
        <TaskPazientePicker value={riga.paziente} senzaRimuovi onChange={(p) => aggiorna({ pazienteId: p?.id ?? null })}
          trigger={
            <button type="button" className="tk-cell-btn tk-cc-wide" aria-label="Paziente collegato">
              {nome ?? <span className="tk-cell-placeholder"><User aria-hidden /><Plus aria-hidden /></span>}
            </button>
          } />
      ) : nome ?? VUOTO
    }

    case 'codice':
      return <TaskIdBadge riga={riga} className="tk-cc-codice" />

    case 'origine':
      return <span className="tk-cc-testo" data-origine={riga.automatico ? 'JOB' : 'MANUALE'}>{etichettaOrigine(riga)}</span>

    case 'creatoDa':
      return riga.creatoDa ? (
        <span className="tk-cc-persona" title={nomeCompleto(riga.creatoDa)}>
          <TaskAvatar persona={riga.creatoDa} size="xs" noTooltip />
          <span>{nomeCompleto(riga.creatoDa)}</span>
        </span>
      ) : VUOTO

    case 'commenti':
      return <Contatore n={riga.commenti} icona={<MessageSquare aria-hidden />} titolo={`${riga.commenti} commenti`} />

    case 'allegati':
      return <Contatore n={riga.allegati} icona={<Paperclip aria-hidden />} titolo={`${riga.allegati} allegati`} />

    case 'aggiornato':
      return <span className="tk-cc-testo" title={new Date(riga.aggiornatoIl).toLocaleString('it-IT')}>{etichettaGiorni(giorniDa(riga.aggiornatoIl)) === 'Oggi' ? `Oggi ${format(new Date(riga.aggiornatoIl), 'HH:mm')}` : dataBreve(riga.aggiornatoIl)}</span>

    case 'creato':
      return <span className="tk-cc-testo" title={new Date(riga.creatoIl).toLocaleString('it-IT')}>{dataBreve(riga.creatoIl)}</span>

    case 'eta': {
      const g = giorniDa(riga.creatoIl)
      return <span className="tk-cc-testo" data-vecchio={!chiuso && g != null && g >= 30 ? '' : undefined}>{etichettaGiorni(g)}</span>
    }
  }
}
