import { format, isSameDay, isWithinInterval, endOfDay, startOfDay } from "date-fns"
import { it } from "date-fns/locale"
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react"
import { BloccoAltre, BloccoVisita } from "@/components/visite/blocco-visita"
import {
  DURATA_SLOT, PASSO_SLOT, delGiorno, densita, disponi, fasciaOraria, inizioSlot, minutoDelGiorno, orario, primoSlotLibero, tempo, type DensitaGiorno, type Disposta,
} from "@/lib/visite"
import type { Visita } from "@/types"

const ALTEZZA_MINIMA_MINUTI = 20

function geometria(d: Pick<Disposta, "inizio" | "fine" | "colonna" | "colonne">, da: number, minutiTotali: number): CSSProperties {
  return {
    top: `${((d.inizio - da) / minutiTotali) * 100}%`,
    height: `max(${((d.fine - d.inizio) / minutiTotali) * 100}%, 1.3rem)`,
    left: `${(d.colonna / d.colonne) * 100}%`,
    width: `${100 / d.colonne}%`,
  }
}

function tagliaBlocco(minuti: number) {
  if (minuti < 25) return "mini"
  return minuti < 45 ? "corta" : "lunga"
}

function ColonnaGiorno({ voce, visite, adesso, da, minutiTotali, scelta, sovrapposte, onSlot, primoPiano }: {
  voce: DensitaGiorno
  visite: Visita[]
  adesso: Date
  da: number
  minutiTotali: number
  scelta: boolean
  sovrapposte: Set<number>
  onSlot: (inizio: string) => void
  primoPiano: ReactNode
}) {
  const { giorno } = voce
  const [cursore, setCursore] = useState<number | null>(null)
  const disposte = useMemo(() => disponi(visite, ALTEZZA_MINIMA_MINUTI), [visite])
  const oggi = isSameDay(giorno, adesso)
  const etichetta = format(giorno, "EEEE d MMMM", { locale: it })

  const minutoDa = (e: MouseEvent<HTMLElement>) => {
    const riquadro = e.currentTarget.getBoundingClientRect()
    const minuto = da + ((e.clientY - riquadro.top) / riquadro.height) * minutiTotali
    return Math.min(da + minutiTotali - PASSO_SLOT, Math.floor(minuto / PASSO_SLOT) * PASSO_SLOT)
  }
  const muovi = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse") setCursore(minutoDa(e))
  }
  // Da tastiera non c'è un punto indicato: si parte dal primo spazio libero del giorno
  const scegli = (e: MouseEvent<HTMLElement>) => onSlot(inizioSlot(giorno, e.detail === 0 ? primoSlotLibero(visite) : minutoDa(e)))

  return (
    <section className="vs-colonna" aria-label={etichetta} data-oggi={oggi ? "" : undefined} data-passato={!oggi && giorno < adesso ? "" : undefined} data-scelta={scelta ? "" : undefined}>
      <button type="button" className="vs-slot" aria-label={`Fissa una visita ${etichetta}`} onPointerMove={muovi} onPointerLeave={() => setCursore(null)} onClick={scegli} />
      {cursore != null ? (
        <span className="vs-fantasma" aria-hidden style={geometria({ inizio: cursore, fine: cursore + DURATA_SLOT, colonna: 0, colonne: 1 }, da, minutiTotali)}>+ {orario(cursore)}</span>
      ) : null}
      {disposte.map((d) => {
        const stile = geometria(d, da, minutiTotali)
        if (d.visite.length > 1) return <BloccoAltre key={d.chiave} visite={d.visite} adesso={adesso} stile={stile} />
        const [visita] = d.visite
        return <BloccoVisita key={d.chiave} visita={visita} adesso={adesso} stile={stile} taglia={tagliaBlocco(d.fine - d.inizio)} avviso={sovrapposte.has(visita.id)} stretto={d.colonne > 1} />
      })}
      {primoPiano}
    </section>
  )
}

export function AgendaSettimana({ giorni, visite, adesso, inCaricamento, sceltoIndice, sovrapposte, vuoto, onSlot }: {
  giorni: Date[]
  visite: Visita[]
  adesso: Date
  inCaricamento: boolean
  sceltoIndice: number | null
  sovrapposte: Set<number>
  vuoto: ReactNode
  onSlot: (inizio: string) => void
}) {
  const contenitore = useRef<HTMLDivElement>(null)
  const corpo = useRef<HTMLDivElement>(null)
  const settimanaCorrente = isWithinInterval(adesso, { start: startOfDay(giorni[0]), end: endOfDay(giorni[6]) })
  const { da, a } = fasciaOraria(visite, settimanaCorrente ? adesso : null)
  const minutiTotali = (a - da) * 60
  const riepilogo = useMemo(() => densita(giorni, visite), [giorni, visite])
  const minutoAdesso = minutoDelGiorno(adesso)
  const posizioneAdesso = settimanaCorrente && minutoAdesso >= da * 60 && minutoAdesso <= a * 60
    ? { top: `${((minutoAdesso - da * 60) / minutiTotali) * 100}%` }
    : null

  const portaAlMinuto = (minuto: number) => {
    const box = contenitore.current
    const griglia = corpo.current
    if (!box || !griglia) return
    const proporzione = Math.max(0, (minuto - da * 60) / minutiTotali)
    box.scrollTo({ top: proporzione * griglia.offsetHeight })
  }

  // All'apertura di una settimana l'agenda parte da dove serve: adesso, oppure la prima visita
  const settimana = giorni[0].getTime()
  const primoOrario = visite.length > 0 ? Math.min(...visite.map((v) => minutoDelGiorno(new Date(v.inizio)))) : 9 * 60
  const obiettivo = settimanaCorrente ? minutoAdesso - 60 : primoOrario - 30
  const riferimento = useRef(portaAlMinuto)
  useEffect(() => {
    riferimento.current = portaAlMinuto
  })
  useEffect(() => {
    if (!inCaricamento) riferimento.current(obiettivo)
    // Solo al cambio di settimana: l'ora che avanza non deve spostare chi sta guardando
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settimana, inCaricamento])

  useEffect(() => {
    if (sceltoIndice == null) return
    const primo = delGiorno(visite, giorni[sceltoIndice])[0]
    if (primo) riferimento.current(minutoDelGiorno(new Date(primo.inizio)) - 30)
    // Solo quando si sceglie un giorno
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceltoIndice])

  const ore = Array.from({ length: a - da }, (_, i) => da + i)
  const stile = { "--vs-ore": a - da } as CSSProperties

  return (
    <div ref={contenitore} className="vs-agenda" tabIndex={-1} style={stile} data-in-attesa={inCaricamento ? "" : undefined}>
      <div className="vs-testate">
        <span aria-hidden />
        {riepilogo.map((voce, i) => {
          const oggi = isSameDay(voce.giorno, adesso)
          return (
            <div key={voce.giorno.toISOString()} className="vs-testata" data-oggi={oggi ? "" : undefined} data-scelta={sceltoIndice === i ? "" : undefined}>
              <span className="vs-testata-giorno">{format(voce.giorno, "EEE", { locale: it })}</span>
              <span className="vs-testata-numero">{format(voce.giorno, "d")}</span>
              <span className="vs-testata-carico">
                {voce.visite > 0 ? <>{voce.visite}<span className="vs-parola"> {voce.visite === 1 ? "visita" : "visite"}</span> · {tempo(voce.minuti)}</> : "libero"}
              </span>
            </div>
          )
        })}
      </div>
      <div ref={corpo} className="vs-griglia">
        <div className="vs-ore" aria-hidden>
          {ore.map((ora) => <span key={ora}>{String(ora).padStart(2, "0")}:00</span>)}
        </div>
        {riepilogo.map((voce) => (
          <ColonnaGiorno key={voce.giorno.toISOString()} voce={voce} visite={delGiorno(visite, voce.giorno)} adesso={adesso} da={da * 60} minutiTotali={minutiTotali}
            scelta={sceltoIndice != null && isSameDay(giorni[sceltoIndice], voce.giorno)} sovrapposte={sovrapposte} onSlot={onSlot}
            primoPiano={posizioneAdesso && isSameDay(voce.giorno, adesso) ? <span className="vs-adesso" aria-hidden style={posizioneAdesso} /> : null} />
        ))}
        {posizioneAdesso ? <span className="vs-adesso-ora" style={posizioneAdesso}>{format(adesso, "HH:mm")}</span> : null}
        {vuoto}
      </div>
    </div>
  )
}
