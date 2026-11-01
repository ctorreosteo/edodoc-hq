import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Check, CloudOff, Loader2, Maximize2, Minimize2, Minus, Paperclip, Send, Trash2, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { casellaService, type EmailComposizione } from '@/services/casella-service'
import { EmailDestinatari } from './email-destinatari'
import { EmailEditor } from './email-editor'
import { EmailEditorToolbar } from './email-editor-toolbar'
import { EmailCorpo } from './email-corpo'
import { dimensioneFile, indirizzoValido, type BozzaComposer } from './email-utils'

const AUTOSALVA_MS = 2500
const LIMITE_ALLEGATI = 24 * 1024 * 1024

export interface InvioRichiesto {
  composizione: EmailComposizione
  file: File[]
  /** Stato del composer, per riaprirlo se l'invio viene annullato o fallisce. */
  ripristino: BozzaComposer
}

interface EmailComposerProps {
  bozza: BozzaComposer
  variante: 'finestra' | 'inline'
  minimizzato?: boolean
  ingrandito?: boolean
  onMinimizza?: (v: boolean) => void
  onIngrandisci?: (v: boolean) => void
  onChiudi: () => void
  onInvia: (invio: InvioRichiesto) => void
  onBozzaCambiata?: () => void
}

type StatoSalvataggio = 'idle' | 'salvando' | 'salvata' | 'errore'

export function EmailComposer({
  bozza,
  variante,
  minimizzato,
  ingrandito,
  onMinimizza,
  onIngrandisci,
  onChiudi,
  onInvia,
  onBozzaCambiata,
}: EmailComposerProps) {
  const [a, setA] = useState(bozza.a)
  const [cc, setCc] = useState(bozza.cc)
  const [ccn, setCcn] = useState(bozza.ccn)
  const [mostraCc, setMostraCc] = useState(bozza.cc.length > 0)
  const [mostraCcn, setMostraCcn] = useState(bozza.ccn.length > 0)
  const [oggetto, setOggetto] = useState(bozza.oggetto)
  const [html, setHtml] = useState(bozza.html)
  const [vuoto, setVuoto] = useState(!bozza.html)
  const [file, setFile] = useState<File[]>([])
  const [esistenti, setEsistenti] = useState(bozza.allegatiEsistenti)
  // Ref e non stato: si legge anche dopo un await (invio, scarta), quando la closure sarebbe vecchia.
  const bozzaIdRef = useRef(bozza.bozzaId)
  // Idem per gli allegati: ogni salvataggio li sposta nella nuova versione della bozza (id nuovi, la vecchia
  // sparisce). Un invio che ha atteso il salvataggio deve usare questi, non quelli della closure.
  const esistentiRef = useRef(esistenti)
  esistentiRef.current = esistenti
  const fileRef = useRef(file)
  fileRef.current = file
  const [salvataggio, setSalvataggio] = useState<StatoSalvataggio>('idle')
  const [mostraCitazione, setMostraCitazione] = useState(false)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [trascinando, setTrascinando] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sporco = useRef(false)
  const salvaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const salvataggioInCorso = useRef<Promise<unknown> | null>(null)
  const chiuso = useRef(false)

  const htmlFinale = useCallback(
    (corpo = html) => {
      let out = corpo || '<p></p>'
      if (bozza.citazione) out += `<br>${bozza.citazione}`
      return out
    },
    [html, bozza.citazione],
  )

  const composizione = useCallback(
    (): EmailComposizione => ({
      a,
      cc: mostraCc ? cc : [],
      ccn: mostraCcn ? ccn : [],
      oggetto,
      html: htmlFinale(),
      threadId: bozza.threadId,
      inReplyTo: bozza.inReplyTo,
      references: bozza.references,
      allegatiEsistenti: esistentiRef.current.map(({ messaggioId, allegatoId, nome, mimeType }) => ({ messaggioId, allegatoId, nome, mimeType })),
      bozzaId: bozzaIdRef.current,
    }),
    [a, cc, ccn, mostraCc, mostraCcn, oggetto, htmlFinale, bozza],
  )

  const contenuto = !vuoto || oggetto.trim() || a.length > 0 || file.length > 0 || esistenti.length > 0

  const salva = useCallback(async () => {
    if (!sporco.current || chiuso.current) return
    if (!contenuto) return
    sporco.current = false
    const inviati = file
    setSalvataggio('salvando')
    const p = casellaService
      .salvaBozza(composizione(), inviati)
      .then((esito) => {
        bozzaIdRef.current = esito.bozzaId
        if (inviati.length > 0 || esistenti.length > 0) {
          // Gli allegati ora vivono nella bozza Gmail: i loro id cambiano a ogni salvataggio.
          const nuovi = esito.allegati.filter((x) => !x.inline).map((x) => ({ ...x }))
          esistentiRef.current = nuovi
          fileRef.current = fileRef.current.filter((f) => !inviati.includes(f))
          setEsistenti(nuovi)
          setFile((attuali) => attuali.filter((f) => !inviati.includes(f)))
        }
        setSalvataggio('salvata')
        onBozzaCambiata?.()
      })
      .catch(() => {
        sporco.current = true
        setSalvataggio('errore')
      })
    salvataggioInCorso.current = p
    await p
    salvataggioInCorso.current = null
  }, [composizione, contenuto, file, esistenti.length, onBozzaCambiata])

  const salvaRef = useRef(salva)
  salvaRef.current = salva

  const segnaModifica = useCallback(() => {
    sporco.current = true
    if (salvaTimer.current) clearTimeout(salvaTimer.current)
    salvaTimer.current = setTimeout(() => void salvaRef.current(), AUTOSALVA_MS)
  }, [])

  // Ogni modifica dopo il primo render pianifica il salvataggio.
  const primoRender = useRef(true)
  useEffect(() => {
    if (primoRender.current) {
      primoRender.current = false
      return
    }
    segnaModifica()
  }, [a, cc, ccn, oggetto, html, file, segnaModifica])

  useEffect(
    () => () => {
      if (salvaTimer.current) clearTimeout(salvaTimer.current)
    },
    [],
  )

  const ripristino = (): BozzaComposer => ({
    ...bozza,
    a,
    cc,
    ccn,
    oggetto,
    html,
    allegatiEsistenti: esistentiRef.current,
    bozzaId: bozzaIdRef.current,
  })

  const invia = async () => {
    const tutti = [...a, ...(mostraCc ? cc : []), ...(mostraCcn ? ccn : [])]
    if (tutti.length === 0) {
      toast.error('Aggiungi almeno un destinatario')
      return
    }
    const errati = tutti.filter((x) => !indirizzoValido(x))
    if (errati.length) {
      toast.error(`Indirizzo non valido: ${errati[0]}`)
      return
    }
    const totale = file.reduce((s, f) => s + f.size, 0) + esistenti.reduce((s, x) => s + (x.dimensione ?? 0), 0)
    if (totale > LIMITE_ALLEGATI) {
      toast.error('Gli allegati superano i 24 MB consentiti da Gmail')
      return
    }
    if (!oggetto.trim() && !window.confirm("Inviare senza oggetto?")) return
    if (salvaTimer.current) clearTimeout(salvaTimer.current)
    if (salvataggioInCorso.current) await salvataggioInCorso.current.catch(() => {})
    chiuso.current = true
    onInvia({ composizione: composizione(), file: fileRef.current, ripristino: ripristino() })
  }

  const scarta = async () => {
    chiuso.current = true
    if (salvaTimer.current) clearTimeout(salvaTimer.current)
    if (salvataggioInCorso.current) await salvataggioInCorso.current.catch(() => {})
    const id = bozzaIdRef.current
    onChiudi()
    if (id) {
      try {
        await casellaService.eliminaBozza(id)
        onBozzaCambiata?.()
      } catch {
        /* già eliminata */
      }
    }
  }

  const chiudi = async () => {
    if (salvaTimer.current) clearTimeout(salvaTimer.current)
    if (sporco.current && contenuto) {
      await salvaRef.current()
      toast.success('Bozza salvata')
    }
    chiuso.current = true
    onChiudi()
  }

  const aggiungiFile = (nuovi: File[]) => {
    if (nuovi.length) setFile((f) => [...f, ...nuovi])
  }

  const titolo = oggetto.trim() || (bozza.modo === 'inoltra' ? 'Inoltra' : bozza.modo.startsWith('rispondi') ? 'Rispondi' : 'Nuovo messaggio')
  const totaleAllegati = file.reduce((s, f) => s + f.size, 0) + esistenti.reduce((s, x) => s + (x.dimensione ?? 0), 0)

  if (variante === 'finestra' && minimizzato) {
    return (
      <div className="em-composer em-composer--mini" role="dialog" aria-label={titolo}>
        <button type="button" className="em-composer-mini-titolo" onClick={() => onMinimizza?.(false)}>
          <span>{titolo}</span>
        </button>
        <button type="button" className="em-icon-btn" onClick={() => onMinimizza?.(false)} aria-label="Espandi"><Maximize2 /></button>
        <button type="button" className="em-icon-btn" onClick={() => void chiudi()} aria-label="Chiudi"><X /></button>
      </div>
    )
  }

  return (
    <div
      className={`em-composer em-composer--${variante}${ingrandito ? ' em-composer--grande' : ''}`}
      role={variante === 'finestra' ? 'dialog' : 'region'}
      aria-label={titolo}
      data-trascina={trascinando ? '' : undefined}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setTrascinando(true)
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setTrascinando(false)
      }}
      onDrop={(e) => {
        setTrascinando(false)
        if (e.defaultPrevented) return
        const f = Array.from(e.dataTransfer.files)
        if (f.length) {
          e.preventDefault()
          aggiungiFile(f)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          void invia()
        }
      }}
    >
      {variante === 'finestra' ? (
        <header className="em-composer-testa">
          <span className="em-composer-titolo">{titolo}</span>
          <button type="button" className="em-icon-btn" onClick={() => onMinimizza?.(true)} aria-label="Riduci"><Minus /></button>
          <button type="button" className="em-icon-btn" onClick={() => onIngrandisci?.(!ingrandito)} aria-label={ingrandito ? 'Rimpicciolisci' : 'Ingrandisci'}>
            {ingrandito ? <Minimize2 /> : <Maximize2 />}
          </button>
          <button type="button" className="em-icon-btn" onClick={() => void chiudi()} aria-label="Chiudi e salva la bozza"><X /></button>
        </header>
      ) : null}

      <div className="em-composer-campi">
        <EmailDestinatari
          etichetta="A"
          valori={a}
          onChange={setA}
          autoFocus={bozza.modo === 'nuova' || bozza.modo === 'inoltra'}
          coda={
            <span className="em-dest-coda">
              {!mostraCc ? <button type="button" onClick={() => setMostraCc(true)}>Cc</button> : null}
              {!mostraCcn ? <button type="button" onClick={() => setMostraCcn(true)}>Ccn</button> : null}
            </span>
          }
        />
        {mostraCc ? <EmailDestinatari etichetta="Cc" valori={cc} onChange={setCc} /> : null}
        {mostraCcn ? <EmailDestinatari etichetta="Ccn" valori={ccn} onChange={setCcn} /> : null}
        {variante === 'finestra' || bozza.modo === 'inoltra' ? (
          <input className="em-oggetto" placeholder="Oggetto" value={oggetto} onChange={(e) => setOggetto(e.target.value)} aria-label="Oggetto" />
        ) : null}
      </div>

      <div className="em-composer-corpo">
        <EmailEditor
          html={bozza.html}
          autoFocus={bozza.modo === 'rispondi' || bozza.modo === 'rispondiTutti'}
          placeholder={bozza.modo.startsWith('rispondi') ? 'Scrivi la risposta… (⌘↵ per inviare)' : 'Scrivi il messaggio…'}
          onChange={(h, v) => {
            setHtml(h)
            setVuoto(v)
          }}
          onFile={aggiungiFile}
          onReady={setEditor}
          onInvia={() => void invia()}
        />

        {bozza.citazione ? (
          <div className="em-citazione">
            <button type="button" className="em-citazione-toggle" onClick={() => setMostraCitazione((v) => !v)} aria-expanded={mostraCitazione}>
              {mostraCitazione ? 'Nascondi' : 'Mostra'} {bozza.modo === 'inoltra' ? 'il messaggio inoltrato' : 'il messaggio citato'}
            </button>
            {mostraCitazione ? <EmailCorpo html={bozza.citazione} citazioniVisibili compatto titolo="Messaggio citato" /> : null}
          </div>
        ) : null}

        {file.length + esistenti.length > 0 ? (
          <ul className="em-allegati-composer">
            {esistenti.map((x) => (
              <li key={`${x.messaggioId}-${x.allegatoId}`}>
                <Paperclip aria-hidden />
                <span className="em-allegato-nome">{x.nome}</span>
                {x.dimensione ? <small>{dimensioneFile(x.dimensione)}</small> : null}
                <button type="button" aria-label={`Rimuovi ${x.nome}`} onClick={() => { setEsistenti((l) => l.filter((y) => y !== x)); sporco.current = true; segnaModifica() }}>
                  <X />
                </button>
              </li>
            ))}
            {file.map((f, i) => (
              <li key={`${f.name}-${i}`} data-nuovo="">
                <Paperclip aria-hidden />
                <span className="em-allegato-nome">{f.name}</span>
                <small>{dimensioneFile(f.size)}</small>
                <button type="button" aria-label={`Rimuovi ${f.name}`} onClick={() => setFile((l) => l.filter((y) => y !== f))}>
                  <X />
                </button>
              </li>
            ))}
            {totaleAllegati > LIMITE_ALLEGATI ? <li className="em-allegati-oltre">Oltre 24 MB: Gmail non lo accetterà</li> : null}
          </ul>
        ) : null}
      </div>

      <div className="em-composer-formato">
        <EmailEditorToolbar editor={editor} />
      </div>

      <footer className="em-composer-piede">
        <div className="em-invia-gruppo">
          <button type="button" className="em-btn em-btn--invia" onClick={() => void invia()} title="Invia (⌘↵)">
            <Send aria-hidden /> Invia
          </button>
        </div>

        <span className="em-composer-spazio" />

        <button type="button" className="em-icon-btn" onClick={() => fileInputRef.current?.click()} aria-label="Allega file" title="Allega file">
          <Paperclip />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            aggiungiFile(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
        <span className="em-salvataggio" data-stato={salvataggio} aria-live="polite">
          {salvataggio === 'salvando' ? <><Loader2 className="animate-spin" aria-hidden /> Salvo…</> : null}
          {salvataggio === 'salvata' ? <><Check aria-hidden /> Bozza salvata</> : null}
          {salvataggio === 'errore' ? <><CloudOff aria-hidden /> Non salvata</> : null}
        </span>
        <button type="button" className="em-icon-btn em-icon-btn--pericolo" onClick={() => void scarta()} aria-label="Elimina bozza" title="Elimina bozza">
          <Trash2 />
        </button>
      </footer>

      {trascinando ? <div className="em-drop" aria-hidden><Paperclip /> Rilascia per allegare</div> : null}
    </div>
  )
}
