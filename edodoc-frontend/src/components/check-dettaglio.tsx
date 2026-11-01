import { Chip } from "@/components/chip"
import { SheetKV, SheetKVGrid } from "@/components/ui/sheet-kit"
import { dataOra } from "@/lib/format"
import type { CheckDettaglio } from "@/types"

export function SegnaliCheck({ check }: { check: CheckDettaglio }) {
  if (!check.pesoFermo && !check.percezioneNegativa && !check.energiaBassa) return <Chip tono="ok">Nessun segnale</Chip>
  return (
    <div className="flex flex-wrap gap-1">
      {check.pesoFermo ? <Chip tono="danger">Peso fermo</Chip> : null}
      {check.percezioneNegativa ? <Chip tono="danger">Nessun miglioramento</Chip> : null}
      {check.energiaBassa ? <Chip tono="danger">Energia bassa</Chip> : null}
    </div>
  )
}

const voto = (valore: number | null) => (valore != null ? `${valore} su 5` : "—")

/** Le risposte con le stesse parole del form, per leggerle come il lunedì mattina. */
export function RisposteCheck({ check }: { check: CheckDettaglio }) {
  const percezione = check.percezioneMigliorata == null ? null : check.percezioneMigliorata ? "Nota miglioramenti" : "Nessun miglioramento"
  return (
    <div className="grid gap-3">
      <SegnaliCheck check={check} />
      <SheetKVGrid cols={2}>
        <SheetKV label="Pasti ottimali">{check.pastiOttimali != null ? `${check.pastiOttimali}` : "—"}</SheetKV>
        <SheetKV label="Pasti liberi">{check.pastiLiberi || "—"}</SheetKV>
        <SheetKV label="Energia">{voto(check.energia)}</SheetKV>
        <SheetKV label="Impegno">{voto(check.impegno)}</SheetKV>
        <SheetKV label="Peso">{check.pesoKg != null ? `${check.pesoKg} kg` : "—"}</SheetKV>
        <SheetKV label="Dati del peso">{check.andamentoPeso || "—"}</SheetKV>
        <SheetKV label="Allenamento">{check.allenamento || "—"}</SheetKV>
        <SheetKV label="Percezione">{[percezione, check.percezione].filter(Boolean).join(" · ") || "—"}</SheetKV>
      </SheetKVGrid>
      <p className="text-xs text-muted-foreground">Compilato il {dataOra(check.compilatoIl)} {check.fonte === "APP" ? "dall'app" : "dal gestionale"}</p>
    </div>
  )
}
