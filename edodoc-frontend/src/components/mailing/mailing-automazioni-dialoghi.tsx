import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Check, Loader2, Search, UserPlus, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import {
  mailingService,
  messaggioErroreMailing,
  type MailingAutomazioneEmail,
  type MailingContattoRiga,
  type MailingDocumento,
} from '@/services/mailing-service'
import { documentoDaHtml, documentoVuoto, normalizzaDocumento } from '@/lib/mailing-render'
import { MailingDialog } from './mailing-dialog'
import { MailingEditor } from './mailing-editor'
import { nomeContatto, iniziali, tintaPer, formatNumero } from './mailing-utils'

/* Finestre del builder: iscrizione manuale dei contatti, editor a tutto schermo del contenuto di un'email. */

// ───────────────────────── Iscrivi contatti ─────────────────────────

export function DialogIscrivi({ open, onOpenChange, automazioneId, nome }: { open: boolean; onOpenChange: (v: boolean) => void; automazioneId: number; nome: string }) {
  const [q, setQ] = useState('')
  const [risultati, setRisultati] = useState<MailingContattoRiga[] | null>(null)
  const [totale, setTotale] = useState(0)
  const [carico, setCarico] = useState(false)
  const [scelti, setScelti] = useState<Map<number, MailingContattoRiga>>(new Map())
  const [invio, setInvio] = useState(false)
  const richiesta = useRef(0)

  useEffect(() => {
    if (!open) return
    const n = ++richiesta.current
    setCarico(true)
    const t = window.setTimeout(async () => {
      try {
        const pagina = await mailingService.contatti({ q: q.trim() || undefined, stato: 'ISCRITTO', dimensione: 20, pagina: 0 })
        if (n !== richiesta.current) return
        setRisultati(pagina.elementi)
        setTotale(pagina.totale)
      } catch (err) {
        if (n === richiesta.current) toast.error(messaggioErroreMailing(err, 'Ricerca non riuscita'))
      } finally {
        if (n === richiesta.current) setCarico(false)
      }
    }, 280)
    return () => window.clearTimeout(t)
  }, [q, open])

  useEffect(() => {
    if (!open) {
      setScelti(new Map())
      setQ('')
    }
  }, [open])

  const commuta = (c: MailingContattoRiga) =>
    setScelti((m) => {
      const nuova = new Map(m)
      if (nuova.has(c.id)) nuova.delete(c.id)
      else nuova.set(c.id, c)
      return nuova
    })

  const iscrivi = async () => {
    setInvio(true)
    try {
      const esito = await mailingService.iscriviAutomazione(automazioneId, [...scelti.keys()])
      toast.success(
        esito.iscritti === 1 ? '1 contatto è entrato nel percorso' : `${formatNumero(esito.iscritti)} contatti sono entrati nel percorso`,
        esito.saltati ? { description: `${formatNumero(esito.saltati)} saltati: erano già dentro o non possono ricevere email.` } : undefined,
      )
      onOpenChange(false)
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Iscrizione non riuscita'))
    } finally {
      setInvio(false)
    }
  }

  return (
    <MailingDialog
      open={open}
      onOpenChange={(v) => !invio && onOpenChange(v)}
      titolo="Iscrivi contatti"
      icona={<UserPlus className="size-5" aria-hidden />}
      descrizione={<>Entrano subito nel percorso «{nome}», dal primo passo. Solo i contatti iscritti alle email.</>}
      larghezza="max-w-xl"
    >
      <div className="ml-au-iscrivi">
        <label className="ml-au-cerca">
          <Search className="size-4" aria-hidden />
          <input className="ml-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome o email" aria-label="Cerca contatti" autoFocus />
          {carico ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        </label>
        {scelti.size ? (
          <div className="ml-au-scelti" aria-label="Contatti scelti">
            {[...scelti.values()].map((c) => (
              <button key={c.id} type="button" className="ml-chip ml-chip--attivo" onClick={() => commuta(c)} aria-label={`Togli ${nomeContatto(c)}`}>
                {nomeContatto(c)} <X className="size-3" aria-hidden />
              </button>
            ))}
          </div>
        ) : null}
        <ul className="ml-au-risultati" aria-busy={carico}>
          {risultati === null
            ? Array.from({ length: 4 }, (_, i) => <li key={i}><span className="ml-skeleton block h-10 w-full" /></li>)
            : risultati.map((c) => {
                const scelto = scelti.has(c.id)
                return (
                  <li key={c.id}>
                    <button type="button" className="ml-au-risultato" aria-pressed={scelto} onClick={() => commuta(c)}>
                      <span className="ml-avatar" style={{ ['--ml-hue' as string]: tintaPer(c.email) }} aria-hidden>{iniziali(nomeContatto(c))}</span>
                      <span className="min-w-0 flex-1">
                        <span className="ml-au-risultato-nome">{nomeContatto(c)}</span>
                        <span className="ml-au-risultato-email">{c.email}</span>
                      </span>
                      <span className="ml-badge ml-badge--neutro">{c.tipo === 'PAZIENTE' ? 'Paziente' : c.tipo === 'LEAD' ? 'Lead' : 'Contatto'}</span>
                      <span className="ml-au-spunta" data-on={scelto ? '' : undefined} aria-hidden>{scelto ? <Check className="size-3.5" /> : null}</span>
                    </button>
                  </li>
                )
              })}
          {risultati && !risultati.length ? <li className="ml-au-nessuno">Nessun contatto iscritto trovato.</li> : null}
        </ul>
        {risultati && totale > risultati.length ? <div className="ml-campo-aiuto">Mostro i primi {risultati.length} di {formatNumero(totale)}: affina la ricerca.</div> : null}
      </div>
      <div className="ml-dialog-piede">
        <button type="button" className="ml-btn ml-btn--ghost" onClick={() => onOpenChange(false)} disabled={invio}>Annulla</button>
        <button type="button" className="ml-btn ml-btn--pieno" disabled={!scelti.size || invio} onClick={() => void iscrivi()}>
          {invio ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}
          {scelti.size ? `Iscrivi ${scelti.size}` : 'Iscrivi'}
        </button>
      </div>
    </MailingDialog>
  )
}

// ───────────────────────── Editor email a tutto schermo ─────────────────────────

function documentoIniziale(e: MailingAutomazioneEmail): MailingDocumento {
  if (e.design) return normalizzaDocumento(e.design)
  if (e.html?.trim()) return documentoDaHtml(e.html)
  return documentoVuoto()
}

export function EditorEmailAutomazione({
  email,
  numero,
  aiDisponibile,
  contestoProva,
  salvataggio,
  onCambia,
  onOggetto,
  onChiudi,
}: {
  email: MailingAutomazioneEmail
  numero: number
  aiDisponibile: boolean
  contestoProva: { mittenteId: number | null; categoriaId: number | null }
  salvataggio: 'salvato' | 'salvo' | 'modificato' | 'errore'
  onCambia: (doc: MailingDocumento, html: string) => void
  onOggetto: (oggetto: string) => void
  onChiudi: () => void
}) {
  const [doc, setDoc] = useState<MailingDocumento>(() => documentoIniziale(email))
  const radice = useRef<HTMLDivElement>(null)
  useEffect(() => {
    radice.current?.focus()
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[data-slot="dialog-content"],[data-slot="popover-content"]')) onChiudi()
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  const testoStato = useMemo(
    () => ({ salvato: 'Salvata', salvo: 'Salvataggio…', modificato: 'Modifiche in corso…', errore: 'Non salvata, riprovo' })[salvataggio],
    [salvataggio],
  )

  return createPortal(
    <div ref={radice} tabIndex={-1} className="ml-au-editor" data-vl="" data-vl-page="mailing" role="dialog" aria-modal="true" aria-label={`Contenuto dell’email del passo ${numero}`}>
      <div className="ml-au-editor-testa">
        <button type="button" className="ml-btn ml-btn--ghost" onClick={onChiudi}>
          <ArrowLeft className="size-4" aria-hidden /> Torna al percorso
        </button>
        <div className="ml-au-editor-oggetto">
          <span className="ml-etichetta">Passo {numero} · oggetto</span>
          <input className="ml-input" value={email.oggetto} maxLength={150} placeholder="Oggetto dell’email" aria-label="Oggetto dell’email" onChange={(e) => onOggetto(e.target.value)} />
        </div>
        <span className="ml-au-salvataggio" data-stato={salvataggio} aria-live="polite">
          {salvataggio === 'salvo' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <span className="ml-au-salvataggio-punto" aria-hidden />}
          {testoStato}
        </span>
        <button type="button" className="ml-btn ml-btn--pieno" onClick={onChiudi}>
          <Check className="size-4" aria-hidden /> Fatto
        </button>
      </div>
      <div className="ml-au-editor-corpo">
        <MailingEditor
          documento={doc}
          aiDisponibile={aiDisponibile}
          contestoAnteprima={{ oggetto: email.oggetto, preheader: email.preheader }}
          contestoProva={contestoProva}
          onSuggerimentiAi={(s) => {
            if (!email.oggetto?.trim() && s.oggetti[0]) onOggetto(s.oggetti[0])
          }}
          onChange={(d, html) => {
            setDoc(d)
            onCambia(d, html)
          }}
        />
      </div>
    </div>,
    document.body,
  )
}
