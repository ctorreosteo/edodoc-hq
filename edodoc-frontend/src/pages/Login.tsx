import { useState, type FormEvent } from "react"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/contexts/auth-context"

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [errore, setErrore] = useState("")
  const [inCorso, setInCorso] = useState(false)

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

  return (
    <div data-m-auth className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-2xl border-0">
        <CardContent className="p-8">
          <form onSubmit={invia} className="flex flex-col gap-5">
            <div className="flex flex-col items-center text-center gap-3">
              <Logo className="h-12" />
              <p className="text-muted-foreground text-sm">Accedi al gestionale</p>
            </div>
            {errore ? <p role="alert" className="text-sm text-center text-destructive">{errore}</p> : null}
            <div className="grid gap-2">
              <Label htmlFor="username">Email</Label>
              <Input id="username" type="email" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" disabled={inCorso} className="w-full font-bold">{inCorso ? "Accesso…" : "Accedi"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
