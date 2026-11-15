import type { AnyExtension } from '@tiptap/core'
import { MarkdownManager } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { TaskItem, TaskList } from '@tiptap/extension-list'

/*
  Descrizione dei task scritta già formattata (come si vede dopo il salvataggio) ma salvata in markdown.
  Qui le estensioni che decidono come il markdown entra ed esce dall'editor (@tiptap/markdown):
  un link scritto nudo (https://…) resta nudo, non diventa `[url](url)`.
  `rappresentabile` dice se una descrizione esistente esce dall'editor con tutto il suo testo (le tabelle, per
  esempio, no): se non è così si modifica col vecchio editor di markdown, per non perdere niente.
*/

/** Link: se il testo è l'indirizzo stesso resta un link nudo. */
export const LinkNudo = Link.extend({
  renderMarkdown: (node, h, ctx) => {
    const href = node.attrs?.href ?? ''
    const title = node.attrs?.title ?? ''
    const testo = h.renderChildren(node)
    if (!title && (ctx?.meta as { markText?: string } | undefined)?.markText === href) return testo
    return title ? `[${testo}](${href} "${title}")` : `[${testo}](${href})`
  },
})

/** Estensioni di contenuto (senza comportamento d'interfaccia): le stesse per l'editor e per il controllo. */
export function estensioniContenuto(): AnyExtension[] {
  return [
    StarterKit.configure({ link: false, heading: { levels: [1, 2, 3] } }),
    LinkNudo.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' }),
    TaskList,
    TaskItem.configure({ nested: true }),
  ]
}

let manager: MarkdownManager | null = null
const conv = () => (manager ??= new MarkdownManager({ extensions: estensioniContenuto() }))

/** Lettere e cifre in ordine: se coincidono, il giro nell'editor non ha perso testo (cambia solo la sintassi). */
const firma = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '')

/** True se la descrizione si può modificare nell'editor visuale senza perdere testo. */
export function rappresentabile(markdown: string | null | undefined): boolean {
  const md = markdown ?? ''
  if (!md.trim()) return true
  try {
    return firma(conv().serialize(conv().parse(md))) === firma(md)
  } catch {
    return false
  }
}
