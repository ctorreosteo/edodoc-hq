import { AlarmClock, ListChecks, Plus, Sparkles } from "lucide-react"
import { useState } from "react"
import { Chip } from "@/components/chip"
import { LuxHero, LuxKpi } from "@/components/lux"
import { iconaTask, MenuTask } from "@/components/menu-contestuali"
import { Cta, Pagina, Riquadro } from "@/components/pagina"
import { Caricamento, Errore, Vuoto } from "@/components/stati"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useAzioni } from "@/contexts/azioni-context"
import { useDati } from "@/hooks/use-dati"
import { data } from "@/lib/format"
import { PRIORITA } from "@/lib/etichette"
import { toastErrore } from "@/lib/toast"
import { taskService } from "@/services/gestionale"
import type { Task as TaskT } from "@/types"

export default function Task() {
  const azioni = useAzioni()
  const [completati, setCompletati] = useState(false)
  const { dati, errore, riprova } = useDati(() => taskService.lista(completati), [completati])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const aperti = dati.filter((t) => t.stato === "DA_FARE")
  const inRitardo = aperti.filter((t) => t.inRitardo).length
  const automatici = aperti.filter((t) => t.automatico).length

  const cambia = async (task: TaskT, fatto: boolean) => {
    try {
      await taskService.cambiaStato(task.id, fatto)
      azioni.aggiorna()
    } catch (e) {
      toastErrore(e)
    }
  }

  return (
    <Pagina>
      <LuxHero ariaLabel="Task" eyebrow="Da fare" title="Task" subtitle="Quello che oggi resta in testa: ricontatti, rinnovi, scadenze"
        actions={<Cta icona={Plus} onClick={() => azioni.nuovoTask()}>Nuovo task</Cta>}>
        <div className="vl-kpis vl-kpis--3">
          <LuxKpi icon={<ListChecks className="size-4" />} label="Aperti" value={aperti.length} />
          <LuxKpi icon={<AlarmClock className="size-4" />} label="In ritardo" value={inRitardo} />
          <LuxKpi icon={<Sparkles className="size-4" />} label="Creati da soli" value={automatici} foot="Rinnovi, esami, Tessera Sanitaria" />
        </div>
      </LuxHero>

      <Riquadro titolo="Lista" conteggio={dati.length} descrizione="Tasto destro su un task per modificarlo"
        azioni={<Button variant="outline" size="sm" aria-pressed={completati} onClick={() => setCompletati((c) => !c)}>{completati ? "Nascondi completati" : "Mostra completati"}</Button>}>
        {dati.length === 0 ? <Vuoto titolo="Tutto fatto" /> : (
          <ul className="grid gap-2">
            {dati.map((t) => {
              const Icona = iconaTask(t.tipo.icona)
              const fatto = t.stato === "FATTO"
              return (
                <MenuTask key={t.id} task={t}>
                  <li className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
                    <Checkbox aria-label={`Segna fatto: ${t.titolo}`} checked={fatto} onCheckedChange={(v) => void cambia(t, v === true)} />
                    <Icona className="size-4 shrink-0 opacity-60" aria-hidden />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => azioni.modificaTask(t)}>
                      <span className={`block truncate text-sm font-semibold ${fatto ? "line-through opacity-60" : ""}`}>{t.titolo}</span>
                      <span className="block truncate text-xs text-muted-foreground">{[t.tipo.etichetta, t.pazienteNome].filter(Boolean).join(" · ")}</span>
                    </button>
                    {t.scadenza ? <span className="text-xs text-muted-foreground tabular-nums">{data(t.scadenza)}</span> : null}
                    {t.inRitardo ? <Chip tono="danger">In ritardo</Chip> : !fatto ? <Chip tono={PRIORITA[t.priorita].tono}>{PRIORITA[t.priorita].testo}</Chip> : null}
                  </li>
                </MenuTask>
              )
            })}
          </ul>
        )}
      </Riquadro>
    </Pagina>
  )
}
