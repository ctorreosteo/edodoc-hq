import { Check, ChevronsUpDown, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toastErrore } from "@/lib/toast"
import { pazientiService } from "@/services/gestionale"
import type { Paziente } from "@/types"

export function PazienteCombobox({ valore, onChange, disabled, id }: {
  valore: number | null | undefined
  onChange: (id: number) => void
  disabled?: boolean
  id?: string
}) {
  const [aperto, setAperto] = useState(false)
  const [ricerca, setRicerca] = useState("")
  const [pazienti, setPazienti] = useState<Paziente[]>([])

  useEffect(() => {
    pazientiService.lista().then(setPazienti).catch(toastErrore)
  }, [])

  const scelto = pazienti.find((p) => p.id === valore)
  const risultati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase()
    return testo ? pazienti.filter((p) => `${p.nome} ${p.cognome}`.toLowerCase().includes(testo)) : pazienti
  }, [pazienti, ricerca])

  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" disabled={disabled} className="w-full justify-between font-normal">
          <span className="truncate">{scelto ? `${scelto.nome} ${scelto.cognome}` : "Scegli il paziente"}</span>
          <ChevronsUpDown className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 opacity-50" aria-hidden />
          <input
            autoFocus
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Cerca per nome"
            aria-label="Cerca paziente"
            className="h-9 w-full bg-transparent text-sm outline-none"
          />
        </div>
        <ul className="max-h-60 overflow-y-auto p-1">
          {risultati.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onChange(p.id)
                  setAperto(false)
                  setRicerca("")
                }}
              >
                {p.nome} {p.cognome}
                {p.id === valore ? <Check className="size-4" aria-hidden /> : null}
              </button>
            </li>
          ))}
          {risultati.length === 0 ? <li className="px-2 py-3 text-center text-sm text-muted-foreground">Nessun paziente</li> : null}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
