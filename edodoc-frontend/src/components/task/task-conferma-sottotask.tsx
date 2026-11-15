import { useEffect, useState } from 'react'
import { CheckCheck, ListTree } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { registraConfermaSottotask, type RichiestaConfermaSottotask } from '@/lib/task-conferma-sottotask'

/*
  Completando un task principale con sottotask ancora aperti si chiede conferma: confermando si completano anche
  quelli (il backend li chiude con `completaSottotask`), annullando non cambia niente.
  Una finestra sola per tutta l'app (montata in App.tsx), aperta da lista, kanban, dettaglio, azioni multiple e
  task citati nei documenti tramite `lib/task-conferma-sottotask.ts`.
*/

export function TaskConfermaSottotaskHost() {
  const [richiesta, setRichiesta] = useState<RichiestaConfermaSottotask | null>(null)

  useEffect(() => registraConfermaSottotask((r) => setRichiesta((prima) => {
    prima?.rispondi(false)
    return r
  })), [])

  const chiudi = (si: boolean) => {
    richiesta?.rispondi(si)
    setRichiesta(null)
  }

  const n = richiesta?.aperti ?? 0
  const piu = (richiesta?.principali ?? 1) > 1
  return (
    <Dialog open={!!richiesta} onOpenChange={(o) => !o && chiudi(false)}>
      <DialogContent className="max-w-md rounded-2xl!">
        <DialogHeader>
          <span className="mb-1 inline-grid size-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" aria-hidden>
            <ListTree className="size-5" />
          </span>
          <DialogTitle>
            {n === 1 ? 'C\'è un sottotask ancora aperto' : `Ci sono ${n} sottotask ancora aperti`}
          </DialogTitle>
          <DialogDescription>
            {piu
              ? `Completando i task selezionati si completano anche i loro sottotask aperti (${n}).`
              : <>Completando «{richiesta?.titolo}» {n === 1 ? 'si completa anche il suo sottotask' : `si completano anche i suoi ${n} sottotask`}. Quelli annullati restano annullati.</>}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => chiudi(false)}>Annulla</Button>
          <Button autoFocus onClick={() => chiudi(true)} className="gap-1.5">
            <CheckCheck className="size-4" /> Completa tutto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
