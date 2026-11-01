import { Clock, GraduationCap, Layers, ListVideo, Plus } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Chip } from "@/components/chip"
import { CopertinaCorso, StatoCorso } from "@/components/corsi/corso-ui"
import { CorsoDialog } from "@/components/forms/corso-dialog"
import { LuxHero, LuxKpi } from "@/components/lux"
import { Cta, Pagina, Riquadro } from "@/components/pagina"
import { Caricamento, Errore, Vuoto } from "@/components/stati"
import { useDati } from "@/hooks/use-dati"
import { durata } from "@/lib/format"
import { corsiService } from "@/services/gestionale"

export default function Corsi() {
  const navigate = useNavigate()
  const [nuovo, setNuovo] = useState(false)
  const { dati, errore, riprova } = useDati(corsiService.catalogo, [])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const pubblicati = dati.filter((c) => c.pubblicato).length
  const lezioni = dati.reduce((somma, c) => somma + c.lezioni, 0)
  const secondi = dati.reduce((somma, c) => somma + c.secondiVideo, 0)

  return (
    <Pagina>
      <LuxHero ariaLabel="Corsi" eyebrow="App pazienti" title="Corsi" subtitle="Corsi, moduli e lezioni che i pazienti seguono dall'app"
        actions={<Cta icona={Plus} onClick={() => setNuovo(true)}>Nuovo corso</Cta>}>
        <div className="vl-kpis vl-kpis--3">
          <LuxKpi icon={<GraduationCap className="size-4" />} label="Pubblicati" value={pubblicati} foot={`su ${dati.length}`} />
          <LuxKpi icon={<ListVideo className="size-4" />} label="Lezioni" value={lezioni} />
          <LuxKpi icon={<Clock className="size-4" />} label="Video" value={durata(secondi)} />
        </div>
      </LuxHero>

      <Riquadro titolo="Catalogo" conteggio={dati.length}>
        {dati.length === 0 ? <Vuoto titolo="Ancora nessun corso" descrizione="Crea il primo: titolo e copertina, poi moduli e lezioni" icona={<GraduationCap aria-hidden />} /> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {dati.map((c) => (
              <button key={c.id} type="button" onClick={() => navigate(`/corsi/${c.id}`)} className="min-w-0 overflow-hidden rounded-xl border text-left transition-colors hover:bg-muted/50">
                <CopertinaCorso id={c.copertinaId} titolo={c.titolo} />
                <div className="grid gap-1.5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 font-semibold">{c.titolo}</span>
                    <StatoCorso pubblicato={c.pubblicato} />
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{c.descrizione ?? "Nessuna descrizione"}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Layers className="size-3.5" aria-hidden />{c.moduli} {c.moduli === 1 ? "modulo" : "moduli"}</span>
                    <span className="inline-flex items-center gap-1"><ListVideo className="size-3.5" aria-hidden />{c.lezioni} {c.lezioni === 1 ? "lezione" : "lezioni"}</span>
                    {c.pubblicato && c.lezioniPubblicate < c.lezioni ? <Chip tono="warn">{c.lezioni - c.lezioniPubblicate} in bozza</Chip> : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Riquadro>

      <CorsoDialog open={nuovo} onOpenChange={setNuovo} onSalvato={(id) => navigate(`/corsi/${id}`)} />
    </Pagina>
  )
}
