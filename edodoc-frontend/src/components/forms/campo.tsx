import type { ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function Campo({ etichetta, id, children, className }: { etichetta: string; id?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`grid gap-1.5 min-w-0 ${className ?? ""}`}>
      <Label htmlFor={id}>{etichetta}</Label>
      {children}
    </div>
  )
}

export function Griglia({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
}

export function Scelta({ valore, onChange, opzioni, segnaposto, id }: {
  valore: string | null | undefined
  onChange: (valore: string) => void
  opzioni: Record<string, string>
  segnaposto?: string
  id?: string
}) {
  return (
    <Select value={valore ?? ""} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full"><SelectValue placeholder={segnaposto ?? "Scegli"} /></SelectTrigger>
      <SelectContent>
        {Object.entries(opzioni).map(([chiave, testo]) => (
          <SelectItem key={chiave} value={chiave}>{testo}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
