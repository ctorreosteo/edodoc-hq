import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function Pagina({ children }: { children: ReactNode }) {
  return <div data-vl="" className="w-full flex flex-col gap-4 sm:gap-5 min-w-0 max-w-full">{children}</div>
}

export function Cta({ icona: Icona, children, onClick }: { icona: LucideIcon; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="vl-cta" onClick={onClick}>
      <span className="vl-cta-icon" aria-hidden><Icona className="size-4" /></span>
      <span className="vl-cta-label">{children}</span>
    </button>
  )
}

export function Riquadro({ titolo, descrizione, conteggio, azioni, children, className }: {
  titolo: string
  descrizione?: string
  conteggio?: number
  azioni?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={`vl-card min-w-0 ${className ?? ""}`}>
      <CardHeader>
        <div className="vl-card-heading flex items-center gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2">
              {titolo}
              {conteggio != null ? <span className="vl-card-count">{conteggio}</span> : null}
            </CardTitle>
            {descrizione ? <CardDescription>{descrizione}</CardDescription> : null}
          </div>
          {azioni}
        </div>
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  )
}

export function Tabella({ children }: { children: ReactNode }) {
  return (
    <div className="vl-table-wrap w-full overflow-x-auto">
      <table data-vl-table="" className="w-full caption-bottom text-sm">{children}</table>
    </div>
  )
}
