import { useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

/*
  Dialog della pagina Email Marketing: il portale porta data-vl + data-vl-page="mailing" (token e classi ml-),
  il titolo è un div (niente h1–h6 fuori dall'hero).
*/

export function MailingDialog({
  open,
  onOpenChange,
  titolo,
  icona,
  descrizione,
  children,
  larghezza = 'max-w-lg',
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  titolo: ReactNode
  icona?: ReactNode
  descrizione?: ReactNode
  children?: ReactNode
  larghezza?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`ml-dialog ${larghezza} max-h-[92dvh] overflow-y-auto`} data-vl="" data-vl-page="mailing">
        <DialogTitle asChild>
          <div className="ml-dialog-titolo pr-8">
            {icona}
            {titolo}
          </div>
        </DialogTitle>
        {descrizione ? (
          <DialogDescription asChild>
            <div className="ml-dialog-testo">{descrizione}</div>
          </DialogDescription>
        ) : (
          <DialogDescription className="sr-only">{typeof titolo === 'string' ? titolo : 'Finestra'}</DialogDescription>
        )}
        {children}
      </DialogContent>
    </Dialog>
  )
}

/** Conferma con azione asincrona: il pulsante mostra l'attesa e il dialog si chiude solo se l'azione riesce. */
export function ConfermaMailing({
  open,
  onOpenChange,
  titolo,
  icona,
  testo,
  conferma,
  pericolo,
  onConferma,
  children,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  titolo: ReactNode
  icona?: ReactNode
  testo: ReactNode
  conferma: string
  pericolo?: boolean
  onConferma: () => Promise<boolean | void> | boolean | void
  children?: ReactNode
}) {
  const [inCorso, setInCorso] = useState(false)
  const esegui = async () => {
    setInCorso(true)
    try {
      const esito = await onConferma()
      if (esito !== false) onOpenChange(false)
    } finally {
      setInCorso(false)
    }
  }
  return (
    <MailingDialog open={open} onOpenChange={(v) => !inCorso && onOpenChange(v)} titolo={titolo} icona={icona} descrizione={testo}>
      {children}
      <div className="ml-dialog-piede">
        <button type="button" className="ml-btn ml-btn--ghost" onClick={() => onOpenChange(false)} disabled={inCorso}>
          Annulla
        </button>
        <button type="button" className={`ml-btn ${pericolo ? 'ml-btn--pericolo' : 'ml-btn--pieno'}`} onClick={() => void esegui()} disabled={inCorso}>
          {inCorso ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {conferma}
        </button>
      </div>
    </MailingDialog>
  )
}
