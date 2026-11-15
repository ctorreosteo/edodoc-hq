import { toast } from '@/lib/toast'

/**
 * Riferimento di un task da copiare e incollare: "#123" identifica il task ovunque
 * (ricerca della pagina Task, chat, email); il link apre direttamente il dettaglio.
 */
export const codiceTask = (id: number) => `#${id}`

export const linkTask = (id: number) => `${window.location.origin}/task?task=${id}`

/** "#123 Titolo — link": quello che serve per citare un task a qualcuno. */
export const riferimentoTask = (t: { id: number; titolo: string }) => `${codiceTask(t.id)} ${t.titolo} — ${linkTask(t.id)}`

/**
 * Id del task indicato da un testo incollato o digitato: "#123", "task 123" o un link /task?task=123.
 * Un numero senza "#" resta una ricerca normale (potrebbe essere nel titolo).
 */
export function idDaRiferimento(testo: string): number | null {
  const t = testo.trim()
  const m = t.match(/^(?:task\s*)?#\s*(\d{1,18})$/i) ?? t.match(/^task\s+(\d{1,18})$/i) ?? t.match(/[?&]task=(\d{1,18})(?:&|#|$)/)
  const id = m ? Number(m[1]) : NaN
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export async function copiaNegliAppunti(testo: string, conferma: string) {
  try {
    await navigator.clipboard.writeText(testo)
    toast.success(conferma)
  } catch {
    toast.error('Impossibile copiare negli appunti')
  }
}
