import { Check, CircleCheck, Mail } from "lucide-react"
import { LuxAvatar } from "@/components/lux"
import { MenuPagamento } from "@/components/menu-contestuali"
import { Azione, partiNome } from "@/components/pagamenti/comuni"
import { Riquadro } from "@/components/pagina"
import { useAzioni } from "@/contexts/azioni-context"
import { data, euro } from "@/lib/format"
import { ritardo, type Moroso } from "@/lib/incassi"
import type { Pagamento } from "@/types"

function RigaRata({ pagamento }: { pagamento: Pagamento }) {
  const azioni = useAzioni()
  return (
    <MenuPagamento pagamento={pagamento}>
      <li className="pg-moroso-rata">
        <span><strong>{pagamento.descrizione}</strong><small>Scaduta il {data(pagamento.scadenza)}</small></span>
        <strong className="pg-importo">{euro(pagamento.importo)}</strong>
        <Azione icona={Check} etichetta={`Registra ${pagamento.descrizione}`} onClick={() => azioni.registraPagamento(pagamento)}>Registra</Azione>
      </li>
    </MenuPagamento>
  )
}

function SchedaMoroso({ moroso }: { moroso: Moroso }) {
  const azioni = useAzioni()
  const { primo, secondo } = partiNome(moroso.nome)
  const unica = moroso.righe.length === 1 ? moroso.righe[0] : null
  const scheda = (
    <li className="pg-moroso">
      <div className="pg-moroso-testa">
        <LuxAvatar first={primo} second={secondo} />
        <button type="button" className="pg-moroso-chi" onClick={() => azioni.apriPaziente(moroso.pazienteId)}>
          <strong>{moroso.nome}</strong>
          <small>{ritardo(moroso.giorni)}{unica ? ` · ${unica.descrizione}` : ` · ${moroso.righe.length} pagamenti`}</small>
        </button>
        <strong className="pg-moroso-totale">{euro(moroso.totale)}</strong>
        <div className="pg-moroso-azioni">
          {/* Dal paziente il backend propone tutti i suoi scaduti, dal pagamento solo quello */}
          <Azione icona={Mail} forte etichetta={`Sollecita ${moroso.nome}`}
            onClick={() => azioni.inviaEmail({ tipo: "SOLLECITO_PAGAMENTO", pazienteId: moroso.pazienteId, pagamentoId: unica?.id })}>Sollecita</Azione>
          {unica ? <Azione icona={Check} etichetta={`Registra il pagamento di ${moroso.nome}`} onClick={() => azioni.registraPagamento(unica)}>Registra</Azione> : null}
        </div>
      </div>
      {unica ? null : <ul className="pg-moroso-rate">{moroso.righe.map((r) => <RigaRata key={r.id} pagamento={r} />)}</ul>}
    </li>
  )
  return unica ? <MenuPagamento pagamento={unica}>{scheda}</MenuPagamento> : scheda
}

export function DaSollecitare({ morosi }: { morosi: Moroso[] }) {
  return (
    <Riquadro titolo="Da sollecitare" conteggio={morosi.length} descrizione="Il sollecito apre l'email da rivedere prima dell'invio">
      {morosi.length === 0 ? (
        <p className="pg-tutto-bene"><CircleCheck className="size-5" aria-hidden />Nessun pagamento in ritardo. Non c'è nessuno da sollecitare.</p>
      ) : (
        <ul className="pg-morosi">{morosi.map((m) => <SchedaMoroso key={m.pazienteId} moroso={m} />)}</ul>
      )}
    </Riquadro>
  )
}
