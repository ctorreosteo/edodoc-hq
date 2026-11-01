import { ArrowRight, Banknote, Check, CircleCheck, MessageCircle, PhoneCall, type LucideIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"
import { AltreAzioni } from "@/components/dashboard/altre-azioni"
import { MenuTask } from "@/components/menu-contestuali"
import { Riquadro } from "@/components/pagina"
import { Vuoto } from "@/components/stati"
import { useAzioni } from "@/contexts/azioni-context"
import { conta, gruppiTask, quandoTask, segnali } from "@/lib/dashboard"
import { toast, toastErrore } from "@/lib/toast"
import { taskService } from "@/services/gestionale"
import type { Dashboard, Task } from "@/types"

const ICONE: Record<string, LucideIcon> = { dedicati: MessageCircle, scaduti: Banknote, contatti: PhoneCall }

function RigaTask({ task }: { task: Task }) {
  const azioni = useAzioni()
  const [fatto, setFatto] = useState(false)
  const quando = quandoTask(task)

  const riapri = async () => {
    try {
      await taskService.cambiaStato(task.id, false)
      azioni.aggiorna()
    } catch (e) {
      toastErrore(e)
    }
  }

  const segna = async () => {
    setFatto(true)
    try {
      await taskService.cambiaStato(task.id, true)
      toast.success("Task fatto", { description: task.titolo, action: { label: "Annulla", onClick: () => void riapri() } })
      azioni.aggiorna()
    } catch (e) {
      setFatto(false)
      toastErrore(e)
    }
  }

  return (
    <MenuTask task={task}>
      <li className="db-task" data-fatto={fatto ? "" : undefined}>
        <button type="button" className="db-spunta" disabled={fatto} aria-label={`Segna fatto: ${task.titolo}`} onClick={() => void segna()}>
          <span aria-hidden><Check className="size-3.5" strokeWidth={3} /></span>
        </button>
        <div className="db-task-corpo">
          <button type="button" className="db-task-titolo" title={task.titolo} onClick={() => azioni.modificaTask(task)}>{task.titolo}</button>
          {task.pazienteId ? (
            <button type="button" className="db-task-paziente" onClick={() => azioni.apriPaziente(task.pazienteId!)}>{task.pazienteNome}</button>
          ) : null}
        </div>
        <span className="db-quando" data-tono={quando.tono}>{quando.testo}</span>
        <AltreAzioni etichetta={`Altre azioni per ${task.titolo}`} />
      </li>
    </MenuTask>
  )
}

/** Tutto ciò che aspetta una mano: prima i segnali che arrivano da check e pagamenti, poi i task per urgenza. */
export function DaSbrigare({ d, adesso }: { d: Dashboard; adesso: Date }) {
  const voci = segnali(d, adesso)
  const gruppi = gruppiTask(d.taskUrgenti)
  const altri = d.taskAperti - d.taskUrgenti.length

  return (
    <Riquadro titolo="Da sbrigare" conteggio={d.taskAperti} azioni={<Link to="/task" className="db-link">Tutti i task<ArrowRight className="size-3.5" aria-hidden /></Link>}>
      {voci.length ? (
        <ul className="db-segnali">
          {voci.map((v) => {
            const Icona = ICONE[v.chiave]
            return (
              <li key={v.chiave}>
                <Link to={v.a} className="db-segnale" data-tono={v.tono}>
                  <span className="db-segnale-testa">
                    <Icona className="size-4" aria-hidden />
                    <span className="db-segnale-titolo">{v.titolo}</span>
                  </span>
                  <span className="db-segnale-valore">{v.valore}</span>
                  <span className="db-segnale-dettaglio">{v.dettaglio}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}

      {gruppi.map((g) => (
        <section key={g.chiave} className="db-gruppo" aria-label={g.titolo}>
          <p className="db-gruppo-titolo">{g.titolo}{g.chiave === "ritardo" ? ` · ${d.taskInRitardo}` : ""}</p>
          <ul>{g.righe.map((t) => <RigaTask key={t.id} task={t} />)}</ul>
        </section>
      ))}

      {!voci.length && !gruppi.length ? <Vuoto titolo="Niente da sbrigare" descrizione="Nessun task aperto e nessun segnale dai check." icona={<CircleCheck aria-hidden />} /> : null}
      {altri > 0 ? <Link to="/task" className="db-altri">Altri {conta(altri, "task aperto", "task aperti")}<ArrowRight className="size-3.5" aria-hidden /></Link> : null}
    </Riquadro>
  )
}
