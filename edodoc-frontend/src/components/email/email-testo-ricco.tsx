import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { EmailEditor } from './email-editor'
import { EmailEditorToolbar } from './email-editor-toolbar'

/*
  Corpo email formattato per i popup di invio: barra + foglio bianco, come lo vedrà chi riceve. Il testo pronto arriva
  come HTML e può cambiare da fuori (template, nome del paziente appena caricato): si riallinea senza emettere.
*/

interface EmailTestoRiccoProps {
  html: string
  /** `testo` è il contenuto senza formattazione, per i controlli di lunghezza e di campo vuoto. */
  onChange: (html: string, testo: string) => void
  placeholder?: string
  disabled?: boolean
  /** File incollati o trascinati sul testo. */
  onFile?: (file: File[]) => void
}

export function EmailTestoRicco({ html, onChange, placeholder, disabled, onFile }: EmailTestoRiccoProps) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const ultimo = useRef(html)

  useEffect(() => {
    if (!editor || html === ultimo.current) return
    ultimo.current = html
    editor.commands.setContent(html, { emitUpdate: false })
  }, [editor, html])

  useEffect(() => {
    editor?.setEditable(!disabled, false)
  }, [editor, disabled])

  return (
    <div className="te-campo" data-disabilitato={disabled ? '' : undefined}>
      <EmailEditorToolbar editor={editor} />
      <div className="te-carta">
        <EmailEditor
          html={html}
          immagini={false}
          placeholder={placeholder}
          onChange={(h, vuoto, testo) => {
            const valore = vuoto ? '' : h
            ultimo.current = valore
            onChange(valore, testo)
          }}
          onFile={onFile}
          onReady={setEditor}
        />
      </div>
    </div>
  )
}
