import { FilePlus2, History, LayoutTemplate } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { Campo } from "@/components/forms/campo"
import { Finestra } from "@/components/forms/finestra"
import { PazienteCombobox } from "@/components/forms/paziente-combobox"
import { Input } from "@/components/ui/input"
import { dataOra } from "@/lib/format"
import { toast, toastErrore } from "@/lib/toast"
import { dieteService } from "@/services/gestionale"
import type { RigaDieta } from "@/types"
import "@/style/diete.css"

export type DatiNuovaDieta = { pazienteId?: number; modello?: boolean; daDietaId?: number }

function Partenza({ scelta, onClick, icona, titolo, dettaglio }: { scelta: boolean; onClick: () => void; icona: ReactNode; titolo: string; dettaglio: string }) {
  return (
    <button type="button" className="dt-partenza" aria-pressed={scelta} onClick={onClick}>
      <span className="dt-partenza-icona" aria-hidden>{icona}</span>
      <span className="dt-partenza-testo">
        <strong>{titolo}</strong>
        <small>{dettaglio}</small>
      </span>
    </button>
  )
}

/**
 * Nuova dieta per un paziente, o nuovo modello. Si parte da un foglio con la giornata tipo, da un modello
 * o dall'ultima dieta del paziente: cambiare il piano nel tempo è copiare il precedente e ritoccarlo.
 */
export function NuovaDietaDialog({ open, onOpenChange, dati }: { open: boolean; onOpenChange: (a: boolean) => void; dati: DatiNuovaDieta }) {
  const navigate = useNavigate()
  const [pazienteId, setPazienteId] = useState<number | null>(null)
  const [titolo, setTitolo] = useState("")
  const [origine, setOrigine] = useState<number | null>(null)
  const [modelli, setModelli] = useState<RigaDieta[]>([])
  const [precedenti, setPrecedenti] = useState<RigaDieta[]>([])
  const [inCorso, setInCorso] = useState(false)
  const modello = dati.modello === true

  useEffect(() => {
    if (!open) return
    setPazienteId(dati.pazienteId ?? null)
    setTitolo("")
    setOrigine(dati.daDietaId ?? null)
    dieteService.tutte().then((tutte) => setModelli(tutte.filter((d) => d.pazienteId == null))).catch(toastErrore)
  }, [open, dati])

  useEffect(() => {
    if (!open || pazienteId == null) {
      setPrecedenti([])
      return
    }
    dieteService.delPaziente(pazienteId).then((righe) => {
      setPrecedenti(righe)
      // Il caso più frequente: la nuova dieta evolve dall'ultima
      if (dati.daDietaId == null && righe.length > 0) setOrigine(righe[0].id)
    }).catch(toastErrore)
  }, [open, pazienteId, dati.daDietaId])

  const salva = async () => {
    if (!modello && pazienteId == null) {
      toast.error("Scegli il paziente")
      return
    }
    setInCorso(true)
    try {
      const nuova = await dieteService.crea({ pazienteId: modello ? null : pazienteId, titolo: titolo.trim() || null, daDietaId: origine })
      onOpenChange(false)
      navigate(`/diete/${nuova.id}`)
    } catch (e) {
      toastErrore(e)
    } finally {
      setInCorso(false)
    }
  }

  const ultima = precedenti[0]
  return (
    <Finestra open={open} onOpenChange={onOpenChange} titolo={modello ? "Nuovo modello" : "Nuova dieta"} larga inCorso={inCorso}
      descrizione={modello ? "Un modello è una dieta senza paziente da cui partire le prossime volte." : "La dieta precedente resta nello storico del paziente, con le sue date."}
      salva={salva} etichettaSalva="Crea e apri">
      {!modello ? (
        <Campo etichetta="Paziente" id="dieta-paziente">
          <PazienteCombobox id="dieta-paziente" valore={pazienteId} onChange={setPazienteId} disabled={dati.pazienteId != null} />
        </Campo>
      ) : null}
      <Campo etichetta="Titolo" id="dieta-titolo">
        <Input id="dieta-titolo" value={titolo} onChange={(e) => setTitolo(e.target.value)}
          placeholder={origine != null ? "Lo stesso della dieta di partenza" : modello ? "Es. Ricomposizione 1.800 kcal" : "Es. Piano alimentare · fase 2"} />
      </Campo>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Parti da</span>
        <div className="dt-partenze">
          <Partenza scelta={origine == null} onClick={() => setOrigine(null)} icona={<FilePlus2 />} titolo="Foglio nuovo" dettaglio="Giornata tipo con i cinque pasti da riempire" />
          {ultima ? (
            <Partenza scelta={origine === ultima.id} onClick={() => setOrigine(ultima.id)} icona={<History />} titolo={`Ultima dieta: ${ultima.titolo}`}
              dettaglio={`Aggiornata il ${dataOra(ultima.updatedAt)} · la copi e la ritocchi`} />
          ) : null}
          {precedenti.slice(1).map((d) => (
            <Partenza key={d.id} scelta={origine === d.id} onClick={() => setOrigine(d.id)} icona={<History />} titolo={d.titolo}
              dettaglio={`Dieta precedente, creata il ${dataOra(d.createdAt)}`} />
          ))}
          {modelli.map((m) => (
            <Partenza key={m.id} scelta={origine === m.id} onClick={() => setOrigine(m.id)} icona={<LayoutTemplate />} titolo={m.titolo}
              dettaglio={`Modello${m.kcal ? ` · ${m.kcal.toLocaleString("it-IT")} kcal` : ""} · ${m.pasti} pasti`} />
          ))}
        </div>
      </div>
    </Finestra>
  )
}
