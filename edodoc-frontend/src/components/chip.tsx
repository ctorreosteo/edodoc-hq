import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import type { SheetTone } from "@/components/ui/sheet-kit"

/** accent non esiste tra le chip lux: lì è il blu info. */
export function Chip({ tono, children }: { tono: SheetTone; children: ReactNode }) {
  return (
    <Badge data-m-chip="" data-tone={tono === "accent" ? "info" : tono} variant="secondary" className="text-xs w-fit">
      {children}
    </Badge>
  )
}
