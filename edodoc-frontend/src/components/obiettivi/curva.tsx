import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { movimentoRidotto } from "@/hooks/use-conteggio"
import type { LetturaObiettivo } from "@/lib/obiettivo"

const ASSE = { fontSize: 11, fill: "var(--muted-foreground)" }

type RigaTip = { dataKey?: string; name?: string; value?: number | string | null }

function Riquadretto({ active, label, payload }: { active?: boolean; label?: string | number; payload?: RigaTip[] }) {
  if (!active || !payload?.length) return null
  const righe = payload.filter((r) => r.value != null)
  return (
    <div className="ob-tip">
      <p className="ob-tip-titolo">Settimana del {label}</p>
      {righe.map((r) => (
        <p key={r.dataKey} className="ob-tip-riga" data-serie={r.dataKey}>
          <i aria-hidden />
          <strong>{r.value}</strong>
          <span>{r.name}</span>
        </p>
      ))}
    </div>
  )
}

/** La corsa cumulata: reale contro il ritmo ideale e contro l'anno prima. */
export function Curva({ o }: { o: LetturaObiettivo }) {
  const massimo = Math.max(o.target, o.fatti, o.precedenteTotale) * 1.06
  const oggi = o.curva.find((p, i) => p.reale != null && o.curva[i + 1]?.reale == null)
  const animata = !movimentoRidotto()

  return (
    <div className="ob-curva">
      <ul className="ob-legenda">
        {o.fase !== "attesa" ? <li data-serie="reale"><i aria-hidden />{o.anno}</li> : null}
        <li data-serie="ideale"><i aria-hidden />Ritmo per arrivare a {o.target}</li>
        <li data-serie="precedente"><i aria-hidden />{o.anno - 1}</li>
      </ul>
      <div className="ob-curva-grafico" role="img"
        aria-label={`Clienti cumulati: ${o.fatti} nel ${o.anno}, ${Math.round(o.atteso)} attesi sul ritmo, ${o.precedenteAllaData} nel ${o.anno - 1} alla stessa data`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={o.curva} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ob-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--grafico-arancione)" stopOpacity={0.38} />
                <stop offset="100%" stopColor="var(--grafico-arancione)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--vl-line)" />
            <XAxis dataKey="etichetta" tick={ASSE} axisLine={false} tickLine={false} interval={8} tickMargin={8} />
            <YAxis tick={ASSE} axisLine={false} tickLine={false} domain={[0, Math.ceil(massimo / 50) * 50]} ticks={[0, 100, 200, 300].filter((t) => t <= massimo)} width={36} />
            <ReferenceLine y={o.target} stroke="var(--grafico-arancione)" strokeOpacity={0.5} strokeDasharray="2 4"
              label={{ value: `${o.target}`, position: "insideTopLeft", fill: "var(--vl-accent-ink)", fontSize: 11, fontWeight: 700 }} />
            {oggi ? <ReferenceLine x={oggi.etichetta} stroke="var(--vl-line-strong)" label={{ value: "oggi", position: "top", fill: "var(--muted-foreground)", fontSize: 10 }} /> : null}
            <Tooltip cursor={{ stroke: "var(--vl-line-strong)" }} content={<Riquadretto />} />
            <Line dataKey="precedente" name={`clienti nel ${o.anno - 1}`} type="monotone" stroke="var(--grafico-blu)" strokeWidth={2} dot={false} connectNulls isAnimationActive={animata} />
            <Line dataKey="ideale" name="sul ritmo ideale" type="linear" stroke="var(--vl-ink-3)" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={animata} />
            {o.fase !== "attesa" ? (
              <Area dataKey="reale" name={`clienti nel ${o.anno}`} type="monotone" stroke="var(--grafico-arancione)" strokeWidth={2.5} fill="url(#ob-area)"
                activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }} isAnimationActive={animata} animationDuration={1400} />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
