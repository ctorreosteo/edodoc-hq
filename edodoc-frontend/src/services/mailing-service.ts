import { api } from './api-client';

/*
  Email Marketing (/email-marketing): contatti = pazienti del gestionale (un lead è un paziente in stato LEAD
  o LISTA_ATTESA), segmenti sui dati veri, campagne, automazioni, invio dalle caselle Google Workspace.
  Portato da Mobilitas HQ (mobilitas-backend/docs/features/email-marketing.md). Ogni tipo qui è lo specchio di
  un record in edodoc-backend/src/main/java/it/edodoc/hq/dto/MailingDto.java: cambiarli insieme.
  Date: stringhe ISO con offset. Tassi: percentuale 0–100, null se non calcolabile.
*/

// ───────────────────────── Enum (stringhe del backend) ─────────────────────────

export type MailingStatoContatto = 'ISCRITTO' | 'DISISCRITTO' | 'RIMBALZATO' | 'SEGNALATO_SPAM' | 'ARCHIVIATO';
export type MailingBaseGiuridica = 'CONSENSO' | 'CLIENTE_SOFT_SPAM' | 'MANUALE';
export type MailingTipoContatto = 'PAZIENTE' | 'LEAD' | 'ALTRO';
/** Stato del paziente in EdoDoc (un lead è un paziente LEAD o LISTA_ATTESA). */
export type MailingStatoPaziente = 'LEAD' | 'LISTA_ATTESA' | 'ATTIVO' | 'MANTENIMENTO' | 'CONCLUSO';
export type MailingCoinvolgimento = 'ATTIVO' | 'TIEPIDO' | 'DORMIENTE' | 'MAI';
export type MailingStatoCampagna =
  | 'BOZZA' | 'PROGRAMMATA' | 'IN_INVIO' | 'TEST_AB' | 'IN_PAUSA' | 'INVIATA' | 'ANNULLATA';
export type MailingStatoAutomazione = 'BOZZA' | 'ATTIVA' | 'IN_PAUSA' | 'ARCHIVIATA';
export type MailingStatoIscrizione = 'ATTIVA' | 'IN_ATTESA' | 'COMPLETATA' | 'USCITA' | 'ERRORE';
export type MailingStatoInvio = 'IN_CODA' | 'IN_INVIO' | 'INVIATO' | 'RIMBALZATO' | 'ERRORE' | 'SALTATO' | 'ANNULLATO';
export type MailingCanale = 'GMAIL_API' | 'SMTP_RELAY_GOOGLE' | 'SMTP';
export type MailingTipoEvento =
  | 'INVIATO' | 'APERTURA' | 'CLICK' | 'RISPOSTA' | 'DISISCRIZIONE' | 'RIMBALZO' | 'SPAM'
  | 'CONVERSIONE_VISITA' | 'CONVERSIONE_ACQUISTO';
export type MailingEsitoControllo = 'OK' | 'AVVISO' | 'BLOCCANTE' | 'ERRORE';
export type MailingFiltroDestinatari = 'TUTTI' | 'APERTO' | 'CLICK' | 'NON_APERTO' | 'RIMBALZATO' | 'DISISCRITTO';
export type MailingTono = 'CALDO' | 'PROFESSIONALE' | 'BREVE' | 'URGENTE';

// ───────────────────────── Comuni ─────────────────────────

export type MailingPagina<T> = { elementi: T[]; totale: number; pagina: number; dimensione: number };

export type MailingMetriche = {
  destinatari: number;
  inviati: number;
  inCoda: number;
  errori: number;
  rimbalzi: number;
  apertureUniche: number;
  apertureAutomatiche: number;
  clickUnici: number;
  risposte: number;
  disiscrizioni: number;
  spam: number;
  tassoApertura: number | null;
  tassoClick: number | null;
  tassoClickSuAperture: number | null;
  tassoDisiscrizione: number | null;
  tassoRimbalzo: number | null;
  visiteGenerate: number;
  fatturatoGenerato: number | null;
};

export type MailingPuntoSerie = { giorno: string; valori: Record<string, number> };

// ───────────────────────── Stato e panoramica ─────────────────────────

export type MailingStato = {
  invioAbilitato: boolean;
  aiDisponibile: boolean;
  mittentiAttivi: number;
  urlPubblico: string;
  avvisi: string[];
};

export type MailingSaluteLista = {
  punteggio: number;
  attivi: number;
  tiepidi: number;
  dormienti: number;
  maiAperto: number;
  rimbalzati: number;
  disiscritti: number;
  tassoRimbalzo30g: number | null;
  tassoSpam30g: number | null;
  consigli: string[];
};

export type MailingAttivita = {
  id: number;
  tipo: MailingTipoEvento;
  avvenutoIl: string;
  contattoId: number | null;
  contattoNome: string | null;
  contattoEmail: string | null;
  campagnaId: number | null;
  automazioneId: number | null;
  messaggio: string;
  url: string | null;
  dispositivo: string | null;
  valore: number | null;
};

export type MailingPanoramica = {
  giorni: number;
  contattiIscritti: number;
  contattiTotali: number;
  nuoviIscritti: number;
  nuoviIscrittiPrecedente: number;
  disiscritti: number;
  metriche: MailingMetriche;
  metrichePrecedente: MailingMetriche;
  crescita: MailingPuntoSerie[];
  attivitaGiornaliera: MailingPuntoSerie[];
  salute: MailingSaluteLista;
  campagneRecenti: MailingCampagnaRiga[];
  programmate: MailingCampagnaRiga[];
  automazioniAttive: MailingAutomazioneRiga[];
  mittenti: MailingMittente[];
  inCodaTotale: number;
};

// ───────────────────────── Contatti ─────────────────────────

export type MailingTag = { id: number; nome: string; colore: string | null; sistema: boolean; contatti: number | null };

export type MailingContattoRiga = {
  id: number;
  email: string;
  nome: string | null;
  cognome: string | null;
  stato: MailingStatoContatto;
  baseGiuridica: MailingBaseGiuridica;
  pazienteId: number | null;
  tipo: MailingTipoContatto;
  tag: MailingTag[];
  punteggio: number;
  coinvolgimento: MailingCoinvolgimento;
  ultimaAperturaIl: string | null;
  ultimoClickIl: string | null;
  creatoIl: string;
};

export type MailingPazienteBreve = {
  id: number;
  nomeCompleto: string;
  cellulare: string | null;
  numeroVisite: number;
  ultimaVisita: string | null;
  prossimaVisita: string | null;
  statoPaziente: MailingStatoPaziente | null;
  spesaTotale: number | null;
};

export type MailingInvioContatto = {
  id: number;
  oggetto: string | null;
  campagnaId: number | null;
  campagnaNome: string | null;
  automazioneId: number | null;
  automazioneNome: string | null;
  stato: MailingStatoInvio;
  inviatoIl: string | null;
  primaAperturaIl: string | null;
  aperture: number;
  primoClickIl: string | null;
  click: number;
  rispostoIl: string | null;
};

export type MailingIscrizioneContatto = {
  id: number;
  automazioneId: number;
  automazioneNome: string;
  stato: MailingStatoIscrizione;
  nodoCorrente: string | null;
  prossimaAzioneIl: string | null;
  iniziataIl: string;
};

export type MailingContattoDettaglio = {
  contatto: MailingContattoRiga;
  fonte: string | null;
  consensoIl: string | null;
  disiscrittoIl: string | null;
  motivoDisiscrizione: string | null;
  note: string | null;
  categorieEscluse: number[];
  metriche: MailingMetriche;
  invii: MailingInvioContatto[];
  eventi: MailingAttivita[];
  automazioni: MailingIscrizioneContatto[];
  paziente: MailingPazienteBreve | null;
};

export type MailingContattoInput = {
  email: string;
  nome?: string | null;
  cognome?: string | null;
  baseGiuridica?: MailingBaseGiuridica | null;
  note?: string | null;
  tagIds?: number[] | null;
  categorieEscluse?: number[] | null;
};

export type MailingEsitoImport = {
  righe: number;
  creati: number;
  aggiornati: number;
  saltati: number;
  nonValidi: number;
  errori: string[];
};

export type MailingEsitoSincronizzazione = {
  pazienti: number;
  lead: number;
  creati: number;
  aggiornati: number;
  archiviati: number;
};

export type MailingFiltroContatti = {
  q?: string;
  stato?: MailingStatoContatto | '';
  tagId?: number | null;
  segmentoId?: number | null;
  pagina?: number;
  dimensione?: number;
  ordina?: string;
};

// ───────────────────────── Categorie e segmenti ─────────────────────────

export type MailingCategoria = {
  id: number;
  nome: string;
  descrizione: string | null;
  ordine: number;
  attiva: boolean;
  esclusi: number | null;
};

export type MailingCategoriaInput = { nome: string; descrizione?: string | null; ordine?: number; attiva?: boolean };

/** Condizione foglia del costruttore di segmenti. Vedi §4 della specifica per campi e operatori. */
export type MailingCondizione = { campo: string; op: string; valore?: unknown };
export type MailingGruppoRegole = { operatore: 'E' | 'O'; condizioni: (MailingCondizione | MailingGruppoRegole)[] };

export type MailingSegmento = {
  id: number;
  nome: string;
  descrizione: string | null;
  colore: string | null;
  regole: MailingGruppoRegole;
  ultimoConteggio: number | null;
  contatoIl: string | null;
  aggiornatoIl: string | null;
};

export type MailingSegmentoInput = {
  nome: string;
  descrizione?: string | null;
  colore?: string | null;
  regole: MailingGruppoRegole;
};

export type MailingOpzione = { valore: string; etichetta: string };

/** tipoValore: NESSUNO, NUMERO, TESTO, SELECT, MULTI_SELECT, INTERVALLO, MESE */
export type MailingCatalogoCampo = {
  campo: string;
  etichetta: string;
  gruppo: string;
  tipoValore: 'NESSUNO' | 'NUMERO' | 'TESTO' | 'SELECT' | 'MULTI_SELECT' | 'INTERVALLO' | 'MESE';
  operatori: string[];
  opzioni: MailingOpzione[] | null;
  aiuto: string | null;
};

export type MailingAnteprimaSegmento = { totale: number; iscritti: number; campione: MailingContattoRiga[] };

// ───────────────────────── Template, immagini, documento editor ─────────────────────────

export type MailingImpostazioniDocumento = {
  larghezza: number;
  sfondo: string;
  sfondoContenuto: string;
  font: string;
  colorePrimario: string;
  coloreTesto: string;
  raggio: number;
};

export type MailingTipoBlocco =
  | 'intestazione' | 'titolo' | 'testo' | 'immagine' | 'pulsante' | 'divisore' | 'spazio'
  | 'colonne' | 'social' | 'video' | 'recensione' | 'html' | 'piedipagina';

/**
 * Blocco del documento email. `props` dipende dal tipo (definito in lib/mailing-render.ts, unico renderer).
 * `colonne` ha `colonne: MailingBlocco[][]`.
 */
export type MailingBlocco = {
  id: string;
  tipo: MailingTipoBlocco;
  props: Record<string, unknown>;
  colonne?: MailingBlocco[][];
};

export type MailingDocumento = {
  versione: 1;
  impostazioni: MailingImpostazioniDocumento;
  blocchi: MailingBlocco[];
};

export type MailingTemplateRiga = {
  id: number;
  nome: string;
  categoria: string | null;
  origine: 'EDITOR' | 'SISTEMA';
  aggiornatoIl: string | null;
};

export type MailingTemplate = MailingTemplateRiga & { design: MailingDocumento | null; html: string };

export type MailingTemplateInput = {
  nome: string;
  categoria?: string | null;
  design: MailingDocumento | null;
  html: string;
};

export type MailingImmagine = { id: number; url: string; larghezza: number | null; altezza: number | null };

// ───────────────────────── Campagne ─────────────────────────

export type MailingPubblico = {
  tutti: boolean;
  segmentiIds: number[];
  tagIds: number[];
  regole: MailingGruppoRegole | null;
  esclusiSegmentiIds: number[];
  esclusiTagIds: number[];
};

export type MailingVarianteAb = { chiave: string; oggetto: string; preheader: string | null };

export type MailingTestAb = {
  varianti: MailingVarianteAb[];
  percentualeTest: number;
  metrica: 'APERTURE' | 'CLICK';
  oreAttesa: number;
  vincitore: string | null;
  decisoIl: string | null;
};

export type MailingCampagnaRiga = {
  id: number;
  nome: string;
  stato: MailingStatoCampagna;
  oggetto: string | null;
  mittente: string | null;
  programmataIl: string | null;
  invioIniziatoIl: string | null;
  invioCompletatoIl: string | null;
  destinatariTotali: number | null;
  testAb: boolean;
  metriche: MailingMetriche;
  aggiornatoIl: string | null;
};

export type MailingCampagna = {
  id: number;
  nome: string;
  stato: MailingStatoCampagna;
  mittenteId: number | null;
  categoriaId: number | null;
  oggetto: string | null;
  preheader: string | null;
  design: MailingDocumento | null;
  html: string | null;
  pubblico: MailingPubblico | null;
  testAb: MailingTestAb | null;
  invioIntelligente: boolean;
  utmCampaign: string | null;
  programmataIl: string | null;
  invioIniziatoIl: string | null;
  invioCompletatoIl: string | null;
  destinatariTotali: number | null;
  metriche: MailingMetriche;
  creatoIl: string;
  aggiornatoIl: string | null;
};

export type MailingCampagnaInput = {
  nome: string;
  mittenteId?: number | null;
  categoriaId?: number | null;
  oggetto?: string | null;
  preheader?: string | null;
  design?: MailingDocumento | null;
  html?: string | null;
  pubblico?: MailingPubblico | null;
  testAb?: MailingTestAb | null;
  invioIntelligente?: boolean;
  utmCampaign?: string | null;
  templateId?: number | null;
};

export type MailingStimaPubblico = {
  destinatari: number;
  disiscritti: number;
  rimbalzati: number;
  categoriaEsclusa: number;
  senzaEmailValida: number;
  giorniInvioStimati: number;
  fineInvioStimata: string | null;
  campione: MailingContattoRiga[];
};

export type MailingControllo = { chiave: string; esito: MailingEsitoControllo; titolo: string; dettaglio: string | null };
export type MailingControlli = { pronta: boolean; punteggioSpam: number; controlli: MailingControllo[] };

export type MailingLinkReport = { indice: number; url: string; etichetta: string | null; clickUnici: number; clickTotali: number };
export type MailingVoceConteggio = { chiave: string; etichetta: string; valore: number };
export type MailingReportVariante = { chiave: string; oggetto: string; metriche: MailingMetriche; vincitore: boolean };

export type MailingReportCampagna = {
  campagna: MailingCampagna;
  metriche: MailingMetriche;
  andamentoOrario: MailingPuntoSerie[];
  link: MailingLinkReport[];
  dispositivi: MailingVoceConteggio[];
  client: MailingVoceConteggio[];
  varianti: MailingReportVariante[];
  conversioni: MailingAttivita[];
};

export type MailingDestinatarioRiga = {
  invioId: number;
  contattoId: number;
  email: string;
  nome: string | null;
  stato: MailingStatoInvio;
  variante: string | null;
  inviatoIl: string | null;
  primaAperturaIl: string | null;
  aperture: number;
  primoClickIl: string | null;
  click: number;
  rispostoIl: string | null;
  disiscrittoIl: string | null;
  errore: string | null;
};

// ───────────────────────── Automazioni ─────────────────────────

/**
 * parametri per tipo: NUOVO_LEAD {fonte?} · ESITO_CONOSCITIVA {esito?: INTERESSATO|CI_PENSA|ACQUISTATO|NON_ADATTO}
 * VISITA_EFFETTUATA {numero?} · ACQUISTO {tipoPercorso?: METODO_BUSSOLA|RINNOVO|MANTENIMENTO} · TAG_AGGIUNTO {tagId}
 * COMPLEANNO {giorniPrima?} · INATTIVO_DA_GIORNI {giorni, includiGiaInattivi?} · ENTRATA_SEGMENTO {segmentoId}
 */
export type MailingTipoTrigger =
  | 'NUOVO_LEAD' | 'CONOSCITIVA_PRENOTATA' | 'CONOSCITIVA_SVOLTA' | 'ESITO_CONOSCITIVA'
  | 'PRIMA_VISITA_PRENOTATA' | 'PRIMA_VISITA_EFFETTUATA' | 'VISITA_EFFETTUATA' | 'ACQUISTO'
  | 'TAG_AGGIUNTO' | 'COMPLEANNO' | 'INATTIVO_DA_GIORNI' | 'ENTRATA_SEGMENTO' | 'ISCRIZIONE' | 'MANUALE';

export type MailingTipoNodo =
  | 'EMAIL' | 'ATTESA' | 'ATTESA_FINO_A' | 'CONDIZIONE' | 'AGGIUNGI_TAG' | 'RIMUOVI_TAG' | 'NOTIFICA_STAFF' | 'FINE';

export type MailingTrigger = { tipo: MailingTipoTrigger; parametri: Record<string, unknown> };

/**
 * config per tipo:
 * EMAIL {emailId} · ATTESA {quantita, unita: MINUTI|ORE|GIORNI} · ATTESA_FINO_A {giorni: number[] (1=lun), ora: "09:00"}
 * CONDIZIONE {regole?: MailingGruppoRegole, haAperto?: nodoId, haCliccato?: nodoId} · AGGIUNGI_TAG/RIMUOVI_TAG {tagId}
 * NOTIFICA_STAFF {testo} (crea un task per il dottore) · FINE {}
 */
export type MailingNodo = { id: string; tipo: MailingTipoNodo; config: Record<string, unknown>; x: number; y: number };
export type MailingArco = { da: string; a: string; ramo: 'SI' | 'NO' | null };
export type MailingGrafo = { nodi: MailingNodo[]; archi: MailingArco[] };

export type MailingAutomazioneRiga = {
  id: number;
  nome: string;
  descrizione: string | null;
  stato: MailingStatoAutomazione;
  triggerTipo: MailingTipoTrigger;
  triggerDescrizione: string;
  attivi: number;
  completati: number;
  totaliIscritti: number;
  metriche: MailingMetriche;
  attivataIl: string | null;
  aggiornatoIl: string | null;
};

export type MailingAutomazioneEmail = {
  id: number;
  nome: string | null;
  oggetto: string;
  preheader: string | null;
  design: MailingDocumento | null;
  html: string;
  metriche: MailingMetriche;
};

export type MailingAutomazione = {
  id: number;
  nome: string;
  descrizione: string | null;
  stato: MailingStatoAutomazione;
  mittenteId: number | null;
  categoriaId: number | null;
  trigger: MailingTrigger;
  grafo: MailingGrafo;
  uscita: MailingTrigger | null;
  rientroConsentito: boolean;
  soloOrariLavorativi: boolean;
  email: MailingAutomazioneEmail[];
  attivataIl: string | null;
  aggiornatoIl: string | null;
};

export type MailingAutomazioneInput = {
  nome: string;
  descrizione?: string | null;
  mittenteId?: number | null;
  categoriaId?: number | null;
  trigger?: MailingTrigger | null;
  grafo?: MailingGrafo | null;
  uscita?: MailingTrigger | null;
  rientroConsentito?: boolean;
  soloOrariLavorativi?: boolean;
  /** Chiave di un ModelloAutomazione: crea grafo ed email dal modello. */
  modello?: string | null;
};

export type MailingAutomazioneEmailInput = {
  nome?: string | null;
  oggetto: string;
  preheader?: string | null;
  design: MailingDocumento | null;
  html: string;
};

export type MailingModelloAutomazione = {
  chiave: string;
  nome: string;
  descrizione: string;
  icona: string;
  trigger: MailingTrigger;
  grafo: MailingGrafo;
  uscita: MailingTrigger | null;
  email: MailingAutomazioneEmailInput[];
};

export type MailingReportNodo = { nodoId: string; entrati: number; inAttesa: number; usciti: number; metriche: MailingMetriche | null };

export type MailingReportAutomazione = {
  automazione: MailingAutomazione;
  attivi: number;
  completati: number;
  usciti: number;
  errori: number;
  metriche: MailingMetriche;
  nodi: MailingReportNodo[];
  ingressiGiornalieri: MailingPuntoSerie[];
};

// ───────────────────────── Mittenti e impostazioni ─────────────────────────

export type MailingMittente = {
  id: number;
  email: string;
  nomeVisualizzato: string;
  rispondiA: string | null;
  casellaDelegata: string | null;
  canale: MailingCanale;
  smtpHost: string | null;
  smtpPorta: number | null;
  smtpUtente: string | null;
  smtpPasswordEnv: string | null;
  smtpPasswordPresente: boolean;
  limiteGiornaliero: number;
  limiteAlMinuto: number;
  predefinito: boolean;
  attivo: boolean;
  verificatoIl: string | null;
  ultimoErrore: string | null;
  inviatiUltime24h: number;
  inCoda: number;
};

export type MailingMittenteInput = {
  email: string;
  nomeVisualizzato: string;
  rispondiA?: string | null;
  casellaDelegata?: string | null;
  canale: MailingCanale;
  smtpHost?: string | null;
  smtpPorta?: number | null;
  smtpUtente?: string | null;
  smtpPasswordEnv?: string | null;
  limiteGiornaliero?: number;
  limiteAlMinuto?: number;
  predefinito?: boolean;
  attivo?: boolean;
};

export type MailingEsitoVerifica = { inviata: boolean; errore: string | null; controlli: MailingControllo[] };

export type MailingImpostazioni = {
  invioAbilitato: boolean;
  indirizzoPostale: string;
  finestraAttribuzioneGiorni: number;
  categorie: MailingCategoria[];
};

// ───────────────────────── AI ─────────────────────────

export type MailingAiEmailInput = {
  brief: string;
  tono?: MailingTono | null;
  obiettivo?: string | null;
  segmentoId?: number | null;
  impostazioni?: MailingImpostazioniDocumento | null;
};
export type MailingAiEmail = { design: MailingDocumento; oggetti: string[]; preheader: string | null };
export type MailingAiOggetto = { oggetto: string; punteggio: number; motivazione: string };
export type MailingAiSegmento = { regole: MailingGruppoRegole; spiegazione: string };
export type MailingAiAnalisi = { sintesi: string; puntiForza: string[]; consigli: string[] };

// ───────────────────────── Pubblico (senza login) ─────────────────────────

export type MailingPreferenzeCategoria = { id: number; nome: string; descrizione: string | null; attiva: boolean };
export type MailingPreferenze = {
  nomeMostrato: string | null;
  emailMascherata: string;
  stato: MailingStatoContatto;
  mittente: string | null;
  categorie: MailingPreferenzeCategoria[];
};
export type MailingAggiornaPreferenze = {
  categorieEscluse: number[];
  disiscrivi: boolean;
  motivo?: string | null;
  reiscrivi?: boolean;
  invioToken?: string | null;
};


// ───────────────────────── Client ─────────────────────────

export function messaggioErroreMailing(err: unknown, fallback = 'Qualcosa è andato storto'): string {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  const e = err as { details?: unknown; message?: unknown; code?: unknown };
  const testo = [e.details, e.code, e.message].find((v) => typeof v === 'string' && v.trim()) as string | undefined;
  return testo ?? fallback;
}

/** Il backend segnala un mittente non autorizzato in Google Admin con questo prefisso: la UI mostra la guida. */
export const ERRORE_MITTENTE_NON_CONFIGURATO = 'MAILING_MITTENTE_NON_CONFIGURATO';

const id = (v: number | string) => encodeURIComponent(String(v));

type Parametri = Record<string, string | number | boolean | null | undefined>;

/** api-client di EdoDoc vuole parametri senza null: i null diventano "assenti". */
const parametri = (p: Parametri) =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? undefined])) as Record<string, string | number | boolean | undefined>;

/**
 * api-client di EdoDoc non accetta un AbortSignal: la richiesta parte comunque, ma se nel frattempo il chiamante
 * l'ha annullata il risultato viene scartato con un AbortError (come farebbe fetch).
 */
async function conSegnale<T>(richiesta: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new DOMException('Richiesta annullata', 'AbortError');
  const dati = await richiesta;
  if (signal?.aborted) throw new DOMException('Richiesta annullata', 'AbortError');
  return dati;
}

function multipart(campi: Record<string, string | Blob | null | undefined>, file: File): FormData {
  const dati = new FormData();
  dati.append('file', file, file.name);
  for (const [k, v] of Object.entries(campi)) if (v != null && v !== '') dati.append(k, v);
  return dati;
}

export const mailingService = {
  // Stato e panoramica
  stato: () => api.get<MailingStato>('/mailing/stato'),
  panoramica: (giorni = 30) => api.get<MailingPanoramica>('/mailing/panoramica', { giorni }),
  attivita: (limite = 30) => api.get<MailingAttivita[]>('/mailing/attivita', { limite }),

  // Contatti
  contatti: (filtro: MailingFiltroContatti = {}) =>
    api.get<MailingPagina<MailingContattoRiga>>('/mailing/contatti', parametri(filtro as Parametri)),
  contatto: (contattoId: number) => api.get<MailingContattoDettaglio>(`/mailing/contatti/${id(contattoId)}`),
  contattoDelPaziente: (pazienteId: number) => api.get<MailingContattoDettaglio | null>(`/mailing/contatti/paziente/${id(pazienteId)}`),
  creaContatto: (input: MailingContattoInput) => api.post<MailingContattoDettaglio>('/mailing/contatti', input),
  aggiornaContatto: (contattoId: number, input: MailingContattoInput) =>
    api.put<MailingContattoDettaglio>(`/mailing/contatti/${id(contattoId)}`, input),
  cambiaStatoContatto: (contattoId: number, stato: MailingStatoContatto, motivo?: string) =>
    api.post<MailingContattoDettaglio>(`/mailing/contatti/${id(contattoId)}/stato`, { stato, motivo: motivo ?? null }),
  aggiungiTag: (contattoId: number, tag: { tagId?: number; nome?: string }) =>
    api.post<MailingContattoDettaglio>(`/mailing/contatti/${id(contattoId)}/tag`, tag),
  rimuoviTag: (contattoId: number, tagId: number) =>
    api.delete<MailingContattoDettaglio>(`/mailing/contatti/${id(contattoId)}/tag/${id(tagId)}`),
  importaCsv: (file: File, opzioni: { tagId?: number | null; baseGiuridica: MailingBaseGiuridica }) =>
    api.post<MailingEsitoImport>(
      '/mailing/contatti/importa',
      multipart({ tagId: opzioni.tagId ? String(opzioni.tagId) : null, baseGiuridica: opzioni.baseGiuridica }, file),
    ),
  sincronizza: () => api.post<MailingEsitoSincronizzazione>('/mailing/contatti/sincronizza'),

  // Tag e categorie
  tag: () => api.get<MailingTag[]>('/mailing/tag'),
  creaTag: (nome: string, colore?: string | null) => api.post<MailingTag>('/mailing/tag', { nome, colore: colore ?? null }),
  aggiornaTag: (tagId: number, nome: string, colore?: string | null) =>
    api.put<MailingTag>(`/mailing/tag/${id(tagId)}`, { nome, colore: colore ?? null }),
  eliminaTag: (tagId: number) => api.delete<null>(`/mailing/tag/${id(tagId)}`),
  categorie: () => api.get<MailingCategoria[]>('/mailing/categorie'),
  creaCategoria: (input: MailingCategoriaInput) => api.post<MailingCategoria>('/mailing/categorie', input),
  aggiornaCategoria: (categoriaId: number, input: MailingCategoriaInput) =>
    api.put<MailingCategoria>(`/mailing/categorie/${id(categoriaId)}`, input),

  // Segmenti
  segmenti: () => api.get<MailingSegmento[]>('/mailing/segmenti'),
  catalogoSegmenti: () => api.get<MailingCatalogoCampo[]>('/mailing/segmenti/catalogo'),
  anteprimaSegmento: (regole: MailingGruppoRegole, signal?: AbortSignal) =>
    conSegnale(api.post<MailingAnteprimaSegmento>('/mailing/segmenti/anteprima', { regole }), signal),
  creaSegmento: (input: MailingSegmentoInput) => api.post<MailingSegmento>('/mailing/segmenti', input),
  aggiornaSegmento: (segmentoId: number, input: MailingSegmentoInput) =>
    api.put<MailingSegmento>(`/mailing/segmenti/${id(segmentoId)}`, input),
  eliminaSegmento: (segmentoId: number) => api.delete<null>(`/mailing/segmenti/${id(segmentoId)}`),

  // Template e immagini
  templates: () => api.get<MailingTemplateRiga[]>('/mailing/template'),
  template: (templateId: number) => api.get<MailingTemplate>(`/mailing/template/${id(templateId)}`),
  creaTemplate: (input: MailingTemplateInput) => api.post<MailingTemplate>('/mailing/template', input),
  aggiornaTemplate: (templateId: number, input: MailingTemplateInput) =>
    api.put<MailingTemplate>(`/mailing/template/${id(templateId)}`, input),
  eliminaTemplate: (templateId: number) => api.delete<null>(`/mailing/template/${id(templateId)}`),
  caricaImmagine: (file: File) => api.post<MailingImmagine>('/mailing/immagini', multipart({}, file)),

  // Campagne
  campagne: (stato?: MailingStatoCampagna) => api.get<MailingCampagnaRiga[]>('/mailing/campagne', { stato }),
  campagna: (campagnaId: number) => api.get<MailingCampagna>(`/mailing/campagne/${id(campagnaId)}`),
  creaCampagna: (input: MailingCampagnaInput) => api.post<MailingCampagna>('/mailing/campagne', input),
  aggiornaCampagna: (campagnaId: number, input: MailingCampagnaInput) =>
    api.put<MailingCampagna>(`/mailing/campagne/${id(campagnaId)}`, input),
  duplicaCampagna: (campagnaId: number) => api.post<MailingCampagna>(`/mailing/campagne/${id(campagnaId)}/duplica`),
  eliminaCampagna: (campagnaId: number) => api.delete<null>(`/mailing/campagne/${id(campagnaId)}`),
  stimaPubblico: (pubblico: MailingPubblico, categoriaId?: number | null, mittenteId?: number | null, signal?: AbortSignal) =>
    conSegnale(
      api.post<MailingStimaPubblico>('/mailing/pubblico/stima', { pubblico, categoriaId: categoriaId ?? null, mittenteId: mittenteId ?? null }),
      signal,
    ),
  inviaTest: (campagnaId: number, indirizzi: string[], contattoAnteprimaId?: number | null) =>
    api.post<null>(`/mailing/campagne/${id(campagnaId)}/test`, { indirizzi, contattoAnteprimaId: contattoAnteprimaId ?? null }),
  /** Prova del contenuto dell'editor così com'è (anche non salvato): automazioni, template, campagne. */
  inviaProva: (prova: {
    indirizzi: string[];
    html: string;
    oggetto?: string | null;
    preheader?: string | null;
    mittenteId?: number | null;
    categoriaId?: number | null;
    contattoAnteprimaId?: number | null;
  }) => api.post<null>('/mailing/prova', prova),
  controlli: (campagnaId: number) => api.post<MailingControlli>(`/mailing/campagne/${id(campagnaId)}/controlli`),
  avviaInvio: (campagnaId: number, programmataIl?: string | null) =>
    api.post<MailingCampagna>(`/mailing/campagne/${id(campagnaId)}/invia`, { programmataIl: programmataIl ?? null }),
  pausaCampagna: (campagnaId: number) => api.post<MailingCampagna>(`/mailing/campagne/${id(campagnaId)}/pausa`),
  riprendiCampagna: (campagnaId: number) => api.post<MailingCampagna>(`/mailing/campagne/${id(campagnaId)}/riprendi`),
  annullaCampagna: (campagnaId: number) => api.post<MailingCampagna>(`/mailing/campagne/${id(campagnaId)}/annulla`),
  reportCampagna: (campagnaId: number) => api.get<MailingReportCampagna>(`/mailing/campagne/${id(campagnaId)}/report`),
  destinatari: (campagnaId: number, filtro: MailingFiltroDestinatari = 'TUTTI', pagina = 0, q?: string) =>
    api.get<MailingPagina<MailingDestinatarioRiga>>(`/mailing/campagne/${id(campagnaId)}/destinatari`, { filtro, pagina, q }),

  // Automazioni
  automazioni: () => api.get<MailingAutomazioneRiga[]>('/mailing/automazioni'),
  modelliAutomazione: () => api.get<MailingModelloAutomazione[]>('/mailing/automazioni/modelli'),
  automazione: (automazioneId: number) => api.get<MailingAutomazione>(`/mailing/automazioni/${id(automazioneId)}`),
  creaAutomazione: (input: MailingAutomazioneInput) => api.post<MailingAutomazione>('/mailing/automazioni', input),
  aggiornaAutomazione: (automazioneId: number, input: MailingAutomazioneInput) =>
    api.put<MailingAutomazione>(`/mailing/automazioni/${id(automazioneId)}`, input),
  eliminaAutomazione: (automazioneId: number) => api.delete<null>(`/mailing/automazioni/${id(automazioneId)}`),
  creaEmailAutomazione: (automazioneId: number, input: MailingAutomazioneEmailInput) =>
    api.post<MailingAutomazioneEmail>(`/mailing/automazioni/${id(automazioneId)}/email`, input),
  aggiornaEmailAutomazione: (automazioneId: number, emailId: number, input: MailingAutomazioneEmailInput) =>
    api.put<MailingAutomazioneEmail>(`/mailing/automazioni/${id(automazioneId)}/email/${id(emailId)}`, input),
  eliminaEmailAutomazione: (automazioneId: number, emailId: number) =>
    api.delete<null>(`/mailing/automazioni/${id(automazioneId)}/email/${id(emailId)}`),
  attivaAutomazione: (automazioneId: number) => api.post<MailingAutomazione>(`/mailing/automazioni/${id(automazioneId)}/attiva`),
  pausaAutomazione: (automazioneId: number) => api.post<MailingAutomazione>(`/mailing/automazioni/${id(automazioneId)}/pausa`),
  iscriviAutomazione: (automazioneId: number, contattoIds: number[]) =>
    api.post<{ iscritti: number; saltati: number }>(`/mailing/automazioni/${id(automazioneId)}/iscrivi`, { contattoIds }),
  reportAutomazione: (automazioneId: number) => api.get<MailingReportAutomazione>(`/mailing/automazioni/${id(automazioneId)}/report`),

  // Mittenti e impostazioni
  mittenti: () => api.get<MailingMittente[]>('/mailing/mittenti'),
  creaMittente: (input: MailingMittenteInput) => api.post<MailingMittente>('/mailing/mittenti', input),
  aggiornaMittente: (mittenteId: number, input: MailingMittenteInput) =>
    api.put<MailingMittente>(`/mailing/mittenti/${id(mittenteId)}`, input),
  eliminaMittente: (mittenteId: number) => api.delete<null>(`/mailing/mittenti/${id(mittenteId)}`),
  verificaMittente: (mittenteId: number, indirizzoTest: string) =>
    api.post<MailingEsitoVerifica>(`/mailing/mittenti/${id(mittenteId)}/verifica`, { indirizzoTest }),
  impostazioni: () => api.get<MailingImpostazioni>('/mailing/impostazioni'),
  salvaImpostazioni: (input: MailingImpostazioni) => api.put<MailingImpostazioni>('/mailing/impostazioni', input),

  // AI (la UI le mostra solo se Stato.aiDisponibile)
  aiEmail: (input: MailingAiEmailInput) => api.post<MailingAiEmail>('/mailing/ai/email', input),
  aiOggetti: (input: { oggetto?: string | null; contenuto?: string | null; obiettivo?: string | null }) =>
    api.post<MailingAiOggetto[]>('/mailing/ai/oggetti', input),
  aiRiscrivi: (testo: string, tono: MailingTono) => api.post<{ testo: string }>('/mailing/ai/riscrivi', { testo, tono }),
  aiSegmento: (descrizione: string) => api.post<MailingAiSegmento>('/mailing/ai/segmento', { descrizione }),
  aiAnalisiCampagna: (campagnaId: number) => api.post<MailingAiAnalisi>(`/mailing/ai/analisi-campagna/${id(campagnaId)}`),

  // Pubblico (pagina preferenze, senza login: /api/pubblico/mailing)
  preferenze: (token: string) => api.get<MailingPreferenze>(`/pubblico/mailing/preferenze/${id(token)}`),
  salvaPreferenze: (token: string, input: MailingAggiornaPreferenze) =>
    api.post<MailingPreferenze>(`/pubblico/mailing/preferenze/${id(token)}`, input),
};
