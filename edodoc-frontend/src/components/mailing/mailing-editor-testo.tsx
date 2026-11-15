import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Loader2, RemoveFormatting, Sparkles, Underline as UnderlineIcon, Unlink } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/lib/toast'
import { mailingService, messaggioErroreMailing, type MailingTono } from '@/services/mailing-service'
import { MenuSegnaposto } from './mailing-editor-controlli'
import { PORTALE, TONI } from './mailing-editor-dati'

/*
  Testo ricco dei blocchi "testo" e "piè di pagina": solo ciò che il renderer accetta (p, br, strong, em, u, a,
  elenchi, h2/h3). Il valore esterno può cambiare (annulla/ripeti): in quel caso si riallinea senza emettere.
*/


function Tasto({ attivo, onClick, titolo, children, disabled }: { attivo?: boolean; onClick: () => void; titolo: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="ml-ed-tb-btn"
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

function LinkPopover({ editor }: { editor: Editor }) {
  const [aperto, setAperto] = useState(false)
  const [url, setUrl] = useState('')
  const applica = () => {
    const u = url.trim()
    if (!u) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: /^(https?:|mailto:|tel:|\{\{)/i.test(u) ? u : `https://${u}` }).run()
    setAperto(false)
  }
  return (
    <Popover
      open={aperto}
      onOpenChange={(o) => {
        setAperto(o)
        if (o) setUrl(editor.getAttributes('link').href ?? '')
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className="ml-ed-tb-btn" data-attivo={editor.isActive('link') ? '' : undefined} title="Link" aria-label="Link" onMouseDown={(e) => e.preventDefault()}>
          <Link2 />
        </button>
      </PopoverTrigger>
      <PopoverContent className="ml-ed-pop w-80" align="start" {...PORTALE}>
        <form
          className="ml-ed-link-form"
          onSubmit={(e) => {
            e.preventDefault()
            applica()
          }}
        >
          <input autoFocus className="ml-input ml-ed-input" placeholder="https://www.edodoc.it/…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Indirizzo del link" />
          <button type="submit" className="ml-btn ml-btn--pieno ml-btn--sm">
            Applica
          </button>
        </form>
        {editor.isActive('link') ? (
          <button
            type="button"
            className="ml-btn ml-btn--ghost ml-btn--sm ml-ed-link-togli"
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run()
              setAperto(false)
            }}
          >
            <Unlink /> Togli il link
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/** Testo grezzo → paragrafi HTML (per le risposte dell'AI in testo semplice). */
function aParagrafi(testo: string): string {
  if (/<(p|ul|ol|h2|h3|br)\b/i.test(testo)) return testo
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return testo
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export function EditorTesto({
  html,
  onChange,
  aiDisponibile,
  ridotto,
  placeholder = 'Scrivi qui…',
  autoFocus,
}: {
  html: string
  onChange: (html: string) => void
  aiDisponibile?: boolean
  /** Piè di pagina: niente titoli né elenchi. */
  ridotto?: boolean
  placeholder?: string
  autoFocus?: boolean
}) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const ultimo = useRef(html)
  const [riscrivendo, setRiscrivendo] = useState<MailingTono | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: ridotto ? false : { levels: [2, 3] },
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        bulletList: ridotto ? false : undefined,
        orderedList: ridotto ? false : undefined,
        listItem: ridotto ? false : undefined,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { rel: null, target: null } },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: html || '',
    autofocus: autoFocus ? 'end' : false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { class: 'ml-ed-prose', 'aria-label': 'Testo', role: 'textbox', 'aria-multiline': 'true' },
      handlePaste: (_view, event) => (event.clipboardData?.files?.length ?? 0) > 0,
      handleDrop: (_view, event) => ((event as DragEvent).dataTransfer?.files?.length ?? 0) > 0,
    },
    onUpdate: ({ editor: e }) => {
      const valore = e.isEmpty ? '' : e.getHTML()
      ultimo.current = valore
      onChangeRef.current(valore)
    },
  })

  // Valore cambiato da fuori (annulla, AI): riallinea senza rimbalzare
  useEffect(() => {
    if (!editor || html === ultimo.current) return
    ultimo.current = html
    editor.commands.setContent(html || '', { emitUpdate: false })
  }, [editor, html])

  const riscrivi = async (tono: MailingTono) => {
    if (!editor) return
    const sorgente = editor.getHTML()
    if (!editor.getText().trim()) {
      toast.info('Scrivi prima qualche riga: l\'AI la riscrive nel tono che scegli')
      return
    }
    setRiscrivendo(tono)
    try {
      const r = await mailingService.aiRiscrivi(sorgente, tono)
      const nuovo = aParagrafi(r.testo ?? '')
      if (!nuovo.trim()) throw new Error('Risposta vuota')
      editor.chain().focus().setContent(nuovo).run()
      toast.success('Testo riscritto', { description: 'Non ti convince? Annulla con ⌘Z.' })
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Riscrittura non riuscita'))
    } finally {
      setRiscrivendo(null)
    }
  }

  if (!editor) return <div className="ml-ed-testo ml-skeleton" style={{ height: 160 }} />
  const c = () => editor.chain().focus()
  return (
    <div className="ml-ed-testo" data-occupato={riscrivendo ? '' : undefined}>
      <div className="ml-ed-toolbar" role="toolbar" aria-label="Formattazione">
        <Tasto titolo="Grassetto (⌘B)" attivo={editor.isActive('bold')} onClick={() => c().toggleBold().run()}>
          <Bold />
        </Tasto>
        <Tasto titolo="Corsivo (⌘I)" attivo={editor.isActive('italic')} onClick={() => c().toggleItalic().run()}>
          <Italic />
        </Tasto>
        <Tasto titolo="Sottolineato (⌘U)" attivo={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()}>
          <UnderlineIcon />
        </Tasto>
        <LinkPopover editor={editor} />
        {!ridotto ? (
          <>
            <span className="ml-ed-tb-sep" aria-hidden />
            <Tasto titolo="Titoletto" attivo={editor.isActive('heading', { level: 2 })} onClick={() => c().toggleHeading({ level: 2 }).run()}>
              <Heading2 />
            </Tasto>
            <Tasto titolo="Titoletto piccolo" attivo={editor.isActive('heading', { level: 3 })} onClick={() => c().toggleHeading({ level: 3 }).run()}>
              <Heading3 />
            </Tasto>
            <Tasto titolo="Elenco puntato" attivo={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()}>
              <List />
            </Tasto>
            <Tasto titolo="Elenco numerato" attivo={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()}>
              <ListOrdered />
            </Tasto>
          </>
        ) : null}
        <Tasto titolo="Togli formattazione" onClick={() => c().unsetAllMarks().clearNodes().run()}>
          <RemoveFormatting />
        </Tasto>
        <span className="ml-ed-tb-sep" aria-hidden />
        <MenuSegnaposto compatto onScegli={(s) => c().insertContent(s).run()} />
        {aiDisponibile && !ridotto ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="ml-ed-tb-btn ml-ed-tb-ai" title="Riscrivi con AI" aria-label="Riscrivi con AI" disabled={!!riscrivendo} onMouseDown={(e) => e.preventDefault()}>
                {riscrivendo ? <Loader2 className="ml-ed-gira" /> : <Sparkles />}
                <span>Riscrivi</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="ml-ed-menu" align="end" {...PORTALE}>
              <DropdownMenuLabel className="ml-ed-menu-gruppo">Riscrivi il testo</DropdownMenuLabel>
              {TONI.map((t) => (
                <DropdownMenuItem key={t.valore} className="ml-ed-menu-voce" onSelect={() => void riscrivi(t.valore)}>
                  <span className="ml-ed-menu-voce-nome">{t.etichetta}</span>
                  <span className="ml-ed-menu-voce-es">{t.descrizione}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <EditorContent editor={editor} className="ml-ed-testo-area" />
      {riscrivendo ? (
        <div className="ml-ed-testo-velo" aria-live="polite">
          <Sparkles /> Sto riscrivendo…
        </div>
      ) : null}
    </div>
  )
}
