import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"

export function ModeToggle() {
  const { theme, setTheme } = useTheme()
  const scuro = theme === "dark"
  return (
    <Button variant="outline" size="icon" aria-label={scuro ? "Passa al tema chiaro" : "Passa al tema scuro"} onClick={() => setTheme(scuro ? "light" : "dark")}>
      {scuro ? <Sun /> : <Moon />}
    </Button>
  )
}
