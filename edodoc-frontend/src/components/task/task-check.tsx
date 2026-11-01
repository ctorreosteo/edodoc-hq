import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/** Cerchio di completamento: riempimento a molla, spunta disegnata e un piccolo ripple. */
export function TaskCheck({ completato, onToggle, size = "md", className }: {
  completato: boolean
  onToggle: (el: HTMLButtonElement) => void
  size?: "sm" | "md"
  className?: string
}) {
  const ref = useRef<HTMLButtonElement>(null)
  // L'animazione parte solo quando lo stato cambia per un clic, non al primo render
  const [anima, setAnima] = useState(false)
  const precedente = useRef(completato)
  useEffect(() => {
    if (precedente.current === completato) return
    precedente.current = completato
    setAnima(true)
    const t = window.setTimeout(() => setAnima(false), 600)
    return () => window.clearTimeout(t)
  }, [completato])

  return (
    <button ref={ref} type="button" role="checkbox" aria-checked={completato} aria-label={completato ? "Riapri" : "Completa"}
      title={completato ? "Riapri" : "Completa"} data-size={size} data-on={completato ? "" : undefined}
      data-anima={anima ? "" : undefined} className={cn("tkb-check", className)}
      onClick={(e) => {
        e.stopPropagation()
        if (ref.current) onToggle(ref.current)
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") e.stopPropagation()
      }}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle className="tkb-check-ring" cx="12" cy="12" r="10" />
        <circle className="tkb-check-fill" cx="12" cy="12" r="10" />
        <path className="tkb-check-mark" d="M7.5 12.4l3 3 6-6.4" />
      </svg>
      <span className="tkb-check-ripple" aria-hidden />
    </button>
  )
}
