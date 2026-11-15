import { api, urlApi } from "@/services/api-client"

/* Accettazione firmata online: pannello nella scheda paziente (gestionale) e pagina pubblica /firma/:token. */

export type StatoAccettazione = "INVIATA" | "APERTA" | "FIRMATA" | "ANNULLATA" | "SCADUTA"

export type RigaAccettazione = {
  id: number
  stato: StatoAccettazione
  codiceVerifica: string
  creataIl: string
  scadeIl: string
  apertaIl: string | null
  firmataIl: string | null
  email: string
  firmatario: string
  ruolo: "PAZIENTE" | "GENITORE" | "TUTORE"
  versioneModulo: string
  emailInviataIl: string | null
  copiaInviataIl: string | null
  marcaTemporale: boolean
  motivoAnnullamento: string | null
  consensi: Record<string, boolean>
}

export type ConsensoPaziente = { tipo: string; titolo: string; concesso: boolean; il: string; fonte: "ACCETTAZIONE" | "MANUALE"; note: string | null }

export type PanoramicaAccettazione = {
  richieste: RigaAccettazione[]
  consensi: ConsensoPaziente[]
  datiTitolareMancanti: string[]
  emailAttiva: boolean
  minorenne: boolean
}

export type AccettazioneInviata = { riga: RigaAccettazione; link: string; avviso: string | null }

export type EventoRegistro = { seq: number; tipo: string; il: string; ip: string | null; userAgent: string | null; dettagli: string | null }

export type CreaAccettazione = {
  email?: string
  inviaEmail: boolean
  genitore?: { nome: string; cognome: string; codiceFiscale?: string; ruolo: "GENITORE" | "TUTORE" } | null
}

export const accettazioneService = {
  panoramica: (pazienteId: number) => api.get<PanoramicaAccettazione>(`/pazienti/${pazienteId}/accettazioni`),
  crea: (pazienteId: number, corpo: CreaAccettazione) => api.post<AccettazioneInviata>(`/pazienti/${pazienteId}/accettazioni`, corpo),
  reinvia: (id: number, corpo: { email?: string; inviaEmail: boolean }) => api.post<AccettazioneInviata>(`/accettazioni/${id}/reinvia`, corpo),
  annulla: (id: number, motivo?: string) => api.post<RigaAccettazione>(`/accettazioni/${id}/annulla`, { motivo }),
  elimina: (id: number) => api.delete<void>(`/accettazioni/${id}`),
  registro: (id: number) => api.get<{ eventi: EventoRegistro[]; integro: boolean }>(`/accettazioni/${id}/registro`),
  consenso: (pazienteId: number, tipo: string, concesso: boolean, note?: string) =>
    api.post<ConsensoPaziente[]>(`/pazienti/${pazienteId}/consensi`, { tipo, concesso, note }),
  async apriPdf(id: number) {
    // Scheda aperta subito: dopo l'await il browser la bloccherebbe come popup
    const scheda = window.open("", "_blank")
    try {
      const url = URL.createObjectURL(await api.blob(`/accettazioni/${id}/pdf`))
      if (scheda) scheda.location.href = url
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      scheda?.close()
      throw e
    }
  },
}

// ------------------------------------------------------------------ pagina pubblica

export type Persona = {
  nome: string
  cognome: string
  codiceFiscale: string | null
  dataNascita: string | null
  luogoNascita: string | null
  indirizzo: string | null
  cap: string | null
  citta: string | null
  provincia: string | null
  email: string | null
  cellulare: string | null
}

export type SezioneModulo = { id: string; titolo: string; testo: string; dichiarazione: string }
export type ConsensoFacoltativo = { id: string; titolo: string; testo: string }

export type VistaFirma = {
  stato: StatoAccettazione
  scadeIl: string
  titolare: string
  ruolo: "PAZIENTE" | "GENITORE" | "TUTORE"
  minorenne: boolean
  paziente: Persona | null
  firmatario: Persona | null
  emailMascherata: string | null
  datiConfermati: boolean
  codiceVerificato: boolean
  modulo: {
    titolo: string
    sottotitolo: string
    versione: string
    sezioni: SezioneModulo[]
    dichiarazioneRappresentante: string
    consensi: ConsensoFacoltativo[]
    notaConsensi: string | null
  } | null
  informativaHtml: string | null
  fornitoriHtml: string | null
  informativaTitolo: string | null
  fornitoriTitolo: string | null
  firmata: { codiceVerifica: string; firmataIl: string; copiaInviata: boolean } | null
  contatto: string
}

export type VerificaFirma = {
  valido: boolean
  titolo: string | null
  firmataIl: string | null
  iniziali: string | null
  pdfSha256: string | null
  marcaTemporale: boolean
  titolare: string
}

const base = (token: string) => `/pubblico/accettazione/${encodeURIComponent(token)}`

export const firmaPubblica = {
  vista: (token: string) => api.get<VistaFirma>(base(token)),
  dati: (token: string, paziente: Persona, firmatario: Persona | null) => api.post<VistaFirma>(`${base(token)}/dati`, { paziente, firmatario }),
  documentoAperto: (token: string, tipo: "INFORMATIVA" | "FORNITORI") =>
    api.post<void>(`${base(token)}/documento-aperto?tipo=${tipo}`).catch(() => undefined),
  inviaCodice: (token: string) => api.post<{ emailMascherata: string; validoMinuti: number; attesaSecondi: number }>(`${base(token)}/codice`),
  verificaCodice: (token: string, codice: string) => api.post<VistaFirma>(`${base(token)}/codice/verifica`, { codice }),
  firma: (token: string, corpo: { dichiarazioni: string[]; consensi: Record<string, boolean>; rappresentante: boolean; firmaPng: string }) =>
    api.post<{ codiceVerifica: string; firmataIl: string; copiaInviata: boolean }>(`${base(token)}/firma`, corpo),
  urlCopia: (token: string) => urlApi(`${base(token)}/copia`),
  verifica: (codice: string) => api.get<VerificaFirma>(`/pubblico/verifica-firma/${encodeURIComponent(codice)}`),
}
