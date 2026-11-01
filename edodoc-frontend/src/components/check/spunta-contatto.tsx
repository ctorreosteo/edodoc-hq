import { Check } from "lucide-react"
import { dataOra } from "@/lib/format"
import { fattoIl, GIRI, type Giro } from "@/lib/check"
import type { RigaCheck } from "@/types"

/** Le due spunte di contatto: testo e segno di spunta dicono lo stato, il colore lo rinforza. */
export function SpunteContatto({ riga, giro, onContatto }: {
  riga: RigaCheck
  giro: Giro
  onContatto: (riga: RigaCheck, giro: Giro, fatto: boolean) => void
}) {
  return (
    <div className="ck-spunte" role="group" aria-label={`Contatti con ${riga.pazienteNome}`}>
      {GIRI.map((g) => {
        const quando = fattoIl(riga, g.giro)
        return (
          <button key={g.giro} type="button" role="checkbox" className="ck-spunta" aria-checked={!!quando} data-attuale={g.giro === giro ? "" : undefined}
            aria-label={`Contattato ${g.nome.toLowerCase()}: ${riga.pazienteNome}`} title={quando ? `Contattato il ${dataOra(quando)}` : `Segna il contatto ${g.del}`}
            onClick={() => onContatto(riga, g.giro, !quando)}>
            <i aria-hidden>{quando ? <Check /> : null}</i>{g.breve}
          </button>
        )
      })}
    </div>
  )
}
