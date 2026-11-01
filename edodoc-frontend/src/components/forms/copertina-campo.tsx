import { ImagePlus, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Label } from "@/components/ui/label"
import { urlCopertina } from "@/services/gestionale"

const MASSIMO_BYTES = 5 * 1024 * 1024
const TIPI = "image/jpeg,image/png,image/webp"

/** file: nuova immagine da caricare. rimossa: togliere quella attuale. */
export type SceltaCopertina = { file: File | null; rimossa: boolean }
export const NESSUNA_SCELTA: SceltaCopertina = { file: null, rimossa: false }

export function CopertinaCampo({ attuale, scelta, onChange }: {
  attuale: string | null
  scelta: SceltaCopertina
  onChange: (scelta: SceltaCopertina) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [anteprima, setAnteprima] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    if (!scelta.file) {
      setAnteprima(null)
      return
    }
    const url = URL.createObjectURL(scelta.file)
    setAnteprima(url)
    return () => URL.revokeObjectURL(url)
  }, [scelta.file])

  const scegli = (file?: File) => {
    if (!file) return
    if (file.size > MASSIMO_BYTES) {
      setErrore("L'immagine supera i 5 MB")
      return
    }
    setErrore(null)
    onChange({ file, rimossa: false })
  }

  const mostrata = anteprima ?? (scelta.rimossa || !attuale ? null : urlCopertina(attuale))

  return (
    <div className="grid gap-1.5">
      <Label>Copertina (facoltativa)</Label>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => input.current?.click()} aria-label="Scegli la copertina"
          className="relative flex aspect-video w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed text-muted-foreground hover:bg-muted">
          {mostrata ? <img src={mostrata} alt="" className="size-full object-cover" /> : <ImagePlus className="size-5" aria-hidden />}
        </button>
        <div className="min-w-0 text-xs text-muted-foreground">
          <p>JPG, PNG o WebP, massimo 5 MB. Meglio orizzontale (16:9).</p>
          {errore ? <p className="text-destructive">{errore}</p> : null}
          {mostrata ? (
            <button type="button" className="mt-1 inline-flex items-center gap-1 underline" onClick={() => onChange({ file: null, rimossa: true })}>
              <X className="size-3" aria-hidden />Togli
            </button>
          ) : null}
        </div>
      </div>
      <input ref={input} type="file" accept={TIPI} hidden onChange={(e) => {
        scegli(e.target.files?.[0])
        e.target.value = ""
      }} />
    </div>
  )
}
