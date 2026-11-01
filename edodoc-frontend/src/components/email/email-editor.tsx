import { useEffect, useRef } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import { BackgroundColor, Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import { Placeholder } from '@tiptap/extensions'

/*
  Editor del corpo email (tiptap): formattazione completa da email, link, immagini incollate (restano data URI:
  il backend le trasforma in parti inline). I file trascinati che non sono immagini diventano allegati.
  I popup di invio passano immagini={false}: non hanno parti inline, ogni file trascinato va a onFile.
*/

const MAX_IMMAGINE_INLINE = 3 * 1024 * 1024

function leggiComeDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

interface EmailEditorProps {
  html: string
  placeholder?: string
  autoFocus?: boolean
  onChange: (html: string, vuoto: boolean, testo: string) => void
  onFile?: (file: File[]) => void
  /** Immagini dentro il testo: sì nella pagina Email, no nei popup. */
  immagini?: boolean
  onReady?: (editor: Editor) => void
  /** Cmd/Ctrl+Invio */
  onInvia?: () => void
}

export function EmailEditor({ html, placeholder = 'Scrivi qui…', autoFocus, onChange, onFile, immagini: conImmagini = true, onReady, onInvia }: EmailEditorProps) {
  const callbacks = useRef({ onChange, onFile, onInvia })
  callbacks.current = { onChange, onFile, onInvia }
  const editorRef = useRef<Editor | null>(null)

  const inserisciImmagini = async (editor: Editor, file: File[], pos?: number) => {
    const immagini = conImmagini ? file.filter((f) => f.type.startsWith('image/') && f.size <= MAX_IMMAGINE_INLINE) : []
    const altri = file.filter((f) => !immagini.includes(f))
    for (const img of immagini) {
      const src = await leggiComeDataUrl(img)
      const chain = editor.chain().focus()
      if (pos != null) chain.insertContentAt(pos, { type: 'image', attrs: { src, alt: img.name } }).run()
      else chain.setImage({ src, alt: img.name }).run()
    }
    if (altri.length) callbacks.current.onFile?.(altri)
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } },
      }),
      ...(conImmagini ? [Image.configure({ allowBase64: true, inline: false })] : []),
      TextStyle,
      Color,
      BackgroundColor,
      FontFamily,
      FontSize,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
    ],
    content: html || '',
    autofocus: autoFocus ? 'start' : false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { class: 'em-editor-prose te-prose', 'aria-label': 'Testo dell\'email' },
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.files ?? [])
        if (file.length === 0 || !editorRef.current) return false
        event.preventDefault()
        void inserisciImmagini(editorRef.current, file)
        return true
      },
      handleDrop: (view, event) => {
        const file = Array.from((event as DragEvent).dataTransfer?.files ?? [])
        if (file.length === 0 || !editorRef.current) return false
        event.preventDefault()
        const coords = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })
        void inserisciImmagini(editorRef.current, file, coords?.pos)
        return true
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          callbacks.current.onInvia?.()
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: e }) => callbacks.current.onChange(e.getHTML(), e.isEmpty, e.getText()),
  })
  editorRef.current = editor

  useEffect(() => {
    if (editor) onReady?.(editor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  return <EditorContent editor={editor} className="em-editor" />
}
