import { ArrowRight, CircleAlert, Eye, EyeOff, Loader2 } from "lucide-react"
import { useState, type FormEvent, type KeyboardEvent } from "react"
import { FiloAccesso } from "@/components/login/filo-accesso"
import { Logo } from "@/components/logo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/contexts/auth-context"
import { dataLunga } from "@/lib/format"
import { oggiIso } from "@/lib/utils"
import "@/style/login.css"

function saluto(ore: number) {
  if (ore >= 5 && ore < 13) return "Buongiorno"
  return ore >= 13 && ore < 18 ? "Buon pomeriggio" : "Buonasera"
}

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [errore, setErrore] = useState("")
  const [inCorso, setInCorso] = useState(false)
  const [visibile, setVisibile] = useState(false)
  const [maiuscole, setMaiuscole] = useState(false)

  const invia = async (e: FormEvent) => {
    e.preventDefault()
    setErrore("")
    setInCorso(true)
    try {
      await login(username, password)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Credenziali non valide")
    } finally {
      setInCorso(false)
    }
  }

  const leggiMaiuscole = (e: KeyboardEvent<HTMLInputElement>) => setMaiuscole(e.getModifierState("CapsLock"))

  return (
    <div className="ac-pagina">
      <div className="ac-puntini" aria-hidden />
      <FiloAccesso />

      <div className="ac-benvenuto">
        <Logo className="ac-logo" />
        <h1 className="ac-saluto">{saluto(new Date().getHours())}</h1>
        <p className="ac-data">{dataLunga(oggiIso())}</p>
      </div>

      <form onSubmit={invia} className="ac-scheda">
        <p className="ac-titolo">Accedi al gestionale</p>
        {errore ? <p role="alert" className="ac-errore"><CircleAlert className="size-4" aria-hidden />{errore}</p> : null}
        <div className="ac-campo">
          <Label htmlFor="username">Email</Label>
          <Input id="username" className="ac-input" type="email" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="ac-campo">
          <Label htmlFor="password">Password</Label>
          <div className="ac-password">
            <Input id="password" className="ac-input" type={visibile ? "text" : "password"} autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} onKeyUp={leggiMaiuscole} onBlur={() => setMaiuscole(false)} required />
            <button type="button" className="ac-occhio" aria-label={visibile ? "Nascondi la password" : "Mostra la password"} aria-pressed={visibile} onClick={() => setVisibile((v) => !v)}>
              {visibile ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </button>
          </div>
          {maiuscole ? <p className="ac-maiuscole" role="status">Maiuscole attive</p> : null}
        </div>
        <button type="submit" className="ac-invia" disabled={inCorso}>
          {inCorso ? <><Loader2 className="size-4 animate-spin" aria-hidden />Accesso…</> : <>Accedi<ArrowRight className="size-4" aria-hidden /></>}
        </button>
      </form>
    </div>
  )
}
