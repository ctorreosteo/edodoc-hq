import { ArrowDown, ArrowLeft, ArrowUp, Eye, EyeOff, FileText, GripVertical, Pencil, Plus, Trash2, Video } from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Link, Navigate, useNavigate, useParams } from "react-router-dom"
import { CorsoFlusso, CosaManca } from "@/components/corsi/corso-flusso"
import { StatoLezione } from "@/components/corsi/corso-ui"
import { CorsoDialog } from "@/components/forms/corso-dialog"
import { LezioneDialog } from "@/components/forms/lezione-dialog"
import { ModuloDialog } from "@/components/forms/modulo-dialog"
import { LuxHero } from "@/components/lux"
import { Pagina, Riquadro } from "@/components/pagina"
import { Caricamento, Errore, Vuoto } from "@/components/stati"
import { Button } from "@/components/ui/button"
import { useAzioni } from "@/contexts/azioni-context"
import { useDati } from "@/hooks/use-dati"
import { useRiordino } from "@/hooks/use-riordino"
import { contiLezioni, faseCorso } from "@/lib/corsi"
import { durata } from "@/lib/format"
import { toast, toastErrore } from "@/lib/toast"
import { corsiService } from "@/services/gestionale"
import type { ModuloConLezioni, RigaLezione, RigaModulo, TipoLezione } from "@/types"
import "@/style/corsi.css"
import "@/style/corsi-hq.css"

const POLLING_MS = 5000

type FinestraLezione = { moduloId: number; tipo: TipoLezione; lezione?: RigaLezione }

function Icona({ etichetta, onClick, disabled, children }: { etichetta: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label={etichetta} title={etichetta} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  )
}

function RigaDiLezione({ lezione, numero, totale, trascina, sposta, onApri }: {
  lezione: RigaLezione
  numero: number
  totale: number
  trascina: object
  sposta: (delta: -1 | 1) => void
  onApri: () => void
}) {
  const azioni = useAzioni()
  const pubblica = async () => {
    try {
      await corsiService.pubblicaLezione(lezione.id, !lezione.pubblicata)
      azioni.aggiorna()
    } catch (e) {
      toastErrore(e)
    }
  }
  const elimina = () => azioni.conferma({
    titolo: "Eliminare la lezione?",
    descrizione: `"${lezione.titolo}" e il suo contenuto spariscono per sempre, anche dall'app dei pazienti.`,
    etichetta: "Elimina",
    azione: async () => {
      await corsiService.eliminaLezione(lezione.id)
      toast.success("Lezione eliminata")
      azioni.aggiorna()
    },
  })
  const TipoIcona = lezione.tipo === "VIDEO" ? Video : FileText
  return (
    <li {...trascina} className="cs-lezione">
      <GripVertical className="cs-maniglia hidden sm:block" aria-hidden />
      <button type="button" className="cs-lezione-apri" onClick={onApri}>
        <span className="cs-lezione-tipo"><TipoIcona aria-hidden /></span>
        <span className="cs-lezione-testo">
          <span className="cs-lezione-titolo">{lezione.titolo}</span>
          <span className="cs-lezione-meta">{lezione.tipo === "VIDEO" ? "Video" : "Testo"}{lezione.durataSecondi ? ` · ${durata(lezione.durataSecondi)}` : ""}</span>
        </span>
      </button>
      <StatoLezione lezione={lezione} />
      <div className="cs-lezione-azioni">
        <Icona etichetta={lezione.pubblicata ? "Riporta in bozza" : "Pubblica"} onClick={() => void pubblica()} disabled={!lezione.completa && !lezione.pubblicata}>
          {lezione.pubblicata ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </Icona>
        <Icona etichetta="Sposta su" onClick={() => sposta(-1)} disabled={numero === 1}><ArrowUp aria-hidden /></Icona>
        <Icona etichetta="Sposta giù" onClick={() => sposta(1)} disabled={numero === totale}><ArrowDown aria-hidden /></Icona>
        <Icona etichetta="Elimina lezione" onClick={elimina}><Trash2 aria-hidden /></Icona>
      </div>
    </li>
  )
}

function SchedaModulo({ voce, numero, totale, trascina, sposta, onModifica, onLezione }: {
  voce: ModuloConLezioni
  numero: number
  totale: number
  trascina: object
  sposta: (delta: -1 | 1) => void
  onModifica: () => void
  onLezione: (finestra: Omit<FinestraLezione, "moduloId">) => void
}) {
  const azioni = useAzioni()
  const { modulo, lezioni } = voce
  const riordino = useRiordino(lezioni, async (ids) => {
    await corsiService.riordinaLezioni(modulo.id, ids)
    azioni.aggiorna()
  })
  const elimina = () => azioni.conferma({
    titolo: "Eliminare il modulo?",
    descrizione: lezioni.length
      ? `"${modulo.titolo}" e le sue ${lezioni.length} lezioni spariscono per sempre, video compresi.`
      : `"${modulo.titolo}" sparisce per sempre.`,
    etichetta: "Elimina",
    azione: async () => {
      await corsiService.eliminaModulo(modulo.id)
      toast.success("Modulo eliminato")
      azioni.aggiorna()
    },
  })
  const pubblicate = contiLezioni(lezioni).pubblicate
  return (
    <section {...trascina} className="cs-modulo">
      <header className="cs-modulo-testa">
        <GripVertical className="cs-maniglia hidden sm:block" aria-hidden />
        <span className="cs-numero" aria-hidden>{numero}</span>
        <div className="cs-modulo-nome">
          <h2>{modulo.titolo}</h2>
          <p>{lezioni.length > 0 ? `${pubblicate} su ${lezioni.length} pubblicate` : "Nessuna lezione"}{modulo.descrizione ? ` · ${modulo.descrizione}` : ""}</p>
        </div>
        <div className="cs-modulo-azioni">
          <Icona etichetta="Sposta su" onClick={() => sposta(-1)} disabled={numero === 1}><ArrowUp aria-hidden /></Icona>
          <Icona etichetta="Sposta giù" onClick={() => sposta(1)} disabled={numero === totale}><ArrowDown aria-hidden /></Icona>
          <Icona etichetta="Modifica modulo" onClick={onModifica}><Pencil aria-hidden /></Icona>
          <Icona etichetta="Elimina modulo" onClick={elimina}><Trash2 aria-hidden /></Icona>
        </div>
      </header>
      {riordino.lista.length > 0 ? (
        <ol className="cs-lezioni">
          {riordino.lista.map((l, i) => (
            <RigaDiLezione key={l.id} lezione={l} numero={i + 1} totale={riordino.lista.length} trascina={riordino.trascina(l.id)}
              sposta={(delta) => riordino.sposta(l.id, delta)} onApri={() => onLezione({ tipo: l.tipo, lezione: l })} />
          ))}
        </ol>
      ) : null}
      <div className="cs-modulo-aggiungi">
        <Button type="button" variant="outline" size="sm" onClick={() => onLezione({ tipo: "VIDEO" })}><Video aria-hidden />Aggiungi video</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onLezione({ tipo: "TESTO" })}><FileText aria-hidden />Aggiungi testo</Button>
      </div>
    </section>
  )
}

function Costruttore({ corsoId }: { corsoId: number }) {
  const navigate = useNavigate()
  const azioni = useAzioni()
  const { aggiorna } = azioni
  const { dati, errore, riprova } = useDati(() => corsiService.struttura(corsoId), [corsoId])
  const [modificaCorso, setModificaCorso] = useState(false)
  const [finestraModulo, setFinestraModulo] = useState<{ modulo?: RigaModulo } | null>(null)
  const [finestraLezione, setFinestraLezione] = useState<FinestraLezione | null>(null)

  const elementi = useMemo(() => (dati?.moduli ?? []).map((m) => ({ id: m.modulo.id, voce: m })), [dati])
  const riordino = useRiordino(elementi, async (ids) => {
    await corsiService.riordinaModuli(corsoId, ids)
    azioni.aggiorna()
  })

  // Video in elaborazione su Cloudflare: la lista si aggiorna da sola, tranne quando ci pensa la finestra aperta
  const inElaborazione = useMemo(
    () => (dati?.moduli ?? []).flatMap((m) => m.lezioni).filter((l) => l.videoStato === "ELABORAZIONE").map((l) => l.id).join(),
    [dati],
  )
  const finestraAperta = finestraLezione != null
  useEffect(() => {
    if (!inElaborazione || finestraAperta) return
    const giro = window.setInterval(() => {
      Promise.all(inElaborazione.split(",").map((id) => corsiService.sincronizzaVideo(Number(id))))
        .then(aggiorna)
        // Si riprova al giro dopo
        .catch(() => undefined)
    }, POLLING_MS)
    return () => window.clearInterval(giro)
  }, [inElaborazione, finestraAperta, aggiorna])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const { corso } = dati
  const conti = contiLezioni(dati.moduli.flatMap((m) => m.lezioni))
  const fase = faseCorso(corso, conti)
  const bloccato = !corso.pubblicato && conti.pubblicate === 0
  const CtaIcona = corso.pubblicato ? EyeOff : Eye
  const pubblica = async () => {
    try {
      await corsiService.pubblica(corso.id, !corso.pubblicato)
      toast.success(corso.pubblicato ? "Corso riportato in bozza" : "Corso pubblicato")
      azioni.aggiorna()
    } catch (e) {
      toastErrore(e)
    }
  }
  const elimina = () => azioni.conferma({
    titolo: "Eliminare il corso?",
    descrizione: `"${corso.titolo}" sparisce per sempre con tutti i moduli, le lezioni e i video.`,
    etichetta: "Elimina",
    azione: async () => {
      await corsiService.elimina(corso.id)
      toast.success("Corso eliminato")
      navigate("/corsi")
    },
  })

  return (
    <Pagina>
      <div className="cs-pagina">
        <Link to="/corsi" className="cs-torna"><ArrowLeft className="size-4" aria-hidden />Tutti i corsi</Link>

        <LuxHero ariaLabel="Corso" eyebrow={corso.pubblicato ? "Pubblicato: visibile nell'app" : "Bozza: i pazienti non lo vedono"} title={corso.titolo}
          subtitle={corso.descrizione ?? "Aggiungi una descrizione per dire cosa impara il paziente"}
          actions={
            <>
              <button type="button" className="vl-ghost-btn" onClick={() => setModificaCorso(true)}><Pencil /><span>Modifica</span></button>
              <button type="button" className="vl-ghost-btn" onClick={elimina}><Trash2 /><span>Elimina</span></button>
              <button type="button" className="vl-cta cs-cta" disabled={bloccato} title={bloccato ? "Serve almeno una lezione pubblicata" : undefined} onClick={() => void pubblica()}>
                <span className="vl-cta-icon" aria-hidden><CtaIcona className="size-4" /></span>
                <span className="vl-cta-label">{corso.pubblicato ? "Riporta in bozza" : "Pubblica corso"}</span>
              </button>
            </>
          }>
          <CorsoFlusso corso={corso} conti={conti} fase={fase} onCopertina={() => setModificaCorso(true)} />
        </LuxHero>

        <div className="cs-corpo" data-pieno={conti.totali === 0 ? "" : undefined}>
          <Riquadro titolo="Moduli e lezioni" conteggio={corso.moduli} descrizione="Trascina per cambiare l'ordine. Ogni lezione si pubblica da sola: l'occhio la mostra ai pazienti"
            azioni={<Button variant="outline" size="sm" onClick={() => setFinestraModulo({})}><Plus aria-hidden />Nuovo modulo</Button>}>
            {riordino.lista.length === 0 ? <Vuoto titolo="Ancora nessun modulo" descrizione="Crea il primo modulo, poi aggiungi video e lezioni scritte" /> : (
              <div className="cs-moduli">
                {riordino.lista.map(({ id, voce }, i) => (
                  <SchedaModulo key={id} voce={voce} numero={i + 1} totale={riordino.lista.length} trascina={riordino.trascina(id)}
                    sposta={(delta) => riordino.sposta(id, delta)} onModifica={() => setFinestraModulo({ modulo: voce.modulo })}
                    onLezione={(f) => setFinestraLezione({ ...f, moduloId: id })} />
                ))}
              </div>
            )}
          </Riquadro>
          {conti.totali > 0 ? (
            <CosaManca corso={corso} moduli={dati.moduli} conti={conti} onLezione={(moduloId, lezione) => setFinestraLezione({ moduloId, tipo: lezione.tipo, lezione })} />
          ) : null}
        </div>
      </div>

      <CorsoDialog open={modificaCorso} onOpenChange={setModificaCorso} corso={corso} onSalvato={azioni.aggiorna} />
      <ModuloDialog open={finestraModulo != null} onOpenChange={(a) => !a && setFinestraModulo(null)} corsoId={corso.id} modulo={finestraModulo?.modulo} />
      {finestraLezione ? (
        <LezioneDialog open onOpenChange={(a) => !a && setFinestraLezione(null)} moduloId={finestraLezione.moduloId} tipo={finestraLezione.tipo} lezione={finestraLezione.lezione} />
      ) : null}
    </Pagina>
  )
}

export default function Corso() {
  const { id } = useParams()
  const corsoId = Number(id)
  if (!Number.isInteger(corsoId)) return <Navigate to="/corsi" replace />
  return <Costruttore key={corsoId} corsoId={corsoId} />
}
