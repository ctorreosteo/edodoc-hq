import type { Utente } from "@/types"

/**
 * Planner social: in EdoDoc il gestionale è solo per l'ADMIN (il dottore), che può tutto — aprire il planner,
 * approvare i post e cambiare le impostazioni (il backend lo conferma con stato.puoApprovare / stato.puoImpostare).
 */
export function canAccessPlanner(utente: Pick<Utente, "ruolo"> | null | undefined): boolean {
  return utente?.ruolo === "ADMIN"
}

export const PLANNER_URL = "planner"
