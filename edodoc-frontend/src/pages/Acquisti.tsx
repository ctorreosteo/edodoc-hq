import { AlertTriangle, ChevronDown, Plus, Search, ShoppingBag, TrendingUp, Wallet } from "lucide-react"
import { useMemo, useState } from "react"
import { Chip } from "@/components/chip"
import { LuxHero, LuxKpi } from "@/components/lux"
import { MenuAcquisto, MenuPagamento } from "@/components/menu-contestuali"
import { Cta, Pagina, Riquadro } from "@/components/pagina"
import { Caricamento, Errore, Vuoto } from "@/components/stati"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAzioni } from "@/contexts/azioni-context"
import { useDati } from "@/hooks/use-dati"
import { data, euro } from "@/lib/format"
import { METODO_PAGAMENTO, PIANO_PAGAMENTO, TIPO_PERCORSO } from "@/lib/etichette"
import { percorsiService } from "@/services/gestionale"
import type { Acquisto, Pagamento } from "@/types"

const FILTRI: Record<string, string> = { TUTTI: "Tutti", ATTIVI: "Attivi", DA_SALDARE: "Da saldare", SCADUTI: "Con rate scadute", CHIUSI: "Conclusi" }

function passa(a: Acquisto, filtro: string) {
  if (filtro === "ATTIVI") return a.percorso.stato === "ATTIVO"
  if (filtro === "DA_SALDARE") return a.percorso.stato !== "ANNULLATO" && a.pagato < a.percorso.importoTotale
  if (filtro === "SCADUTI") return a.scaduto > 0
  if (filtro === "CHIUSI") return a.percorso.stato !== "ATTIVO"
  return true
}

function StatoSaldo({ acquisto }: { acquisto: Acquisto }) {
  if (acquisto.percorso.stato === "ANNULLATO") return <Chip tono="muted">Annullato</Chip>
  if (acquisto.scaduto > 0) return <Chip tono="danger">{euro(acquisto.scaduto)} scaduti</Chip>
  if (acquisto.daPagare > 0) return <Chip tono="warn">Mancano {euro(acquisto.daPagare)}</Chip>
  // Senza rate aperte non è detto che sia saldato: le rate possono essere state annullate
  if (acquisto.pagato >= acquisto.percorso.importoTotale) return <Chip tono="ok">Saldato</Chip>
  return <Chip tono="danger">Rate annullate: {euro(acquisto.percorso.importoTotale - acquisto.pagato)} scoperti</Chip>
}

function RigaPagamento({ pagamento, conPaziente }: { pagamento: Pagamento; conPaziente?: boolean }) {
  const azioni = useAzioni()
  const pagato = pagamento.stato === "PAGATO"
  return (
    <MenuPagamento pagamento={pagamento}>
      <li>
        <button type="button" onClick={() => (pagato ? azioni.apriPaziente(pagamento.pazienteId) : azioni.registraPagamento(pagamento))}
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-3 py-2 text-left">
          <span className="min-w-40 flex-1">
            <span className="block truncate text-sm font-semibold">{conPaziente ? `${pagamento.pazienteNome} · ${pagamento.descrizione}` : pagamento.descrizione}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {pagato
                ? `Pagato il ${data(pagamento.dataPagamento)}${pagamento.metodo ? ` · ${METODO_PAGAMENTO[pagamento.metodo]}` : ""}`
                : `Entro il ${data(pagamento.scadenza)}`}
            </span>
          </span>
          <span className="text-sm font-semibold tabular-nums">{euro(pagamento.importo)}</span>
          {pagato ? <Chip tono="ok">Pagato</Chip> : pagamento.scaduto ? <Chip tono="danger">Scaduto</Chip> : <Chip tono="warn">Da pagare</Chip>}
          {pagato ? <Chip tono={pagamento.fatturato ? "ok" : "warn"}>{pagamento.fatturato ? "Fattura emessa" : "Da fatturare"}</Chip> : null}
        </button>
      </li>
    </MenuPagamento>
  )
}

function SchedaAcquisto({ acquisto }: { acquisto: Acquisto }) {
  const azioni = useAzioni()
  const [aperto, setAperto] = useState(false)
  const { percorso: p, pazienteNome } = acquisto
  const avanzamento = p.importoTotale > 0 ? Math.min(100, (acquisto.pagato / p.importoTotale) * 100) : 0
  return (
    <MenuAcquisto acquisto={acquisto}>
      <li className="rounded-xl border">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
          <button type="button" className="min-w-44 flex-1 text-left" onClick={() => azioni.apriPaziente(p.pazienteId)}>
            <span className="block truncate text-sm font-bold">{pazienteNome}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {TIPO_PERCORSO[p.tipo]} · {PIANO_PAGAMENTO[p.pianoPagamento]} · {data(p.dataInizio)} – {data(p.dataFine)}
            </span>
          </button>
          <span className="text-xs text-muted-foreground tabular-nums">{p.visiteEffettuate} di {p.visiteTotali} visite fatte</span>
          <div className="w-44 min-w-0">
            <div className="flex justify-between gap-2 text-xs tabular-nums">
              <span className="font-semibold">{euro(acquisto.pagato)}</span>
              <span className="text-muted-foreground">su {euro(p.importoTotale)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted" role="progressbar" aria-label="Pagato sul totale" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(avanzamento)}>
              <div className="h-full rounded-full bg-[var(--grafico-blu)]" style={{ width: `${avanzamento}%` }} />
            </div>
          </div>
          <StatoSaldo acquisto={acquisto} />
          <Button size="sm" variant="ghost" aria-expanded={aperto} onClick={() => setAperto((a) => !a)}>
            Pagamenti ({acquisto.pagamenti.length})
            <ChevronDown className={aperto ? "rotate-180 transition-transform" : "transition-transform"} aria-hidden />
          </Button>
        </div>
        {aperto ? (
          <ul className="grid grid-cols-1 gap-2 border-t p-3">
            {acquisto.pagamenti.map((r) => <RigaPagamento key={r.id} pagamento={r} />)}
            {acquisto.pagamenti.length === 0 ? <li className="text-sm text-muted-foreground">Nessun pagamento collegato</li> : null}
          </ul>
        ) : null}
      </li>
    </MenuAcquisto>
  )
}

export default function Acquisti() {
  const azioni = useAzioni()
  const { dati, errore, riprova } = useDati(percorsiService.acquisti, [])
  const [filtro, setFiltro] = useState("ATTIVI")
  const [ricerca, setRicerca] = useState("")

  const righe = useMemo(() => {
    const testo = ricerca.trim().toLowerCase()
    return (dati?.percorsi ?? []).filter((a) => passa(a, filtro) && (!testo || a.pazienteNome.toLowerCase().includes(testo)))
  }, [dati, filtro, ricerca])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const validi = dati.percorsi.filter((a) => a.percorso.stato !== "ANNULLATO")
  const attivi = validi.filter((a) => a.percorso.stato === "ATTIVO").length
  const incassato = validi.reduce((s, a) => s + a.pagato, 0)
  const daIncassare = validi.reduce((s, a) => s + a.daPagare, 0)
  const scaduto = validi.reduce((s, a) => s + a.scaduto, 0)
  const fuoriPercorso = dati.fuoriPercorso.filter((p) => !ricerca.trim() || p.pazienteNome.toLowerCase().includes(ricerca.trim().toLowerCase()))

  return (
    <Pagina>
      <LuxHero ariaLabel="Acquisti" eyebrow="Percorsi venduti" title="Acquisti" subtitle="Chi ha acquistato cosa, quanto ha pagato e quali rate mancano"
        actions={<Cta icona={Plus} onClick={() => azioni.nuovoPercorso()}>Nuovo acquisto</Cta>}>
        <div className="vl-kpis">
          <LuxKpi icon={<ShoppingBag className="size-4" />} label="Acquisti attivi" value={attivi} foot={`${validi.length} in totale`} />
          <LuxKpi icon={<TrendingUp className="size-4" />} label="Incassato" value={euro(incassato)} />
          <LuxKpi icon={<Wallet className="size-4" />} label="Da incassare" value={euro(daIncassare)} />
          <LuxKpi icon={<AlertTriangle className="size-4" />} label="Scaduto" value={euro(scaduto)} />
        </div>
      </LuxHero>

      <Riquadro titolo="Elenco" conteggio={righe.length} descrizione="Apri «Pagamenti» per vedere le rate, tasto destro per le azioni"
        azioni={
          <div className="flex flex-wrap items-center gap-1">
            {Object.entries(FILTRI).map(([k, v]) => (
              <Button key={k} size="sm" variant={filtro === k ? "default" : "outline"} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{v}</Button>
            ))}
            <div className="relative ml-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 opacity-50" aria-hidden />
              <Input aria-label="Cerca paziente" placeholder="Cerca paziente" value={ricerca} onChange={(e) => setRicerca(e.target.value)} className="pl-8 w-44 h-8" />
            </div>
          </div>
        }>
        {righe.length === 0 ? <Vuoto titolo="Nessun acquisto" descrizione={dati.percorsi.length ? "Prova a cambiare i filtri." : "Registra il primo acquisto."} /> : (
          <ul className="grid grid-cols-1 gap-2">
            {righe.map((a) => <SchedaAcquisto key={a.percorso.id} acquisto={a} />)}
          </ul>
        )}
      </Riquadro>

      {fuoriPercorso.length > 0 ? (
        <Riquadro titolo="Pagamenti fuori percorso" conteggio={fuoriPercorso.length} descrizione="Acconti e incassi non ancora collegati a un acquisto">
          <ul className="grid grid-cols-1 gap-2">
            {fuoriPercorso.map((p) => <RigaPagamento key={p.id} pagamento={p} conPaziente />)}
          </ul>
        </Riquadro>
      ) : null}
    </Pagina>
  )
}
