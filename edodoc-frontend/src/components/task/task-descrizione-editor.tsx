import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { Markdown } from '@tiptap/markdown'
import { Placeholder } from '@tiptap/extensions'
import { Extension } from '@tiptap/core'
import { Bold, CornerDownLeft, Italic, Link2, List, ListChecks, ListOrdered } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fileDaAppunti } from '@/lib/file-da-appunti'
import { estensioniContenuto, rappresentabile } from '@/lib/task-descrizione-markdown'
import { TaskMarkdownEditor } from './task-markdown'
import '@/style/task-descrizione-editor.css'

/*
  Descrizione del task scritta già come si vede dopo il salvataggio: grassetto, elenchi, checklist e link,
  senza simboli di markdown. Si salva comunque in markdown (lib/task-descrizione-markdown.ts).
  Una descrizione che l'editor non saprebbe riscrivere intera (es. con una tabella) resta nel vecchio editor.
*/

interface Props {
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
  autoFocus?: boolean
  /** ⌘↵ */
  onSubmit?: () => void
  /** Il fuoco esce dall'editor (barra e campo del link compresi) */
  onBlur?: () => void
  onPasteFiles?: (files: File[]) => void
}

export function TaskDescrizioneEditor(props: Props) {
  // Si decide all'apertura: il testo di partenza deve poter uscire intero dall'editor
  const [visuale] = useState(() => rappresentabile(props.value))
  if (!visuale) {
    return (
      <TaskMarkdownEditor value={props.value} onChange={props.onChange} autoFocus={props.autoFocus}
        minRows={5} placeholder={props.placeholder} onSubmit={props.onSubmit} onBlur={props.onBlur} onPasteFiles={props.onPasteFiles} />
    )
  }
  return <EditorVisuale {...props} />
}

function EditorVisuale({ value, onChange, placeholder, autoFocus, onSubmit, onBlur, onPasteFiles }: Props) {
  const contenitore = useRef<HTMLDivElement>(null)
  const ultimo = useRef(value)
  // Le estensioni nascono una volta: le callback si leggono da qui
  const cb = useRef({ onChange, onSubmit, onPasteFiles })
  cb.current = { onChange, onSubmit, onPasteFiles }

  const [link, setLink] = useState<string | null>(null)

  const estensioni = useMemo(() => [
    ...estensioniContenuto(),
    Placeholder.configure({ placeholder: placeholder ?? 'Scrivi…' }),
    Markdown,
    Extension.create({
      name: 'tastiDescrizione',
      addKeyboardShortcuts: () => ({
        'Mod-Enter': () => {
          cb.current.onSubmit?.()
          return true
        },
      }),
    }),
  ], [placeholder])

  const editor = useEditor({
    extensions: estensioni,
    content: value,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: { class: 'tk-desc-prose', 'aria-label': 'Descrizione' },
      handlePaste: (_view, event) => {
        const files = event.clipboardData ? fileDaAppunti(event.clipboardData) : []
        if (!files.length || !cb.current.onPasteFiles) return false
        cb.current.onPasteFiles(files)
        return true
      },
    },
    onUpdate: ({ editor: e }) => {
      const md = e.getMarkdown()
      ultimo.current = md
      cb.current.onChange(md)
    },
  })

  // Il testo cambiato da fuori (non da qui) si ricarica
  useEffect(() => {
    if (editor && !editor.isDestroyed && value !== ultimo.current) {
      ultimo.current = value
      editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
    }
  }, [editor, value])

  return (
    <div ref={contenitore} className="tk-desc relative rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(0,37,82,0.05)] transition-[border-color,box-shadow] focus-within:border-[var(--brand-blue)]/50 focus-within:ring-4 focus-within:ring-[var(--brand-blue)]/10 dark:border-white/15 dark:bg-white/[0.04] dark:focus-within:border-[var(--brand-orange)]/60 dark:focus-within:ring-[var(--brand-orange)]/15"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onBlur?.()
      }}>
      <EditorContent editor={editor} />
      {editor ? <Barra editor={editor} link={link} setLink={setLink} /> : null}
    </div>
  )
}

type Strumento = { id: string; icon: typeof Bold; label: string; attivo: (e: Editor) => boolean; esegui: (e: Editor) => void }

const STRUMENTI: Strumento[] = [
  { id: 'bold', icon: Bold, label: 'Grassetto (⌘B)', attivo: (e) => e.isActive('bold'), esegui: (e) => e.chain().focus().toggleBold().run() },
  { id: 'italic', icon: Italic, label: 'Corsivo (⌘I)', attivo: (e) => e.isActive('italic'), esegui: (e) => e.chain().focus().toggleItalic().run() },
  { id: 'ul', icon: List, label: 'Elenco puntato', attivo: (e) => e.isActive('bulletList'), esegui: (e) => e.chain().focus().toggleBulletList().run() },
  { id: 'ol', icon: ListOrdered, label: 'Elenco numerato', attivo: (e) => e.isActive('orderedList'), esegui: (e) => e.chain().focus().toggleOrderedList().run() },
  { id: 'check', icon: ListChecks, label: 'Checklist', attivo: (e) => e.isActive('taskList'), esegui: (e) => e.chain().focus().toggleTaskList().run() },
]

function Barra({ editor, link, setLink }: { editor: Editor; link: string | null; setLink: (v: string | null) => void }) {
  // Ridisegna la barra quando cambiano selezione o formattazione (stato attivo dei pulsanti)
  const [, ridisegna] = useState(0)
  useEffect(() => {
    const f = () => ridisegna((n) => n + 1)
    editor.on('transaction', f)
    return () => {
      editor.off('transaction', f)
    }
  }, [editor])

  const applicaLink = () => {
    const href = (link ?? '').trim()
    setLink(null)
    if (!href) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    const url = /^[a-z]+:/i.test(href) ? href : `https://${href}`
    if (editor.state.selection.empty && !editor.isActive('link')) {
      editor.chain().focus().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).insertContent(' ').run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }

  const pulsante = 'inline-flex size-7 items-center justify-center rounded-md! border-0! bg-transparent p-0 text-slate-500 transition hover:bg-slate-100 hover:text-foreground dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white'
  const acceso = 'bg-slate-100 text-foreground dark:bg-white/10 dark:text-white'
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-t border-slate-100 px-1.5 py-1 dark:border-white/10">
      {link == null ? (
        <>
          {STRUMENTI.map(({ id, icon: Icon, label, attivo, esegui }) => (
            <button key={id} type="button" title={label} aria-label={label} aria-pressed={attivo(editor)}
              onMouseDown={(e) => e.preventDefault()} onClick={() => esegui(editor)} className={cn(pulsante, attivo(editor) && acceso)}>
              <Icon className="size-4" />
            </button>
          ))}
          <button type="button" title="Link" aria-label="Link" aria-pressed={editor.isActive('link')}
            onMouseDown={(e) => e.preventDefault()} onClick={() => setLink(String(editor.getAttributes('link').href ?? ''))}
            className={cn(pulsante, editor.isActive('link') && acceso)}>
            <Link2 className="size-4" />
          </button>
          <span className="ml-auto hidden items-center gap-1 pr-1.5 text-[11px] text-muted-foreground sm:inline-flex">
            <CornerDownLeft className="size-3" /> ⌘↵ per chiudere
          </span>
        </>
      ) : (
        <form className="flex w-full items-center gap-1.5 px-1" onSubmit={(e) => {
          e.preventDefault()
          applicaLink()
        }}>
          <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input autoFocus value={link} onChange={(e) => setLink(e.target.value)} placeholder="Incolla il link e premi Invio"
            aria-label="Indirizzo del link" className="h-7 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                setLink(null)
                editor.commands.focus()
              }
            }} />
          <button type="submit" className="rounded-md! border-0! bg-transparent px-2 text-[12px]! font-semibold text-[var(--brand-blue)] dark:text-[var(--brand-orange)]">
            Applica
          </button>
        </form>
      )}
    </div>
  )
}
