import type { PlannerCanale, PlannerFormato, PlannerMedia, PlannerOpzioni } from "@/services/planner-service"

/*
  Regole dei canali del Planner social. I limiti bloccanti sono gli stessi del backend (PlannerCanali.java): vanno
  cambiati insieme. Qui in più gli avvisi non bloccanti (proporzioni, durata, link non cliccabili) e i collegamenti
  per pubblicare a mano.
*/

export type InfoCanale = {
  nome: string
  /** Colore di marca (icone, bordi, anteprime). */
  colore: string
  maxTesto: number
  /** Etichetta del titolo, se il canale ne ha uno. */
  titolo?: { etichetta: string; max: number; obbligatorio: boolean }
  formati: PlannerFormato[]
}

export const CANALI: PlannerCanale[] = ["INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE", "LINKEDIN", "GOOGLE_BUSINESS", "X", "THREADS", "PINTEREST"]

export const INFO_CANALE: Record<PlannerCanale, InfoCanale> = {
  FACEBOOK: { nome: "Facebook", colore: "#1877f2", maxTesto: 63206, formati: ["POST", "REEL", "STORIA"] },
  INSTAGRAM: { nome: "Instagram", colore: "#e1306c", maxTesto: 2200, formati: ["POST", "CAROSELLO", "REEL", "STORIA"] },
  YOUTUBE: {
    nome: "YouTube",
    colore: "#ff0033",
    maxTesto: 5000,
    titolo: { etichetta: "Titolo del video", max: 100, obbligatorio: true },
    formati: ["VIDEO", "SHORT"],
  },
  GOOGLE_BUSINESS: { nome: "Google Business", colore: "#1a73e8", maxTesto: 1500, formati: ["AGGIORNAMENTO", "EVENTO", "OFFERTA"] },
  TIKTOK: {
    nome: "TikTok",
    colore: "#fe2c55",
    maxTesto: 2200,
    titolo: { etichetta: "Titolo del carosello", max: 90, obbligatorio: false },
    formati: ["VIDEO", "CAROSELLO"],
  },
  LINKEDIN: { nome: "LinkedIn", colore: "#0a66c2", maxTesto: 3000, formati: ["POST"] },
  X: { nome: "X", colore: "#111111", maxTesto: 280, formati: ["POST"] },
  THREADS: { nome: "Threads", colore: "#7a7a7a", maxTesto: 500, formati: ["POST"] },
  PINTEREST: {
    nome: "Pinterest",
    colore: "#e60023",
    maxTesto: 500,
    titolo: { etichetta: "Titolo del pin", max: 100, obbligatorio: false },
    formati: ["POST"],
  },
}

export const NOME_FORMATO: Record<PlannerFormato, string> = {
  POST: "Post",
  CAROSELLO: "Carosello",
  REEL: "Reel",
  STORIA: "Storia",
  VIDEO: "Video",
  SHORT: "Short",
  AGGIORNAMENTO: "Aggiornamento",
  EVENTO: "Evento",
  OFFERTA: "Offerta",
}

/** Caratteri come li conta il backend (code point: un'emoji vale 1). */
export function lunghezza(testo: string | null | undefined): number {
  return testo ? [...testo].length : 0
}

export function contaHashtag(testo: string | null | undefined): number {
  return testo ? (testo.match(/(?<![\p{L}\p{N}_])#[\p{L}\p{N}_]+/gu) ?? []).length : 0
}

/** Formato sensato per un canale dati i media (es. un video su Instagram è un reel). */
export function formatoConsigliato(canale: PlannerCanale, media: PlannerMedia[], attuale?: PlannerFormato): PlannerFormato {
  const formati = INFO_CANALE[canale].formati
  const video = media.filter((m) => m.tipo === "VIDEO").length
  const immagini = media.length - video
  if (attuale && formati.includes(attuale) && attuale !== "POST" && attuale !== "VIDEO") return attuale
  switch (canale) {
    case "INSTAGRAM":
      if (media.length >= 2) return "CAROSELLO"
      if (video === 1) return "REEL"
      return "POST"
    case "TIKTOK":
      return immagini > 0 && video === 0 ? "CAROSELLO" : "VIDEO"
    case "YOUTUBE": {
      const v = media.find((m) => m.tipo === "VIDEO")
      const verticale = v && v.altezza && v.larghezza ? v.altezza > v.larghezza : false
      return verticale && (v?.durataSecondi ?? 999) <= 180 ? "SHORT" : "VIDEO"
    }
    default:
      return attuale && formati.includes(attuale) ? attuale : formati[0]
  }
}

export type Controllo = { livello: "errore" | "avviso" | "info"; testo: string }

type DatiControllo = {
  canale: PlannerCanale
  formato: PlannerFormato
  testo: string
  titolo: string
  media: PlannerMedia[]
  link: string
  opzioni: PlannerOpzioni
  manuale: boolean
}

/** Controlli prima di programmare: gli errori bloccano (come il backend), gli avvisi no. */
export function controlla(d: DatiControllo): Controllo[] {
  const out: Controllo[] = []
  const info = INFO_CANALE[d.canale]
  const n = info.nome
  const len = lunghezza(d.testo)
  const immagini = d.media.filter((m) => m.tipo === "IMMAGINE")
  const video = d.media.filter((m) => m.tipo === "VIDEO")
  const errore = (testo: string) => out.push({ livello: "errore", testo })
  const avviso = (testo: string) => out.push({ livello: "avviso", testo })

  if (len > info.maxTesto) errore(`Il testo supera i ${info.maxTesto.toLocaleString("it-IT")} caratteri (${len.toLocaleString("it-IT")}).`)
  if (info.titolo && lunghezza(d.titolo) > info.titolo.max) errore(`${info.titolo.etichetta}: massimo ${info.titolo.max} caratteri.`)

  switch (d.canale) {
    case "FACEBOOK":
      if (d.formato === "REEL" && (video.length !== 1 || immagini.length > 0)) errore("Un reel è un solo video.")
      if (d.formato === "STORIA" && d.media.length !== 1) errore("Una storia è una sola immagine o un solo video.")
      if (d.formato === "POST") {
        if (video.length > 1 || (video.length === 1 && immagini.length > 0)) errore("Fino a 10 immagini oppure un solo video.")
        if (immagini.length > 10) errore("Al massimo 10 immagini.")
        if (d.media.length === 0 && len === 0) errore("Scrivi un testo o aggiungi un media.")
      }
      break
    case "INSTAGRAM":
      if (contaHashtag(d.testo) > 30) errore("Al massimo 30 hashtag.")
      if (d.formato === "POST" && (immagini.length !== 1 || video.length > 0))
        errore("Un post è una sola immagine: per un video scegli Reel, per più media Carosello.")
      if (d.formato === "CAROSELLO" && (d.media.length < 2 || d.media.length > 10)) errore("Un carosello ha da 2 a 10 media.")
      if (d.formato === "REEL" && (video.length !== 1 || immagini.length > 0)) errore("Un reel è un solo video.")
      if (d.formato === "STORIA" && d.media.length !== 1) errore("Una storia è una sola immagine o un solo video.")
      if (d.link && d.formato !== "STORIA") avviso("Su Instagram il link nel testo non è cliccabile: mettilo in bio o nelle storie.")
      for (const m of immagini) {
        if (m.larghezza && m.altezza) {
          const r = m.larghezza / m.altezza
          if (d.formato !== "STORIA" && (r < 0.8 - 0.01 || r > 1.91 + 0.01))
            avviso("Un'immagine è fuori dalle proporzioni di Instagram (da 4:5 a 1,91:1): Meta la rifiuta o la ritaglia.")
        }
      }
      if (d.formato === "REEL") avvisoVerticale(video, avviso)
      if (contaHashtag(d.testo) > 15) avviso("Più di 15 hashtag: oggi Instagram premia pochi hashtag pertinenti.")
      break
    case "YOUTUBE":
      if (video.length !== 1 || immagini.length > 0) errore("Serve un solo video.")
      if (!d.titolo.trim()) errore("Il titolo del video è obbligatorio.")
      if (d.formato === "SHORT") {
        avvisoVerticale(video, avviso)
        if ((video[0]?.durataSecondi ?? 0) > 180) avviso("Uno Short dura al massimo 3 minuti: questo uscirà come video normale.")
      }
      break
    case "GOOGLE_BUSINESS":
      if (video.length > 0) errore("I post della scheda Google accettano solo un'immagine, non video.")
      if (immagini.length > 1) errore("Al massimo un'immagine.")
      if (len === 0) errore("Il testo è obbligatorio.")
      if (d.formato !== "AGGIORNAMENTO" && (!d.opzioni.titoloEvento || !d.opzioni.inizio || !d.opzioni.fine))
        errore("Un evento o un'offerta vuole titolo, data di inizio e di fine.")
      if (contaHashtag(d.testo) > 0) avviso("Su Google gli hashtag non servono: meglio toglierli.")
      if (d.opzioni.pulsante && d.opzioni.pulsante !== "CALL" && !d.opzioni.urlPulsante && !d.link) errore("Il pulsante vuole un link.")
      break
    case "TIKTOK":
      if (d.formato === "VIDEO" && (video.length !== 1 || immagini.length > 0)) errore("Serve un solo video.")
      if (d.formato === "CAROSELLO" && (video.length > 0 || immagini.length < 1 || immagini.length > 35)) errore("Un carosello ha da 1 a 35 immagini.")
      if (d.formato === "VIDEO") avvisoVerticale(video, avviso)
      break
    case "LINKEDIN":
      if (video.length > 1 || (video.length === 1 && immagini.length > 0) || immagini.length > 9) errore("Fino a 9 immagini oppure un solo video.")
      if (d.media.length === 0 && len === 0) errore("Scrivi un testo o aggiungi un media.")
      break
    case "X":
      if (video.length > 1 || (video.length === 1 && immagini.length > 0) || immagini.length > 4) errore("Fino a 4 immagini oppure un solo video.")
      if (d.media.length === 0 && len === 0) errore("Scrivi un testo o aggiungi un media.")
      break
    case "THREADS":
      if (d.media.length > 10) errore("Al massimo 10 media.")
      if (d.media.length === 0 && len === 0) errore("Scrivi un testo o aggiungi un media.")
      break
    case "PINTEREST":
      if (d.media.length !== 1) errore("Un pin è una sola immagine o un solo video.")
      if (!d.link) avviso("Un pin senza link porta meno traffico: aggiungi il link del post.")
      break
  }
  if (d.manuale) out.push({ livello: "info", testo: `${n} si pubblica a mano: all'ora arriva l'avviso con testo e media pronti.` })
  return out
}

function avvisoVerticale(video: PlannerMedia[], avviso: (t: string) => void) {
  const v = video[0]
  if (v?.larghezza && v.altezza && v.larghezza >= v.altezza) avviso("Il video è orizzontale: in questo formato rende di più verticale (9:16).")
}

/** Dove andare per pubblicare a mano (col testo già pronto quando la piattaforma lo permette). */
export function linkPubblicazioneManuale(canale: PlannerCanale, testo: string, urlProfilo: string | null): string {
  const t = encodeURIComponent(testo)
  switch (canale) {
    case "X":
      return `https://x.com/intent/post?text=${t}`
    case "THREADS":
      return `https://www.threads.net/intent/post?text=${t}`
    case "LINKEDIN":
      return `https://www.linkedin.com/feed/?shareActive=true&text=${t}`
    case "TIKTOK":
      return "https://www.tiktok.com/tiktokstudio/upload"
    case "PINTEREST":
      return "https://www.pinterest.com/pin-builder/"
    case "YOUTUBE":
      return "https://studio.youtube.com/"
    case "GOOGLE_BUSINESS":
      return urlProfilo ?? "https://business.google.com/"
    case "INSTAGRAM":
      return urlProfilo ?? "https://www.instagram.com/"
    case "FACEBOOK":
      return urlProfilo ?? "https://business.facebook.com/latest/composer"
  }
}

/** Opzioni TikTok della privacy, con il nome che TikTok chiede di mostrare. */
export const PRIVACY_TIKTOK: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Tutti",
  MUTUAL_FOLLOW_FRIENDS: "Amici",
  FOLLOWER_OF_CREATOR: "Follower",
  SELF_ONLY: "Solo io",
}

export const PULSANTI_GOOGLE: Record<string, string> = {
  BOOK: "Prenota",
  CALL: "Chiama",
  LEARN_MORE: "Scopri di più",
  SIGN_UP: "Registrati",
  ORDER: "Ordina",
  SHOP: "Acquista",
}

export function chiaveDestinazione(canale: PlannerCanale, account: string | null): string {
  return `${canale}|${account ?? ""}`
}
