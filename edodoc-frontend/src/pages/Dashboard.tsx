import { Banknote, CalendarPlus, ClipboardCheck, ListChecks, MessageCircle, Users } from "lucide-react"
import { Link } from "react-router-dom"
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Chip } from "@/components/chip"
import { LuxHero, LuxKpi } from "@/components/lux"
import { MenuTask, MenuVisita } from "@/components/menu-contestuali"
import { Cta, Pagina, Riquadro } from "@/components/pagina"
import { Caricamento, Errore, Vuoto } from "@/components/stati"
import { useAzioni } from "@/contexts/azioni-context"
import { useAuth } from "@/contexts/auth-context"
import { useDati } from "@/hooks/use-dati"
import { data, dataBreve, dataLunga, euro, euroTondi, ora } from "@/lib/format"
import { MODALITA_VISITA, STATO_VISITA, TIPO_VISITA } from "@/lib/etichette"
import { oggiIso } from "@/lib/utils"
import { dashboardService } from "@/services/gestionale"

const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
const ASSE = { fontSize: 11, fill: "var(--muted-foreground)" }
const STILE_TOOLTIP = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--popover-foreground)" }

export default function Dashboard() {
  const { utente } = useAuth()
  const azioni = useAzioni()
  const { dati: d, errore, riprova } = useDati(dashboardService.carica, [])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!d) return <Caricamento />

  const percentualeCheck = d.checkAttesi ? (d.checkCompilati / d.checkAttesi) * 100 : 0
  const incassi = d.incassiMensili.map((m) => ({ mese: MESI[m.mese - 1], importo: m.importo }))
  const andamento = d.andamentoCheck.map((c) => ({ ...c, etichetta: dataBreve(c.settimana) }))

  return (
    <Pagina>
      <LuxHero
        ariaLabel="Riepilogo di oggi"
        eyebrow={dataLunga(oggiIso())}
        title={`Ciao ${utente?.nome ?? ""}`}
        subtitle={d.daContattareOggi > 0 ? `${d.daContattareOggi} pazienti da contattare e ${d.visiteOggi.length} visite oggi` : `${d.visiteOggi.length} visite oggi`}
        actions={<Cta icona={CalendarPlus} onClick={() => azioni.nuovaVisita()}>Nuova visita</Cta>}
      >
        <div className="vl-kpis vl-kpis--5">
          <LuxKpi icon={<Users className="size-4" />} label="Pazienti attivi" value={d.pazientiAttivi} foot={`${d.lead} lead · ${d.listaAttesa} in attesa`} />
          <LuxKpi icon={<ClipboardCheck className="size-4" />} label="Check compilati" value={d.checkCompilati} unit={`/${d.checkAttesi}`} progress={percentualeCheck} />
          <LuxKpi icon={<MessageCircle className="size-4" />} label="Messaggi dedicati" value={d.checkConSegnali} foot="Peso, percezione o energia" />
          <LuxKpi icon={<ListChecks className="size-4" />} label="Task aperti" value={d.taskAperti} foot={d.taskInRitardo ? `${d.taskInRitardo} in ritardo` : "Nessuno in ritardo"} />
          <LuxKpi icon={<Banknote className="size-4" />} label="Incassato nel mese" value={euroTondi(d.incassatoMese)} foot={`${euroTondi(d.incassatoAnno)} nell'anno`} />
        </div>
      </LuxHero>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
        <Riquadro titolo="Visite di oggi" conteggio={d.visiteOggi.length}>
          {d.visiteOggi.length === 0 ? <Vuoto titolo="Nessuna visita oggi" /> : (
            <ul className="grid gap-2">
              {d.visiteOggi.map((v) => (
                <MenuVisita key={v.id} visita={v}>
                  <li className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
                    <span className="text-sm font-bold tabular-nums">{ora(v.inizio)}</span>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => azioni.apriPaziente(v.pazienteId)}>
                      <span className="block truncate text-sm font-semibold">{v.pazienteNome}</span>
                      <span className="block truncate text-xs text-muted-foreground">{TIPO_VISITA[v.tipo]} · {MODALITA_VISITA[v.modalita]}</span>
                    </button>
                    <Chip tono={STATO_VISITA[v.stato].tono}>{STATO_VISITA[v.stato].testo}</Chip>
                  </li>
                </MenuVisita>
              ))}
            </ul>
          )}
        </Riquadro>

        <Riquadro titolo="Da fare" conteggio={d.taskAperti} azioni={<Link to="/task" className="text-sm font-semibold">Tutti</Link>}>
          {d.taskUrgenti.length === 0 ? <Vuoto titolo="Nessun task aperto" /> : (
            <ul className="grid gap-2">
              {d.taskUrgenti.map((t) => (
                <MenuTask key={t.id} task={t}>
                  <li className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{t.titolo}</p>
                      <p className="truncate text-xs text-muted-foreground">{[t.pazienteNome, t.scadenza ? `entro il ${data(t.scadenza)}` : null].filter(Boolean).join(" · ")}</p>
                    </div>
                    {t.inRitardo ? <Chip tono="danger">In ritardo</Chip> : null}
                  </li>
                </MenuTask>
              ))}
            </ul>
          )}
        </Riquadro>

        <Riquadro titolo="Incassi mensili" descrizione={`${euro(d.incassatoAnno)} incassati, ${euro(d.daIncassare)} da incassare`}>
          <div className="h-56" role="img" aria-label={`Incassi mensili: ${incassi.map((m) => `${m.mese} ${euroTondi(m.importo)}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={incassi} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="mese" tick={ASSE} axisLine={false} tickLine={false} />
                <YAxis tick={ASSE} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => `${v / 1000}k`} />
                <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={STILE_TOOLTIP} formatter={(v) => [euro(Number(v)), "Incassato"]} />
                <Bar dataKey="importo" fill="var(--grafico-blu)" maxBarSize={24} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Riquadro>

        <Riquadro titolo="Check delle ultime 8 settimane">
          <div className="flex gap-4 pb-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[var(--grafico-blu)]" aria-hidden />Compilati</span>
            <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[var(--grafico-arancione)]" aria-hidden />Con segnali</span>
          </div>
          <div className="h-48" role="img" aria-label={`Check compilati e con segnali: ${andamento.map((c) => `${c.etichetta} ${c.compilati} e ${c.segnali}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={andamento} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="etichetta" tick={ASSE} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={ASSE} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={STILE_TOOLTIP} />
                <Line type="monotone" dataKey="compilati" name="Compilati" stroke="var(--grafico-blu)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--grafico-blu)" }} />
                <Line type="monotone" dataKey="segnali" name="Con segnali" stroke="var(--grafico-arancione)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--grafico-arancione)" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Riquadro>

        <Riquadro titolo="Rinnovi in arrivo" descrizione="Percorsi in scadenza entro 60 giorni" conteggio={d.rinnovi.length}>
          {d.rinnovi.length === 0 ? <Vuoto titolo="Nessun rinnovo in arrivo" /> : (
            <ul className="grid gap-2">
              {d.rinnovi.map((r) => (
                <li key={r.percorsoId}>
                  <button type="button" className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left" onClick={() => azioni.apriPaziente(r.pazienteId)}>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.pazienteNome}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{r.visiteFissate} su {r.visiteTotali} · fine {data(r.dataFine)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Riquadro>

        <Riquadro titolo="Fisco e soglia" descrizione={d.candidatureAperte ? "Candidature aperte" : "Margine sotto il valore di un cliente: candidature da chiudere"}
          azioni={<Chip tono={d.candidatureAperte ? "ok" : "warn"}>{euro(d.margineSoglia)} dalla soglia</Chip>}>
          {d.prossimeScadenze.length === 0 ? <Vuoto titolo="Nessuna scadenza nei prossimi 90 giorni" /> : (
            <ul className="grid gap-2">
              {d.prossimeScadenze.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.titolo}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{data(s.dataScadenza)}</span>
                  <span className="text-sm font-semibold tabular-nums">{s.importoStimato != null ? euro(s.importoStimato) : "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </Riquadro>
      </div>
    </Pagina>
  )
}
