import type { TipoEmail } from "@/lib/email"

export type Paziente = {
  id: number; nome: string; cognome: string; email: string | null; cellulare: string | null
  codiceFiscale: string | null; dataNascita: string | null; indirizzo: string | null; cap: string | null
  citta: string | null; provincia: string | null; stato: string; fonte: string | null
  situazione: string | null; nota: string | null; pesoInizialeKg: number | null; pesoObiettivoKg: number | null
  createdAt: string; percorso: Percorso | null; prossimaVisita: string | null; situazionePagamenti: string
  residuo: number; checkSettimana: boolean; accessoApp: boolean
}

export type PazienteForm = Omit<Paziente, "id" | "createdAt" | "percorso" | "prossimaVisita" | "situazionePagamenti" | "residuo" | "checkSettimana" | "accessoApp">

export type Percorso = {
  id: number; pazienteId: number; tipo: string; pianoPagamento: string; dataInizio: string; dataFine: string
  visiteTotali: number; visiteFissate: number; visiteEffettuate: number; importoTotale: number; stato: string; note: string | null
}

export type Acquisto = {
  percorso: Percorso; pazienteNome: string; pagato: number; daPagare: number; scaduto: number
  prossimaScadenza: string | null; pagamenti: Pagamento[]
}

export type Acquisti = { percorsi: Acquisto[]; fuoriPercorso: Pagamento[] }

export type Listino = { unico: number; rataPercorso: number; acconto: number; mantenimento: number; rataMantenimento: number }

export type Visita = {
  id: number; pazienteId: number; pazienteNome: string; pazienteEmail: string | null; pazienteCellulare: string | null
  percorsoId: number | null; percorsoTipo: string | null; numeroVisita: number | null; visiteTotali: number | null
  tipo: string; modalita: string; stato: string; inizio: string; fine: string; conMeet: boolean; meetUrl: string | null
  invitaPaziente: boolean; note: string | null; titoloCalendario: string; googleSyncStato: string; googleSyncErrore: string | null
}

export type VisitaForm = {
  pazienteId: number; tipo: string; modalita: string; inizio: string; durataMinuti: number
  conMeet: boolean; invitaPaziente: boolean; note: string | null
}

export type RisposteCheck = {
  pastiOttimali: number; pastiLiberi: string | null; energia: number; allenamento: string | null
  pesoKg: number | null; andamentoPeso: string | null; percezione: string | null
  percezioneMigliorata: boolean | null; impegno: number
}

export type CheckDettaglio = RisposteCheck & {
  id: number; pazienteId: number; pazienteNome: string; settimana: string; compilatoIl: string; fonte: string
  pesoFermo: boolean; percezioneNegativa: boolean; energiaBassa: boolean; lettoIl: string | null
}

export type RigaCheck = {
  pazienteId: number; pazienteNome: string; cellulare: string | null; statoPaziente: string; situazione: string | null
  nota: string | null; azione: string; check: CheckDettaglio | null; lunediFattoIl: string | null; mercolediFattoIl: string | null
}

export type SettimanaCheck = {
  settimana: string; attesi: number; compilati: number; conSegnali: number
  daContattareLunedi: number; daContattareMercoledi: number; righe: RigaCheck[]
}

export type Pagamento = {
  id: number; pazienteId: number; pazienteNome: string; percorsoId: number | null; percorsoTipo: string | null; tipo: string; descrizione: string
  importo: number; scadenza: string; stato: string; scaduto: boolean; dataPagamento: string | null
  metodo: string | null; contabile: boolean; note: string | null; fatturato: boolean
}

export type ListaPagamenti = { riepilogo: { pagato: number; daPagare: number; scaduto: number }; righe: Pagamento[] }

export type Fattura = {
  id: number; numero: number; dataEmissione: string; stato: string; pazienteId: number; pagamentoId: number | null; pagamentoDescrizione: string | null
  intestatario: string; indirizzo: string; codiceFiscale: string; descrizione: string; imponibile: number
  contributo: number; bollo: number; importoTotale: number; motivoAnnullamento: string | null
  emailPaziente: string | null; emailDestinatario: string | null; emailInviataIl: string | null
  tsStato: string; tsInseritaIl: string | null; tsOpposizione: boolean; nomeFile: string
}

export type AnteprimaFattura = {
  numero: number; data: string; intestatario: string; indirizzo: string | null; codiceFiscale: string | null
  descrizione: string; imponibile: number; contributo: number; bollo: number; importoTotale: number
}

export type EmettiFattura = {
  pagamentoId?: number | null; pazienteId?: number | null; importo?: number | null
  data?: string | null; descrizione?: string | null; tsOpposizione?: boolean
}

export type RigaTessera = { fatturaId: number; numero: number; data: string; codiceFiscale: string; importo: number }

export type TaskCartella = { id: number; nome: string; parentId: number | null; colore: string; ordine: number; archiviata: boolean }

/** codice: solo le liste di sistema, dove scrivono i job; non si archiviano e non si eliminano. */
export type TaskLista = {
  id: number; nome: string; cartellaId: number | null; codice: string | null; colore: string; icona: string; ordine: number; archiviata: boolean
}

export type TaskStruttura = { cartelle: TaskCartella[]; liste: TaskLista[] }

export type TaskTipoStruttura = "LISTA" | "CARTELLA"

export type Task = {
  id: number; titolo: string; descrizione: string | null; lista: TaskLista; stato: string; priorita: string
  scadenza: string | null; pazienteId: number | null; pazienteNome: string | null; automatico: boolean
  completatoIl: string | null; inRitardo: boolean
}

export type TaskForm = {
  listaId: number; titolo: string; descrizione?: string | null; scadenza?: string | null
  priorita?: string | null; pazienteId?: number | null
}

export type MeseFinance = {
  mese: number; pazienti: number; youtube: number; altro: number; lordo: number; impostaSostitutiva: number
  contributoInFattura: number; cassaPrevidenziale: number; netto: number; uscite: number
}

export type RiepilogoFinance = {
  anno: number; mesi: MeseFinance[]; totali: MeseFinance
  livelli: { nome: string; descrizione: string; totale: number; margineObiettivo: number; margineSoglia: number }[]
  soglia: number; obiettivo: number; valoreNuovoCliente: number; candidatureAperte: boolean; saldoCassa: number
}

export type Movimento = { id: number; data: string; tipo: string; categoria: string; descrizione: string; importo: number; note: string | null }

export type ScadenzaFiscale = {
  id: number; titolo: string; categoria: string; dataScadenza: string; importoStimato: number | null
  stato: string; pagataIl: string | null; note: string | null
}

export type Dashboard = {
  pazientiAttivi: number; pazientiMantenimento: number; lead: number; listaAttesa: number; settimana: string
  checkAttesi: number; checkCompilati: number; checkConSegnali: number; daContattareOggi: number
  visiteSettimana: number; visiteOggi: Visita[]; taskAperti: number; taskInRitardo: number; taskUrgenti: Task[]
  incassatoMese: number; incassatoAnno: number; daIncassare: number; scaduto: number; margineSoglia: number
  candidatureAperte: boolean
  rinnovi: { pazienteId: number; pazienteNome: string; percorsoId: number; visiteFissate: number; visiteTotali: number; dataFine: string }[]
  incassiMensili: { mese: number; importo: number }[]
  andamentoCheck: { settimana: string; compilati: number; segnali: number; energiaMedia: number | null; impegnoMedio: number | null }[]
  prossimeScadenze: ScadenzaFiscale[]
}

export type BozzaEmail = {
  tipo: TipoEmail; pazienteId: number; pazienteNome: string; pagamentoId: number | null; fatturaId: number | null
  mittente: string; destinatario: string | null; oggetto: string; testo: string; allegato: string | null; invioAttivo: boolean
}

export type Utente = { id: number; username: string; nome: string; cognome: string; ruolo: string; pazienteId: number | null }

export type Impostazioni = {
  voci: { chiave: string; valore: string; descrizione: string | null }[]
  integrazioni: { codice: string; nome: string; attiva: boolean; configurata: boolean; nota: string }[]
}

export type TipoLezione = "VIDEO" | "TESTO"
export type VideoStato = "CARICAMENTO" | "ELABORAZIONE" | "PRONTO" | "ERRORE"

export type RigaCorso = {
  id: number; titolo: string; descrizione: string | null; copertinaId: string | null; pubblicato: boolean
  moduli: number; lezioni: number; lezioniPubblicate: number; secondiVideo: number
}

export type RigaModulo = { id: number; titolo: string; descrizione: string | null; copertinaId: string | null; ordine: number }

export type RigaLezione = {
  id: number; moduloId: number; titolo: string; descrizione: string | null; tipo: TipoLezione; ordine: number
  pubblicata: boolean; completa: boolean; contenuto: string | null; videoStato: VideoStato | null
  videoErrore: string | null; durataSecondi: number | null
}

export type LezioneForm = { tipo: TipoLezione; titolo: string; descrizione: string | null; contenuto: string | null }
export type ModuloConLezioni = { modulo: RigaModulo; lezioni: RigaLezione[] }
export type StrutturaCorso = { corso: RigaCorso; moduli: ModuloConLezioni[] }
export type StatoVideo = { stato: VideoStato; avanzamento: number | null; lezione: RigaLezione }
export type Riproduzione = { iframeUrl: string; hlsUrl: string }
