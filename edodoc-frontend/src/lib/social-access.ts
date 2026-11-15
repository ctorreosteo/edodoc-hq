import type { Utente } from "@/types"

/**
 * Stessa regola di SocialAccessService (backend): pagina Meta, API `/api/social` e topic realtime.
 * In EdoDoc il gestionale è del dottore: solo ADMIN. Il REVISORE (account per Apple e Google) non vede mai dati veri.
 */
export function canAccessSocial(utente: Pick<Utente, "ruolo"> | null | undefined): boolean {
  return utente?.ruolo === "ADMIN"
}

export const SOCIAL_URL = "meta"
