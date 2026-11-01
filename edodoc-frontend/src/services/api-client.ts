const BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/+$/, "")
const CHIAVE_TOKEN = "edodoc-token"

type Busta<T> = { success: boolean; message?: string; data: T; error?: string }

let suSessioneScaduta: () => void = () => {}

export const sessione = {
  token: () => localStorage.getItem(CHIAVE_TOKEN),
  salva: (token: string) => localStorage.setItem(CHIAVE_TOKEN, token),
  cancella: () => localStorage.removeItem(CHIAVE_TOKEN),
  quandoScade: (callback: () => void) => {
    suSessioneScaduta = callback
  },
}

export const urlApi = (percorso: string) => `${BASE_URL}${percorso}`

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function chiama(metodo: string, percorso: string, corpo?: unknown): Promise<Response> {
  const token = sessione.token()
  // Con FormData il browser imposta da solo il Content-Type con il boundary
  const multipart = corpo instanceof FormData
  let risposta: Response
  try {
    risposta = await fetch(`${BASE_URL}${percorso}`, {
      method: metodo,
      headers: {
        ...(corpo !== undefined && !multipart && { "Content-Type": "application/json" }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: multipart ? corpo : corpo !== undefined ? JSON.stringify(corpo) : undefined,
    })
  } catch {
    throw new ApiError("Impossibile connettersi al server", 0)
  }
  if (risposta.status === 401 && token) {
    sessione.cancella()
    suSessioneScaduta()
    throw new ApiError("Sessione scaduta", 401)
  }
  if (!risposta.ok) {
    const errore = await risposta.json().catch(() => null)
    throw new ApiError(errore?.message || errore?.error || "Si è verificato un errore. Riprova.", risposta.status)
  }
  return risposta
}

async function json<T>(metodo: string, percorso: string, corpo?: unknown): Promise<T> {
  const busta: Busta<T> = await (await chiama(metodo, percorso, corpo)).json()
  return busta.data
}

function query(parametri?: Record<string, string | number | boolean | undefined>) {
  const voci = Object.entries(parametri ?? {}).filter(([, v]) => v !== undefined && v !== "")
  return voci.length ? `?${new URLSearchParams(voci.map(([k, v]) => [k, String(v)])).toString()}` : ""
}

export const api = {
  get: <T>(percorso: string, parametri?: Record<string, string | number | boolean | undefined>) =>
    json<T>("GET", `${percorso}${query(parametri)}`),
  post: <T>(percorso: string, corpo?: unknown) => json<T>("POST", percorso, corpo),
  put: <T>(percorso: string, corpo: unknown) => json<T>("PUT", percorso, corpo),
  delete: <T>(percorso: string) => json<T>("DELETE", percorso),
  blob: async (percorso: string) => (await chiama("GET", percorso)).blob(),
}
