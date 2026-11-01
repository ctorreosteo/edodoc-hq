import { Eye, PencilLine, TriangleAlert } from "lucide-react"
import { Chip } from "@/components/chip"
import { semeTitolo, type FaseCorso } from "@/lib/corsi"
import { urlCopertina } from "@/services/gestionale"
import type { RigaLezione } from "@/types"

const TINTE = 4

/** Onde generate dal titolo: ogni corso senza copertina ha un motivo suo, sempre lo stesso. */
function Motivo({ seme }: { seme: number }) {
  const onde = Array.from({ length: 9 }, (_, i) => {
    const y = 22 + i * 21
    const a = 14 + ((seme >> (i % 7)) % 4) * 7
    const fase = ((seme + i * 37) % 90) - 45
    return `M-20 ${y} C ${70 + fase} ${y - a}, ${150 - fase} ${y + a}, 230 ${y} S ${310 + fase} ${y - a}, 350 ${y + a / 2}`
  })
  const cx = 70 + (seme % 200)
  const cy = 30 + (seme % 70)
  return (
    <svg className="cs-motivo" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <circle cx={cx} cy={cy} r={46} className="cs-motivo-sole" />
      {onde.map((d, i) => <path key={i} d={d} style={{ opacity: 0.1 + (i % 4) * 0.06 }} />)}
    </svg>
  )
}

export function CopertinaCorso({ id, titolo, conTitolo = true }: { id: string | null; titolo: string; conTitolo?: boolean }) {
  const seme = semeTitolo(titolo)
  return (
    <div className="cs-copertina" data-tinta={seme % TINTE} data-immagine={id ? "" : undefined}>
      {id ? <img src={urlCopertina(id)} alt="" loading="lazy" /> : <Motivo seme={seme} />}
      {conTitolo ? <p className="cs-copertina-titolo">{titolo}</p> : null}
    </div>
  )
}

const STATO_FASE: Record<FaseCorso, { testo: string; icona: typeof Eye; tono: string }> = {
  vuoto: { testo: "Bozza", icona: PencilLine, tono: "bozza" },
  contenuti: { testo: "Bozza", icona: PencilLine, tono: "bozza" },
  lezioni: { testo: "Bozza", icona: PencilLine, tono: "bozza" },
  pronto: { testo: "Bozza pronta", icona: PencilLine, tono: "pronto" },
  online: { testo: "Pubblicato", icona: Eye, tono: "online" },
  "online-vuoto": { testo: "Pubblicato, ma vuoto", icona: TriangleAlert, tono: "avviso" },
}

export function StatoCorso({ fase }: { fase: FaseCorso }) {
  const { testo, icona: Icona, tono } = STATO_FASE[fase]
  return <span className="cs-stato" data-tono={tono}><Icona aria-hidden />{testo}</span>
}

export function StatoLezione({ lezione }: { lezione: RigaLezione }) {
  if (lezione.tipo === "VIDEO") {
    if (lezione.videoStato === "ELABORAZIONE") return <Chip tono="info">In elaborazione</Chip>
    if (lezione.videoStato === "ERRORE") return <Chip tono="danger">Errore video</Chip>
    if (lezione.videoStato !== "PRONTO") return <Chip tono="warn">Video da caricare</Chip>
  } else if (!lezione.completa) {
    return <Chip tono="warn">Testo da scrivere</Chip>
  }
  return <Chip tono={lezione.pubblicata ? "ok" : "muted"}>{lezione.pubblicata ? "Pubblicata" : "Bozza"}</Chip>
}
