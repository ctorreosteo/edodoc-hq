import { Ellipsis } from "lucide-react"
import type { MouseEvent } from "react"

/** Apre il menu contestuale della riga: lo stesso del tasto destro, ma raggiungibile con un tocco e da tastiera. */
export function AltreAzioni({ etichetta }: { etichetta: string }) {
  const apri = (e: MouseEvent<HTMLButtonElement>) => {
    const { left, bottom } = e.currentTarget.getBoundingClientRect()
    e.currentTarget.dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: left, clientY: bottom }))
  }
  return (
    <button type="button" className="db-altre" aria-label={etichetta} aria-haspopup="menu" onClick={apri}>
      <Ellipsis className="size-4" aria-hidden />
    </button>
  )
}
