import { addWeeks, format, parseISO } from "date-fns"
import { it } from "date-fns/locale"
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardPlus, MessageCircle, Phone } from "lucide-react"
import { useMemo, useState } from "react"
import { Chip } from "@/components/chip"
import { RisposteCheck, SegnaliCheck } from "@/components/check-dettaglio"
import { LuxHero, LuxKpi } from "@/components/lux"
import { MenuRigaCheck } from "@/components/menu-contestuali"
import { Cta, Pagina, Riquadro, Tabella } from "@/components/pagina"
import { Caricamento, Errore, Vuoto } from "@/components/stati"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { SheetHero } from "@/components/ui/sheet-kit"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAzioni } from "@/contexts/azioni-context"
import { useDati } from "@/hooks/use-dati"
import { linkWhatsapp } from "@/lib/format"
import { AZIONE_CHECK } from "@/lib/etichette"
import { toastErrore } from "@/lib/toast"
import { checkService } from "@/services/gestionale"
import type { RigaCheck } from "@/types"

const FILTRI: Record<string, string> = { TUTTI: "Tutti", SOLLECITO: "Senza check", MESSAGGIO_DEDICATO: "Con segnali" }
// Prima chi ha bisogno di attenzione: l'ordine è la lista di lavoro del lunedì
const ORDINE: Record<string, number> = { MESSAGGIO_DEDICATO: 0, SOLLECITO: 1, MESSAGGIO_STANDARD: 2 }

export default function Check() {
  const azioni = useAzioni()
  const [data, setData] = useState<string | undefined>(undefined)
  const [filtro, setFiltro] = useState("TUTTI")
  const [aperta, setAperta] = useState<RigaCheck | null>(null)
  const { dati, errore, riprova } = useDati(() => checkService.settimana(data), [data])

  const righe = useMemo(() => [...(dati?.righe ?? [])]
    .filter((r) => filtro === "TUTTI" || r.azione === filtro)
    .sort((a, b) => ORDINE[a.azione] - ORDINE[b.azione]), [dati, filtro])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const sposta = (settimane: number) => setData(format(addWeeks(parseISO(dati.settimana), settimane), "yyyy-MM-dd"))
  const contatto = async (riga: RigaCheck, giorno: "LUNEDI" | "MERCOLEDI", fatto: boolean) => {
    try {
      await checkService.contatto(riga.pazienteId, dati.settimana, giorno, fatto)
      azioni.aggiorna()
    } catch (e) {
      toastErrore(e)
    }
  }
  const apri = (riga: RigaCheck) => {
    setAperta(riga)
    if (riga.check && !riga.check.lettoIl) void checkService.letto(riga.check.id).catch(toastErrore)
  }

  return (
    <Pagina>
      <LuxHero ariaLabel="Check settimanale" eyebrow={`Settimana del ${format(parseISO(dati.settimana), "d MMMM", { locale: it })}`} title="Check settimanale"
        subtitle="La lista del lunedì e del mercoledì: chi ha compilato e a chi serve un messaggio diverso"
        actions={<Cta icona={ClipboardPlus} onClick={() => azioni.inserisciCheck()}>Inserisci check</Cta>}>
        <div className="vl-kpis vl-kpis--3">
          <LuxKpi icon={<ClipboardCheck className="size-4" />} label="Compilati" value={dati.compilati} unit={`/${dati.attesi}`} progress={dati.attesi ? (dati.compilati / dati.attesi) * 100 : 0} />
          <LuxKpi icon={<AlertTriangle className="size-4" />} label="Messaggio dedicato" value={dati.conSegnali} foot="Peso, percezione o energia" />
          <LuxKpi icon={<Phone className="size-4" />} label="Da contattare" value={dati.daContattareLunedi} foot={`${dati.daContattareMercoledi} per il mercoledì`} />
        </div>
      </LuxHero>

      <Riquadro titolo="Pazienti" conteggio={righe.length} descrizione="Clic su una riga per leggere le risposte, tasto destro per le azioni"
        azioni={
          <div className="flex flex-wrap items-center gap-1">
            {Object.entries(FILTRI).map(([k, v]) => (
              <Button key={k} size="sm" variant={filtro === k ? "default" : "outline"} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{v}</Button>
            ))}
            <span className="w-2" />
            <Button variant="outline" size="icon" aria-label="Settimana precedente" onClick={() => sposta(-1)}><ChevronLeft /></Button>
            <Button variant="outline" size="icon" aria-label="Settimana successiva" onClick={() => sposta(1)}><ChevronRight /></Button>
          </div>
        }>
        {righe.length === 0 ? <Vuoto titolo="Nessun paziente in questa lista" /> : (
          <Tabella>
            <TableHeader>
              <TableRow>
                <TableHead>Paziente</TableHead>
                <TableHead>Da fare</TableHead>
                <TableHead>Segnali</TableHead>
                <TableHead>Energia</TableHead>
                <TableHead>Impegno</TableHead>
                <TableHead>Peso</TableHead>
                <TableHead>Lun</TableHead>
                <TableHead>Mer</TableHead>
                <TableHead>Scrivi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {righe.map((r) => {
                const whatsapp = linkWhatsapp(r.cellulare)
                return (
                  <MenuRigaCheck key={r.pazienteId} riga={r}>
                  <TableRow className="cursor-pointer" onClick={() => apri(r)}>
                    <TableCell className="font-semibold">{r.pazienteNome}</TableCell>
                    <TableCell><Chip tono={AZIONE_CHECK[r.azione].tono}>{AZIONE_CHECK[r.azione].testo}</Chip></TableCell>
                    <TableCell>{r.check ? <SegnaliCheck check={r.check} /> : "—"}</TableCell>
                    <TableCell className="tabular-nums">{r.check?.energia ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{r.check?.impegno ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{r.check?.pesoKg != null ? `${r.check.pesoKg} kg` : "—"}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox aria-label={`Contattato lunedì: ${r.pazienteNome}`} checked={!!r.lunediFattoIl} onCheckedChange={(v) => void contatto(r, "LUNEDI", v === true)} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox aria-label={`Contattato mercoledì: ${r.pazienteNome}`} checked={!!r.mercolediFattoIl} onCheckedChange={(v) => void contatto(r, "MERCOLEDI", v === true)} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {whatsapp ? (
                        <Button size="icon" variant="ghost" asChild>
                          <a href={whatsapp} target="_blank" rel="noreferrer" aria-label={`WhatsApp a ${r.pazienteNome}`}><MessageCircle /></a>
                        </Button>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                  </MenuRigaCheck>
                )
              })}
            </TableBody>
          </Tabella>
        )}
      </Riquadro>

      <Sheet open={aperta != null} onOpenChange={(v) => !v && setAperta(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto gap-4 p-4 sm:p-6" data-vl="scope">
          {aperta ? (
            <>
              <SheetHero icon={<ClipboardCheck />} eyebrow="Check settimanale" title={aperta.pazienteNome} description={aperta.situazione ?? AZIONE_CHECK[aperta.azione].testo} />
              {aperta.check ? <RisposteCheck check={aperta.check} /> : <Vuoto titolo="Check non compilato" descrizione="Manda il vocale del lunedì." />}
              {aperta.nota ? <p className="text-sm">{aperta.nota}</p> : null}
              <Button variant="outline" onClick={() => {
                azioni.apriPaziente(aperta.pazienteId)
                setAperta(null)
              }}>Apri la scheda del paziente</Button>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </Pagina>
  )
}
