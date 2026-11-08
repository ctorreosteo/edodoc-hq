import { format, parseISO } from "date-fns"
import { it } from "date-fns/locale"
import { Download, ExternalLink, FileText, History, RotateCcw, X } from "lucide-react"
import { useEffect, useState, type KeyboardEvent } from "react"
import { Caricamento } from "@/components/stati"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { toastErrore } from "@/lib/toast"
import { dieteService } from "@/services/gestionale"
import type { Dieta, VersioneDieta } from "@/types"

/** Data e ora precise, come le vuole lo storico: "8 novembre 2026, 15:32". */
export const quando = (iso: string) => format(parseISO(iso), "d MMMM yyyy, HH:mm", { locale: it })
export const quandoBreve = (iso: string) => format(parseISO(iso), "d MMM yyyy · HH:mm", { locale: it })

/** Elenco di voci brevi (alimenti liberi, da limitare): si scrive e si preme Invio. */
export function Gettoni({ valori, onChange, segnaposto, tono }: { valori: string[]; onChange: (v: string[]) => void; segnaposto: string; tono: "liberi" | "limitare" }) {
  const [testo, setTesto] = useState("")
  const aggiungi = () => {
    const nuovi = testo.split(/[,;]/).map((t) => t.trim()).filter(Boolean).filter((t) => !valori.some((v) => v.toLowerCase() === t.toLowerCase()))
    if (nuovi.length) onChange([...valori, ...nuovi])
    setTesto("")
  }
  const tasto = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      aggiungi()
    } else if (e.key === "Backspace" && !testo && valori.length) {
      onChange(valori.slice(0, -1))
    }
  }
  return (
    <div className="dt-gettoni" data-tono={tono}>
      {valori.map((v, i) => (
        <span key={`${v}-${i}`} className="dt-gettone">
          {v}
          <button type="button" aria-label={`Togli ${v}`} onClick={() => onChange(valori.filter((_, j) => j !== i))}><X aria-hidden /></button>
        </span>
      ))}
      <input className="dt-gettoni-input" value={testo} placeholder={valori.length ? "Aggiungi…" : segnaposto} onChange={(e) => setTesto(e.target.value)}
        onKeyDown={tasto} onBlur={aggiungi} aria-label={segnaposto} />
    </div>
  )
}

/** Una modifica dello storico, con il segno colorato: + aggiunto, − tolto, → cambiato. */
function Modifica({ testo }: { testo: string }) {
  const tipo = testo.startsWith("+ ") || testo.includes(": + ") ? "piu" : testo.startsWith("− ") || testo.includes(": − ") ? "meno" : "cambio"
  return <li data-tipo={tipo}>{testo}</li>
}

function Versione({ dieta, v, attuale, sporca, nuova, onRipristina }: {
  dieta: Dieta; v: VersioneDieta; attuale: boolean; sporca: boolean; nuova: boolean; onRipristina: (numero: number) => void
}) {
  const [aperta, setAperta] = useState(false)
  const mostrate = aperta ? v.modifiche : v.modifiche.slice(0, 4)
  return (
    <li className="dt-versione" data-attuale={attuale ? "" : undefined} data-nuova={nuova ? "" : undefined}>
      <span className="dt-versione-punto" aria-hidden />
      <div className="dt-versione-testo">
        <strong>{v.numero === 1 ? "Creazione" : `Versione ${v.numero}`}{attuale ? <em>{sporca ? "ultima salvata" : "attuale"}</em> : null}</strong>
        <time dateTime={v.createdAt}>{quando(v.createdAt)}</time>
        {v.nota ? <span className="dt-versione-nota">{v.nota}</span> : null}
        {mostrate.length ? (
          <ul className="dt-modifiche">
            {mostrate.map((m, i) => <Modifica key={i} testo={m} />)}
          </ul>
        ) : v.numero === 1 && !v.nota ? <small>{v.titolo}{v.kcal ? ` · ${v.kcal.toLocaleString("it-IT")} kcal` : ""} · {v.pasti} pasti</small> : null}
        {v.modifiche.length > 4 ? (
          <button type="button" className="dt-modifiche-altre" onClick={() => setAperta(!aperta)}>
            {aperta ? "Mostra meno" : v.modifiche.length === 5 ? "Un'altra modifica" : `Altre ${v.modifiche.length - 4} modifiche`}
          </button>
        ) : null}
      </div>
      <div className="dt-versione-azioni">
        <button type="button" className="dt-icona" title="Apri il PDF di questa versione" aria-label={`PDF della versione ${v.numero}`}
          onClick={() => dieteService.apriPdfVersione(dieta.id, v.numero).catch(toastErrore)}><FileText aria-hidden /></button>
        {!attuale ? (
          <button type="button" className="dt-icona" title="Ripristina questa versione" aria-label={`Ripristina la versione ${v.numero}`}
            onClick={() => onRipristina(v.numero)}><RotateCcw aria-hidden /></button>
        ) : null}
      </div>
    </li>
  )
}

/**
 * Ogni salvataggio è una versione con la sua ora e il racconto di cosa è cambiato. Si riapre in PDF o si ripristina,
 * e il ripristino è a sua volta una versione: lo storico non perde nulla.
 */
export function Storico({ dieta, sporca, nuova, onRipristina }: { dieta: Dieta; sporca: boolean; nuova?: number | null; onRipristina: (numero: number) => void }) {
  const ultima = dieta.versioni[0]?.numero
  return (
    <ol className="dt-storico">
      {dieta.versioni.map((v) => (
        <Versione key={v.numero} dieta={dieta} v={v} attuale={v.numero === ultima} sporca={sporca} nuova={v.numero === nuova} onRipristina={onRipristina} />
      ))}
      {dieta.versioni.length === 0 ? <li className="dt-versione-vuota"><History aria-hidden />Nessuna versione salvata</li> : null}
    </ol>
  )
}

/** Il PDF vero, quello che riceve il paziente, dentro il gestionale. */
export function AnteprimaPdf({ dieta, aperta, onClose }: { dieta: Dieta | null; aperta: boolean; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const nomeFile = dieta ? `${dieta.pazienteNome ? `Dieta ${dieta.pazienteNome}` : dieta.titolo}.pdf` : "dieta.pdf"

  useEffect(() => {
    if (!aperta || !dieta) return
    let indirizzo: string | null = null
    let annullato = false
    setUrl(null)
    dieteService.pdf(dieta.id).then((blob) => {
      if (annullato) return
      indirizzo = URL.createObjectURL(blob)
      setUrl(indirizzo)
    }).catch((e) => {
      toastErrore(e)
      onClose()
    })
    return () => {
      annullato = true
      if (indirizzo) URL.revokeObjectURL(indirizzo)
    }
  }, [aperta, dieta, onClose])

  return (
    <Sheet open={aperta} onOpenChange={(a) => !a && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-3xl p-0 gap-0 flex flex-col" data-vl="scope">
        <div className="dt-anteprima-testa">
          <div className="min-w-0">
            <SheetTitle className="truncate">{dieta?.titolo ?? "Anteprima"}</SheetTitle>
            <SheetDescription className="truncate">{dieta?.pazienteNome ? `Il PDF che riceverà ${dieta.pazienteNome}` : "Anteprima del modello"}</SheetDescription>
          </div>
          {url ? (
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" asChild><a href={url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden />Apri</a></Button>
              <Button size="sm" asChild><a href={url} download={nomeFile}><Download aria-hidden />Scarica</a></Button>
            </div>
          ) : null}
        </div>
        <div className="dt-anteprima-corpo">
          {url ? <iframe title="Anteprima della dieta in PDF" src={`${url}#view=FitH&toolbar=0`} /> : <Caricamento etichetta="Impagino il PDF…" />}
        </div>
      </SheetContent>
    </Sheet>
  )
}
