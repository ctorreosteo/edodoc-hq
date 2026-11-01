import { addWeeks, format, parseISO } from "date-fns"
import { ClipboardCheck } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { CodaCheck } from "@/components/check/coda-check"
import { FocusVuoto, SchedaCheck, TestataFocus, useLargo } from "@/components/check/focus-check"
import { GiroHero } from "@/components/check/giro-hero"
import { Pagina } from "@/components/pagina"
import { Caricamento, Errore } from "@/components/stati"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { SheetHero } from "@/components/ui/sheet-kit"
import { useAzioni } from "@/contexts/azioni-context"
import { movimentoRidotto } from "@/hooks/use-conteggio"
import { useDati } from "@/hooks/use-dati"
import { fattoIl, giroPredefinito, momentoSettimana, ordinaCoda, prossimoDa, type Filtro, type Giro } from "@/lib/check"
import { AZIONE_CHECK } from "@/lib/etichette"
import { toastErrore } from "@/lib/toast"
import { celebra } from "@/lib/task-festa"
import { checkService } from "@/services/gestionale"
import "@/style/check.css"
import type { RigaCheck, SettimanaCheck } from "@/types"

const stoScrivendo = (e: KeyboardEvent) => {
  const bersaglio = e.target as HTMLElement
  return bersaglio.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(bersaglio.tagName) || document.querySelector("[role='dialog'], [role='menu'], [role='listbox']") != null
}

function Settimana({ dati, inAttesa, onSposta, onOggi }: { dati: SettimanaCheck; inAttesa: boolean; onSposta: (settimane: number) => void; onOggi: () => void }) {
  const azioni = useAzioni()
  const largo = useLargo()
  const [oggi] = useState(() => new Date())
  const [filtro, setFiltro] = useState<Filtro>("TUTTI")
  const [soloDaContattare, setSoloDaContattare] = useState(false)
  const [giroScelto, setGiroScelto] = useState<Giro | null>(null)
  const [scelto, setScelto] = useState<number | null>(null)
  // La spunta risponde subito: la coda scorre senza aspettare il server, e un errore la riporta indietro.
  const [spunte, setSpunte] = useState<Record<string, string | null>>({})
  const lavoro = useRef<HTMLDivElement>(null)

  const giro = giroScelto ?? giroPredefinito(dati.settimana, oggi)
  const momento = momentoSettimana(dati.settimana, oggi)

  const righe = useMemo(() => ordinaCoda(dati.righe.map((r) => {
    const lunedi = spunte[`${dati.settimana}:${r.pazienteId}:LUNEDI`]
    const mercoledi = spunte[`${dati.settimana}:${r.pazienteId}:MERCOLEDI`]
    return { ...r, lunediFattoIl: lunedi === undefined ? r.lunediFattoIl : lunedi, mercolediFattoIl: mercoledi === undefined ? r.mercolediFattoIl : mercoledi }
  })), [dati, spunte])

  const coda = useMemo(() => righe.filter((r) => (filtro === "TUTTI" || r.azione === filtro) && (!soloDaContattare || !fattoIl(r, giro) || r.pazienteId === scelto)), [righe, filtro, soloDaContattare, giro, scelto])
  const aperta = righe.find((r) => r.pazienteId === scelto) ?? null

  const scegli = (riga: RigaCheck) => {
    setScelto(riga.pazienteId)
    if (riga.check && !riga.check.lettoIl) void checkService.letto(riga.check.id).then(azioni.aggiorna).catch(toastErrore)
  }

  const contatto = async (riga: RigaCheck, giorno: Giro, fatto: boolean) => {
    const chiave = `${dati.settimana}:${riga.pazienteId}:${giorno}`
    setSpunte((s) => ({ ...s, [chiave]: fatto ? new Date().toISOString() : null }))
    try {
      await checkService.contatto(riga.pazienteId, dati.settimana, giorno, fatto)
      azioni.aggiorna()
    } catch (e) {
      setSpunte((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== chiave)))
      toastErrore(e)
    }
  }

  const avanti = (riga: RigaCheck) => {
    const prossimo = prossimoDa(coda, riga.pazienteId, giro)
    if (!fattoIl(riga, giro)) void contatto(riga, giro, true)
    if (prossimo) return scegli(prossimo)
    setScelto(null)
    if (righe.every((r) => r.pazienteId === riga.pazienteId || fattoIl(r, giro))) celebra(null, 40)
  }

  const sposta = (settimane: number) => {
    setScelto(null)
    onSposta(settimane)
  }

  // Frecce sinistra e destra: si scorre la coda senza staccare le mani dalla tastiera
  useEffect(() => {
    if (!largo) return
    const onTasto = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || stoScrivendo(e)) return
      const indice = coda.findIndex((r) => r.pazienteId === scelto)
      const riga = coda[e.key === "ArrowRight" ? indice + 1 : indice - 1]
      if (!riga || (indice < 0 && e.key === "ArrowLeft")) return
      e.preventDefault()
      setScelto(riga.pazienteId)
      if (riga.check && !riga.check.lettoIl) void checkService.letto(riga.check.id).then(azioni.aggiorna).catch(toastErrore)
    }
    window.addEventListener("keydown", onTasto)
    return () => window.removeEventListener("keydown", onTasto)
  }, [largo, coda, scelto, azioni.aggiorna])

  // Il paziente aperto resta sempre in vista nella coda
  useEffect(() => {
    if (scelto == null || !largo) return
    lavoro.current?.querySelector(`[data-paziente="${scelto}"]`)?.scrollIntoView({ behavior: movimentoRidotto() ? "auto" : "smooth", block: "nearest" })
  }, [scelto, largo])

  const scheda = aperta ? (testata: React.ReactNode) => (
    <SchedaCheck riga={aperta} coda={coda} giro={giro} testata={testata} onContatto={contatto} onAvanti={avanti} onScegli={scegli} onChiudi={() => setScelto(null)} />
  ) : null

  return (
    <div className="ck-pagina" data-in-attesa={inAttesa ? "" : undefined}>
      <GiroHero dati={dati} righe={righe} coda={coda} giro={giro} scelto={scelto} momento={momento} onGiro={setGiroScelto} onScegli={scegli} onSposta={sposta} onOggi={onOggi} />

      <div className="ck-lavoro" ref={lavoro} data-largo={largo ? "" : undefined}>
        <CodaCheck coda={coda} giro={giro} filtro={filtro} soloDaContattare={soloDaContattare} scelto={scelto}
          onFiltro={setFiltro} onSoloDaContattare={setSoloDaContattare} onScegli={scegli} onContatto={contatto} />
        {largo ? (
          <aside className="ck-focus" aria-label="Paziente aperto">
            {aperta && scheda ? scheda(<TestataFocus riga={aperta} />) : <FocusVuoto righe={righe} coda={coda} giro={giro} onScegli={scegli} onGiro={setGiroScelto} />}
          </aside>
        ) : null}
      </div>

      <Sheet open={!largo && aperta != null} onOpenChange={(v) => !v && setScelto(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto gap-4 p-4 sm:p-6" data-vl="scope">
          {aperta && scheda ? scheda(<SheetHero icon={<ClipboardCheck />} eyebrow="Check settimanale" title={aperta.pazienteNome} description={aperta.situazione ?? AZIONE_CHECK[aperta.azione].testo} />) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

export default function Check() {
  const [data, setData] = useState<string | undefined>(undefined)
  const { dati, errore, riprova } = useDati(() => checkService.settimana(data), [data])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const sposta = (settimane: number) => setData(format(addWeeks(parseISO(data ?? dati.settimana), settimane), "yyyy-MM-dd"))

  return (
    <Pagina>
      <Settimana dati={dati} inAttesa={data != null && data !== dati.settimana} onSposta={sposta} onOggi={() => setData(undefined)} />
    </Pagina>
  )
}
