import { SquareCheckBig } from "lucide-react"
import { ContextMenuItem } from "@/components/ui/context-menu"

interface TaskContextMenuItemProps {
  onSelect: () => void
}

/** Voce "Crea task" nei menu contestuali. */
export function TaskContextMenuItem({ onSelect }: TaskContextMenuItemProps) {
  return (
    <ContextMenuItem onClick={onSelect}>
      <SquareCheckBig className="mr-2 h-4 w-4" />
      <span>Crea task</span>
    </ContextMenuItem>
  )
}
