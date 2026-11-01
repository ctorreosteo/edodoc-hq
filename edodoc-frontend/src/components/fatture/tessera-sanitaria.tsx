import { Check, Copy, Landmark } from "lucide-react"
import { forwardRef } from "react"
import { useSegnaTessera } from "@/components/fatture/registro-fatture"
import { Azione } from "@/components/pagamenti/comuni"
import { Riquadro, Tabella } from "@/components/pagina"
import { Caricamento, Errore, Vuoto } from "@/components/stati"
import { Input } from "@/components/ui/input"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDati } from "@/hooks/use-dati"
import { data, euro } from "@/lib/format"
import { mesiTessera, nomeMeseBreve, nomeMeseConAnno, quanti, type MeseTessera } from "@/lib/incassi"
import { toast, toastErrore } from "@/lib/toast"
import { fattureService } from "@/services/gestionale"
import type { Fattura } from "@/types"

function CasellaMese({ voce, scelta, onScelta }: { voce: MeseTessera; scelta: boolean; onScelta: () => void }) {
  const fatto = voce.daInserire === 0 && voce.inserite > 0
  const stato = voce.daInserire > 0 ? `${voce.daInserire} da fare` : fatto ? "Fatto" : "—"
  const descrizione = voce.daInserire > 0 ? quanti(voce.daInserire, "fattura da inserire", "fatture da inserire") : fatto ? "tutto inserito" : "nessuna fattura da inserire"
  return (
    <button type="button" className="ft-mese" data-stato={voce.daInserire > 0 ? "da-fare" : fatto ? "fatto" : "vuoto"} aria-pressed={scelta}
      aria-label={`${nomeMeseConAnno(voce.mese)}: ${descrizione}`} onClick={onScelta}>
      <strong>{nomeMeseBreve(voce.mese)}</strong>
      <small>{fatto ? <Check className="size-3" aria-hidden /> : null}{stato}</small>
    </button>
  )
}

/** I quattro campi che cambiano nell'inserimento sul Sistema TS, pronti da copiare. */
export const TesseraSanitaria = forwardRef<HTMLDivElement, { fatture: Fattura[]; mese: string; onMese: (mese: string) => void }>(function TesseraSanitaria({ fatture, mese, onMese }, ref) {
  const { dati, errore, riprova } = useDati(() => fattureService.tessera(mese), [mese])
  const segna = useSegnaTessera()
  const mesi = mesiTessera(fatture, Number(mese.slice(0, 4)))
  const scelto = mesi.find((m) => m.mese === mese)

  const copia = async () => {
    const righe = (dati ?? []).map((r) => [data(r.data), r.numero, r.codiceFiscale, String(r.importo).replace(".", ",")].join("\t"))
    try {
      await navigator.clipboard.writeText(righe.join("\n"))
      toast.success("Elenco copiato")
    } catch (e) {
      toastErrore(e)
    }
  }

  return (
    <div ref={ref} className="ft-ancora">
      <Riquadro titolo="Tessera Sanitaria" conteggio={dati?.length} descrizione="Trasmissione automatica spenta: l'elenco serve per l'inserimento mensile a mano"
        azioni={
          <div className="ft-tessera-azioni">
            <Input aria-label="Mese" type="month" value={mese} onChange={(e) => e.target.value && onMese(e.target.value)} className="h-8 w-40" />
            <Azione icona={Copy} disabled={!dati?.length} onClick={() => void copia()}>Copia</Azione>
          </div>
        }>
        <div className="ft-mesi" role="group" aria-label="Mesi dell'anno">
          {mesi.map((m) => <CasellaMese key={m.mese} voce={m} scelta={m.mese === mese} onScelta={() => onMese(m.mese)} />)}
        </div>
        <p className="ft-tessera-nota">
          {nomeMeseConAnno(mese)}
          {scelto && scelto.inserite > 0 ? ` · ${quanti(scelto.inserite, "già inserita", "già inserite")}` : ""}
          {scelto && scelto.opposizioni > 0 ? ` · ${quanti(scelto.opposizioni, "con opposizione: non va inserita", "con opposizione: non vanno inserite")}` : ""}
        </p>
        {errore ? <Errore messaggio={errore} onRiprova={riprova} /> : !dati ? <Caricamento /> : dati.length === 0 ? <Vuoto titolo="Nessuna fattura da inserire" /> : (
          <Tabella>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Numero</TableHead>
                <TableHead>Codice fiscale</TableHead>
                <TableHead>Importo</TableHead>
                <TableHead>Azione</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dati.map((r) => (
                <TableRow key={r.fatturaId}>
                  <TableCell className="tabular-nums">{data(r.data)}</TableCell>
                  <TableCell className="tabular-nums">{r.numero}</TableCell>
                  <TableCell className="font-mono text-xs">{r.codiceFiscale}</TableCell>
                  <TableCell className="tabular-nums">{euro(r.importo)}</TableCell>
                  <TableCell>
                    <Azione icona={Landmark} etichetta={`Segna la fattura n. ${r.numero} inserita in Tessera Sanitaria`} onClick={() => void segna(r.fatturaId, r.numero)}>Segna inserita</Azione>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Tabella>
        )}
      </Riquadro>
    </div>
  )
})
