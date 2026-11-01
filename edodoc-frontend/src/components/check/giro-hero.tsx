import { format, parseISO } from "date-fns"
import { it } from "date-fns/locale"
import { AlertTriangle, ArrowRight, BellRing, Check, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardPlus, Phone, Sparkles, type LucideIcon } from "lucide-react"
import { LuxHero, LuxKpi } from "@/components/lux"
import { Cta } from "@/components/pagina"
import { useAzioni } from "@/contexts/azioni-context"
import { useConteggio } from "@/hooks/use-conteggio"
import { contati, corsie, fattoIl, fraseGiro, GIRI, inizialiDi, nomeGiro, prossimoDa, type Giro, type Momento } from "@/lib/check"
import type { RigaCheck, SettimanaCheck } from "@/types"

const ICONA_CORSIA: Record<string, LucideIcon> = { MESSAGGIO_DEDICATO: AlertTriangle, SOLLECITO: BellRing, MESSAGGIO_STANDARD: Sparkles }
export const iconaCorsia = (azione: string) => ICONA_CORSIA[azione]

const MOMENTO: Record<Momento, string> = { passata: "conclusa", "in-arrivo": "in arrivo", "in-corso": "in corso", futura: "non ancora iniziata" }

export function GiroHero({ dati, righe, coda, giro, scelto, momento, onGiro, onScegli, onSposta, onOggi }: {
  dati: SettimanaCheck
  /** Tutte le righe della settimana, con i contatti aggiornati. */
  righe: RigaCheck[]
  coda: RigaCheck[]
  giro: Giro
  scelto: number | null
  momento: Momento
  onGiro: (giro: Giro) => void
  onScegli: (riga: RigaCheck) => void
  onSposta: (settimane: number) => void
  onOggi: () => void
}) {
  const azioni = useAzioni()
  const fatti = contati(righe, giro)
  const mostrato = Math.round(useConteggio(fatti, 600))
  const prossimo = prossimoDa(coda, scelto, giro)
  const finito = righe.length > 0 && fatti === righe.length
  const altro = GIRI.find((g) => g.giro !== giro)!
  const inizio = parseISO(dati.settimana)
  const daLeggere = righe.filter((r) => r.check && !r.check.lettoIl).length

  return (
    <LuxHero ariaLabel="Check settimanale" eyebrow={`Settimana del ${format(inizio, "d MMMM", { locale: it })} · ${MOMENTO[momento]}`} title="Check settimanale" subtitle={fraseGiro(righe, giro, momento)}
      actions={(
        <>
          <div className="ck-settimana" role="group" aria-label="Settimana">
            <button type="button" aria-label="Settimana precedente" onClick={() => onSposta(-1)}><ChevronLeft className="size-4" aria-hidden /></button>
            <span aria-live="polite">{format(inizio, "d MMM", { locale: it })}</span>
            <button type="button" aria-label="Settimana successiva" onClick={() => onSposta(1)}><ChevronRight className="size-4" aria-hidden /></button>
          </div>
          <Cta icona={ClipboardPlus} onClick={() => azioni.inserisciCheck()}>Inserisci check</Cta>
        </>
      )}>
      <div className="ck-plancia">
        <div className="ck-avanzamento">
          <div className="ck-giri" role="group" aria-label="Giro di contatti">
            {GIRI.map((g) => (
              <button key={g.giro} type="button" aria-pressed={g.giro === giro} onClick={() => onGiro(g.giro)}>
                {g.nome}<small>{contati(righe, g.giro)}/{righe.length}</small>
              </button>
            ))}
          </div>
          <p className="ck-conteggio"><strong>{mostrato}</strong><span>/{righe.length}</span></p>
          <p className="ck-conteggio-etichetta">contattati nel giro {nomeGiro(giro).del}</p>
          {finito ? <p className="ck-finito"><Check className="size-4" aria-hidden />Giro completato</p>
            : prossimo ? <button type="button" className="ck-prossimo" onClick={() => onScegli(prossimo)}>Prossimo: {prossimo.pazienteNome}<ArrowRight className="size-4" aria-hidden /></button>
            : null}
          {momento === "in-corso" || momento === "in-arrivo" ? null : <button type="button" className="ck-torna" onClick={onOggi}>Torna a questa settimana</button>}
        </div>

        <div className="ck-nastro" role="list" aria-label="Avanzamento per tipo di messaggio">
          {corsie(righe, giro).map((c) => {
            const Icona = ICONA_CORSIA[c.azione]
            return (
              <div key={c.azione} role="listitem" className="ck-corsia" data-azione={c.azione}>
                <p className="ck-corsia-testa">
                  <i aria-hidden><Icona /></i>
                  <strong>{c.titolo}</strong>
                  <span>{c.fatti}/{c.voci.length}</span>
                </p>
                {c.voci.length === 0 ? <p className="ck-corsia-vuota">Nessuno questa settimana</p> : (
                  <div className="ck-gettoni">
                    {c.voci.map((r, i) => {
                      const fatto = !!fattoIl(r, giro)
                      return (
                        <button key={r.pazienteId} type="button" className="ck-gettone" style={{ animationDelay: `${i * 30}ms` }} data-fatto={fatto ? "" : undefined} data-attivo={r.pazienteId === scelto ? "" : undefined}
                          aria-current={r.pazienteId === scelto || undefined} title={r.pazienteNome} aria-label={`${r.pazienteNome}: ${fatto ? "contattato" : "da contattare"}`} onClick={() => onScegli(r)}>
                          {fatto ? <Check aria-hidden /> : inizialiDi(r.pazienteNome)}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="vl-kpis vl-kpis--3">
        <LuxKpi icon={<ClipboardCheck className="size-4" />} label="Compilati" value={dati.compilati} unit={`/${dati.attesi}`} progress={dati.attesi ? (dati.compilati / dati.attesi) * 100 : 0}
          foot={daLeggere > 0 ? `${daLeggere} da leggere` : dati.compilati > 0 ? "Tutti letti" : undefined} />
        <LuxKpi icon={<AlertTriangle className="size-4" />} label="Messaggio dedicato" value={dati.conSegnali} foot="Peso, percezione o energia" />
        <LuxKpi icon={<Phone className="size-4" />} label="Da contattare" value={righe.length - fatti} foot={`${righe.length - contati(righe, altro.giro)} per il ${altro.nome.toLowerCase()}`} />
      </div>
    </LuxHero>
  )
}
