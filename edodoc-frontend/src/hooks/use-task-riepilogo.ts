import { useCallback, useEffect, useState } from "react"
import { useTaskChanged } from "@/hooks/use-task-cambi"
import { taskService, type TaskRiepilogo } from "@/services/task-service"

/** Contatori della giornata (in ritardo, oggi, prossimi 7 giorni, senza scadenza): si ricaricano a ogni modifica. */
export function useTaskRiepilogo() {
  const [riepilogo, setRiepilogo] = useState<TaskRiepilogo | null>(null)
  const ricarica = useCallback(() => {
    taskService.getRiepilogo().then(setRiepilogo, () => undefined)
  }, [])
  useEffect(ricarica, [ricarica])
  useTaskChanged(ricarica)
  return { riepilogo, ricarica }
}
