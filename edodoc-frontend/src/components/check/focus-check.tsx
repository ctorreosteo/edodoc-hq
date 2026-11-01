import { ArrowRight, CalendarCheck, ChevronLeft, ChevronRight, ClipboardPlus, MessageCircle, PartyPopper, UserRound } from "lucide-react"
import { useSyncExternalStore, type ReactNode } from "react"
import { RisposteCheck } from "@/components/check-dettaglio"
import { Chip } from "@/components/chip"
import { LuxAvatar } from "@/components/lux"
import { SpunteContatto } from "@/components/check/spunta-contatto"
import { Vuoto } from "@/components/stati"
import { Button } from "@/components/ui/button"
import { useAzioni } from "@/contexts/azioni-context"
import { dividiNome, fattoIl, GIRI, nomeGiro, prossimoDa, type Giro } from "@/lib/check"
import { AZIONE_CHECK } from "@/lib/etichette"
import { linkWhatsapp } from "@/lib/format"
import type { RigaCheck } from "@/types"

const LARGO = "(min-width: 1280px)"

/** Da questa larghezza la scheda sta accanto alla coda; sotto si apre nel pannello laterale. */
export function useLargo() {
  return useSyncExternalStore((avvisa) => {
    const media = window.matchMedia(LARGO)
    media.addEventListener("change", avvisa)
    return () => media.removeEventListener("change", avvisa)
  }, () => window.matchMedia(LARGO).matches)
}

function perche(riga: RigaCheck) {
  const c = riga.check
  if (!c) return ["Il check non è arrivato: manda il vocale."]
  const motivi = [
    c.pesoFermo ? "Il peso non è sceso rispetto all'ultimo check." : null,
    c.percezioneNegativa ? "Non nota miglioramenti." : null,
    c.energiaBassa ? `Energia bassa: ${c.energia} su 5.` : null,
  ].filter((m): m is string => m != null)
  return motivi.length ? motivi : ["Nessun segnale: basta il messaggio motivazionale."]
}

/** Le risposte del paziente e il passo successivo: sempre lo stesso gesto, un paziente dopo l'altro. */
export function SchedaCheck({ riga, coda, giro, testata, onContatto, onAvanti, onScegli, onChiudi }: {
  riga: RigaCheck
  coda: RigaCheck[]
  giro: Giro
  testata: ReactNode
  onContatto: (riga: RigaCheck, giro: Giro, fatto: boolean) => void
  onAvanti: (riga: RigaCheck) => void
  onScegli: (riga: RigaCheck) => void
  onChiudi: () => void
}) {
  const azioni = useAzioni()
  const whatsapp = linkWhatsapp(riga.cellulare)
  const indice = coda.findIndex((r) => r.pazienteId === riga.pazienteId)
  const fatto = !!fattoIl(riga, giro)
  const prossimo = prossimoDa(coda, riga.pazienteId, giro)
  const motivi = perche(riga)

  return (
    <div className="ck-scheda">
      {testata}

      <div className="ck-perche" data-azione={riga.azione}>
        {motivi.map((m) => <p key={m}>{m}</p>)}
      </div>

      <div className="ck-gesti">
        {whatsapp ? (
          <Button asChild>
            <a href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle aria-hidden />Scrivi su WhatsApp</a>
          </Button>
        ) : <p className="ck-senza-cellulare">Nessun cellulare in anagrafica</p>}
        <SpunteContatto riga={riga} giro={giro} onContatto={onContatto} />
      </div>

      {riga.check ? <div className="ck-risposte"><RisposteCheck check={riga.check} /></div> : <Vuoto titolo="Check non compilato" descrizione="Manda il vocale del lunedì." />}
      {riga.nota ? <p className="text-sm">{riga.nota}</p> : null}

      <div className="flex flex-wrap gap-2">
        {riga.check ? null : <Button size="sm" variant="outline" onClick={() => azioni.inserisciCheck(riga.pazienteId)}><ClipboardPlus aria-hidden />Inserisci check</Button>}
        <Button size="sm" variant="outline" onClick={() => {
          azioni.apriPaziente(riga.pazienteId)
          onChiudi()
        }}><UserRound aria-hidden />Apri la scheda del paziente</Button>
      </div>

      <div className="ck-avanti">
        <Button variant="outline" size="icon" aria-label="Paziente precedente" disabled={indice <= 0} onClick={() => onScegli(coda[indice - 1])}><ChevronLeft /></Button>
        <span aria-live="polite">{indice >= 0 ? `${indice + 1} di ${coda.length}` : "Fuori dalla coda"}</span>
        <Button variant="outline" size="icon" aria-label="Paziente successivo" disabled={indice < 0 || indice >= coda.length - 1} onClick={() => onScegli(coda[indice + 1])}><ChevronRight /></Button>
        <button type="button" className="ck-avanti-cta" onClick={() => onAvanti(riga)}>
          {fatto ? (prossimo ? "Vai al prossimo" : "Chiudi il giro") : prossimo ? "Contattato, avanti" : "Contattato, chiudi il giro"}
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}

export function TestataFocus({ riga }: { riga: RigaCheck }) {
  const { primo, resto } = dividiNome(riga.pazienteNome)
  return (
    <header className="ck-focus-testa">
      <LuxAvatar first={primo} second={resto} />
      <span>
        <strong>{riga.pazienteNome}</strong>
        <small>{riga.situazione ?? AZIONE_CHECK[riga.azione].testo}</small>
      </span>
      <Chip tono={AZIONE_CHECK[riga.azione].tono}>{AZIONE_CHECK[riga.azione].testo}</Chip>
    </header>
  )
}

/** Quando nessun paziente è aperto: da dove partire, o il giro finito. Aprire un check lo segna come letto, quindi parte solo con un clic. */
export function FocusVuoto({ righe, coda, giro, onScegli, onGiro }: {
  righe: RigaCheck[]
  coda: RigaCheck[]
  giro: Giro
  onScegli: (riga: RigaCheck) => void
  onGiro: (giro: Giro) => void
}) {
  const prossimo = prossimoDa(coda, null, giro)
  const finito = righe.length > 0 && righe.every((r) => fattoIl(r, giro))
  const altro = GIRI.find((g) => g.giro !== giro)!

  if (finito) {
    const altroAperto = righe.some((r) => !fattoIl(r, altro.giro))
    return (
      <div className="ck-focus-vuoto" data-finito="">
        <PartyPopper aria-hidden />
        <strong>Giro {nomeGiro(giro).del} completato</strong>
        <p>{righe.length === 1 ? "Hai contattato l'unico paziente della lista." : `Hai contattato tutti e ${righe.length} i pazienti.`}</p>
        {altroAperto ? <Button variant="outline" onClick={() => onGiro(altro.giro)}>Passa al giro {altro.del}</Button> : null}
      </div>
    )
  }
  return (
    <div className="ck-focus-vuoto">
      <CalendarCheck aria-hidden />
      <strong>{prossimo ? `Inizia da ${prossimo.pazienteNome}` : "Nessun paziente da contattare"}</strong>
      <p>{prossimo ? "Leggi il check, scrivi il messaggio e passa al prossimo: la coda tiene il segno." : "Cambia i filtri della coda per vedere gli altri pazienti."}</p>
      {prossimo ? <Button onClick={() => onScegli(prossimo)}>Inizia il giro {nomeGiro(giro).del}</Button> : null}
    </div>
  )
}
