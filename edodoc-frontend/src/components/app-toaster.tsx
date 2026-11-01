import { X } from "lucide-react"
import { Toaster, toast, useSonner } from "sonner"

/** Da quante notifiche a schermo compare "Chiudi tutte". */
const SOGLIA = 2

/**
 * Toaster dell'app con il pulsante "Chiudi tutte": quando le notifiche si accumulano (molte restano
 * aperte finché non le si chiude) le toglie in un colpo. Il pulsante sta sotto la barra in alto
 * (non copre le sue azioni) e la pila scende per fargli posto.
 */
export function AppToaster() {
  const { toasts } = useSonner()
  const aperte = toasts.filter((t) => !t.delete).length
  const conPulsante = aperte >= SOGLIA

  return (
    <>
      <Toaster
        theme="system"
        position="top-right"
        expand={false}
        closeButton
        duration={4000}
        offset={conPulsante ? { top: 124, right: 24 } : { top: 24, right: 24 }}
        mobileOffset={conPulsante ? { top: 116, right: 16, left: 16 } : { top: 16, right: 16, left: 16 }}
      />
      {conPulsante ? (
        <button type="button" className="toast-chiudi-tutte" onClick={() => toast.dismiss()}>
          <X aria-hidden />
          Chiudi tutte
          <b>{aperte}</b>
        </button>
      ) : null}
    </>
  )
}
