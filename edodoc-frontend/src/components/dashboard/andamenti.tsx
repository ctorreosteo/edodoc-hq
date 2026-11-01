import { ArrowRight } from "lucide-react"
import { memo } from "react"
import { Link } from "react-router-dom"
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { movimentoRidotto, useConteggio } from "@/hooks/use-conteggio"
import { MESI, MESI_BREVI } from "@/lib/finance"
import { dataBreve, euro, euroTondi } from "@/lib/format"
import type { Dashboard } from "@/types"

const ASSE = { fontSize: 11, fill: "var(--muted-foreground)" }
const BLU = "var(--grafico-blu)"
const ARANCIONE = "var(--grafico-arancione)"

type RigaTip = { name?: string; value?: number | string; color?: string }

function Riquadretto({ active, label, payload, formato }: { active?: boolean; label?: string | number; payload?: RigaTip[]; formato?: (v: number) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="db-tip">
      <p className="db-tip-titolo">{label}</p>
      {payload.map((r) => (
        <p key={r.name} className="db-tip-riga">
          <strong>{formato ? formato(Number(r.value)) : r.value}</strong>
          <span>{r.name}</span>
        </p>
      ))}
    </div>
  )
}

function Incassi({ d, meseCorrente }: { d: Dashboard; meseCorrente: number }) {
  const importo = useConteggio(d.incassatoMese)
  const righe = d.incassiMensili.map((m) => ({ mese: MESI_BREVI[m.mese - 1], numero: m.mese, importo: m.importo }))

  return (
    <div className="db-pannello">
      <div className="db-pannello-testa">
        <p className="db-pannello-titolo">Incassato a {MESI[meseCorrente - 1].toLowerCase()}</p>
        <Link to="/finance" className="db-link">Finance<ArrowRight className="size-3.5" aria-hidden /></Link>
      </div>
      <p className="db-pannello-valore">{euroTondi(importo)}</p>
      <p className="db-pannello-piede">{euroTondi(d.incassatoAnno)} nell'anno · {euroTondi(d.daIncassare)} da incassare</p>
      {righe.some((m) => m.importo > 0) ? (
        <div className="db-grafico" role="img" aria-label={`Incassi mensili: ${righe.map((m) => `${m.mese} ${euroTondi(m.importo)}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={righe} margin={{ top: 6, right: 0, left: 0, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="var(--vl-line)" />
              <XAxis dataKey="mese" tick={ASSE} axisLine={false} tickLine={false} interval={0} tickMargin={6} minTickGap={0} />
              <YAxis hide />
              <Tooltip cursor={{ fill: "var(--vl-hover)" }} content={<Riquadretto formato={euro} />} />
              <Bar dataKey="importo" name="Incassato" maxBarSize={22} radius={[4, 4, 0, 0]} isAnimationActive={!movimentoRidotto()} animationDuration={700}>
                {righe.map((m) => <Cell key={m.numero} fill={m.numero === meseCorrente ? ARANCIONE : BLU} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : <p className="db-nulla">Nessun incasso registrato quest'anno.</p>}
    </div>
  )
}

function Check({ d }: { d: Dashboard }) {
  const percentuale = d.checkAttesi ? Math.min(100, (d.checkCompilati / d.checkAttesi) * 100) : 0
  const righe = d.andamentoCheck.map((c) => ({ ...c, etichetta: dataBreve(c.settimana) }))
  const punto = (colore: string) => ({ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: colore })

  return (
    <div className="db-pannello">
      <div className="db-pannello-testa">
        <p className="db-pannello-titolo">Check della settimana</p>
        <Link to="/check" className="db-link">Check<ArrowRight className="size-3.5" aria-hidden /></Link>
      </div>
      <p className="db-pannello-valore">{d.checkCompilati}<small> su {d.checkAttesi}</small></p>
      <div className="db-misura" role="progressbar" aria-label="Check compilati" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percentuale)}>
        <span style={{ width: `${percentuale}%` }} />
      </div>
      {righe.some((c) => c.compilati > 0) ? (
        <>
          <p className="db-legenda">
            <span><i data-serie="compilati" aria-hidden />Compilati</span>
            <span><i data-serie="segnali" aria-hidden />Con segnali</span>
          </p>
          <div className="db-grafico" data-basso="" role="img" aria-label={`Check compilati e con segnali, ultime 8 settimane: ${righe.map((c) => `${c.etichetta} ${c.compilati} e ${c.segnali}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={righe} margin={{ top: 8, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--vl-line)" />
                <XAxis dataKey="etichetta" tick={ASSE} axisLine={false} tickLine={false} tickMargin={6} minTickGap={18} />
                <YAxis hide allowDecimals={false} domain={[0, "dataMax + 1"]} />
                <Tooltip cursor={{ stroke: "var(--vl-line-strong)" }} content={<Riquadretto />} />
                <Line type="monotone" dataKey="compilati" name="Compilati" stroke={BLU} strokeWidth={2} dot={punto(BLU)} isAnimationActive={!movimentoRidotto()} />
                <Line type="monotone" dataKey="segnali" name="Con segnali" stroke={ARANCIONE} strokeWidth={2} dot={punto(ARANCIONE)} isAnimationActive={!movimentoRidotto()} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : <p className="db-nulla">Nessun check nelle ultime 8 settimane.</p>}
    </div>
  )
}

function Pazienti({ d }: { d: Dashboard }) {
  const voci = [
    { nome: "Mantenimento", valore: d.pazientiMantenimento },
    { nome: "Lead", valore: d.lead },
    { nome: "Lista d'attesa", valore: d.listaAttesa },
    { nome: "Visite questa settimana", valore: d.visiteSettimana },
  ]
  return (
    <div className="db-pannello">
      <div className="db-pannello-testa">
        <p className="db-pannello-titolo">Pazienti attivi</p>
        <Link to="/pazienti" className="db-link">Pazienti<ArrowRight className="size-3.5" aria-hidden /></Link>
      </div>
      <p className="db-pannello-valore">{d.pazientiAttivi}</p>
      <dl className="db-registro">
        {voci.map((v) => (
          <div key={v.nome}>
            <dt>{v.nome}</dt>
            <dd>{v.valore}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** In secondo piano: l'andamento si guarda quando il resto è a posto. Riceve dati stabili, così l'orologio non ridisegna i grafici. */
export const Andamenti = memo(function Andamenti({ d, meseCorrente }: { d: Dashboard; meseCorrente: number }) {
  return (
    <section className="db-andamenti" aria-label="Andamenti">
      <Incassi d={d} meseCorrente={meseCorrente} />
      <Check d={d} />
      <Pazienti d={d} />
    </section>
  )
})
