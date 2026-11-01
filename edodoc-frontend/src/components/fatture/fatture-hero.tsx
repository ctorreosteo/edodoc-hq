import { format, parseISO } from "date-fns"
import { it } from "date-fns/locale"
import { ArrowRight, Banknote, Landmark, Mail, Plus, Receipt, type LucideIcon } from "lucide-react"
import { LuxHero } from "@/components/lux"
import { CifraGrande, SelettoreAnno, Verdetto } from "@/components/pagamenti/comuni"
import { Cta } from "@/components/pagina"
import { euro } from "@/lib/format"
import { nomeMese, quadroFatture, quanti, type Appuntamento } from "@/lib/incassi"

type Quadro = ReturnType<typeof quadroFatture>

function Stazione({ icona: Icona, titolo, valore, nota, progresso, tono, scelto, onClick }: {
  icona: LucideIcon
  titolo: string
  valore: string
  nota: string
  progresso?: number
  tono?: "fatto" | "da-fare"
  scelto: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button type="button" className="ft-stazione" data-tono={tono} aria-pressed={scelto} onClick={onClick}>
        <span className="ft-stazione-testa"><Icona className="size-4" aria-hidden />{titolo}</span>
        <strong>{valore}</strong>
        <small>{nota}</small>
        {progresso != null ? <span className="ft-stazione-barra" aria-hidden><i style={{ width: `${progresso}%` }} /></span> : null}
      </button>
    </li>
  )
}

const percento = (parte: number, totale: number) => (totale > 0 ? (parte / totale) * 100 : 0)

function quando(giorni: number) {
  if (giorni < 0) return giorni === -1 ? "in ritardo di un giorno" : `in ritardo di ${-giorni} giorni`
  if (giorni === 0) return "oggi"
  return giorni === 1 ? "domani" : `tra ${giorni} giorni`
}

function AppuntamentoTessera({ a, onApri }: { a: Appuntamento; onApri: () => void }) {
  const giorno = parseISO(a.entro)
  const chiuso = a.precedenteChiuso
  return (
    <div className="ft-appuntamento" data-tono={a.tono}>
      <span className="ft-data"><strong>{format(giorno, "d")}</strong><span>{format(giorno, "MMM", { locale: it })}</span></span>
      <div className="ft-appuntamento-testo">
        <p className="pg-etichetta">Tessera Sanitaria, inserimento mensile</p>
        <strong>{chiuso ? `Niente da inserire per ${nomeMese(chiuso)}` : `${quanti(a.quante, "fattura", "fatture")} di ${nomeMese(a.mese)} da inserire`}</strong>
        <small>
          {chiuso
            ? `Prossimo appuntamento entro il ${format(giorno, "d MMMM", { locale: it })}${a.quante > 0 ? `: ${quanti(a.quante, "fattura", "fatture")} di ${nomeMese(a.mese)}, finora` : ` per ${nomeMese(a.mese)}`}`
            : `Entro il ${format(giorno, "d MMMM", { locale: it })}, ${quando(a.giorni)}`}
          {a.arretrate > 0 ? `. Più ${quanti(a.arretrate, "fattura", "fatture")} di mesi precedenti` : ""}
        </small>
      </div>
      <button type="button" className="ft-apri" onClick={onApri}>Apri l'elenco<ArrowRight className="size-3.5" aria-hidden /></button>
    </div>
  )
}

function numerazione(q: Quadro) {
  if (q.primo == null) return null
  if (!q.numerazioneContinua) return { tono: "warn" as const, testo: `Controlla la numerazione: mancano numeri tra ${q.primo} e ${q.ultimo}` }
  return { tono: "ok" as const, testo: q.primo === q.ultimo ? `Una sola fattura: n. ${q.primo}` : `Numerazione continua, dal n. ${q.primo} al n. ${q.ultimo}` }
}

export function FattureHero({ q, anno, onAnno, daEmettere, importoDaEmettere, filtro, onStazione, appuntamento, onApriTessera, onNuova }: {
  q: Quadro
  anno: number
  onAnno: (anno: number) => void
  daEmettere: number
  importoDaEmettere: number
  filtro: string
  onStazione: (filtro: string) => void
  appuntamento: Appuntamento
  onApriTessera: () => void
  onNuova: () => void
}) {
  const passi = [
    daEmettere > 0 ? `${daEmettere} da emettere` : null,
    q.daInviare > 0 ? `${q.daInviare} da inviare` : null,
    q.daInserire > 0 ? `${q.daInserire} da inserire in Tessera Sanitaria` : null,
  ].filter(Boolean)
  const num = numerazione(q)
  const sottotitolo = passi.length > 0 ? `Resta da fare: ${passi.join(", ")}` : q.emesse > 0 ? "Non resta niente da fare: tutte emesse, inviate e inserite" : `Nessuna fattura emessa nel ${anno}`
  return (
    <LuxHero ariaLabel="Fatture" eyebrow={`Anno ${anno}`} title="Fatture" subtitle={sottotitolo}
      actions={(
        <>
          <SelettoreAnno anno={anno} onAnno={onAnno} />
          <Cta icona={Plus} onClick={onNuova}>Nuova fattura</Cta>
        </>
      )}>
      <div className="ft-plancia">
        <div className="pg-apertura">
          <p className="pg-etichetta">Fatturato {anno}, bollo compreso</p>
          <CifraGrande valore={q.totale} />
          {num ? <Verdetto tono={num.tono}>{num.testo}</Verdetto> : null}
          {q.annullate > 0 ? <p className="pg-nota">{quanti(q.annullate, "fattura annullata", "fatture annullate")}: il numero resta occupato</p> : null}
        </div>
        <AppuntamentoTessera a={appuntamento} onApri={onApriTessera} />
      </div>

      <ol className="ft-catena" aria-label="Avanzamento delle fatture">
        <Stazione icona={Banknote} titolo="Incassi da fatturare" valore={String(daEmettere)} nota={daEmettere > 0 ? `${euro(importoDaEmettere)}, tutti gli anni` : "Ogni incasso ha la sua fattura"}
          tono={daEmettere > 0 ? "da-fare" : "fatto"} scelto={filtro === "DA_EMETTERE"} onClick={() => onStazione("DA_EMETTERE")} />
        <Stazione icona={Receipt} titolo={`Emesse nel ${anno}`} valore={String(q.emesse)} nota={q.emesse > 0 ? "Ogni fattura nasce a pagamento ricevuto" : "Nessuna fattura nell'anno"} scelto={filtro === "TUTTE"} onClick={() => onStazione("TUTTE")} />
        <Stazione icona={Mail} titolo="Inviate al paziente" valore={`${q.inviate} di ${q.emesse}`} nota={q.daInviare > 0 ? `${q.daInviare} da inviare` : q.emesse > 0 ? "Tutte inviate" : "Niente da inviare"}
          progresso={percento(q.inviate, q.emesse)} tono={q.daInviare > 0 ? "da-fare" : "fatto"} scelto={filtro === "DA_INVIARE"} onClick={() => onStazione("DA_INVIARE")} />
        <Stazione icona={Landmark} titolo="In Tessera Sanitaria" valore={`${q.inserite} di ${q.perTessera}`}
          nota={`${q.daInserire > 0 ? `${q.daInserire} da inserire` : q.perTessera > 0 ? "Tutte inserite" : "Niente da inserire"}${q.opposizioni > 0 ? `, ${q.opposizioni} con opposizione` : ""}`}
          progresso={percento(q.inserite, q.perTessera)} tono={q.daInserire > 0 ? "da-fare" : "fatto"} scelto={filtro === "DA_INSERIRE"} onClick={() => onStazione("DA_INSERIRE")} />
      </ol>
    </LuxHero>
  )
}
