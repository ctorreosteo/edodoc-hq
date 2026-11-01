import { lazy, Suspense } from "react"
import "@/style/corsi.css"

const Markdown = lazy(() => import("react-markdown"))

/** Stesso testo che il paziente leggerà nell'app. L'HTML scritto a mano non viene interpretato. */
export function TestoMarkdown({ testo }: { testo: string }) {
  return (
    <div className="corso-testo">
      <Suspense fallback={null}><Markdown>{testo}</Markdown></Suspense>
    </div>
  )
}
