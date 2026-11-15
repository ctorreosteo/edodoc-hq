import { api } from './api-client';

/*
  Pagina Meta (/meta): pagine Facebook e profili Instagram del dottore, via Graph API di Meta.
  `account` è il pageId della pagina Facebook: il backend lo verifica sempre contro le pagine che il token può
  gestire, quindi qui è solo una scelta, mai un permesso. Le metriche null significano "Meta non la fornisce",
  non zero.
*/

export type SocialPiattaforma = 'FACEBOOK' | 'INSTAGRAM';
export type SocialFiltroPiattaforma = SocialPiattaforma | 'TUTTE';

export type SocialAccount = {
  pageId: string;
  nome: string;
  immagine: string | null;
  categoria: string | null;
  linkFacebook: string | null;
  followerFacebook: number | null;
  instagramId: string | null;
  instagramUsername: string | null;
  instagramImmagine: string | null;
  linkInstagram: string | null;
  followerInstagram: number | null;
  postInstagram: number | null;
};

export type SocialStato = {
  utilizzabile: boolean;
  motivo: string | null;
  aiDisponibile: boolean;
  webhookConfigurato: boolean;
  intervalloAggiornamentoSecondi: number;
  account: SocialAccount[];
};

export type SocialMetrica = {
  chiave: string;
  etichetta: string;
  valore: number | null;
  precedente: number | null;
  descrizione: string | null;
};

export type SocialPiattaformaStat = {
  disponibile: boolean;
  errore: string | null;
  follower: number | null;
  metriche: SocialMetrica[];
};

export type SocialPuntoSerie = {
  data: string;
  fbCopertura: number | null;
  fbVisualizzazioni: number | null;
  fbInterazioni: number | null;
  igCopertura: number | null;
  igNuoviFollower: number | null;
};

export type SocialCellaOrario = { giorno: number; ora: number; punteggio: number; contenuti: number };

export type SocialCommunity = {
  commentiTotali: number;
  commentiDaRispondere: number;
  commentiRisposti: number;
  tassoRisposta: number | null;
  tempoMedioRispostaMinuti: number | null;
  conversazioniNonLette: number;
};

export type SocialTipoAzione =
  | 'RISPOSTA_COMMENTO'
  | 'MESSAGGIO'
  | 'MESSAGGIO_PRIVATO'
  | 'NASCOSTO'
  | 'MOSTRATO'
  | 'ELIMINATO'
  | 'MI_PIACE'
  | 'GESTITO'
  | 'PUBBLICAZIONE';

export type SocialAzione = {
  id: number;
  tipo: SocialTipoAzione | string;
  piattaforma: SocialPiattaforma | null;
  oggettoId: string | null;
  anteprima: string | null;
  utenteId: number | null;
  utenteNome: string | null;
  creatoIl: string;
};

export type SocialTipoContenuto = 'FOTO' | 'VIDEO' | 'REEL' | 'CAROSELLO' | 'TESTO' | 'LINK';

export type SocialContenuto = {
  id: string;
  piattaforma: SocialPiattaforma;
  tipo: SocialTipoContenuto | string;
  testo: string | null;
  immagine: string | null;
  link: string | null;
  pubblicatoIl: string;
  miPiace: number | null;
  commenti: number | null;
  condivisioni: number | null;
  salvataggi: number | null;
  copertura: number | null;
  visualizzazioni: number | null;
  interazioni: number | null;
  tassoInterazione: number | null;
};

export type SocialPanoramica = {
  pageId: string;
  giorni: number;
  aggiornatoIl: string;
  facebook: SocialPiattaformaStat;
  instagram: SocialPiattaformaStat;
  serie: SocialPuntoSerie[];
  orariMigliori: SocialCellaOrario[];
  topContenuti: SocialContenuto[];
  community: SocialCommunity;
  attivitaTeam: SocialAzione[];
};

export type SocialCommento = {
  id: string;
  piattaforma: SocialPiattaforma;
  postId: string;
  postTesto: string | null;
  postImmagine: string | null;
  postLink: string | null;
  autoreId: string | null;
  autoreNome: string | null;
  autoreImmagine: string | null;
  testo: string | null;
  allegatoImmagine: string | null;
  creatoIl: string;
  miPiace: number | null;
  nascosto: boolean;
  piaceAllaPagina: boolean;
  puoNascondere: boolean;
  puoEliminare: boolean;
  puoMettereMiPiace: boolean;
  daPagina: boolean;
  risposto: boolean;
  rispostoIl: string | null;
  gestito: boolean;
  gestitoDa: string | null;
  gestitoIl: string | null;
  risposte: SocialCommento[];
  rispostoDaUtenteId: number | null;
  rispostoDaUtenteNome: string | null;
};

export type SocialElencoCommenti = {
  commenti: SocialCommento[];
  community: SocialCommunity;
  aggiornatoIl: string;
};

export type SocialConversazione = {
  id: string;
  piattaforma: SocialPiattaforma;
  contattoId: string | null;
  contattoNome: string | null;
  contattoImmagine: string | null;
  ultimoMessaggio: string | null;
  ultimoMessaggioIl: string | null;
  ultimoDaPagina: boolean;
  nonLetti: number;
  gestito: boolean;
  finestraAperta: boolean;
  finestraScadeIl: string | null;
  link: string | null;
};

export type SocialAllegato = {
  tipo: 'IMMAGINE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'STICKER' | 'CONDIVISIONE' | 'STORIA' | string;
  url: string | null;
  anteprima: string | null;
  nome: string | null;
};

export type SocialMessaggio = {
  id: string;
  testo: string | null;
  creatoIl: string;
  daPagina: boolean;
  autoreNome: string | null;
  allegati: SocialAllegato[];
  inviatoDaUtenteId: number | null;
  inviatoDaUtenteNome: string | null;
};

export type SocialThread = { conversazione: SocialConversazione; messaggi: SocialMessaggio[] };

export type SocialRispostaRapida = { id: number; titolo: string; testo: string; scorciatoia: string | null; usi: number };

export type SocialStatoPubblicazione = 'PROGRAMMATA' | 'IN_CORSO' | 'PUBBLICATA' | 'PARZIALE' | 'ERRORE' | 'ANNULLATA';

export type SocialPubblicazione = {
  id: number;
  pageId: string;
  piattaforme: SocialPiattaforma[];
  testo: string | null;
  link: string | null;
  conImmagine: boolean;
  stato: SocialStatoPubblicazione;
  programmataAlle: string | null;
  pubblicataIl: string | null;
  idFacebook: string | null;
  idInstagram: string | null;
  linkFacebook: string | null;
  linkInstagram: string | null;
  errore: string | null;
  creatoDaUtenteId: number | null;
  creatoDaNome: string | null;
  creatoIl: string;
};

export type SocialFetta = { chiave: string; etichetta: string; valore: number };
export type SocialFettaEtaGenere = { eta: string; donne: number; uomini: number; altro: number };

export type SocialPubblico = {
  disponibile: boolean;
  errore: string | null;
  follower: number | null;
  etaGenere: SocialFettaEtaGenere[];
  genere: SocialFetta[];
  citta: SocialFetta[];
  paesi: SocialFetta[];
};

export type SocialTono = 'CORDIALE' | 'PROFESSIONALE' | 'BREVE' | 'EMPATICO';

export type SocialRispostaAi = { testo: string; modello: string | null };
export type SocialDidascaliaAi = { facebook: string; instagram: string; hashtag: string[]; modello: string | null };

export type SocialEvento = {
  tipo: 'COMMENTO' | 'MESSAGGIO' | 'AGGIORNAMENTO' | 'PUBBLICAZIONE' | string;
  piattaforma: SocialPiattaforma | null;
  pageId: string | null;
  autoreNome: string | null;
  anteprima: string | null;
  oggettoId: string | null;
};

export type SocialNuovaPubblicazione = {
  account: string;
  piattaforme: SocialPiattaforma[];
  testo: string;
  link: string | null;
  /** Ora locale (Europe/Rome) "yyyy-MM-ddTHH:mm"; null = pubblica subito. */
  programmataAlle: string | null;
};

/** Testo leggibile di un errore dell'API: il backend lo scrive gia per chi usa il gestionale (409 = Meta non disponibile). */
export function messaggioErroreSocial(err: unknown, fallback = 'Qualcosa è andato storto'): string {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  const e = err as { details?: unknown; message?: unknown; code?: unknown };
  const testo = [e.details, e.code, e.message].find((v) => typeof v === 'string' && v.trim()) as string | undefined;
  return testo ?? fallback;
}

const id = (v: string) => encodeURIComponent(v);

export const socialService = {
  async stato(): Promise<SocialStato> {
    return api.get<SocialStato>('/social/stato');
  },

  async panoramica(account: string, giorni: number): Promise<SocialPanoramica> {
    return api.get<SocialPanoramica>('/social/panoramica', { account, giorni });
  },

  async contenuti(account: string, piattaforma: SocialFiltroPiattaforma, limite = 30): Promise<SocialContenuto[]> {
    return api.get<SocialContenuto[]>('/social/contenuti', { account, piattaforma, limite });
  },

  async pubblico(account: string): Promise<SocialPubblico> {
    return api.get<SocialPubblico>('/social/pubblico', { account });
  },

  async commenti(account: string, piattaforma: SocialFiltroPiattaforma = 'TUTTE'): Promise<SocialElencoCommenti> {
    return api.get<SocialElencoCommenti>('/social/commenti', { account, piattaforma });
  },

  async rispondiCommento(account: string, c: Pick<SocialCommento, 'id' | 'piattaforma'>, testo: string): Promise<SocialCommento> {
    return api.post<SocialCommento>(`/social/commenti/${id(c.id)}/rispondi`, { account, piattaforma: c.piattaforma, testo });
  },

  async nascondiCommento(account: string, c: Pick<SocialCommento, 'id' | 'piattaforma'>, nascosto: boolean): Promise<void> {
    await api.post<null>(`/social/commenti/${id(c.id)}/nascondi`, { account, piattaforma: c.piattaforma, nascosto });
  },

  async miPiaceCommento(account: string, c: Pick<SocialCommento, 'id' | 'piattaforma'>, attivo: boolean): Promise<void> {
    await api.post<null>(`/social/commenti/${id(c.id)}/mi-piace`, { account, piattaforma: c.piattaforma, attivo });
  },

  async eliminaCommento(account: string, c: Pick<SocialCommento, 'id' | 'piattaforma'>): Promise<void> {
    const q = new URLSearchParams({ account, piattaforma: c.piattaforma });
    await api.delete<null>(`/social/commenti/${id(c.id)}?${q}`);
  },

  async messaggioPrivato(account: string, c: Pick<SocialCommento, 'id' | 'piattaforma'>, testo: string): Promise<void> {
    await api.post<null>(`/social/commenti/${id(c.id)}/messaggio-privato`, { account, piattaforma: c.piattaforma, testo });
  },

  async segnaGestito(
    account: string,
    oggetto: { id: string; piattaforma: SocialPiattaforma },
    tipo: 'COMMENTO' | 'CONVERSAZIONE',
    gestito: boolean,
  ): Promise<void> {
    await api.post<null>('/social/gestiti', { account, piattaforma: oggetto.piattaforma, oggettoId: oggetto.id, tipo, gestito });
  },

  async conversazioni(account: string, piattaforma: SocialFiltroPiattaforma = 'TUTTE'): Promise<SocialConversazione[]> {
    return api.get<SocialConversazione[]>('/social/conversazioni', { account, piattaforma });
  },

  async thread(account: string, c: Pick<SocialConversazione, 'id' | 'piattaforma'>): Promise<SocialThread> {
    return api.get<SocialThread>(`/social/conversazioni/${id(c.id)}`, { account, piattaforma: c.piattaforma });
  },

  async inviaMessaggio(account: string, c: SocialConversazione, testo: string): Promise<SocialMessaggio> {
    return api.post<SocialMessaggio>(`/social/conversazioni/${id(c.id)}/messaggi`, {
      account,
      piattaforma: c.piattaforma,
      destinatarioId: c.contattoId,
      testo,
    });
  },

  async segnaLetta(account: string, c: SocialConversazione): Promise<void> {
    await api
      .post<null>(`/social/conversazioni/${id(c.id)}/letta`, { account, piattaforma: c.piattaforma, destinatarioId: c.contattoId })
      .catch(() => null);
  },

  async risposteRapide(): Promise<SocialRispostaRapida[]> {
    return api.get<SocialRispostaRapida[]>('/social/risposte-rapide');
  },

  async salvaRispostaRapida(r: { id?: number; titolo: string; testo: string; scorciatoia: string | null }): Promise<SocialRispostaRapida> {
    const corpo = { titolo: r.titolo, testo: r.testo, scorciatoia: r.scorciatoia };
    return r.id
      ? api.put<SocialRispostaRapida>(`/social/risposte-rapide/${r.id}`, corpo)
      : api.post<SocialRispostaRapida>('/social/risposte-rapide', corpo);
  },

  async eliminaRispostaRapida(id: number): Promise<void> {
    await api.delete<null>(`/social/risposte-rapide/${id}`);
  },

  async usaRispostaRapida(id: number): Promise<void> {
    await api.post<null>(`/social/risposte-rapide/${id}/uso`).catch(() => null);
  },

  async pubblicazioni(account: string): Promise<SocialPubblicazione[]> {
    return api.get<SocialPubblicazione[]>('/social/pubblicazioni', { account });
  },

  async pubblica(dati: SocialNuovaPubblicazione, immagine: File | null): Promise<SocialPubblicazione> {
    const formData = new FormData();
    formData.append('pubblicazione', new Blob([JSON.stringify(dati)], { type: 'application/json' }));
    if (immagine) formData.append('immagine', immagine, immagine.name);
    return api.post<SocialPubblicazione>('/social/pubblicazioni', formData);
  },

  async annullaPubblicazione(id: number): Promise<SocialPubblicazione> {
    return api.delete<SocialPubblicazione>(`/social/pubblicazioni/${id}`);
  },

  /** L'immagine passa dall'API autenticata: un <img src> non porterebbe il token. */
  async immaginePubblicazione(id: number): Promise<string | null> {
    try {
      return URL.createObjectURL(await api.blob(`/social/pubblicazioni/${id}/immagine`));
    } catch {
      return null;
    }
  },

  async attivita(account: string): Promise<SocialAzione[]> {
    return api.get<SocialAzione[]>('/social/attivita', { account });
  },

  async rispostaAi(dati: {
    account: string;
    piattaforma: SocialPiattaforma;
    tipo: 'COMMENTO' | 'MESSAGGIO';
    oggettoId: string;
    tono: SocialTono;
    istruzioni?: string;
  }): Promise<SocialRispostaAi> {
    return api.post<SocialRispostaAi>('/social/ai/risposta', dati);
  },

  async didascaliaAi(dati: { idea: string; piattaforme: SocialPiattaforma[]; tono: SocialTono; hashtag: boolean; emoji: boolean }): Promise<SocialDidascaliaAi> {
    return api.post<SocialDidascaliaAi>('/social/ai/didascalia', dati);
  },
};
