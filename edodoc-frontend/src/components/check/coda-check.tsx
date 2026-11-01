import { Check, MessageCircle } from "lucide-react"
import { Chip } from "@/components/chip"
import { iconaCorsia } from "@/components/check/giro-hero"
import { SpunteContatto } from "@/components/check/spunta-contatto"
import { LuxAvatar } from "@/components/lux"
import { MenuRigaCheck } from "@/components/menu-contestuali"
import { Riquadro } from "@/components/pagina"
import { Vuoto } from "@/components/stati"
import { Button } from "@/components/ui/button"
import { corsie, dividiNome, fattoIl, nomeGiro, type Filtro, type Giro } from "@/lib/check"
import { linkWhatsapp } from "@/lib/format"
import type { RigaCheck } from "@/types"

const FILTRI: Record<Filtro, string> = { TUTTI: "Tutti", SOLLECITO: "Senza check", MESSAGGIO_DEDICATO: "Con segnali" }

function Misure({ riga }: { riga: RigaCheck }) {
  const c = riga.check
  if (!c) return <small>Check non arrivato</small>
  return <small>Energia {c.energia ?? "—"} · Impegno {c.impegno ?? "—"} · {c.pesoKg != null ? `${c.pesoKg} kg` : "peso assente"}</small>
}

function Voce({ riga, giro, attiva, onScegli, onContatto }: {
  riga: RigaCheck
  giro: Giro
  attiva: boolean
  onScegli: (riga: RigaCheck) => void
  onContatto: (riga: RigaCheck, giro: Giro, fatto: boolean) => void
}) {
  const { primo, resto } = dividiNome(riga.pazienteNome)
  const whatsapp = linkWhatsapp(riga.cellulare)
  const c = riga.check
  const fatto = !!fattoIl(riga, giro)
  const daLeggere = !!c && !c.lettoIl

  return (
    <MenuRigaCheck riga={riga}>
      <li className="ck-voce" data-paziente={riga.pazienteId} data-attiva={attiva ? "" : undefined} data-fatto={fatto ? "" : undefined}>
        <button type="button" className="ck-voce-corpo" aria-current={attiva || undefined} aria-label={`Apri il check di ${riga.pazienteNome}${daLeggere ? ", da leggere" : ""}`} onClick={() => onScegli(riga)}>
          <span className="ck-voce-avatar">
            <LuxAvatar first={primo} second={resto} />
            {fatto ? <i aria-hidden><Check /></i> : null}
          </span>
          <span className="ck-voce-testo">
            <strong>{riga.pazienteNome}{daLeggere ? <em>Da leggere</em> : null}</strong>
            {c?.pesoFermo || c?.percezioneNegativa || c?.energiaBassa ? (
              <span className="ck-segnali">
                {c.pesoFermo ? <Chip tono="danger">Peso fermo</Chip> : null}
                {c.percezioneNegativa ? <Chip tono="danger">Nessun miglioramento</Chip> : null}
                {c.energiaBassa ? <Chip tono="danger">Energia bassa</Chip> : null}
              </span>
            ) : null}
            <Misure riga={riga} />
          </span>
        </button>
        <div className="ck-voce-azioni">
          <SpunteContatto riga={riga} giro={giro} onContatto={onContatto} />
          {whatsapp ? (
            <Button size="icon" variant="ghost" asChild>
              <a href={whatsapp} target="_blank" rel="noreferrer" aria-label={`WhatsApp a ${riga.pazienteNome}`}><MessageCircle /></a>
            </Button>
          ) : <span className="ck-senza-numero" title="Nessun cellulare in anagrafica">—</span>}
        </div>
      </li>
    </MenuRigaCheck>
  )
}

export function CodaCheck({ coda, giro, filtro, soloDaContattare, scelto, onFiltro, onSoloDaContattare, onScegli, onContatto }: {
  coda: RigaCheck[]
  giro: Giro
  filtro: Filtro
  soloDaContattare: boolean
  scelto: number | null
  onFiltro: (filtro: Filtro) => void
  onSoloDaContattare: (solo: boolean) => void
  onScegli: (riga: RigaCheck) => void
  onContatto: (riga: RigaCheck, giro: Giro, fatto: boolean) => void
}) {
  return (
    <Riquadro titolo="Coda di lavoro" conteggio={coda.length} descrizione="Clic per leggere le risposte, tasto destro per le azioni" className="ck-coda"
      azioni={
        <div className="ck-filtri">
          <div className="ck-segmenti" role="group" aria-label="Filtra la coda">
            {Object.entries(FILTRI).map(([k, v]) => <button key={k} type="button" aria-pressed={filtro === k} onClick={() => onFiltro(k as Filtro)}>{v}</button>)}
          </div>
          <button type="button" className="ck-solo" aria-pressed={soloDaContattare} onClick={() => onSoloDaContattare(!soloDaContattare)}>
            <i aria-hidden>{soloDaContattare ? <Check /> : null}</i>Solo da contattare
          </button>
        </div>
      }>
      {coda.length === 0 ? (
        <Vuoto titolo={soloDaContattare ? `Tutti contattati nel giro ${nomeGiro(giro).del}` : "Nessun paziente in questa lista"} />
      ) : corsie(coda, giro).filter((c) => c.voci.length > 0).map((c) => {
        const Icona = iconaCorsia(c.azione)
        return (
          <section key={c.azione} className="ck-gruppo" data-azione={c.azione} aria-label={c.titolo}>
            <header>
              <i aria-hidden><Icona /></i>
              <span><strong>{c.titolo}</strong><small>{c.spiega}</small></span>
              <b>{c.fatti}/{c.voci.length}</b>
            </header>
            <ol>
              {c.voci.map((r) => <Voce key={r.pazienteId} riga={r} giro={giro} attiva={r.pazienteId === scelto} onScegli={onScegli} onContatto={onContatto} />)}
            </ol>
          </section>
        )
      })}
    </Riquadro>
  )
}
