import { Andamenti } from "@/components/dashboard/andamenti"
import { DaSbrigare } from "@/components/dashboard/da-sbrigare"
import { FiscoSoglia, Rinnovi } from "@/components/dashboard/in-arrivo"
import { OggiHero } from "@/components/dashboard/oggi-hero"
import { Pagina } from "@/components/pagina"
import { Caricamento, Errore } from "@/components/stati"
import { useAuth } from "@/contexts/auth-context"
import { useDati } from "@/hooks/use-dati"
import { useAdesso } from "@/lib/dashboard"
import { formatDateOnlyLocal } from "@/lib/utils"
import { dashboardService } from "@/services/gestionale"
import "@/style/dashboard.css"

export default function Dashboard() {
  const { utente } = useAuth()
  const adesso = useAdesso()
  const giorno = formatDateOnlyLocal(adesso)
  const { dati: d, errore, riprova } = useDati(dashboardService.carica, [giorno])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!d) return <Caricamento />

  return (
    <Pagina>
      <div className="db-pagina">
        <OggiHero d={d} nome={utente?.nome ?? ""} adesso={adesso} />
        <div className="db-corpo">
          <DaSbrigare d={d} adesso={adesso} />
          <div className="db-colonna">
            <FiscoSoglia d={d} />
            <Rinnovi rinnovi={d.rinnovi} />
          </div>
        </div>
        <Andamenti d={d} meseCorrente={adesso.getMonth() + 1} />
      </div>
    </Pagina>
  )
}
