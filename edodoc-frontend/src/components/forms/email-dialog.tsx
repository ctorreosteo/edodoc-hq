import { Copy, Loader2, Mail, Paperclip } from "lucide-react"
import { useEffect, useState } from "react"
import { EmailTestoRicco } from "@/components/email/email-testo-ricco"
import { PazienteCombobox } from "@/components/forms/paziente-combobox"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SheetNotice } from "@/components/ui/sheet-kit"
import { useAzioni } from "@/contexts/azioni-context"
import { EMAIL, testoInHtml, type RichiestaEmail } from "@/lib/email"
import { toast, toastErrore } from "@/lib/toast"
import { emailService } from "@/services/gestionale"
import type { BozzaEmail } from "@/types"

/** Popup di invio: propone il modello già riempito e spedisce quello che il dottore approva. */
export function EmailDialog({ open, onOpenChange, richiesta }: { open: boolean; onOpenChange: (a: boolean) => void; richiesta: RichiestaEmail | null }) {
  const { aggiorna } = useAzioni()
  const [paziente, setPaziente] = useState<number | null>(null)
  const [bozza, setBozza] = useState<BozzaEmail | null>(null)
  const [destinatario, setDestinatario] = useState("")
  const [oggetto, setOggetto] = useState("")
  const [corpo, setCorpo] = useState("")
  const [corpoTesto, setCorpoTesto] = useState("")
  const [errore, setErrore] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)

  const voce = richiesta ? EMAIL[richiesta.tipo] : null
  // Dal menu generale non c'è un riferimento: il paziente si sceglie qui
  const scegliPaziente = !!richiesta && !richiesta.pazienteId && !richiesta.pagamentoId && !richiesta.fatturaId

  useEffect(() => {
    if (!open || !richiesta) return
    setPaziente(null)
    setBozza(null)
    setErrore(null)
  }, [open, richiesta])

  useEffect(() => {
    if (!open || !richiesta) return
    if (scegliPaziente && !paziente) return
    let attivo = true
    setBozza(null)
    setErrore(null)
    emailService.bozza(scegliPaziente ? { ...richiesta, pazienteId: paziente } : richiesta)
      .then((b) => {
        if (!attivo) return
        setBozza(b)
        setDestinatario(b.destinatario ?? "")
        setOggetto(b.oggetto)
        setCorpo(testoInHtml(b.testo))
        setCorpoTesto(b.testo)
      })
      .catch((e: Error) => {
        if (attivo) setErrore(e.message)
      })
    return () => {
      attivo = false
    }
  }, [open, richiesta, paziente, scegliPaziente])

  if (!richiesta || !voce) return null

  const invia = async () => {
    if (!bozza) return
    setInvio(true)
    setErrore(null)
    try {
      await emailService.invia({
        tipo: bozza.tipo, pazienteId: bozza.pazienteId, pagamentoId: bozza.pagamentoId, fatturaId: bozza.fatturaId,
        destinatario: destinatario.trim(), oggetto: oggetto.trim(), corpo,
      })
      toast.success(voce.toast)
      aggiorna()
      onOpenChange(false)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Invio non riuscito")
    } finally {
      setInvio(false)
    }
  }

  const copia = async () => {
    await navigator.clipboard.writeText(corpoTesto).then(() => toast.success("Testo copiato")).catch(toastErrore)
  }

  const pronta = !!bozza && !!destinatario.trim() && !!oggetto.trim() && !!corpoTesto.trim()

  return (
    <Dialog open={open} onOpenChange={(prossimo) => !invio && onOpenChange(prossimo)}>
      <DialogContent className="sm:max-w-2xl overflow-hidden flex flex-col gap-0 p-0 max-h-[90vh]"
        onPointerDownOutside={(e) => invio && e.preventDefault()} onEscapeKeyDown={(e) => invio && e.preventDefault()}>
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--grafico-blu)]/15"><Mail className="size-5" aria-hidden /></span>
            {voce.titolo}
          </DialogTitle>
          <DialogDescription>{bozza ? `Per ${bozza.pazienteNome}. Controlla il testo prima dell'invio.` : "Controlla il testo prima dell'invio."}</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4 overflow-y-auto min-w-0">
          {scegliPaziente ? (
            <div className="space-y-2">
              <Label htmlFor="email-paziente">Paziente</Label>
              <PazienteCombobox id="email-paziente" valore={paziente} onChange={setPaziente} />
            </div>
          ) : null}

          {errore ? <SheetNotice tone="danger">{errore}</SheetNotice> : null}
          {!bozza && !errore && !scegliPaziente ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Preparo l'email…</p>
          ) : null}

          {bozza ? (
            <>
              {!bozza.invioAttivo ? <SheetNotice tone="warn">L'invio non è ancora attivo: collega l'account Google in Impostazioni. Intanto puoi copiare il testo.</SheetNotice> : null}
              {bozza.mittente ? <p className="text-sm"><span className="text-muted-foreground">Da </span><span className="font-medium">{bozza.mittente}</span></p> : null}
              <div className="space-y-2">
                <Label htmlFor="email-a">A</Label>
                <Input id="email-a" type="email" value={destinatario} onChange={(e) => setDestinatario(e.target.value)} disabled={invio} placeholder="Email del paziente" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-oggetto">Oggetto</Label>
                <Input id="email-oggetto" value={oggetto} onChange={(e) => setOggetto(e.target.value)} disabled={invio} maxLength={200} />
              </div>
              <div className="space-y-2">
                <Label>Corpo</Label>
                <EmailTestoRicco html={corpo} disabled={invio} placeholder="Scrivi il messaggio…" onChange={(html, testo) => {
                  setCorpo(html)
                  setCorpoTesto(testo)
                }} />
              </div>
              {bozza.allegato ? (
                <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
                  <Paperclip className="size-4 shrink-0 opacity-60" aria-hidden />
                  <span className="truncate font-medium">{bozza.allegato}</span>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="px-6 py-4 border-t flex flex-wrap items-center justify-end gap-3">
          {bozza ? <Button variant="ghost" className="mr-auto" onClick={() => void copia()}><Copy aria-hidden />Copia testo</Button> : null}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={invio}>Annulla</Button>
          <Button onClick={() => void invia()} disabled={invio || !pronta || !bozza?.invioAttivo}>
            {invio ? <><Loader2 className="animate-spin" aria-hidden />Invio…</> : voce.bottone}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
