import { api, ApiError } from "@/services/api-client"

export type EmailIndirizzo = { nome: string | null; email: string }

export type EmailEtichetta = {
  id: string; nome: string; tipo: "SYSTEM" | "USER"; threadTotali: number; threadNonLetti: number
  coloreSfondo: string | null; coloreTesto: string | null
}

export type EmailCasella = { email: string; nomeVisualizzato: string; etichette: EmailEtichetta[]; historyId: string; demo: boolean }

export type EmailStato = { historyId: string; inArrivoNonLetti: number; cambiato: boolean }

export type EmailThreadRiga = {
  id: string; oggetto: string | null; anteprima: string | null; partecipanti: EmailIndirizzo[]; ultimoMittente: EmailIndirizzo | null
  messaggi: number; data: number; nonLetto: boolean; speciale: boolean; allegati: boolean; bozza: boolean; etichette: string[]
}

export type EmailPagina = { righe: EmailThreadRiga[]; paginaSuccessiva: string | null; stimaTotale: number }

export type EmailAllegato = { messaggioId: string; allegatoId: string; nome: string; mimeType: string | null; dimensione: number; inline: boolean }

export type EmailAllegatoRif = Pick<EmailAllegato, "messaggioId" | "allegatoId" | "nome" | "mimeType">

export type EmailMessaggio = {
  id: string; threadId: string; da: EmailIndirizzo | null; a: EmailIndirizzo[]; cc: EmailIndirizzo[]; ccn: EmailIndirizzo[]
  rispondiA: EmailIndirizzo[]; oggetto: string | null; data: number; anteprima: string | null; html: string | null; testo: string | null
  allegati: EmailAllegato[]; etichette: string[]; nonLetto: boolean; bozza: boolean; messageIdHeader: string | null
  references: string | null; bozzaId: string | null
}

export type EmailThread = { id: string; oggetto: string | null; messaggi: EmailMessaggio[]; etichette: string[] }

export type EmailSuggerimento = { nome: string; email: string; fonte: "PAZIENTE" | "RECENTE"; pazienteId: number | null }

export type EmailComposizione = {
  a: string[]; cc: string[]; ccn: string[]; oggetto: string; html: string; threadId: string | null; inReplyTo: string | null
  references: string | null; allegatiEsistenti: EmailAllegatoRif[]; bozzaId: string | null
}

export type EmailEsitoInvio = { messaggioId: string; threadId: string }

export type EmailEsitoBozza = { bozzaId: string; messaggioId: string | null; threadId: string | null; allegati: EmailAllegato[] }

export type EmailBozza = {
  bozzaId: string; messaggioId: string; threadId: string | null; a: EmailIndirizzo[]; cc: EmailIndirizzo[]; ccn: EmailIndirizzo[]
  oggetto: string | null; html: string | null; inReplyTo: string | null; references: string | null; allegati: EmailAllegato[]
}

/** Casella non collegata a Google: la pagina mostra la guida invece di un errore. */
export function casellaNonCollegata(errore: unknown): boolean {
  return errore instanceof ApiError && errore.status === 409
}

export function messaggioErrore(errore: unknown, ripiego = "Qualcosa è andato storto"): string {
  return errore instanceof Error && errore.message ? errore.message : ripiego
}

function formDati(messaggio: EmailComposizione, file: File[]): FormData {
  const dati = new FormData()
  dati.append("messaggio", new Blob([JSON.stringify(messaggio)], { type: "application/json" }))
  file.forEach((f) => dati.append("file", f, f.name))
  return dati
}

export const casellaService = {
  casella: () => api.get<EmailCasella>("/casella"),
  stato: (dal?: string | null) => api.get<EmailStato>("/casella/stato", { dal: dal ?? undefined }),
  elenco: (cartella: string, q?: string, pagina?: string | null) =>
    api.get<EmailPagina>("/casella/thread", { cartella, q: q || undefined, pagina: pagina || undefined }),
  thread: (id: string) => api.get<EmailThread>(`/casella/thread/${encodeURIComponent(id)}`),
  modifica: (threadIds: string[], aggiungi: string[] = [], rimuovi: string[] = []) =>
    api.post<void>("/casella/thread/modifica", { threadIds, aggiungi, rimuovi }),
  cestina: (threadIds: string[]) => api.post<void>("/casella/thread/cestino", { threadIds }),
  ripristina: (threadIds: string[]) => api.post<void>("/casella/thread/ripristina", { threadIds }),
  invia: (messaggio: EmailComposizione, file: File[]) => api.post<EmailEsitoInvio>("/casella/invia", formDati(messaggio, file)),
  salvaBozza: (messaggio: EmailComposizione, file: File[]) => api.post<EmailEsitoBozza>("/casella/bozze", formDati(messaggio, file)),
  bozza: (id: string) => api.get<EmailBozza>(`/casella/bozze/${encodeURIComponent(id)}`),
  eliminaBozza: (id: string) => api.delete<void>(`/casella/bozze/${encodeURIComponent(id)}`),
  suggerimenti: (q: string) => api.get<EmailSuggerimento[]>("/casella/suggerimenti", { q }),
  allegato: (a: EmailAllegatoRif, anteprima = false) => {
    const parametri = new URLSearchParams({ nome: a.nome, download: String(!anteprima) })
    if (a.mimeType) parametri.set("tipo", a.mimeType)
    return api.blob(`/casella/messaggi/${encodeURIComponent(a.messaggioId)}/allegati/${encodeURIComponent(a.allegatoId)}?${parametri}`)
  },
}
