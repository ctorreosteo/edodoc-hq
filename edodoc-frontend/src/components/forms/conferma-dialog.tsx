import { useState } from "react"
import { Finestra } from "@/components/forms/finestra"
import { Campo } from "@/components/forms/campo"
import { Textarea } from "@/components/ui/textarea"
import { toastErrore } from "@/lib/toast"

export type Conferma = {
  titolo: string
  descrizione: string
  etichetta: string
  /** Se presente chiede un testo obbligatorio (es. motivo dell'annullamento). */
  richiediTesto?: string
  azione: (testo: string) => Promise<void>
}

export function ConfermaDialog({ open, onOpenChange, conferma }: { open: boolean; onOpenChange: (a: boolean) => void; conferma: Conferma | null }) {
  const [inCorso, setInCorso] = useState(false)
  const [testo, setTesto] = useState("")
  if (!conferma) return null
  const salva = async () => {
    setInCorso(true)
    try {
      await conferma.azione(testo.trim())
      setTesto("")
      onOpenChange(false)
    } catch (e) {
      toastErrore(e)
    } finally {
      setInCorso(false)
    }
  }
  return (
    <Finestra open={open} onOpenChange={onOpenChange} titolo={conferma.titolo} descrizione={conferma.descrizione} salva={salva}
      etichettaSalva={conferma.etichetta} inCorso={inCorso} disabilitaSalva={!!conferma.richiediTesto && !testo.trim()}>
      {conferma.richiediTesto ? (
        <Campo etichetta={conferma.richiediTesto} id="conferma-testo">
          <Textarea id="conferma-testo" value={testo} onChange={(e) => setTesto(e.target.value)} />
        </Campo>
      ) : null}
    </Finestra>
  )
}
