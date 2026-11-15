import { useEffect, useRef } from "react"

/*
  Avviso locale "un task è cambiato": pagina Task, scheda del task, dashboard e scheda del paziente
  si riallineano dopo ogni modifica. Un solo utente, quindi niente WebSocket.
*/
const EVENTO = "task:cambiato"

export function emitTaskChanged(taskId?: number) {
  window.dispatchEvent(new CustomEvent<{ taskId?: number }>(EVENTO, { detail: { taskId } }))
}

export function useTaskChanged(cb: (taskId?: number) => void) {
  const ref = useRef(cb)
  useEffect(() => {
    ref.current = cb
  })
  useEffect(() => {
    const handler = (e: Event) => ref.current((e as CustomEvent<{ taskId?: number }>).detail?.taskId)
    window.addEventListener(EVENTO, handler)
    return () => window.removeEventListener(EVENTO, handler)
  }, [])
}
