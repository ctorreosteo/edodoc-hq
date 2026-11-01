import { Plus } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { CartaCorso, CartaNuovo, CorsiVuoto } from "@/components/corsi/catalogo"
import { CorsoDialog } from "@/components/forms/corso-dialog"
import { LuxHero } from "@/components/lux"
import { Cta, Pagina, Riquadro } from "@/components/pagina"
import { Caricamento, Errore } from "@/components/stati"
import { useDati } from "@/hooks/use-dati"
import { fraseCatalogo, schedaCorso, type GruppoCorso } from "@/lib/corsi"
import { durata } from "@/lib/format"
import { corsiService } from "@/services/gestionale"
import "@/style/corsi-hq.css"

const TAPPE: { valore: GruppoCorso; testo: string; nota: string }[] = [
  { valore: "preparare", testo: "Da preparare", nota: "Manca ancora qualcosa" },
  { valore: "pronti", testo: "Pronti", nota: "Basta pubblicarli" },
  { valore: "online", testo: "Nell'app", nota: "I pazienti li vedono" },
]

export default function Corsi() {
  const navigate = useNavigate()
  const [nuovo, setNuovo] = useState(false)
  const [gruppo, setGruppo] = useState<GruppoCorso | null>(null)
  // "Cosa manca" sta nelle lezioni, che il catalogo non porta: un corso illeggibile resta con i soli conteggi
  const { dati, errore, riprova } = useDati(async () => {
    const corsi = await corsiService.catalogo()
    const strutture = await Promise.all(corsi.map((c) => corsiService.struttura(c.id).catch(() => null)))
    return corsi.map((c, i) => schedaCorso(c, strutture[i]))
  }, [])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const inApp = dati.filter((s) => s.gruppo === "online")
  const lezioniInApp = inApp.reduce((s, c) => s + c.pubblicate, 0)
  const secondiInApp = inApp.reduce((s, c) => s + c.secondiVisibili, 0)
  const mostrati = gruppo ? dati.filter((s) => s.gruppo === gruppo) : dati

  return (
    <Pagina>
      <div className="cs-pagina">
        <LuxHero ariaLabel="Corsi" eyebrow="App pazienti" title="Corsi" subtitle={fraseCatalogo(dati)}
          actions={<Cta icona={Plus} onClick={() => setNuovo(true)}>Nuovo corso</Cta>}>
          {dati.length > 0 ? (
            <>
              <div className="cs-tappe" role="group" aria-label="Filtra per stato">
                {TAPPE.map((t) => {
                  const quanti = dati.filter((s) => s.gruppo === t.valore).length
                  return (
                    <button key={t.valore} type="button" className="cs-tappa" aria-pressed={gruppo === t.valore} data-zero={quanti === 0 ? "" : undefined}
                      onClick={() => setGruppo(gruppo === t.valore ? null : t.valore)}>
                      <strong>{quanti}</strong>
                      <span>{t.testo}</span>
                      <small>{t.nota}</small>
                    </button>
                  )
                })}
              </div>
              {lezioniInApp > 0 ? (
                <p className="cs-sintesi">Oggi i pazienti trovano {lezioniInApp} {lezioniInApp === 1 ? "lezione" : "lezioni"}{secondiInApp > 0 ? `, ${durata(secondiInApp)} di video` : ""}.</p>
              ) : null}
            </>
          ) : null}
        </LuxHero>

        {dati.length === 0 ? <CorsiVuoto onCrea={() => setNuovo(true)} /> : (
          <Riquadro titolo={gruppo ? TAPPE.find((t) => t.valore === gruppo)!.testo : "Catalogo"} conteggio={mostrati.length}>
            <div className="cs-griglia">
              {mostrati.map((s) => <CartaCorso key={s.corso.id} scheda={s} />)}
              <CartaNuovo onClick={() => setNuovo(true)} />
            </div>
          </Riquadro>
        )}
      </div>

      <CorsoDialog open={nuovo} onOpenChange={setNuovo} onSalvato={(id) => navigate(`/corsi/${id}`)} />
    </Pagina>
  )
}
