import { AlertTriangle, Check, Clock, Receipt } from "lucide-react"
import { MenuPagamento } from "@/components/menu-contestuali"
import { useAzioni } from "@/contexts/azioni-context"
import { METODO_PAGAMENTO } from "@/lib/etichette"
import { data, euro } from "@/lib/format"
import type { Pagamento } from "@/types"

function Stato({ pagamento }: { pagamento: Pagamento }) {
  if (pagamento.stato === "PAGATO") return <span className="pg-stato" data-tono="ok"><Check className="size-3" aria-hidden />Pagato</span>
  if (pagamento.scaduto) return <span className="pg-stato" data-tono="danger"><AlertTriangle className="size-3" aria-hidden />Scaduto</span>
  return <span className="pg-stato" data-tono="warn"><Clock className="size-3" aria-hidden />Da pagare</span>
}

/** Clic: registra se è da pagare, altrimenti apre il paziente. Tasto destro: tutte le azioni del pagamento. */
export function RigaPagamento({ pagamento, conPaziente }: { pagamento: Pagamento; conPaziente?: boolean }) {
  const azioni = useAzioni()
  const pagato = pagamento.stato === "PAGATO"
  return (
    <MenuPagamento pagamento={pagamento}>
      <li>
        <button type="button" className="aq-rata" onClick={() => (pagato ? azioni.apriPaziente(pagamento.pazienteId) : azioni.registraPagamento(pagamento))}>
          <span className="aq-rata-testo">
            <strong>{conPaziente ? `${pagamento.pazienteNome} · ${pagamento.descrizione}` : pagamento.descrizione}</strong>
            <small>{pagato ? `Pagato il ${data(pagamento.dataPagamento)}${pagamento.metodo ? ` · ${METODO_PAGAMENTO[pagamento.metodo]}` : ""}` : `Entro il ${data(pagamento.scadenza)}`}</small>
          </span>
          {pagato ? (
            <span className="pg-stato" data-tono={pagamento.fatturato ? "muted" : "warn"}>
              <Receipt className="size-3" aria-hidden />{pagamento.fatturato ? "Fattura emessa" : "Da fatturare"}
            </span>
          ) : null}
          <span className="aq-rata-importo"><strong>{euro(pagamento.importo)}</strong><Stato pagamento={pagamento} /></span>
        </button>
      </li>
    </MenuPagamento>
  )
}
