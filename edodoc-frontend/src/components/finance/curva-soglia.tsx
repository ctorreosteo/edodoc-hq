import { useMemo } from "react"
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { movimentoRidotto } from "@/hooks/use-conteggio"
import { useIsMobile } from "@/hooks/use-mobile"
import { curvaAnnuale, type PuntoCurva } from "@/lib/finance"
import { euroTondi } from "@/lib/format"
import type { RiepilogoFinance } from "@/types"

const ASSE = { fontSize: 11, fill: "rgba(255, 255, 255, 0.55)" }
const INCASSATO = "#F0944E"
const CON_RATE = "#FFFFFF"
const PREVISIONE = "#9CC0F5"

function Etichetta({ viewBox, testo }: { viewBox?: { x: number; y: number; width: number }; testo: string }) {
  if (!viewBox) return null
  return <text x={viewBox.x + 4} y={viewBox.y - 6} className="fi-curva-etichetta">{testo}</text>
}

function Riquadretto({ active, payload, label }: { active?: boolean; payload?: { payload: PuntoCurva }[]; label?: string | number }) {
  const punto = payload?.[0]?.payload
  if (!active || !punto || !label) return null
  const righe = [
    { nome: "Incassato", valore: punto.incassato, colore: INCASSATO },
    { nome: "Con le rate", valore: punto.conRate, colore: CON_RATE },
    { nome: "Previsione", valore: punto.previsione, colore: PREVISIONE },
  ].filter((r) => r.valore != null)
  return (
    <div className="fi-curva-tip">
      <p className="fi-curva-tip-mese">Fine {label}</p>
      {righe.map((r) => (
        <p key={r.nome} className="fi-curva-tip-riga">
          <i style={{ background: r.colore }} aria-hidden />
          <strong>{euroTondi(r.valore)}</strong>
          <span>{r.nome}</span>
        </p>
      ))}
    </div>
  )
}

/** Il firmamento della pagina: la corsa dell'anno verso soglia e obiettivo, con il ventaglio dei livelli di previsione. */
export function CurvaSoglia({ r }: { r: RiepilogoFinance }) {
  const { punti, ultimo } = useMemo(() => curvaAnnuale(r), [r])
  const telefono = useIsMobile()
  const animata = !movimentoRidotto()
  const massimo = Math.max(r.soglia, r.obiettivo, ...r.livelli.map((l) => l.totale))
  const passo = massimo > 150000 ? 50000 : 20000
  const tacche = Array.from({ length: Math.ceil(massimo / passo) + 1 }, (_, i) => i * passo)
  const [certo] = r.livelli
  const descrizione = `Incassato ${euroTondi(certo.totale)} a fronte di una soglia di ${euroTondi(r.soglia)} e di un obiettivo di ${euroTondi(r.obiettivo)}. A fine anno: ${r.livelli.map((l) => `${l.nome} ${euroTondi(l.totale)}`).join(", ")}.`

  return (
    <div className="fi-curva" role="img" aria-label={descrizione}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={punti} margin={{ top: 18, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="fi-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={INCASSATO} stopOpacity={0.24} />
              <stop offset="100%" stopColor={INCASSATO} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(255, 255, 255, 0.07)" />
          <XAxis dataKey="etichetta" tick={ASSE} axisLine={false} tickLine={false} interval={telefono ? 1 : 0} minTickGap={0} tickMargin={8} />
          <YAxis tick={ASSE} axisLine={false} tickLine={false} width={38} domain={[0, tacche[tacche.length - 1]]} ticks={tacche} tickFormatter={(v: number) => (v ? `${v / 1000}k` : "0")} />
          <ReferenceArea y1={r.soglia - r.valoreNuovoCliente} y2={r.soglia} fill="#FFFFFF" fillOpacity={0.07} stroke="none" ifOverflow="hidden" />
          <ReferenceLine y={r.obiettivo} stroke="rgba(255, 255, 255, 0.28)" label={<Etichetta testo={`Obiettivo ${euroTondi(r.obiettivo)}`} />} />
          <ReferenceLine y={r.soglia} stroke="rgba(255, 255, 255, 0.75)" label={<Etichetta testo={`Soglia ${euroTondi(r.soglia)}`} />} />
          <Tooltip cursor={{ stroke: "rgba(255, 255, 255, 0.3)" }} content={<Riquadretto />} />
          <Area dataKey="incassato" type="monotone" stroke={INCASSATO} strokeWidth={2.5} fill="url(#fi-area)" dot={false} activeDot={{ r: 5, stroke: "#24406B", strokeWidth: 2 }} isAnimationActive={animata} animationDuration={1100} />
          <Line dataKey="previsione" type="linear" stroke={PREVISIONE} strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={{ r: 4, stroke: "#24406B", strokeWidth: 2 }} isAnimationActive={false} />
          <Line dataKey="conRate" type="linear" stroke={CON_RATE} strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={{ r: 4, stroke: "#24406B", strokeWidth: 2 }} isAnimationActive={false} />
          {ultimo > 0 ? <ReferenceDot x={punti[ultimo].etichetta} y={certo.totale} r={5} fill={INCASSATO} stroke="#24406B" strokeWidth={2} /> : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export const COLORI_SCENARI = [INCASSATO, CON_RATE, PREVISIONE]
