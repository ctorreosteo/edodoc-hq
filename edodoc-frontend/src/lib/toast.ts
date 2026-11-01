import { toast as sonnerToast } from "sonner"

export const toast = sonnerToast

/** Toast d'errore da un errore dell'API: il messaggio del backend è già scritto per il dottore. */
export function toastErrore(errore: unknown) {
  const messaggio = errore instanceof Error ? errore.message : "Si è verificato un errore. Riprova."
  toast.error(messaggio)
}
