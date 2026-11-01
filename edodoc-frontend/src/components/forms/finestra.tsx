import type { FormEvent, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/** Guscio comune dei moduli: titolo, corpo scorrevole, Annulla e conferma. */
export function Finestra({ open, onOpenChange, titolo, descrizione, children, salva, etichettaSalva = "Salva", inCorso, larga, disabilitaSalva }: {
  open: boolean
  onOpenChange: (aperta: boolean) => void
  titolo: string
  descrizione?: string
  children: ReactNode
  salva: () => void | Promise<void>
  etichettaSalva?: string
  inCorso?: boolean
  larga?: boolean
  disabilitaSalva?: boolean
}) {
  const invia = (e: FormEvent) => {
    e.preventDefault()
    void salva()
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={larga ? "sm:max-w-2xl" : "sm:max-w-lg"}>
        <form onSubmit={invia} className="grid gap-4 min-w-0">
          <DialogHeader>
            <DialogTitle>{titolo}</DialogTitle>
            {descrizione ? <DialogDescription>{descrizione}</DialogDescription> : <DialogDescription className="sr-only">{titolo}</DialogDescription>}
          </DialogHeader>
          <div className="grid gap-3 max-h-[65vh] overflow-y-auto px-1 -mx-1 pb-1">{children}</div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="submit" disabled={inCorso || disabilitaSalva}>{inCorso ? "Attendi…" : etichettaSalva}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
