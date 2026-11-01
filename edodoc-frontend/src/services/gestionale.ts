import { api, urlApi } from "@/services/api-client"
import type { RichiestaEmail } from "@/lib/email"
import type {
  Acquisti, AnteprimaFattura, BozzaEmail, CheckDettaglio, Dashboard, EmettiFattura, Fattura, Impostazioni, ListaPagamenti, Listino,
  LezioneForm, Movimento, Pagamento, Paziente, PazienteArchiviato, PazienteForm, Percorso, RigaTessera, RiepilogoFinance, RisposteCheck,
  RigaCorso, RigaLezione, RigaModulo, Riproduzione, ScadenzaFiscale, SettimanaCheck, StatoVideo, StrutturaCorso, Task, TaskCartella, TaskForm, TaskLista, TaskStruttura, Utente, Visita, VisitaForm,
} from "@/types"

export const authService = {
  login: (username: string, password: string) => api.post<{ token: string; utente: Utente }>("/auth/login", { username, password }),
  profilo: () => api.get<Utente>("/auth/me"),
  cambiaPassword: (attuale: string, nuova: string) => api.post<void>("/auth/cambia-password", { attuale, nuova }),
}

export const dashboardService = { carica: () => api.get<Dashboard>("/dashboard") }

export const pazientiService = {
  lista: () => api.get<Paziente[]>("/pazienti"),
  dettaglio: (id: number) => api.get<Paziente>(`/pazienti/${id}`),
  crea: (corpo: PazienteForm) => api.post<Paziente>("/pazienti", corpo),
  aggiorna: (id: number, corpo: PazienteForm) => api.put<Paziente>(`/pazienti/${id}`, corpo),
  archivia: (id: number) => api.delete<void>(`/pazienti/${id}`),
  archiviati: () => api.get<PazienteArchiviato[]>("/pazienti/archiviati"),
  anonimizza: (id: number) => api.post<{ email: string | null; confermaInviata: boolean }>(`/pazienti/${id}/anonimizza`),
  percorsi: (id: number) => api.get<Percorso[]>(`/pazienti/${id}/percorsi`),
  visite: (id: number) => api.get<Visita[]>(`/pazienti/${id}/visite`),
  check: (id: number) => api.get<CheckDettaglio[]>(`/pazienti/${id}/check`),
  pagamenti: (id: number) => api.get<ListaPagamenti>(`/pazienti/${id}/pagamenti`),
  fatture: (id: number) => api.get<Fattura[]>(`/pazienti/${id}/fatture`),
  task: (id: number) => api.get<Task[]>(`/pazienti/${id}/task`),
  invitoApp: (id: number) => api.post<{ link: string; emailInviata: boolean }>(`/pazienti/${id}/invito-app`),
}

export const percorsiService = {
  acquisti: () => api.get<Acquisti>("/percorsi"),
  listino: () => api.get<Listino>("/percorsi/listino"),
  crea: (corpo: { pazienteId: number; tipo: string; pianoPagamento: string; dataInizio: string; note?: string | null }) =>
    api.post<Percorso>("/percorsi", corpo),
  annulla: (id: number) => api.delete<void>(`/percorsi/${id}`),
}

export const visiteService = {
  periodo: (da: string, a: string) => api.get<Visita[]>("/visite", { da, a }),
  crea: (corpo: VisitaForm) => api.post<Visita>("/visite", corpo),
  aggiorna: (id: number, corpo: VisitaForm) => api.put<Visita>(`/visite/${id}`, corpo),
  cambiaStato: (id: number, stato: string) => api.post<Visita>(`/visite/${id}/stato`, { stato }),
}

export const checkService = {
  settimana: (data?: string) => api.get<SettimanaCheck>("/check/settimana", { data }),
  inserisci: (pazienteId: number, risposte: RisposteCheck, data?: string) =>
    api.post<CheckDettaglio>(`/check/paziente/${pazienteId}${data ? `?data=${data}` : ""}`, risposte),
  contatto: (pazienteId: number, settimana: string, giorno: "LUNEDI" | "MERCOLEDI", fatto: boolean) =>
    api.post<void>("/check/contatto", { pazienteId, settimana, giorno, fatto }),
  letto: (id: number) => api.post<void>(`/check/${id}/letto`),
}

export const pagamentiService = {
  periodo: (da: string, a: string) => api.get<ListaPagamenti>("/pagamenti", { da, a }),
  crea: (corpo: { pazienteId: number; tipo: string; descrizione: string; importo: number; scadenza: string; note?: string | null }) =>
    api.post<Pagamento>("/pagamenti", corpo),
  aggiorna: (id: number, corpo: { pazienteId: number; tipo: string; descrizione: string; importo: number; scadenza: string; note?: string | null }) =>
    api.put<Pagamento>(`/pagamenti/${id}`, corpo),
  registra: (id: number, corpo: { dataPagamento: string; metodo: string; contabile: boolean }) =>
    api.post<Pagamento>(`/pagamenti/${id}/registra`, corpo),
  annullaRegistrazione: (id: number) => api.post<Pagamento>(`/pagamenti/${id}/annulla-registrazione`),
  annulla: (id: number) => api.delete<void>(`/pagamenti/${id}`),
}

export const fattureService = {
  periodo: (da: string, a: string) => api.get<Fattura[]>("/fatture", { da, a }),
  anteprima: (corpo: EmettiFattura) => api.post<AnteprimaFattura>("/fatture/anteprima", corpo),
  emetti: (corpo: EmettiFattura) => api.post<Fattura>("/fatture", corpo),
  annulla: (id: number, motivo: string) => api.post<Fattura>(`/fatture/${id}/annulla`, { motivo }),
  tessera: (mese: string) => api.get<RigaTessera[]>("/fatture/tessera-sanitaria", { mese }),
  segnaTessera: (id: number, inserita: boolean) => api.post<void>(`/fatture/${id}/tessera-sanitaria/inserita?inserita=${inserita}`),
  async apriPdf(id: number) {
    // Scheda aperta subito: dopo l'await il browser la bloccherebbe come popup
    const scheda = window.open("", "_blank")
    const url = URL.createObjectURL(await api.blob(`/fatture/${id}/pdf`))
    if (scheda) scheda.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  },
}

export const emailService = {
  bozza: (richiesta: RichiestaEmail) => api.post<BozzaEmail>("/email/bozza", richiesta),
  invia: (corpo: RichiestaEmail & { destinatario: string; oggetto: string; corpo: string }) => api.post<void>("/email/invia", corpo),
}

export const taskService = {
  struttura: () => api.get<TaskStruttura>("/task/struttura"),
  lista: (completati: boolean) => api.get<Task[]>("/task", { completati }),
  crea: (corpo: TaskForm) => api.post<Task>("/task", corpo),
  aggiorna: (id: number, corpo: TaskForm) => api.put<Task>(`/task/${id}`, corpo),
  cambiaStato: (id: number, fatto: boolean) => api.post<Task>(`/task/${id}/stato?fatto=${fatto}`),
  elimina: (id: number) => api.delete<void>(`/task/${id}`),
  creaCartella: (corpo: { nome: string; parentId: number | null; colore: string }) => api.post<TaskCartella>("/task/cartelle", corpo),
  modificaCartella: (id: number, corpo: ModificaStruttura) => api.put<TaskCartella>(`/task/cartelle/${id}`, corpo),
  spostaCartella: (id: number, corpo: SpostaStruttura) => api.put<TaskCartella>(`/task/cartelle/${id}/posizione`, corpo),
  eliminaCartella: (id: number) => api.delete<void>(`/task/cartelle/${id}`),
  creaLista: (corpo: { nome: string; cartellaId: number | null; colore: string; icona: string }) => api.post<TaskLista>("/task/liste", corpo),
  modificaLista: (id: number, corpo: ModificaStruttura) => api.put<TaskLista>(`/task/liste/${id}`, corpo),
  spostaLista: (id: number, corpo: SpostaStruttura) => api.put<TaskLista>(`/task/liste/${id}/posizione`, corpo),
  contaTaskLista: (id: number) => api.get<number>(`/task/liste/${id}/conteggio`),
  eliminaLista: (id: number, conferma: string) => api.delete<void>(`/task/liste/${id}?conferma=${encodeURIComponent(conferma)}`),
}

type ModificaStruttura = { nome?: string; colore?: string; icona?: string; archiviata?: boolean }
type SpostaStruttura = { contenitoreId: number | null; ordine?: number }

type TestiForm = { titolo: string; descrizione: string | null }

const conFile = (file: File) => {
  const corpo = new FormData()
  corpo.append("file", file)
  return corpo
}

export const urlCopertina = (id: string) => urlApi(`/media/copertine/${id}`)

export const corsiService = {
  catalogo: () => api.get<RigaCorso[]>("/corsi"),
  struttura: (id: number) => api.get<StrutturaCorso>(`/corsi/${id}`),
  crea: (corpo: TestiForm) => api.post<StrutturaCorso>("/corsi", corpo),
  aggiorna: (id: number, corpo: TestiForm) => api.put<StrutturaCorso>(`/corsi/${id}`, corpo),
  elimina: (id: number) => api.delete<void>(`/corsi/${id}`),
  pubblica: (id: number, pubblicato: boolean) => api.post<StrutturaCorso>(`/corsi/${id}/pubblicazione?pubblicato=${pubblicato}`),
  caricaCopertina: (id: number, file: File) => api.post<void>(`/corsi/${id}/copertina`, conFile(file)),
  togliCopertina: (id: number) => api.delete<void>(`/corsi/${id}/copertina`),
  creaModulo: (corsoId: number, corpo: TestiForm) => api.post<RigaModulo>(`/corsi/${corsoId}/moduli`, corpo),
  aggiornaModulo: (id: number, corpo: TestiForm) => api.put<RigaModulo>(`/moduli/${id}`, corpo),
  eliminaModulo: (id: number) => api.delete<void>(`/moduli/${id}`),
  riordinaModuli: (corsoId: number, ids: number[]) => api.put<void>(`/corsi/${corsoId}/moduli/ordine`, { ids }),
  caricaCopertinaModulo: (id: number, file: File) => api.post<void>(`/moduli/${id}/copertina`, conFile(file)),
  togliCopertinaModulo: (id: number) => api.delete<void>(`/moduli/${id}/copertina`),
  creaLezione: (moduloId: number, corpo: LezioneForm) => api.post<RigaLezione>(`/moduli/${moduloId}/lezioni`, corpo),
  aggiornaLezione: (id: number, corpo: LezioneForm) => api.put<RigaLezione>(`/lezioni/${id}`, corpo),
  eliminaLezione: (id: number) => api.delete<void>(`/lezioni/${id}`),
  pubblicaLezione: (id: number, pubblicata: boolean) => api.post<RigaLezione>(`/lezioni/${id}/pubblicazione?pubblicata=${pubblicata}`),
  riordinaLezioni: (moduloId: number, ids: number[]) => api.put<void>(`/moduli/${moduloId}/lezioni/ordine`, { ids }),
  avviaUploadVideo: (id: number, dimensioneBytes: number) => api.post<{ uploadUrl: string }>(`/lezioni/${id}/video/upload`, { dimensioneBytes }),
  sincronizzaVideo: (id: number) => api.post<StatoVideo>(`/lezioni/${id}/video/sincronizza`),
  riproduzione: (id: number) => api.get<Riproduzione>(`/lezioni/${id}/video/riproduzione`),
}

type MovimentoForm = Omit<Movimento, "id">
type ScadenzaForm = Pick<ScadenzaFiscale, "titolo" | "categoria" | "dataScadenza" | "importoStimato" | "note">

export const financeService = {
  riepilogo: (anno: number) => api.get<RiepilogoFinance>("/finance/riepilogo", { anno }),
  movimenti: (anno: number) => api.get<Movimento[]>("/finance/movimenti", { anno }),
  creaMovimento: (corpo: MovimentoForm) => api.post<Movimento>("/finance/movimenti", corpo),
  aggiornaMovimento: (id: number, corpo: MovimentoForm) => api.put<Movimento>(`/finance/movimenti/${id}`, corpo),
  eliminaMovimento: (id: number) => api.delete<void>(`/finance/movimenti/${id}`),
  scadenze: (anno: number) => api.get<ScadenzaFiscale[]>("/finance/scadenze", { anno }),
  creaScadenza: (corpo: ScadenzaForm) => api.post<ScadenzaFiscale>("/finance/scadenze", corpo),
  aggiornaScadenza: (id: number, corpo: ScadenzaForm) => api.put<ScadenzaFiscale>(`/finance/scadenze/${id}`, corpo),
  pagaScadenza: (id: number, data: string, importo: number) => api.post<ScadenzaFiscale>(`/finance/scadenze/${id}/paga`, { data, importo }),
  eliminaScadenza: (id: number) => api.delete<void>(`/finance/scadenze/${id}`),
}

export const impostazioniService = {
  carica: () => api.get<Impostazioni>("/impostazioni"),
  aggiorna: (chiave: string, valore: string) => api.put<unknown>("/impostazioni", { chiave, valore }),
}
