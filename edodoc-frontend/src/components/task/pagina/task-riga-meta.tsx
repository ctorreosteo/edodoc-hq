import { AlarmClock, CheckSquare, CornerDownRight, ListTree, MessageSquare, Paperclip, User } from 'lucide-react'
import { nomeCompleto } from '@/lib/task-nomi'
import { TaskCheck } from '@/components/task/task-check'
import { TaskPosticipaMenu } from '@/components/task/task-posticipa'
import { isStatoChiuso, type TaskRiga } from '@/services/task-service'
import { codiceTask, copiaNegliAppunti, riferimentoTask } from '@/lib/task-riferimento'

/** Contatori compatti di commenti, allegati e checklist. */
/** `senzaSottotask`: il contatore dei sottotask lo mostra già la riga (pulsante che li apre). */
/** `nascondi`: quelli che la lista mostra già in una colonna. */
export function TaskContatori({ riga, senzaSottotask, nascondi }: {
  riga: TaskRiga
  senzaSottotask?: boolean
  nascondi?: { commenti?: boolean; allegati?: boolean; checklist?: boolean }
}) {
  const commenti = !nascondi?.commenti && riga.commenti > 0
  const allegati = !nascondi?.allegati && riga.allegati > 0
  const checklist = !nascondi?.checklist && riga.checklistTotale > 0
  const checklistFatta = riga.checklistTotale > 0 && riga.checklistCompletati === riga.checklistTotale
  const sottotask = !senzaSottotask && riga.sottotaskTotale > 0
  if (!commenti && !allegati && !checklist && !sottotask) return null
  return (
    <span className="tk-counters">
      {commenti ? <span title={`${riga.commenti} commenti`}><MessageSquare aria-hidden />{riga.commenti}</span> : null}
      {allegati ? <span title={`${riga.allegati} allegati`}><Paperclip aria-hidden />{riga.allegati}</span> : null}
      {sottotask ? (
        <span title={`${riga.sottotaskCompletati} di ${riga.sottotaskTotale} sottotask fatti`}
          data-done={riga.sottotaskCompletati === riga.sottotaskTotale ? '' : undefined}>
          <ListTree aria-hidden />{riga.sottotaskCompletati}/{riga.sottotaskTotale}
        </span>
      ) : null}
      {checklist ? (
        <span title="Checklist" data-done={checklistFatta ? '' : undefined}>
          <CheckSquare aria-hidden />{riga.checklistCompletati}/{riga.checklistTotale}
        </span>
      ) : null}
    </span>
  )
}

/** Sottotask mostrato da solo: «↳ Titolo del principale». */
export function TaskPrincipaleTag({ riga }: { riga: TaskRiga }) {
  if (riga.parentId == null) return null
  return (
    <span className="tk-principale" title={`Sottotask di «${riga.parentTitolo ?? ''}»`}>
      <CornerDownRight aria-hidden />
      <span>{riga.parentTitolo ?? 'Task principale'}</span>
    </span>
  )
}

export function TaskPazienteTag({ riga }: { riga: TaskRiga }) {
  if (!riga.paziente) return null
  return (
    <span className="tk-paziente" title="Paziente collegato">
      <User aria-hidden />
      <span>{nomeCompleto(riga.paziente)}</span>
    </span>
  )
}

/** Cerchio "completa" di una riga: non apre il dettaglio. `onToggle` riceve il bottone (per i coriandoli). */
export function TaskRigaCheck({ riga, onToggle, colore }: { riga: TaskRiga; onToggle: (el: HTMLButtonElement) => void; colore?: string }) {
  const fatto = riga.stato === 'COMPLETATO'
  return (
    <span className="tk-riga-check" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <TaskCheck completato={fatto} onToggle={onToggle} disabled={isStatoChiuso(riga.stato) && !fatto} colore={colore} />
    </span>
  )
}

/**
 * Pulsante "Posticipa" della riga: su desktop compare al passaggio, su touch è sempre visibile.
 * `data-tk-posticipa` serve alla scorciatoia "p".
 */
export function TaskRigaPosticipa({ riga, onPosticipa }: {
  riga: TaskRiga
  onPosticipa: (scadenza: string | null, scadenzaOra: string | null) => void
}) {
  if (isStatoChiuso(riga.stato)) return null
  return (
    <span className="tk-riga-posticipa" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <TaskPosticipaMenu scadenza={riga.scadenza} scadenzaOra={riga.scadenzaOra} onPosticipa={onPosticipa}
        trigger={
          <button type="button" className="tk-row-action" data-tk-posticipa="" aria-label="Posticipa" title="Posticipa (P)">
            <AlarmClock aria-hidden />
          </button>
        } />
    </span>
  )
}

/**
 * Codice "#123" del task: un clic lo copia, con Maiusc copia anche titolo e link.
 * `data-tk-copia-id` serve alla scorciatoia "i" delle righe.
 */
export function TaskIdBadge({ riga, className }: { riga: Pick<TaskRiga, 'id' | 'titolo'>; className?: string }) {
  const codice = codiceTask(riga.id)
  return (
    <button type="button" className={`tk-id${className ? ` ${className}` : ''}`} data-tk-copia-id=""
      title={`Copia ${codice} (Maiusc: con titolo e link)`} aria-label={`Copia il codice ${codice}`}
      onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        void (e.shiftKey ? copiaNegliAppunti(riferimentoTask(riga), `${codice} copiato con titolo e link`)
          : copiaNegliAppunti(codice, `${codice} copiato`))
      }}>
      {codice}
    </button>
  )
}
