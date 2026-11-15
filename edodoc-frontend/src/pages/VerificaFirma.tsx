import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { dataOra } from "@/lib/format"
import { firmaPubblica, type VerificaFirma as Esito } from "@/services/accettazione-service"

/* Verifica pubblica di un modulo firmato (/verifica-firma/:codice): solo iniziali, data e impronta del PDF. */
export default function VerificaFirma() {
  const { codice = "" } = useParams()
  const [esito, setEsito] = useState<Esito | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    document.title = "Verifica del modulo firmato"
    firmaPubblica.verifica(codice).then(setEsito).catch((e) => setErrore(e instanceof Error ? e.message : "Verifica non riuscita"))
  }, [codice])

  return (
    <div className="min-h-svh bg-muted/40 text-foreground">
      <main className="mx-auto w-full max-w-lg px-4 py-10">
        <section className="rounded-2xl border bg-background p-6 shadow-sm sm:p-8">
          <p className="text-xs text-muted-foreground">Codice di verifica</p>
          <p className="font-mono text-base font-semibold tracking-wider">{codice.toUpperCase()}</p>
          {errore ? (
            <p className="mt-6 text-sm text-destructive">{errore}</p>
          ) : !esito ? (
            <Loader2 className="mt-6 size-5 animate-spin text-muted-foreground" aria-label="Verifica in corso" />
          ) : esito.valido ? (
            <div className="mt-6">
              <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-5" aria-hidden />Documento autentico
              </div>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Documento</dt><dd>{esito.titolo}</dd>
                <dt className="text-muted-foreground">Titolare</dt><dd>{esito.titolare}</dd>
                <dt className="text-muted-foreground">Firmato da</dt><dd>{esito.iniziali}</dd>
                <dt className="text-muted-foreground">Il</dt><dd>{dataOra(esito.firmataIl)}</dd>
                <dt className="text-muted-foreground">Marca temporale</dt><dd>{esito.marcaTemporale ? "Sì" : "No"}</dd>
                <dt className="text-muted-foreground">SHA-256 del PDF</dt><dd className="break-all font-mono text-xs">{esito.pdfSha256}</dd>
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">
                Il PDF che hai è identico all'originale se la sua impronta SHA-256 coincide con quella qui sopra.
              </p>
            </div>
          ) : (
            <div className="mt-6 flex items-center gap-2 font-semibold text-destructive">
              <XCircle className="size-5" aria-hidden />Nessun modulo firmato con questo codice
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
