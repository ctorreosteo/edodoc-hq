import { format, parseISO } from "date-fns"
import { it } from "date-fns/locale"
import { useMemo } from "react"
import { MenuPagamento } from "@/components/menu-contestuali"
import { FiltroAttivo } from "@/components/pagamenti/comuni"
import { Riquadro } from "@/components/pagina"
import { Vuoto } from "@/components/stati"
import { useAzioni } from "@/contexts/azioni-context"
import { giorniDa } from "@/lib/finance"
import { euro } from "@/lib/format"
import { aperto, DOPO, type ColonnaCalendario } from "@/lib/incassi"
import type { Pagamento } from "@/types"

function quando(giorni: number) {
  if (giorni === 0) return "Oggi"
  if (giorni === 1) return "Domani"
  return `Tra ${giorni} giorni`
}

function RigaInArrivo({ pagamento }: { pagamento: Pagamento }) {
  const azioni = useAzioni()
  const giorni = giorniDa(pagamento.scadenza)
  const giorno = parseISO(pagamento.scadenza)
  return (
    <MenuPagamento pagamento={pagamento}>
      <li>
        <button type="button" className="pg-arrivo" data-oggi={giorni === 0 ? "" : undefined} onClick={() => azioni.registraPagamento(pagamento)}
          aria-label={`Registra ${pagamento.pazienteNome}, ${pagamento.descrizione}, ${euro(pagamento.importo)}`}>
          <span className="pg-giorno"><strong>{format(giorno, "d")}</strong><span>{format(giorno, "MMM", { locale: it })}</span></span>
          <span className="pg-arrivo-testo"><strong>{pagamento.pazienteNome}</strong><small>{quando(giorni)} · {pagamento.descrizione}</small></span>
          <strong className="pg-importo">{euro(pagamento.importo)}</strong>
          <span className="pg-arrivo-azione" aria-hidden>Registra</span>
        </button>
      </li>
    </MenuPagamento>
  )
}

export function InArrivo({ righe, colonne, scelto, onScelto }: {
  righe: Pagamento[]
  colonne: ColonnaCalendario[]
  scelto: string | null
  onScelto: (chiave: string | null) => void
}) {
  const ultimo = colonne.filter((c) => c.chiave !== DOPO).at(-1)?.chiave ?? ""
  const voci = useMemo(() => {
    const attesi = righe.filter((p) => aperto(p) && !p.scaduto).sort((a, b) => a.scadenza.localeCompare(b.scadenza))
    if (!scelto) return attesi
    return attesi.filter((p) => (scelto === DOPO ? p.scadenza.slice(0, 7) > ultimo : p.scadenza.startsWith(scelto)))
  }, [righe, scelto, ultimo])
  const colonna = colonne.find((c) => c.chiave === scelto)

  return (
    <Riquadro titolo="In arrivo" conteggio={voci.length} descrizione="Clic per registrare l'incasso, tasto destro per le altre azioni"
      azioni={colonna ? <FiltroAttivo testo={colonna.titolo} etichetta={`Togli il filtro ${colonna.titolo}`} onTogli={() => onScelto(null)} /> : undefined}>
      {voci.length === 0 ? (
        <Vuoto titolo={scelto ? "Niente in scadenza in questo periodo" : "Nessun pagamento in arrivo"} descrizione={scelto ? undefined : "Le rate dei nuovi acquisti compariranno qui."} />
      ) : (
        <ul className="pg-arrivi">{voci.map((p) => <RigaInArrivo key={p.id} pagamento={p} />)}</ul>
      )}
    </Riquadro>
  )
}
