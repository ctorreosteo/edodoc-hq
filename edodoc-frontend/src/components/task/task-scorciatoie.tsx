import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const GRUPPI: { titolo: string; voci: [string[], string][] }[] = [
  {
    titolo: "Ovunque",
    voci: [
      [["N"], "Nuovo task"],
      [["/"], "Cerca"],
      [["?"], "Questo riepilogo"],
    ],
  },
  {
    titolo: "Sulle righe",
    voci: [
      [["J"], "Task successivo"],
      [["K"], "Task precedente"],
      [["Invio"], "Apri il task"],
      [["X"], "Completa / riapri"],
      [["P"], "Posticipa"],
    ],
  },
  {
    titolo: "Aggiunta rapida",
    voci: [
      [["oggi", "domani", "dopodomani"], "Scadenza"],
      [["!alta", "!media", "!bassa"], "Priorità"],
    ],
  },
]

/** Riepilogo delle scorciatoie, aperto con "?". */
export function TaskScorciatoie({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Scorciatoie</DialogTitle>
          <DialogDescription>Fai tutto senza mouse.</DialogDescription>
        </DialogHeader>
        <div className="tk-keys tk-keys-grid" data-vl="scope" data-vl-page="task">
          {GRUPPI.map((g) => (
            <section key={g.titolo}>
              <p role="heading" aria-level={3} className="tk-keys-titolo">{g.titolo}</p>
              <dl>
                {g.voci.map(([tasti, cosa]) => (
                  <div key={cosa}>
                    <dt>{tasti.map((t) => <kbd key={t}>{t}</kbd>)}</dt>
                    <dd>{cosa}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
