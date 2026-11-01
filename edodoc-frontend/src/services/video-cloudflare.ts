/* Upload tus diretto a Cloudflare Stream: il file non passa dal backend. Stesso schema di Mobilitas. */

/** Multiplo di 256 KiB, come chiede Cloudflare: circa 50 MB per blocco. */
const BLOCCO_BYTES = 200 * 256 * 1024
const TENTATIVI = 4

export const VIDEO_ACCEPT = "video/*,.mp4,.mov,.mkv,.webm,.avi"
const MASSIMO_BYTES = 30 * 1024 ** 3

export function validaVideo(file: File): string | null {
  if (file.size === 0) return "Il file è vuoto"
  if (file.size > MASSIMO_BYTES) return "Il video è troppo grande (massimo 30 GB)"
  return null
}

function inviaBlocco(url: string, blocco: Blob, offset: number, avanzamento: (inviati: number) => void, segnale: AbortSignal) {
  return new Promise<number>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PATCH", url)
    xhr.setRequestHeader("Tus-Resumable", "1.0.0")
    xhr.setRequestHeader("Upload-Offset", String(offset))
    xhr.setRequestHeader("Content-Type", "application/offset+octet-stream")
    xhr.upload.onprogress = (e) => avanzamento(e.loaded)
    xhr.onload = () => {
      const nuovo = Number(xhr.getResponseHeader("Upload-Offset"))
      if (xhr.status >= 200 && xhr.status < 300 && Number.isFinite(nuovo)) resolve(nuovo)
      else reject(new Error(`Cloudflare ha rifiutato il blocco (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error("Connessione interrotta"))
    xhr.onabort = () => reject(new DOMException("Annullato", "AbortError"))
    segnale.addEventListener("abort", () => xhr.abort(), { once: true })
    xhr.send(blocco)
  })
}

async function leggiOffset(url: string, segnale: AbortSignal): Promise<number | null> {
  try {
    const risposta = await fetch(url, { method: "HEAD", headers: { "Tus-Resumable": "1.0.0" }, signal: segnale })
    const offset = Number(risposta.headers.get("Upload-Offset"))
    return risposta.ok && Number.isFinite(offset) ? offset : null
  } catch {
    return null
  }
}

/** Carica a blocchi e riprende da solo dopo un errore di rete. */
export async function caricaVideoTus(file: File, url: string, avanzamento: (caricati: number) => void, segnale: AbortSignal) {
  let offset = 0
  let tentativi = 0
  while (offset < file.size) {
    const inizio = offset
    try {
      offset = await inviaBlocco(url, file.slice(inizio, inizio + BLOCCO_BYTES), inizio, (inviati) => avanzamento(inizio + inviati), segnale)
      tentativi = 0
      avanzamento(offset)
    } catch (errore) {
      if (segnale.aborted) throw errore
      tentativi += 1
      if (tentativi > TENTATIVI) throw errore
      await new Promise((r) => setTimeout(r, 1000 * 2 ** tentativi))
      offset = (await leggiOffset(url, segnale)) ?? offset
    }
  }
}
