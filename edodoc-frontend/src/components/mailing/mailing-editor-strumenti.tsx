import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, FileCode2, Loader2, Monitor, Send, Smartphone, Upload, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/lib/toast'
import { mailingService, messaggioErroreMailing } from '@/services/mailing-service'
import { sostituisciSegnaposto, valoriEsempio } from '@/lib/mailing-render'
import { PORTALE } from './mailing-editor-dati'
import { Segmentato } from './mailing-editor-controlli'
import { SchermoIntero } from './mailing-anteprima'
import { emailProvaRicordata, ricordaEmailProva } from './mailing-utils'

/*
  Strumenti per ogni email (editor, nodo email delle automazioni, campagne, report): partire da un HTML già pronto,
  vederla a tutto schermo come la riceve il paziente, mandarsi una prova all'indirizzo che si vuole.
*/

// ───────────────────────── Importa HTML ─────────────────────────

const MAX_HTML_KB = 500

export function DialogImportaHtml({
  aperto,
  onChiudi,
  haContenuto,
  onImporta,
}: {
  aperto: boolean
  onChiudi: () => void
  haContenuto: boolean
  onImporta: (html: string) => void
}) {
  const [html, setHtml] = useState('')
  const [file, setFile] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (aperto) {
      setHtml('')
      setFile(null)
    }
  }, [aperto])
  const leggiFile = async (f: File | undefined) => {
    if (!f) return
    if (f.size > MAX_HTML_KB * 1024) {
      toast.error(`Il file è troppo grande (massimo ${MAX_HTML_KB} KB)`)
      return
    }
    setHtml(await f.text())
    setFile(f.name)
  }
  const importa = () => {
    if (!/<[a-z][\s\S]*>/i.test(html)) {
      toast.info('Incolla il codice HTML dell\'email o scegli un file .html')
      return
    }
    onImporta(html)
    onChiudi()
  }
  return (
    <Dialog open={aperto} onOpenChange={(o) => !o && onChiudi()}>
      <DialogContent className="ml-dialog ml-ed-ai-dialog sm:max-w-xl" {...PORTALE}>
        <DialogHeader>
          <DialogTitle className="ml-ed-dialog-titolo">
            <FileCode2 /> Parti da un HTML già pronto
          </DialogTitle>
          <DialogDescription>Incolla il codice dell'email o carica il file .html: lo vedi subito nell'anteprima e lo mandi così com'è.</DialogDescription>
        </DialogHeader>
        <div className="ml-ed-ai-corpo">
          <div className="ml-ed-campo">
            <button type="button" className="ml-btn ml-btn--sm" onClick={() => input.current?.click()}>
              <Upload /> {file ? `File: ${file}` : 'Scegli un file .html'}
            </button>
            <input ref={input} type="file" accept=".html,.htm,text/html" hidden onChange={(e) => void leggiFile(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
          </div>
          <label className="ml-ed-campo">
            <span className="ml-ed-etichetta">Codice HTML</span>
            <textarea
              className="ml-textarea ml-ed-input ml-ed-area"
              rows={10}
              autoFocus
              spellCheck={false}
              value={html}
              placeholder="<!DOCTYPE html><html>…</html>"
              onChange={(e) => {
                setHtml(e.target.value)
                setFile(null)
              }}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}
            />
          </label>
          <div className="ml-ed-nota">
            {haContenuto ? 'Sostituisce tutto il contenuto attuale (puoi annullare con ⌘Z). ' : ''}
            L'HTML resta un blocco unico: i testi si cambiano nel codice. Se non contiene il link di disiscrizione, il piè di pagina obbligatorio lo aggiungiamo noi all'invio.
          </div>
        </div>
        <div className="ml-ed-dialog-azioni">
          <button type="button" className="ml-btn ml-btn--ghost" onClick={onChiudi}>
            Annulla
          </button>
          <button type="button" className="ml-btn ml-btn--pieno" onClick={importa} disabled={!html.trim()}>
            <FileCode2 /> Usa questo HTML
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────── Invio di prova ─────────────────────────

export type ContestoProva = { oggetto?: string | null; preheader?: string | null; mittenteId?: number | null; categoriaId?: number | null }

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function DialogInvioProva({ aperto, onChiudi, contesto, html }: { aperto: boolean; onChiudi: () => void; contesto: ContestoProva; html: () => string }) {
  const [indirizzi, setIndirizzi] = useState('')
  const [invio, setInvio] = useState(false)
  useEffect(() => {
    if (aperto) setIndirizzi((v) => v || emailProvaRicordata())
  }, [aperto])
  const invia = async () => {
    const lista = [...new Set(indirizzi.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))]
    const errati = lista.filter((x) => !EMAIL.test(x))
    if (!lista.length) {
      toast.info('Scrivi almeno un indirizzo')
      return
    }
    if (errati.length) {
      toast.error(`Indirizzo non valido: ${errati[0]}`)
      return
    }
    if (lista.length > 5) {
      toast.error('Al massimo 5 indirizzi per la prova')
      return
    }
    setInvio(true)
    ricordaEmailProva(lista[0])
    try {
      await mailingService.inviaProva({ indirizzi: lista, html: html(), ...contesto })
      toast.success(`Prova inviata a ${lista.length === 1 ? lista[0] : `${lista.length} indirizzi`}`, { description: 'L\'oggetto inizia con [TEST]. Controlla anche nella cartella Promozioni.' })
      onChiudi()
    } catch (e) {
      toast.error(messaggioErroreMailing(e, 'Invio di prova non riuscito'))
    } finally {
      setInvio(false)
    }
  }
  return (
    <Dialog open={aperto} onOpenChange={(o) => !o && !invio && onChiudi()}>
      <DialogContent className="ml-dialog ml-ed-ai-dialog sm:max-w-md" {...PORTALE}>
        <DialogHeader>
          <DialogTitle className="ml-ed-dialog-titolo">
            <Send /> Invia una prova
          </DialogTitle>
          <DialogDescription>Ti mandiamo l'email esattamente come la vedi qui, anche se non l'hai ancora salvata. Guardala sul telefono e prova i link.</DialogDescription>
        </DialogHeader>
        <div className="ml-ed-ai-corpo">
          <label className="ml-ed-campo">
            <span className="ml-ed-etichetta">A chi la mando</span>
            <input
              className="ml-input ml-ed-input"
              type="text"
              inputMode="email"
              autoFocus
              value={indirizzi}
              placeholder="nome@esempio.it"
              onChange={(e) => setIndirizzi(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void invia()}
            />
          </label>
          <div className="ml-ed-nota">Fino a 5 indirizzi, separati da virgola. Oggetto: «[TEST] {contesto.oggetto?.trim() || 'senza oggetto'}»; i segnaposto come il nome usano dati d'esempio.</div>
        </div>
        <div className="ml-ed-dialog-azioni">
          <button type="button" className="ml-btn ml-btn--ghost" onClick={onChiudi} disabled={invio}>
            Annulla
          </button>
          <button type="button" className="ml-btn ml-btn--pieno" onClick={() => void invia()} disabled={invio}>
            {invio ? <Loader2 className="ml-ed-gira" /> : <Send />}
            {invio ? 'Invio…' : 'Invia la prova'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────── Anteprima a tutto schermo ─────────────────────────

/** L'email come la riceve il paziente (segnaposto con dati d'esempio), su computer o telefono, con «Invia prova». */
export function AnteprimaSchermoIntero({ html, contesto, onChiudi }: { html: string; contesto: ContestoProva; onChiudi: () => void }) {
  const [vista, setVista] = useState<'computer' | 'telefono'>('computer')
  const [provaAperta, setProvaAperta] = useState(false)
  const [altezza, setAltezza] = useState(800)
  const frame = useRef<HTMLIFrameElement>(null)
  const htmlEsempio = useMemo(() => sostituisciSegnaposto(html, valoriEsempio()), [html])
  // L'iframe prende l'altezza dell'email: si scorre la pagina, non un riquadro dentro la pagina.
  const misura = () => {
    const d = frame.current?.contentDocument
    if (d) setAltezza(Math.max(400, d.documentElement.scrollHeight))
  }
  useEffect(() => {
    const t = window.setTimeout(misura, 60)
    return () => window.clearTimeout(t)
  }, [vista, htmlEsempio])
  return (
    <SchermoIntero etichetta="Anteprima dell'email" onEsc={onChiudi}>
      <div className="ml-anteprima-piena">
        <header className="ml-schermo-testa">
          <div className="ml-anteprima-piena-titoli">
            <span className="ml-anteprima-piena-oggetto">{contesto.oggetto?.trim() || 'Senza oggetto'}</span>
            {contesto.preheader ? <span className="ml-anteprima-piena-pre">{contesto.preheader}</span> : null}
          </div>
          <Segmentato
            ariaLabel="Dispositivo"
            valore={vista}
            onChange={setVista}
            opzioni={[
              { valore: 'computer', etichetta: 'Computer', icona: <Monitor /> },
              { valore: 'telefono', etichetta: 'Telefono', icona: <Smartphone /> },
            ]}
          />
          <button type="button" className="ml-btn ml-btn--sm" onClick={() => setProvaAperta(true)}>
            <Send /> Invia prova
          </button>
          <button type="button" className="ml-btn ml-btn--ghost ml-btn--sm" onClick={onChiudi} aria-label="Chiudi l'anteprima">
            <X /> Chiudi
          </button>
        </header>
        <div className="ml-anteprima-piena-corpo">
          <iframe
            ref={frame}
            key={vista}
            title="Anteprima dell'email"
            className="ml-anteprima-piena-email"
            data-vista={vista}
            sandbox="allow-same-origin"
            srcDoc={htmlEsempio}
            onLoad={misura}
            style={{ height: altezza }}
          />
        </div>
      </div>
      <DialogInvioProva aperto={provaAperta} onChiudi={() => setProvaAperta(false)} contesto={contesto} html={() => html} />
    </SchermoIntero>
  )
}

/** I due tasti di ogni email: «Anteprima» a tutto schermo e «Invia prova» (preimpostata sull'email dell'utente). */
export function AzioniEmail({ html, contesto, soloIcone }: { html: string | null | undefined; contesto: ContestoProva; soloIcone?: boolean }) {
  const [anteprima, setAnteprima] = useState(false)
  const [prova, setProva] = useState(false)
  const vuota = !html?.trim()
  return (
    <>
      <button type="button" className="ml-btn ml-btn--sm" onClick={() => setAnteprima(true)} disabled={vuota} title="Guarda l'email a tutto schermo" aria-label="Anteprima">
        <Eye />
        {soloIcone ? null : <span>Anteprima</span>}
      </button>
      <button type="button" className="ml-btn ml-btn--sm" onClick={() => setProva(true)} disabled={vuota} title="Manda l'email a un indirizzo a scelta" aria-label="Invia prova">
        <Send />
        {soloIcone ? null : <span>Invia prova</span>}
      </button>
      {anteprima && html ? <AnteprimaSchermoIntero html={html} contesto={contesto} onChiudi={() => setAnteprima(false)} /> : null}
      <DialogInvioProva aperto={prova} onChiudi={() => setProva(false)} contesto={contesto} html={() => html ?? ''} />
    </>
  )
}
