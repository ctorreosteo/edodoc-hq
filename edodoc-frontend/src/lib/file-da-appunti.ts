import { format } from 'date-fns'

/**
 * File incollati (Cmd/Ctrl+V), di solito screenshot. Alcuni browser lasciano vuoto `clipboardData.files`
 * e mettono l'immagine solo negli `items`. Gli screenshot arrivano tutti come "image.png": prendono
 * un nome con data e ora, così negli allegati si distinguono.
 * Celle di Excel o testo da Word portano con sé anche un'immagine senza nome: con del testo negli appunti
 * si incolla il testo, non quell'immagine. Un file copiato dal Finder ha il suo nome e resta un file.
 */
export function fileDaAppunti(dati: DataTransfer | null | undefined): File[] {
  if (!dati) return []
  let file = Array.from(dati.files ?? [])
  if (file.length === 0) {
    file = Array.from(dati.items ?? [])
      .filter((i) => i.kind === 'file')
      .map((i) => i.getAsFile())
      .filter((f): f is File => f != null)
  }
  const senzaNome = (f: File) => f.type.startsWith('image/') && /^image\.\w+$/i.test(f.name || 'image.png')
  if (file.length > 0 && file.every(senzaNome) && dati.getData('text/plain').trim()) return []
  const ora = format(new Date(), 'yyyy-MM-dd HH.mm.ss')
  return file.map((f, i) => {
    if (!senzaNome(f)) return f
    const estensione = f.type.split('/')[1]?.replace('jpeg', 'jpg').replace(/\+.*$/, '') || 'png'
    return new File([f], `Screenshot ${ora}${file.length > 1 ? ` (${i + 1})` : ''}.${estensione}`, {
      type: f.type,
      lastModified: f.lastModified,
    })
  })
}
