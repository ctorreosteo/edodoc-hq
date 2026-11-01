import { format, isSameDay, parseISO } from "date-fns"
import { it } from "date-fns/locale"
import { CalendarPlus, Plus } from "lucide-react"
import { Fragment } from "react"
import { BloccoVisita } from "@/components/visite/blocco-visita"
import { attiva, durataMinuti, inizioSlot, minutoDelGiorno, orario, primoSlotLibero, tempo, vociDelGiorno, conta } from "@/lib/visite"
import type { Visita } from "@/types"

/** Telefono e tablet: un giorno alla volta, con gli spazi liberi fra le visite pronti da fissare. */
export function AgendaGiorno({ giorno, visite, adesso, sovrapposte, inCaricamento, onSlot }: {
  giorno: Date
  visite: Visita[]
  adesso: Date
  sovrapposte: Set<number>
  inCaricamento: boolean
  onSlot: (inizio: string) => void
}) {
  const valide = visite.filter(attiva)
  const minuti = valide.reduce((s, v) => s + durataMinuti(v), 0)
  const voci = vociDelGiorno(visite)
  const oggi = isSameDay(giorno, adesso)
  const minutoAdesso = minutoDelGiorno(adesso)
  const inizioVoce = (i: number) => {
    const voce = voci[i]
    return voce.tipo === "libero" ? voce.da : minutoDelGiorno(parseISO(voce.visita.inizio))
  }
  const indiceAdesso = oggi ? voci.findIndex((_, i) => inizioVoce(i) > minutoAdesso) : -1
  const adessoInFondo = oggi && indiceAdesso < 0 && voci.length > 0
  const dopoUltima = valide.length > 0 ? Math.max(...valide.map((v) => minutoDelGiorno(parseISO(v.inizio)) + durataMinuti(v))) : null
  const linea = <li className="vs-giorno-adesso" aria-label={`Adesso, ${format(adesso, "HH:mm")}`}><i>{format(adesso, "HH:mm")}</i></li>

  return (
    <div className="vs-giorno" data-in-attesa={inCaricamento ? "" : undefined}>
      <header className="vs-giorno-testa">
        <p>{format(giorno, "EEEE d MMMM", { locale: it })}</p>
        <span>{valide.length > 0 ? `${conta(valide.length, "visita", "visite")} · ${tempo(minuti)}` : "Giornata libera"}</span>
      </header>
      {voci.length === 0 ? (
        <button type="button" className="vs-giorno-vuoto" onClick={() => onSlot(inizioSlot(giorno, primoSlotLibero([])))}>
          <CalendarPlus aria-hidden />
          <strong>Nessuna visita</strong>
          <span>Tocca per fissarne una</span>
        </button>
      ) : (
        <ol className="vs-giorno-lista">
          {voci.map((voce, i) => (
            <Fragment key={voce.tipo === "visita" ? voce.visita.id : `libero-${voce.da}`}>
              {i === indiceAdesso ? linea : null}
              {voce.tipo === "visita" ? (
                <li><BloccoVisita visita={voce.visita} adesso={adesso} taglia="riga" avviso={sovrapposte.has(voce.visita.id)} /></li>
              ) : (
                <li>
                  <button type="button" className="vs-libero" aria-label={`Fissa una visita alle ${orario(voce.da)}, libero per ${tempo(voce.a - voce.da)}`} onClick={() => onSlot(inizioSlot(giorno, voce.da))}>
                    <Plus aria-hidden />
                    <span>{orario(voce.da)}–{orario(voce.a)}</span>
                    <span>Libero · {tempo(voce.a - voce.da)}</span>
                  </button>
                </li>
              )}
            </Fragment>
          ))}
          {adessoInFondo ? linea : null}
          {dopoUltima != null && dopoUltima < 24 * 60 - 30 ? (
            <li>
              <button type="button" className="vs-libero" aria-label={`Fissa una visita alle ${orario(dopoUltima)}`} onClick={() => onSlot(inizioSlot(giorno, dopoUltima))}>
                <Plus aria-hidden />
                <span>Dalle {orario(dopoUltima)}</span>
                <span>Fissa dopo l'ultima visita</span>
              </button>
            </li>
          ) : null}
        </ol>
      )}
    </div>
  )
}
