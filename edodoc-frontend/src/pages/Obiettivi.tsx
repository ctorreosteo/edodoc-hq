import { CalendarClock, Check, Flame, Gauge, Lock, Rocket, Sparkles, Target, TrendingUp, Trophy, Users, Wallet } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Anello } from "@/components/obiettivi/anello"
import { Curva } from "@/components/obiettivi/curva"
import { Griglia } from "@/components/obiettivi/griglia"
import { Pagina } from "@/components/pagina"
import { Caricamento, Errore } from "@/components/stati"
import { useAzioni } from "@/contexts/azioni-context"
import { useConteggio } from "@/hooks/use-conteggio"
import { useDati } from "@/hooks/use-dati"
import { useAdesso } from "@/lib/dashboard"
import { FONTE, TIPO_PERCORSO } from "@/lib/etichette"
import { dataBreve, euroTondi } from "@/lib/format"
import { MESI } from "@/lib/finance"
import { fraseObiettivo, leggiObiettivo, type LetturaObiettivo } from "@/lib/obiettivo"
import { celebra } from "@/lib/task-festa"
import { toast } from "@/lib/toast"
import { obiettiviService } from "@/services/gestionale"
import "@/style/obiettivi.css"

const CHIAVE_VISTI = "edodoc-obiettivo-visti"

function leggiVisti(chiave: string): number | null {
  try {
    const v = window.localStorage.getItem(chiave)
    return v == null ? null : Number(v)
  } catch {
    return null
  }
}

function salvaVisti(chiave: string, n: number) {
  try {
    window.localStorage.setItem(chiave, String(n))
  } catch {
    // Archivio del browser non disponibile: niente festa la prossima volta, pazienza
  }
}

function Numero({ valore, decimali = 0 }: { valore: number; decimali?: number }) {
  const v = useConteggio(valore, 1200)
  return <>{v.toLocaleString("it-IT", { maximumFractionDigits: decimali, minimumFractionDigits: decimali })}</>
}

function Dato({ icona, etichetta, valore, piede, tono }: { icona: ReactNode; etichetta: string; valore: ReactNode; piede?: ReactNode; tono?: "ok" | "warn" }) {
  return (
    <div className="ob-dato" data-tono={tono}>
      <p className="ob-dato-etichetta">{icona}{etichetta}</p>
      <p className="ob-dato-valore">{valore}</p>
      {piede ? <p className="ob-dato-piede">{piede}</p> : null}
    </div>
  )
}

function Scheda({ titolo, icona, extra, children, className }: { titolo: string; icona: ReactNode; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`ob-scheda ${className ?? ""}`} aria-label={titolo}>
      <header className="ob-scheda-testa">
        <h2>{icona}{titolo}</h2>
        {extra}
      </header>
      {children}
    </section>
  )
}

/** Conto alla rovescia al secondo fino al via. */
function ContoAllaRovescia({ verso }: { verso: Date }) {
  const [ora, setOra] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setOra(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const resto = Math.max(0, verso.getTime() - ora)
  const parti = [
    { n: Math.floor(resto / 86400000), u: "giorni" },
    { n: Math.floor(resto / 3600000) % 24, u: "ore" },
    { n: Math.floor(resto / 60000) % 60, u: "minuti" },
    { n: Math.floor(resto / 1000) % 60, u: "secondi" },
  ]
  return (
    <div className="ob-rovescia" role="timer" aria-label={`Mancano ${parti[0].n} giorni al via`}>
      {parti.map((p) => (
        <div key={p.u} className="ob-rovescia-parte">
          <span>{String(p.n).padStart(2, "0")}</span>
          <small>{p.u}</small>
        </div>
      ))}
    </div>
  )
}

/** Tempo trascorso contro obiettivo raggiunto: se la barra arancione sta davanti, sei avanti. */
function Binari({ o }: { o: LetturaObiettivo }) {
  return (
    <div className="ob-binari">
      <div className="ob-binario" data-serie="obiettivo">
        <p><span>Obiettivo</span><b>{o.percentuale.toFixed(1)}%</b></p>
        <div className="ob-binario-pista"><span style={{ width: `${o.percentuale}%` }} /></div>
      </div>
      <div className="ob-binario" data-serie="tempo">
        <p><span>Anno trascorso</span><b>{o.percentualeTempo.toFixed(1)}%</b></p>
        <div className="ob-binario-pista"><span style={{ width: `${o.percentualeTempo}%` }} /></div>
      </div>
    </div>
  )
}

function Hero({ o, pronti, anelloRef }: { o: LetturaObiettivo; pronti: number; anelloRef: React.RefObject<HTMLDivElement | null> }) {
  const frase = fraseObiettivo(o)
  const attesa = o.fase === "attesa"
  const deltaPrecedente = o.fatti - o.precedenteAllaData

  return (
    <section className="ob-hero" aria-label={`Obiettivo ${o.anno}`} data-fase={o.fase}>
      <div className="ob-hero-luce" aria-hidden />
      <div className="ob-hero-luce" data-seconda="" aria-hidden />
      <div className="ob-hero-trama" aria-hidden />

      <div className="ob-hero-corpo">
        <div className="ob-hero-anello" ref={anelloRef}>
          <Anello fatti={o.fatti} target={o.target} atteso={o.fase === "corsa" ? o.atteso : null} anno={o.anno}
            sottotitolo={attesa ? `già per il ${o.anno}` : undefined} />
        </div>

        <div className="ob-hero-testo">
          <p className="ob-eyebrow"><span className="ob-punto" aria-hidden />Obiettivo {o.anno}</p>
          <h1 className="ob-titolo">{o.target} clienti<br /><span>che scelgono un percorso</span></h1>
          <p className="ob-stato" data-tono={frase.tono}>{frase.titolo}</p>
          <p className="ob-stato-testo">{frase.testo}</p>
          {attesa ? <ContoAllaRovescia verso={o.inizio} /> : <Binari o={o} />}
        </div>
      </div>

      <div className="ob-dati">
        {attesa ? (
          <>
            <Dato icona={<Gauge aria-hidden />} etichetta="Passo da tenere" valore={<>{Math.ceil(o.target / 52)}<small>/sett</small></>} piede={`${Math.ceil(o.target / 12)} al mese, uno ogni ${(365 / o.target).toFixed(1).replace(".", ",")} giorni`} />
            <Dato icona={<TrendingUp aria-hidden />} etichetta={`Il ${o.anno - 1} finora`} valore={<Numero valore={o.precedenteAllaData} />} piede={`ritmo da ${o.proiezioneCorrente} l'anno`} />
            <Dato icona={<Rocket aria-hidden />} etichetta="Salto da fare" valore={o.moltiplicatore ? <>×<Numero valore={o.moltiplicatore} decimali={1} /></> : "—"} piede={`rispetto al ritmo del ${o.anno - 1}`} />
            <Dato icona={<Users aria-hidden />} etichetta="Pronti a partire" valore={<Numero valore={pronti} />} piede="tra lead e lista d'attesa" />
          </>
        ) : (
          <>
            <Dato icona={<Target aria-hidden />} etichetta="Mancano" valore={<Numero valore={o.mancanti} />} piede={o.fase === "corsa" ? `${o.giorniRimasti} giorni per farcela` : "a fine anno"} />
            <Dato icona={<Gauge aria-hidden />} etichetta="Ritmo che serve" valore={<><Numero valore={o.ritmoSettimana} decimali={1} /><small>/sett</small></>} piede={`${Math.ceil(o.ritmoMese)} al mese da qui a dicembre`} />
            <Dato icona={<TrendingUp aria-hidden />} etichetta="Proiezione" valore={o.proiezione != null ? <Numero valore={o.proiezione} /> : "—"}
              piede={o.proiezione != null ? (o.proiezione >= o.target ? "ce la fai a questo passo" : `${o.target - o.proiezione} sotto il ${o.target}`) : "dopo le prime due settimane"}
              tono={o.proiezione != null ? (o.proiezione >= o.target ? "ok" : "warn") : undefined} />
            <Dato icona={<CalendarClock aria-hidden />} etichetta={`Contro il ${o.anno - 1}`} valore={<>{deltaPrecedente >= 0 ? "+" : "−"}<Numero valore={Math.abs(deltaPrecedente)} /></>}
              piede={`${o.precedenteAllaData} alla stessa data`} tono={deltaPrecedente >= 0 ? "ok" : "warn"} />
          </>
        )}
      </div>
    </section>
  )
}

function Settimana({ o }: { o: LetturaObiettivo }) {
  const segmenti = Math.max(o.obiettivoSettimana, o.dellaSettimana)
  const centrata = o.dellaSettimana >= o.obiettivoSettimana
  const delMeseServe = Math.ceil(o.ritmoMese)
  return (
    <Scheda titolo="Questa settimana" icona={<Flame aria-hidden />} className="ob-settimana"
      extra={o.serie > 0 ? <span className="ob-serie" title="Settimane consecutive sopra il passo base"><Flame aria-hidden />{o.serie} di fila</span> : null}>
      <p className="ob-grande">{o.dellaSettimana}<small> su {o.obiettivoSettimana}</small></p>
      <div className="ob-segmenti" role="progressbar" aria-label="Clienti della settimana" aria-valuemin={0} aria-valuemax={o.obiettivoSettimana} aria-valuenow={o.dellaSettimana}>
        {Array.from({ length: segmenti }, (_, i) => <span key={i} data-pieno={i < o.dellaSettimana ? "" : undefined} style={{ "--i": i } as React.CSSProperties} />)}
      </div>
      <p className="ob-nota">{centrata ? "Settimana centrata. Ogni cliente in più accorcia la strada." : `Ne mancano ${o.obiettivoSettimana - o.dellaSettimana} per chiudere la settimana sul ritmo.`}</p>

      <div className="ob-separatore" />

      <p className="ob-etichetta">{MESI[new Date().getMonth()]}</p>
      <p className="ob-medio">{o.delMese}<small> su {delMeseServe}</small></p>
      <div className="ob-barra"><span style={{ width: `${Math.min(100, (o.delMese / Math.max(1, delMeseServe)) * 100)}%` }} /></div>
      <p className="ob-nota">{o.giorniFineMese} giorni alla fine del mese{o.meseRecord.clienti > 0 ? ` · record: ${MESI[o.meseRecord.mese].toLowerCase()} con ${o.meseRecord.clienti}` : ""}</p>
    </Scheda>
  )
}

function Riscaldamento({ o, lead, attesa }: { o: LetturaObiettivo; lead: number; attesa: number }) {
  return (
    <Scheda titolo="Riscaldamento" icona={<Sparkles aria-hidden />} className="ob-settimana">
      <p className="ob-etichetta">Il {o.anno - 1} finora</p>
      <p className="ob-grande">{o.precedenteAllaData}<small> clienti</small></p>
      <p className="ob-nota">Al ritmo di oggi il {o.anno - 1} chiude a circa {o.proiezioneCorrente}. Il {o.anno} chiede {o.target}{o.moltiplicatore ? `: ${o.moltiplicatore.toFixed(1).replace(".", ",")} volte tanto` : ""}.</p>
      <div className="ob-separatore" />
      <p className="ob-etichetta">Pronti a partire</p>
      <div className="ob-carburante">
        <div><b>{lead}</b><span>lead da convertire</span></div>
        <div><b>{attesa}</b><span>in lista d'attesa</span></div>
      </div>
      <p className="ob-nota">Chi compra un percorso con inizio nel {o.anno} conta già adesso.</p>
    </Scheda>
  )
}

function Traguardi({ o }: { o: LetturaObiettivo }) {
  return (
    <Scheda titolo="Traguardi" icona={<Trophy aria-hidden />} extra={<span className="ob-conta">{o.traguardi.filter((t) => t.raggiunto).length}/{o.traguardi.length}</span>}>
      <ol className="ob-traguardi">
        {o.traguardi.map((t) => {
          const prossimo = o.prossimo?.n === t.n
          return (
            <li key={t.n} data-stato={t.raggiunto ? "fatto" : prossimo ? "prossimo" : "chiuso"}>
              <span className="ob-traguardo-icona" aria-hidden>{t.raggiunto ? <Check /> : prossimo ? <Target /> : <Lock />}</span>
              <span className="ob-traguardo-n">{t.n}</span>
              <span className="ob-traguardo-nome">{t.nome}</span>
              <span className="ob-traguardo-nota">
                {t.raggiunto && t.data ? dataBreve(t.data) : prossimo ? `ne mancano ${t.n - o.fatti}` : ""}
              </span>
              {prossimo ? <span className="ob-traguardo-barra" aria-hidden><span style={{ width: `${(o.fatti / t.n) * 100}%` }} /></span> : null}
            </li>
          )
        })}
      </ol>
    </Scheda>
  )
}

function Ultime({ o }: { o: LetturaObiettivo }) {
  const azioni = useAzioni()
  return (
    <Scheda titolo="Ultimi arrivati" icona={<Users aria-hidden />} extra={<span className="ob-conta">{o.fatti}</span>}>
      {o.ultime.length ? (
        <ul className="ob-ultime">
          {o.ultime.map((c, i) => (
            <li key={c.pazienteId} style={{ "--i": i } as React.CSSProperties}>
              <span className="ob-avatar" aria-hidden>{c.nome.split(" ").map((p) => p.charAt(0)).slice(0, 2).join("")}</span>
              <span className="ob-ultime-testo">
                <button type="button" onClick={() => azioni.apriPaziente(c.pazienteId)}>{c.nome}</button>
                <small>{TIPO_PERCORSO[c.tipo] ?? c.tipo}{c.fonte ? ` · ${FONTE[c.fonte] ?? c.fonte}` : ""}</small>
              </span>
              <span className="ob-ultime-data">
                <b>#{o.fatti - i}</b>
                <small>{dataBreve(c.data)}</small>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ob-vuoto">Il primo nome di questa lista sarà il prossimo cliente che sceglie un percorso con inizio nel {o.anno}.</p>
      )}
    </Scheda>
  )
}

function Fonti({ o }: { o: LetturaObiettivo }) {
  const massimo = o.fonti[0]?.[1] ?? 0
  const medio = o.fatti ? o.ricavo / o.fatti : 0
  return (
    <Scheda titolo="Da dove arrivano" icona={<Wallet aria-hidden />}>
      {o.fonti.length ? (
        <ul className="ob-fonti">
          {o.fonti.map(([fonte, n]) => (
            <li key={fonte}>
              <span className="ob-fonti-nome">{FONTE[fonte] ?? "Non indicata"}</span>
              <span className="ob-fonti-barra"><span style={{ width: `${(n / massimo) * 100}%` }} /></span>
              <b>{n}</b>
            </li>
          ))}
        </ul>
      ) : <p className="ob-vuoto">Qui vedrai quali canali portano più clienti: YouTube, Instagram, passaparola…</p>}
      <div className="ob-separatore" />
      <div className="ob-carburante">
        <div><b>{euroTondi(o.ricavo)}</b><span>valore dei percorsi</span></div>
        <div><b>{euroTondi(medio)}</b><span>per cliente</span></div>
      </div>
    </Scheda>
  )
}

export default function Obiettivi() {
  const adesso = useAdesso()
  const { dati, errore, riprova } = useDati(obiettiviService.carica, [])
  const anelloRef = useRef<HTMLDivElement>(null)

  // Festa quando dall'ultima visita sono arrivati clienti nuovi
  const fatti = dati?.conquiste.length
  const anno = dati?.anno
  useEffect(() => {
    if (fatti == null || anno == null) return
    const chiave = `${CHIAVE_VISTI}-${anno}`
    const visti = leggiVisti(chiave)
    salvaVisti(chiave, fatti)
    if (visti == null || fatti <= visti) return
    const nuovi = fatti - visti
    const t = window.setTimeout(() => {
      celebra(anelloRef.current, 46)
      toast.success(nuovi === 1 ? "Un nuovo cliente dall'ultima volta!" : `${nuovi} nuovi clienti dall'ultima volta!`, { description: `Siete a ${fatti} su ${dati?.target}. Avanti così.` })
    }, 900)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fatti, anno])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const o = leggiObiettivo(dati, adesso)

  return (
    <Pagina>
      <div className="ob-pagina">
        <Hero o={o} pronti={dati.lead + dati.listaAttesa} anelloRef={anelloRef} />

        <Scheda titolo={`I ${o.target}`} icona={<Sparkles aria-hidden />} className="ob-scheda-griglia"
          extra={<span className="ob-sottotitolo">Ogni pallino è una persona che ha scelto di cambiare. Accendili tutti.</span>}>
          <Griglia conquiste={dati.conquiste} target={o.target} atteso={o.fase === "corsa" ? o.atteso : 0} />
        </Scheda>

        <div className="ob-riga" data-due="">
          <Scheda titolo="La corsa" icona={<TrendingUp aria-hidden />}
            extra={<span className="ob-sottotitolo">Clienti cumulati, settimana per settimana</span>}>
            <Curva o={o} />
          </Scheda>
          {o.fase === "attesa" ? <Riscaldamento o={o} lead={dati.lead} attesa={dati.listaAttesa} /> : <Settimana o={o} />}
        </div>

        <div className="ob-riga" data-tre="">
          <Traguardi o={o} />
          <Ultime o={o} />
          <Fonti o={o} />
        </div>
      </div>
    </Pagina>
  )
}
