import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useAzioni } from "@/contexts/azioni-context"
import { useDati } from "@/hooks/use-dati"
import { toast } from "@/lib/toast"
import { pazientiService } from "@/services/gestionale"
import type { PazienteArchiviato } from "@/types"

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("it-IT") : "—")

/** Il punto dove si chiude una richiesta di eliminazione: il paziente ha chiuso l'account, qui si anonimizza. */
export function PazientiArchiviati() {
  const { conferma } = useAzioni()
  const { dati, riprova } = useDati(pazientiService.archiviati, [])
  const [aperti, setAperti] = useState(false)
  if (!dati?.length) return null

  const anonimizza = (p: PazienteArchiviato) => conferma({
    titolo: `Anonimizzare ${p.nome} ${p.cognome}?`,
    descrizione: "Toglie anagrafica, contatti, note e accesso. Non si può annullare. Fatture e pagamenti restano; eventuali rate non pagate restano senza nome.",
    etichetta: "Anonimizza",
    azione: async () => {
      const esito = await pazientiService.anonimizza(p.id)
      if (esito.confermaInviata || !esito.email) toast.success("Paziente anonimizzato")
      else toast.success("Paziente anonimizzato", { description: `Conferma non inviata: scrivi tu a ${esito.email}`, duration: Infinity })
      riprova()
    },
  })

  return (
    <section aria-label="Pazienti archiviati">
      <Button variant="outline" aria-expanded={aperti} onClick={() => setAperti((a) => !a)}>Archiviati ({dati.length})</Button>
      {aperti ? (
        <ul className="mt-3 flex flex-col gap-2">
          {dati.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {p.nome} {p.cognome}
                <span className="ml-2 text-muted-foreground">
                  {p.anonimizzatoIl ? `anonimizzato il ${data(p.anonimizzatoIl)}` : `archiviato il ${data(p.archiviatoIl)}`}
                </span>
              </span>
              {p.anonimizzatoIl ? null : <Button variant="destructive" size="sm" onClick={() => anonimizza(p)}>Anonimizza</Button>}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
