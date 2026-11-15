import { useEffect, useRef, useState } from "react"
import { Client } from "@stomp/stompjs"
import SockJS from "sockjs-client"
import { sessione } from "@/services/api-client"
import { useAuth } from "@/contexts/auth-context"
import type { SocialEvento } from "@/services/social-service"

export const SOCIAL_TOPIC = "/topic/social"

/** In sviluppo passa dal proxy di Vite; altrimenti /ws accanto a /api (VITE_API_BASE_URL). */
function getWebSocketUrl(): string {
  if (import.meta.env.DEV) return "/ws"
  const base = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/+$/, "")
  return base.replace(/\/api$/, "") + "/ws"
}

/*
  Eventi webhook di Meta (nuovo commento, nuovo DM, pubblicazione) spinti dal backend su /topic/social.
  Si connette solo mentre la pagina è aperta: il topic porta l'anteprima dei messaggi, e la subscribe
  la autorizza comunque il server (SocialStompSubscribeInterceptor, solo ADMIN). Senza webhook la pagina vive di polling.
*/
export function useSocialRealtime(attivo: boolean, onEvento: (evento: SocialEvento) => void) {
  const { utente } = useAuth()
  // Il token sta nella sessione: si riconnette quando cambia l'utente (login/logout)
  const token = utente ? sessione.token() : null
  const [connesso, setConnesso] = useState(false)
  const handlerRef = useRef(onEvento)
  handlerRef.current = onEvento

  useEffect(() => {
    const url = getWebSocketUrl()
    if (!attivo || !token || !url) {
      setConnesso(false)
      return
    }
    const client = new Client({
      webSocketFactory: () => new SockJS(url),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        client.subscribe(SOCIAL_TOPIC, (message) => {
          if (!message.body) return
          try {
            const evento = JSON.parse(message.body) as SocialEvento
            if (evento && typeof evento.tipo === "string") handlerRef.current(evento)
          } catch {
            /* frame non JSON */
          }
        })
        setConnesso(true)
      },
      onDisconnect: () => setConnesso(false),
      onStompError: () => setConnesso(false),
      onWebSocketClose: () => setConnesso(false),
    })
    client.activate()
    return () => {
      setConnesso(false)
      try {
        void client.deactivate()
      } catch {
        /* ignore */
      }
    }
  }, [attivo, token])

  return connesso
}
