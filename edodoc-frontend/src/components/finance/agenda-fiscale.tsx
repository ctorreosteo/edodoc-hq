import { format, parseISO } from "date-fns"
import { it } from "date-fns/locale"
import { Check, Pencil, Plus, Trash2 } from "lucide-react"
import { Chip } from "@/components/chip"
import { Riquadro } from "@/components/pagina"
import { Vuoto } from "@/components/stati"
import { Button } from "@/components/ui/button"
import { useAzioni } from "@/contexts/azioni-context"
import { giorniDa, quandoScade } from "@/lib/finance"
import { data, euro, euroTondi } from "@/lib/format"
import { CATEGORIA } from "@/lib/etichette"
import { toast } from "@/lib/toast"
import { oggiIso } from "@/lib/utils"
import { financeService } from "@/services/gestionale"
import type { ScadenzaFiscale } from "@/types"

export function AgendaFiscale({ scadenze, onNuova, onModifica }: {
  scadenze: ScadenzaFiscale[]
  onNuova: () => void
  onModifica: (scadenza: ScadenzaFiscale) => void
}) {
  const azioni = useAzioni()
  const aperte = scadenze.filter((s) => s.stato !== "PAGATA")
  const pagate = scadenze.filter((s) => s.stato === "PAGATA")
  const daPagare = aperte.reduce((somma, s) => somma + (s.importoStimato ?? 0), 0)

  const paga = (s: ScadenzaFiscale) => azioni.conferma({
    titolo: `Segnare pagata: ${s.titolo}?`,
    descrizione: s.importoStimato != null ? `Crea un'uscita di ${euro(s.importoStimato)} con data di oggi.` : "Importo non stimato: indicalo sotto.",
    etichetta: "Segna pagata",
    richiediTesto: s.importoStimato == null ? "Importo pagato (€)" : undefined,
    azione: async (testo) => {
      const valore = s.importoStimato ?? Number(testo.replace(",", "."))
      if (!(valore > 0)) throw new Error("Importo non valido")
      await financeService.pagaScadenza(s.id, oggiIso(), valore)
      toast.success("Scadenza pagata")
      azioni.aggiorna()
    },
  })

  const elimina = (s: ScadenzaFiscale) => azioni.conferma({
    titolo: "Eliminare la scadenza?",
    descrizione: s.titolo,
    etichetta: "Elimina",
    azione: async () => {
      await financeService.eliminaScadenza(s.id)
      azioni.aggiorna()
    },
  })

  return (
    <Riquadro titolo="Scadenze fiscali" conteggio={aperte.length} descrizione={aperte.length > 0 ? `${euroTondi(daPagare)} ancora da pagare` : undefined}
      azioni={<Button size="sm" variant="outline" onClick={onNuova}><Plus aria-hidden />Scadenza</Button>}>
      {scadenze.length === 0 ? <Vuoto titolo="Nessuna scadenza" descrizione="Aggiungi quota ordine, cassa e F24." /> : (
        <>
          {aperte.length === 0 ? <p className="fi-tutto-pagato"><Check className="size-4" aria-hidden />Tutto pagato per quest'anno</p> : (
            <ol className="fi-agenda">
              {aperte.map((s, i) => {
                const quando = quandoScade(giorniDa(s.dataScadenza))
                const giorno = parseISO(s.dataScadenza)
                return (
                  <li key={s.id} data-prossima={i === 0 ? "" : undefined}>
                    <time dateTime={s.dataScadenza} className="fi-agenda-data">
                      <strong>{format(giorno, "d")}</strong>
                      <span>{format(giorno, "MMM", { locale: it })}</span>
                    </time>
                    <button type="button" className="fi-agenda-corpo" aria-label={`Modifica ${s.titolo}`} onClick={() => onModifica(s)}>
                      <strong>{s.titolo}</strong>
                      <span>{CATEGORIA[s.categoria]}</span>
                    </button>
                    <div className="fi-agenda-stato">
                      <strong>{s.importoStimato != null ? euro(s.importoStimato) : "Da stimare"}</strong>
                      <Chip tono={quando.tono}>{quando.testo}</Chip>
                    </div>
                    <div className="fi-agenda-azioni">
                      <Button size="sm" variant={i === 0 ? "default" : "outline"} onClick={() => paga(s)}>Paga</Button>
                      <Button size="icon" variant="ghost" aria-label={`Modifica ${s.titolo}`} onClick={() => onModifica(s)}><Pencil /></Button>
                      <Button size="icon" variant="ghost" aria-label={`Elimina ${s.titolo}`} onClick={() => elimina(s)}><Trash2 /></Button>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
          {pagate.length > 0 ? (
            <details className="fi-pagate">
              <summary>{pagate.length === 1 ? "1 già pagata" : `${pagate.length} già pagate`}</summary>
              <ul>
                {pagate.map((s) => (
                  <li key={s.id}>
                    <span>{s.titolo}</span>
                    <span>Pagata il {data(s.pagataIl)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </Riquadro>
  )
}
