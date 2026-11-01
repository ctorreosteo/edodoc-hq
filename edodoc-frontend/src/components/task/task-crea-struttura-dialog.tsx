import { useEffect, useState } from "react"
import { Campo, Scelta } from "@/components/forms/campo"
import { Finestra } from "@/components/forms/finestra"
import { Input } from "@/components/ui/input"
import { useAzioni } from "@/contexts/azioni-context"
import { cartellaDaSelezione, chiaveContenitore, opzioniContenitori } from "@/lib/task-struttura"
import { toast, toastErrore } from "@/lib/toast"
import { taskService } from "@/services/gestionale"
import type { TaskTipoStruttura } from "@/types"
import { COLORI_LISTA, ICONE_LISTA } from "./task-lista-icone"

/** Nuova lista o cartella: nome, posizione, colore e (per le liste) icona. */
export function TaskCreaStrutturaDialog({ tipo, parentId, open, onOpenChange, onCreata }: {
  tipo: TaskTipoStruttura
  /** Cartella in cui crearla (null = radice) */
  parentId: number | null
  open: boolean
  onOpenChange: (aperta: boolean) => void
  onCreata: (selezione: string) => void
}) {
  const { aggiorna, struttura } = useAzioni()
  const lista = tipo === "LISTA"
  const [nome, setNome] = useState("")
  const [colore, setColore] = useState(COLORI_LISTA[1])
  const [icona, setIcona] = useState("list")
  const [contenitore, setContenitore] = useState("radice")
  const [inCorso, setInCorso] = useState(false)

  // Ogni apertura riparte pulita, dalla cartella indicata
  useEffect(() => {
    if (!open) return
    setNome("")
    setColore(lista ? COLORI_LISTA[1] : COLORI_LISTA[8])
    setIcona("list")
    setContenitore(chiaveContenitore(parentId))
  }, [open, parentId, lista])

  const salva = async () => {
    setInCorso(true)
    try {
      const destinazione = cartellaDaSelezione(contenitore)
      const selezione = lista
        ? `lista:${(await taskService.creaLista({ nome, cartellaId: destinazione, colore, icona })).id}`
        : `cartella:${(await taskService.creaCartella({ nome, parentId: destinazione, colore })).id}`
      toast.success(lista ? "Lista creata" : "Cartella creata", { description: nome.trim() })
      aggiorna()
      onOpenChange(false)
      onCreata(selezione)
    } catch (e) {
      toastErrore(e)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Finestra open={open} onOpenChange={onOpenChange} titolo={lista ? "Nuova lista" : "Nuova cartella"} salva={salva} inCorso={inCorso}
      etichettaSalva={lista ? "Crea lista" : "Crea cartella"} disabilitaSalva={!nome.trim()}>
      <Campo etichetta="Nome" id="tk-struttura-nome">
        <Input id="tk-struttura-nome" value={nome} maxLength={100} autoFocus required onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <Campo etichetta="Dove" id="tk-struttura-dove">
        <Scelta id="tk-struttura-dove" valore={contenitore} onChange={setContenitore} opzioni={opzioniContenitori(struttura)} />
      </Campo>
      <Campo etichetta="Colore">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colore">
          {COLORI_LISTA.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={colore === c} aria-label={`Colore ${c}`} onClick={() => setColore(c)}
              className="size-6 rounded-full border-2 transition hover:scale-105 aria-checked:scale-110 aria-checked:border-white aria-checked:ring-2 aria-checked:ring-foreground/40"
              style={{ background: c, borderColor: colore === c ? undefined : "transparent" }} />
          ))}
        </div>
      </Campo>
      {lista ? (
        <Campo etichetta="Icona">
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Icona">
            {Object.entries(ICONE_LISTA).map(([n, Icona]) => (
              <button key={n} type="button" role="radio" aria-checked={icona === n} aria-label={n} onClick={() => setIcona(n)}
                className="flex size-8 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-accent aria-checked:border-transparent aria-checked:text-white"
                style={icona === n ? { background: colore } : undefined}>
                <Icona className="size-4" />
              </button>
            ))}
          </div>
        </Campo>
      ) : null}
    </Finestra>
  )
}

