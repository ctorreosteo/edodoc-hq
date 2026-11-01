import { useEffect, useReducer, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Baseline, Bold, Check, ChevronDown, Highlighter, IndentDecrease, IndentIncrease,
  Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, RemoveFormatting, Strikethrough, Underline as UnderlineIcon, Undo2, Unlink,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import '@/style/email-testo-ricco.css'

/*
  Barra di formattazione dei corpi email, uguale nella pagina Email e nei popup di invio. Solo ciò che regge nei client
  di posta: font di sistema, dimensioni in px, colori inline. Il backend (CorpoEmail) accetta esattamente queste proprietà.
*/

const STILI = [
  { etichetta: 'Testo', livello: null },
  { etichetta: 'Titolo', livello: 2 },
  { etichetta: 'Sottotitolo', livello: 3 },
] as const

const FONT = [
  { etichetta: 'Predefinito', valore: null },
  { etichetta: 'Arial', valore: 'Arial, Helvetica, sans-serif' },
  { etichetta: 'Verdana', valore: 'Verdana, Geneva, sans-serif' },
  { etichetta: 'Georgia', valore: 'Georgia, serif' },
  { etichetta: 'Times New Roman', valore: "'Times New Roman', Times, serif" },
  { etichetta: 'Courier New', valore: "'Courier New', Courier, monospace" },
]

const DIMENSIONI = [
  { etichetta: 'Piccolo', valore: '12px' },
  { etichetta: 'Normale', valore: null },
  { etichetta: 'Grande', valore: '18px' },
  { etichetta: 'Molto grande', valore: '24px' },
]

const COLORI_TESTO = [
  { nome: 'Nero', valore: '#1f2933' },
  { nome: 'Grigio', valore: '#6b7280' },
  { nome: 'Blu EdoDoc', valore: '#3A6098' },
  { nome: 'Blu', valore: '#0b63ce' },
  { nome: 'Verde acqua', valore: '#0e7c66' },
  { nome: 'Verde', valore: '#15803d' },
  { nome: 'Ambra', valore: '#b45309' },
  { nome: 'Arancione', valore: '#c2410c' },
  { nome: 'Rosso', valore: '#b91c1c' },
  { nome: 'Rosa', valore: '#be185d' },
  { nome: 'Viola', valore: '#7c3aed' },
  { nome: 'Indaco', valore: '#4338ca' },
]

const COLORI_EVIDENZIA = [
  { nome: 'Giallo', valore: '#fef08a' },
  { nome: 'Verde', valore: '#bbf7d0' },
  { nome: 'Azzurro', valore: '#bae6fd' },
  { nome: 'Rosa', valore: '#fbcfe8' },
  { nome: 'Arancione', valore: '#fed7aa' },
  { nome: 'Viola', valore: '#ddd6fe' },
  { nome: 'Grigio', valore: '#e5e7eb' },
]

const ALLINEAMENTI = [
  { valore: 'left', titolo: 'Allinea a sinistra', Icona: AlignLeft },
  { valore: 'center', titolo: 'Centra', Icona: AlignCenter },
  { valore: 'right', titolo: 'Allinea a destra', Icona: AlignRight },
  { valore: 'justify', titolo: 'Giustifica', Icona: AlignJustify },
]

function Tasto({ attivo, onClick, titolo, children, disabled }: { attivo?: boolean; onClick: () => void; titolo: string; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="te-tb-btn"
      data-attivo={attivo ? '' : undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={titolo}
      aria-label={titolo}
      aria-pressed={attivo}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

/** Menu a tendina che lascia il cursore nell'editor: la selezione resta visibile mentre si sceglie. */
function Tendina({ titolo, attivo, trigger, children }: { titolo: string; attivo?: boolean; trigger: ReactNode; children: (chiudi: () => void) => ReactNode }) {
  const [aperto, setAperto] = useState(false)
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <button type="button" className="te-tb-btn te-tb-tendina" data-attivo={attivo ? '' : undefined} title={titolo} aria-label={titolo} onMouseDown={(e) => e.preventDefault()}>
          {trigger}
          <ChevronDown className="te-tb-freccia" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="te-pop"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {children(() => setAperto(false))}
      </PopoverContent>
    </Popover>
  )
}

function Voce({ scelta, onClick, children }: { scelta: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="te-pop-voce" data-scelta={scelta ? '' : undefined} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <span className="te-pop-voce-testo">{children}</span>
      {scelta ? <Check aria-hidden /> : null}
    </button>
  )
}

function Tavolozza({ colori, attuale, nessuno, onScegli }: { colori: { nome: string; valore: string }[]; attuale?: string; nessuno: string; onScegli: (colore: string | null) => void }) {
  return (
    <>
      <div className="te-tavolozza">
        {colori.map((c) => (
          <button
            key={c.valore}
            type="button"
            className="te-colore"
            style={{ background: c.valore }}
            data-scelto={attuale === c.valore ? '' : undefined}
            title={c.nome}
            aria-label={c.nome}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onScegli(c.valore)}
          />
        ))}
      </div>
      <button type="button" className="te-pop-voce" onMouseDown={(e) => e.preventDefault()} onClick={() => onScegli(null)}>
        <span className="te-pop-voce-testo">{nessuno}</span>
      </button>
    </>
  )
}

function LinkPopover({ editor }: { editor: Editor }) {
  const [aperto, setAperto] = useState(false)
  const [url, setUrl] = useState('')

  const apri = () => {
    setUrl(editor.getAttributes('link').href ?? '')
    setAperto(true)
  }

  useEffect(() => {
    const dom = editor.view.dom
    const scorciatoia = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        apri()
      }
    }
    dom.addEventListener('keydown', scorciatoia)
    return () => dom.removeEventListener('keydown', scorciatoia)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  const togli = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    setAperto(false)
  }

  const applica = () => {
    const u = url.trim()
    if (!u) return togli()
    const href = /^(https?:|mailto:|tel:)/i.test(u) ? u : u.includes('@') ? `mailto:${u}` : `https://${u}`
    if (editor.state.selection.empty && !editor.isActive('link')) {
      // Senza testo selezionato il link sarebbe invisibile: si scrive l'indirizzo stesso
      editor.chain().focus().insertContent({ type: 'text', text: u, marks: [{ type: 'link', attrs: { href } }] }).insertContent(' ').run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    }
    setAperto(false)
  }

  return (
    <Popover open={aperto} onOpenChange={(o) => (o ? apri() : setAperto(false))}>
      <PopoverTrigger asChild>
        <button type="button" className="te-tb-btn" data-attivo={editor.isActive('link') ? '' : undefined} title="Link (⌘K)" aria-label="Link" onMouseDown={(e) => e.preventDefault()}>
          <Link2 />
        </button>
      </PopoverTrigger>
      <PopoverContent className="te-pop te-pop-link" align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
        <form
          className="te-link-form"
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            applica()
          }}
        >
          <input autoFocus className="te-link-input" placeholder="https://… oppure un indirizzo email" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Indirizzo del link" />
          <button type="submit" className="te-link-ok">OK</button>
        </form>
        {editor.isActive('link') ? (
          <button type="button" className="te-pop-voce" onClick={togli}>
            <span className="te-pop-voce-testo te-link-togli"><Unlink aria-hidden /> Togli il link</span>
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function Barra({ editor }: { editor: Editor }) {
  // L'editor vive altrove: senza questo i tasti non seguirebbero il cursore
  const [, aggiorna] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    editor.on('transaction', aggiorna)
    return () => {
      editor.off('transaction', aggiorna)
    }
  }, [editor])

  const c = () => editor.chain().focus()
  const stile = editor.getAttributes('textStyle') as { color?: string; backgroundColor?: string; fontFamily?: string; fontSize?: string }
  const livello = editor.isActive('heading', { level: 2 }) ? 2 : editor.isActive('heading', { level: 3 }) ? 3 : null
  const allineamento = ALLINEAMENTI.find((a) => editor.isActive({ textAlign: a.valore })) ?? ALLINEAMENTI[0]
  const inElenco = editor.isActive('bulletList') || editor.isActive('orderedList')
  const fontScelto = FONT.find((f) => f.valore === (stile.fontFamily ?? null)) ?? FONT[0]
  const dimensioneScelta = DIMENSIONI.find((d) => d.valore === (stile.fontSize ?? null)) ?? DIMENSIONI[1]

  return (
    <div className="te-toolbar" role="toolbar" aria-label="Formattazione">
      <div className="te-tb-gruppo">
        <Tasto titolo="Annulla (⌘Z)" onClick={() => c().undo().run()} disabled={!editor.can().undo()}><Undo2 /></Tasto>
        <Tasto titolo="Ripeti (⇧⌘Z)" onClick={() => c().redo().run()} disabled={!editor.can().redo()}><Redo2 /></Tasto>
      </div>

      <div className="te-tb-gruppo">
        <Tendina titolo="Stile del paragrafo" trigger={<span className="te-tb-valore">{STILI.find((s) => s.livello === livello)?.etichetta}</span>}>
          {(chiudi) => STILI.map((s) => (
            <Voce
              key={s.etichetta}
              scelta={s.livello === livello}
              onClick={() => {
                if (s.livello) c().setHeading({ level: s.livello }).run()
                else c().setParagraph().run()
                chiudi()
              }}
            >
              <span data-stile={s.livello ?? undefined}>{s.etichetta}</span>
            </Voce>
          ))}
        </Tendina>
        <Tendina titolo="Carattere" trigger={<span className="te-tb-valore te-tb-valore--font">{fontScelto.valore ? fontScelto.etichetta : 'Carattere'}</span>}>
          {(chiudi) => FONT.map((f) => (
            <Voce
              key={f.etichetta}
              scelta={f === fontScelto}
              onClick={() => {
                if (f.valore) c().setFontFamily(f.valore).run()
                else c().unsetFontFamily().run()
                chiudi()
              }}
            >
              <span style={{ fontFamily: f.valore ?? undefined }}>{f.etichetta}</span>
            </Voce>
          ))}
        </Tendina>
        <Tendina titolo="Dimensione" trigger={<span className="te-tb-valore">{dimensioneScelta.etichetta}</span>}>
          {(chiudi) => DIMENSIONI.map((d) => (
            <Voce
              key={d.etichetta}
              scelta={d === dimensioneScelta}
              onClick={() => {
                if (d.valore) c().setFontSize(d.valore).run()
                else c().unsetFontSize().run()
                chiudi()
              }}
            >
              <span style={{ fontSize: d.valore ?? undefined }}>{d.etichetta}</span>
            </Voce>
          ))}
        </Tendina>
      </div>

      <div className="te-tb-gruppo">
        <Tasto titolo="Grassetto (⌘B)" attivo={editor.isActive('bold')} onClick={() => c().toggleBold().run()}><Bold /></Tasto>
        <Tasto titolo="Corsivo (⌘I)" attivo={editor.isActive('italic')} onClick={() => c().toggleItalic().run()}><Italic /></Tasto>
        <Tasto titolo="Sottolineato (⌘U)" attivo={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()}><UnderlineIcon /></Tasto>
        <Tasto titolo="Barrato" attivo={editor.isActive('strike')} onClick={() => c().toggleStrike().run()}><Strikethrough /></Tasto>
      </div>

      <div className="te-tb-gruppo">
        <Tendina
          titolo="Colore del testo"
          attivo={Boolean(stile.color)}
          trigger={<span className="te-tb-colore"><Baseline /><i style={{ background: stile.color ?? 'currentColor' }} /></span>}
        >
          {(chiudi) => (
            <Tavolozza
              colori={COLORI_TESTO}
              attuale={stile.color}
              nessuno="Colore automatico"
              onScegli={(colore) => {
                if (colore) c().setColor(colore).run()
                else c().unsetColor().run()
                chiudi()
              }}
            />
          )}
        </Tendina>
        <Tendina
          titolo="Evidenziatore"
          attivo={Boolean(stile.backgroundColor)}
          trigger={<span className="te-tb-colore"><Highlighter /><i style={{ background: stile.backgroundColor ?? 'transparent' }} /></span>}
        >
          {(chiudi) => (
            <Tavolozza
              colori={COLORI_EVIDENZIA}
              attuale={stile.backgroundColor}
              nessuno="Nessuna evidenziazione"
              onScegli={(colore) => {
                if (colore) c().setBackgroundColor(colore).run()
                else c().unsetBackgroundColor().run()
                chiudi()
              }}
            />
          )}
        </Tendina>
      </div>

      <div className="te-tb-gruppo">
        <Tendina titolo="Allineamento" attivo={allineamento.valore !== 'left'} trigger={<allineamento.Icona />}>
          {(chiudi) => (
            <div className="te-pop-riga">
              {ALLINEAMENTI.map((a) => (
                <Tasto
                  key={a.valore}
                  titolo={a.titolo}
                  attivo={a === allineamento}
                  onClick={() => {
                    c().setTextAlign(a.valore).run()
                    chiudi()
                  }}
                >
                  <a.Icona />
                </Tasto>
              ))}
            </div>
          )}
        </Tendina>
        <Tasto titolo="Elenco puntato" attivo={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()}><List /></Tasto>
        <Tasto titolo="Elenco numerato" attivo={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()}><ListOrdered /></Tasto>
        <Tasto titolo="Riduci rientro (⇧Tab)" disabled={!inElenco || !editor.can().liftListItem('listItem')} onClick={() => c().liftListItem('listItem').run()}><IndentDecrease /></Tasto>
        <Tasto titolo="Aumenta rientro (Tab)" disabled={!inElenco || !editor.can().sinkListItem('listItem')} onClick={() => c().sinkListItem('listItem').run()}><IndentIncrease /></Tasto>
      </div>

      <div className="te-tb-gruppo">
        <Tasto titolo="Citazione" attivo={editor.isActive('blockquote')} onClick={() => c().toggleBlockquote().run()}><Quote /></Tasto>
        <Tasto titolo="Linea di separazione" onClick={() => c().setHorizontalRule().run()}><Minus /></Tasto>
        <LinkPopover editor={editor} />
        <Tasto titolo="Togli la formattazione" onClick={() => c().unsetAllMarks().unsetTextAlign().clearNodes().run()}><RemoveFormatting /></Tasto>
      </div>
    </div>
  )
}

export function EmailEditorToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null
  return <Barra editor={editor} />
}
