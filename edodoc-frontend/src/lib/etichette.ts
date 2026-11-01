import type { SheetTone } from "@/components/ui/sheet-kit"

type Etichetta = { testo: string; tono: SheetTone }

export const STATO_PAZIENTE: Record<string, Etichetta> = {
  LEAD: { testo: "Lead", tono: "info" },
  LISTA_ATTESA: { testo: "Lista d'attesa", tono: "violet" },
  ATTIVO: { testo: "Attivo", tono: "ok" },
  MANTENIMENTO: { testo: "Mantenimento", tono: "accent" },
  CONCLUSO: { testo: "Concluso", tono: "muted" },
}

export const FONTE: Record<string, string> = {
  YOUTUBE: "YouTube", INSTAGRAM: "Instagram", MASTERCLASS: "Masterclass", LIBRO: "Libro",
  PASSAPAROLA: "Passaparola", SITO: "Sito", ALTRO: "Altro",
}

export const TIPO_PERCORSO: Record<string, string> = {
  METODO_BUSSOLA: "Percorso 6 mesi", RINNOVO: "Rinnovo 6 mesi", MANTENIMENTO: "Mantenimento",
}

export const PIANO_PAGAMENTO: Record<string, string> = { UNICO: "In anticipo", RATE: "A rate" }

export const TIPO_VISITA: Record<string, string> = {
  CHIAMATA_CONOSCITIVA: "Chiamata conoscitiva", PRIMA_VISITA: "Prima visita", CONTROLLO: "Controllo", MANTENIMENTO: "Mantenimento",
}

export const DURATA_VISITA: Record<string, number> = { CHIAMATA_CONOSCITIVA: 30, PRIMA_VISITA: 60, CONTROLLO: 30, MANTENIMENTO: 30 }

export const MODALITA_VISITA: Record<string, string> = { ONLINE: "Online", PRESENZA: "Dal vivo" }

export const STATO_VISITA: Record<string, Etichetta> = {
  PROGRAMMATA: { testo: "Programmata", tono: "info" },
  EFFETTUATA: { testo: "Effettuata", tono: "ok" },
  ANNULLATA: { testo: "Annullata", tono: "muted" },
  NON_PRESENTATO: { testo: "Non presentato", tono: "danger" },
}

export const SYNC_GOOGLE: Record<string, Etichetta> = {
  DA_SINCRONIZZARE: { testo: "In attesa di Google", tono: "muted" },
  SINCRONIZZATA: { testo: "Su Google Calendar", tono: "ok" },
  ERRORE: { testo: "Errore Google", tono: "danger" },
}

export const METODO_PAGAMENTO: Record<string, string> = {
  BONIFICO: "Bonifico", CARTA: "Carta", CONTANTI: "Contanti", PAYPAL: "PayPal", ALTRO: "Altro",
}

export const TIPO_PAGAMENTO: Record<string, string> = {
  ACCONTO: "Acconto", UNICO: "In anticipo", RATA: "Rata", MANTENIMENTO: "Mantenimento", ALTRO: "Altro",
}

export const SITUAZIONE_PAGAMENTI: Record<string, Etichetta> = {
  IN_REGOLA: { testo: "In regola", tono: "ok" },
  DA_PAGARE: { testo: "Rate da pagare", tono: "warn" },
  SCADUTO: { testo: "Pagamento scaduto", tono: "danger" },
}

export const AZIONE_CHECK: Record<string, Etichetta> = {
  SOLLECITO: { testo: "Sollecitare il check", tono: "warn" },
  MESSAGGIO_DEDICATO: { testo: "Messaggio dedicato", tono: "danger" },
  MESSAGGIO_STANDARD: { testo: "Messaggio motivazionale", tono: "ok" },
}

export const PRIORITA: Record<string, Etichetta> = {
  ALTA: { testo: "Alta", tono: "danger" },
  MEDIA: { testo: "Media", tono: "warn" },
  BASSA: { testo: "Bassa", tono: "muted" },
}

export const CATEGORIE_ENTRATA: Record<string, string> = {
  YOUTUBE_ADS: "YouTube Ads", CONSULENZA: "Consulenza", ALTRO_RICAVO: "Altro ricavo",
}

export const CATEGORIE_USCITA: Record<string, string> = {
  IMPOSTE: "Imposte", CASSA_PREVIDENZA: "Cassa previdenza", ORDINE: "Ordine", COMMERCIALISTA: "Commercialista",
  SOFTWARE: "Software", ALTRA_SPESA: "Altra spesa",
}

export const CATEGORIA: Record<string, string> = { ...CATEGORIE_ENTRATA, ...CATEGORIE_USCITA }
