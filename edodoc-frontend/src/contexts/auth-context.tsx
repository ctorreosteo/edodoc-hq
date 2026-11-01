import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { sessione } from "@/services/api-client"
import { authService } from "@/services/gestionale"
import type { Utente } from "@/types"

type AuthContextType = {
  utente: Utente | null
  pronto: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const contesto = useContext(AuthContext)
  if (!contesto) throw new Error("useAuth deve stare dentro AuthProvider")
  return contesto
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [utente, setUtente] = useState<Utente | null>(null)
  const [pronto, setPronto] = useState(false)

  const logout = useCallback(() => {
    sessione.cancella()
    setUtente(null)
  }, [])

  useEffect(() => {
    sessione.quandoScade(() => setUtente(null))
    if (!sessione.token()) {
      setPronto(true)
      return
    }
    authService.profilo().then(setUtente).catch(logout).finally(() => setPronto(true))
  }, [logout])

  const login = useCallback(async (username: string, password: string) => {
    const risposta = await authService.login(username, password)
    if (risposta.utente.ruolo !== "ADMIN") {
      throw new Error("Questo account è dell'app paziente: il gestionale è riservato al dottore")
    }
    sessione.salva(risposta.token)
    setUtente(risposta.utente)
  }, [])

  return <AuthContext.Provider value={{ utente, pronto, login, logout }}>{children}</AuthContext.Provider>
}
