import { X } from "lucide-react"
import { useState } from "react"
import { Riquadro, Tabella } from "@/components/pagina"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { contoDelPeriodo, MESI, MESI_BREVI } from "@/lib/finance"
import { euro, euroTondi } from "@/lib/format"
import type { MeseFinance, Movimento, RiepilogoFinance } from "@/types"

const SERIE = [
  { chiave: "pazienti", nome: "Pazienti" },
  { chiave: "youtube", nome: "YouTube" },
  { chiave: "altro", nome: "Altro" },
] as const

/** Scala dell'asse su numeri tondi: 1, 2 o 5 per una potenza di dieci. */
function passoTondo(massimo: number) {
  if (massimo <= 0) return 1000
  const grezzo = massimo / 3
  const potenza = 10 ** Math.floor(Math.log10(grezzo))
  return [1, 2, 5, 10].map((m) => m * potenza).find((p) => p >= grezzo) ?? potenza * 10
}

function Colonne({ r, mostrato, scelto, onAnteprima, onScegli }: {
  r: RiepilogoFinance
  mostrato: number | null
  scelto: number | null
  onAnteprima: (mese: number | null) => void
  onScegli: (mese: number) => void
}) {
  const picco = Math.max(...r.mesi.map((m) => m.lordo))
  const passo = passoTondo(picco)
  const cima = Math.max(Math.ceil(picco / passo), 1) * passo
  const tacche = Array.from({ length: Math.round(cima / passo) + 1 }, (_, i) => i * passo)
  const meseEtichetta = mostrato ?? r.mesi.find((m) => m.lordo === picco && picco > 0)?.mese

  return (
    <div>
      <div className="fi-legenda">
        {SERIE.map((s) => <span key={s.chiave}><i data-serie={s.chiave} aria-hidden />{s.nome}</span>)}
      </div>
      <div className="fi-colonne">
        <div className="fi-tacche" aria-hidden>
          {tacche.map((t) => <span key={t} style={{ bottom: `${(t / cima) * 100}%` }}>{t >= 1000 ? `${t / 1000}k` : t}</span>)}
        </div>
        <div className="fi-mesi" onPointerLeave={() => onAnteprima(null)}>
          {r.mesi.map((m) => (
            <button key={m.mese} type="button" className="fi-mese" aria-pressed={scelto === m.mese} data-attivo={mostrato === m.mese ? "" : undefined}
              aria-label={`${MESI[m.mese - 1]}: ${euro(m.lordo)} incassati`} onPointerEnter={(e) => e.pointerType === "mouse" && onAnteprima(m.mese)}
              onFocus={(e) => e.currentTarget.matches(":focus-visible") && onAnteprima(m.mese)} onBlur={() => onAnteprima(null)} onClick={() => onScegli(m.mese)}>
              <span className="fi-mese-area">
                {m.lordo > 0 ? (
                  <span className="fi-pila" style={{ height: `${(m.lordo / cima) * 100}%`, animationDelay: `${m.mese * 35}ms` }}>
                    {meseEtichetta === m.mese ? <b>{euroTondi(m.lordo)}</b> : null}
                    {[...SERIE].reverse().map((s) => m[s.chiave] > 0 ? <i key={s.chiave} data-serie={s.chiave} style={{ flexGrow: m[s.chiave] }} /> : null)}
                  </span>
                ) : null}
              </span>
              <span className="fi-mese-nome">{MESI_BREVI[m.mese - 1]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Riga({ nome, valore, serie, forte }: { nome: string; valore: number; serie?: string; forte?: boolean }) {
  return (
    <li data-forte={forte ? "" : undefined}>
      <span>{serie ? <i data-serie={serie} aria-hidden /> : null}{nome}</span>
      <span>{valore < 0 ? `−${euro(-valore)}` : euro(valore)}</span>
    </li>
  )
}

function Conto({ periodo, movimenti, anno, fissato, onLibera }: {
  periodo: MeseFinance
  movimenti: Movimento[]
  anno: number
  fissato: boolean
  onLibera: () => void
}) {
  const { fisco, spese, resta } = contoDelPeriodo(periodo, movimenti)
  const suCento = periodo.lordo > 0 ? Math.round((resta / periodo.lordo) * 100) : null
  const titolo = periodo.mese === 0 ? `Tutto il ${anno}` : `${MESI[periodo.mese - 1]} ${anno}`

  return (
    <aside className="fi-conto" aria-label={`Conto: ${titolo}`}>
      <div className="fi-conto-testa">
        <p>{titolo}</p>
        {fissato ? <button type="button" onClick={onLibera} aria-label="Torna a tutto l'anno"><X className="size-3.5" aria-hidden /></button> : null}
      </div>
      <p className="fi-conto-resta">{euroTondi(resta)}</p>
      <p className="fi-conto-nota">{suCento != null ? `Ti restano ${suCento} € ogni 100 € incassati` : "Nessun incasso in questo periodo"}</p>
      {periodo.lordo > 0 && resta > 0 ? (
        <div className="fi-quote" role="img" aria-label={`Resta ${euro(resta)}, fisco ${euro(fisco)}, spese ${euro(spese)}`}>
          <i data-serie="resta" style={{ flexGrow: resta }} />
          <i data-serie="fisco" style={{ flexGrow: fisco }} />
          {spese > 0 ? <i data-serie="spese" style={{ flexGrow: spese }} /> : null}
        </div>
      ) : null}
      <ul className="fi-conto-righe">
        <Riga nome="Pazienti" valore={periodo.pazienti} />
        <Riga nome="YouTube" valore={periodo.youtube} />
        {periodo.altro > 0 ? <Riga nome="Altri ricavi" valore={periodo.altro} /> : null}
        <Riga nome="Lordo" valore={periodo.lordo} forte />
        <Riga nome="Imposta sostitutiva" valore={-periodo.impostaSostitutiva} serie="fisco" />
        <Riga nome="Cassa previdenziale" valore={-periodo.cassaPrevidenziale} serie="fisco" />
        <Riga nome="Contributo in fattura" valore={-periodo.contributoInFattura} serie="fisco" />
        <Riga nome="Spese" valore={-spese} serie="spese" />
        <Riga nome="Resta" valore={resta} serie="resta" forte />
      </ul>
    </aside>
  )
}

function Foglio({ r }: { r: RiepilogoFinance }) {
  return (
    <Tabella>
      <TableHeader>
        <TableRow>
          <TableHead>Mese</TableHead>
          <TableHead>Pazienti</TableHead>
          <TableHead>YouTube</TableHead>
          <TableHead>Altro</TableHead>
          <TableHead>Lordo</TableHead>
          <TableHead>Imposta 5%</TableHead>
          <TableHead>Contributo 4%</TableHead>
          <TableHead>Cassa 15%</TableHead>
          <TableHead>Uscite</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...r.mesi, r.totali].map((m) => (
          <TableRow key={m.mese} className={m.mese === 0 ? "font-bold" : ""}>
            <TableCell className="font-semibold">{m.mese === 0 ? "Totale" : MESI[m.mese - 1]}</TableCell>
            <TableCell className="tabular-nums">{euro(m.pazienti)}</TableCell>
            <TableCell className="tabular-nums">{euro(m.youtube)}</TableCell>
            <TableCell className="tabular-nums">{euro(m.altro)}</TableCell>
            <TableCell className="tabular-nums font-semibold">{euro(m.lordo)}</TableCell>
            <TableCell className="tabular-nums">{euro(m.impostaSostitutiva)}</TableCell>
            <TableCell className="tabular-nums">{euro(m.contributoInFattura)}</TableCell>
            <TableCell className="tabular-nums">{euro(m.cassaPrevidenziale)}</TableCell>
            <TableCell className="tabular-nums">{euro(m.uscite)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Tabella>
  )
}

export function MesePerMese({ r, movimenti, scelto, onScelto }: {
  r: RiepilogoFinance
  movimenti: Movimento[]
  scelto: number | null
  onScelto: (mese: number | null) => void
}) {
  const [vista, setVista] = useState<"grafico" | "foglio">("grafico")
  const [anteprima, setAnteprima] = useState<number | null>(null)
  const mostrato = anteprima ?? scelto
  const periodo = mostrato ? r.mesi[mostrato - 1] : r.totali

  return (
    <Riquadro titolo="Mese per mese" descrizione={vista === "grafico" ? "Scegli un mese: il conto e i movimenti si concentrano lì." : "Il foglio Cassa completo."}
      azioni={(
        <div className="fi-segmenti" role="group" aria-label="Vista">
          <button type="button" aria-pressed={vista === "grafico"} onClick={() => setVista("grafico")}>Grafico</button>
          <button type="button" aria-pressed={vista === "foglio"} onClick={() => setVista("foglio")}>Foglio</button>
        </div>
      )}>
      {vista === "foglio" ? <Foglio r={r} /> : (
        <div className="fi-mesi-griglia">
          <Colonne r={r} mostrato={mostrato} scelto={scelto} onAnteprima={setAnteprima} onScegli={(m) => onScelto(scelto === m ? null : m)} />
          <Conto periodo={periodo} movimenti={movimenti} anno={r.anno} fissato={scelto != null} onLibera={() => onScelto(null)} />
        </div>
      )}
    </Riquadro>
  )
}
