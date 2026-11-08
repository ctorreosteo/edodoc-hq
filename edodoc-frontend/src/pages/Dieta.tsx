import { ArrowLeft, CalendarDays, Check, CheckCircle2, Copy, Droplets, Eye, Flame, History, LayoutTemplate, Maximize2, Minimize2, Pencil, Plus, Save, ScrollText, ShoppingBasket, Target, Trash2, UserRound } from "lucide-react"
import { useCallback, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { EditorPasto, focalizza, prendiFuoco } from "@/components/diete/editor-pasto"
import { FoglioDieta } from "@/components/diete/foglio"
import { AnteprimaPdf, Gettoni, quando, Storico } from "@/components/diete/parti-editor"
import { Caricamento, Errore } from "@/components/stati"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useAzioni } from "@/contexts/azioni-context"
import {
  ALIMENTI_COMUNI, GIORNI_SETTIMANA, PASTI_SUGGERITI, QUANTITA_SUGGERITE, conteggi, duplicaGiornata, duplicaPasto, kcalDaMacro, normalizza,
  nuovaGiornata, nuovoId, nuovoPasto, ripartizione,
} from "@/lib/dieta"
import { toast, toastErrore } from "@/lib/toast"
import { dieteService, impostazioniService } from "@/services/gestionale"
import type { ContenutoDieta, Dieta as DietaSalvata, Giornata, Pasto } from "@/types"
import "@/style/diete.css"

type Bozza = { titolo: string; dataInizio: string | null; contenuto: ContenutoDieta }

const daDieta = (d: DietaSalvata): Bozza => ({ titolo: d.titolo, dataInizio: d.dataInizio, contenuto: normalizza(d.contenuto) })
const impronta = (b: Bozza) => JSON.stringify(b)

/** Bozza nel browser: se la scheda si chiude o il Mac si spegne, le modifiche non salvate si ritrovano. */
type BozzaLocale = { bozza: Bozza; quando: string; base: string }
const chiaveBozza = (id: number) => `edodoc-dieta-bozza-${id}`
const leggiBozza = (id: number): BozzaLocale | null => {
  try {
    const testo = localStorage.getItem(chiaveBozza(id))
    return testo ? (JSON.parse(testo) as BozzaLocale) : null
  } catch {
    return null
  }
}
const scriviBozza = (id: number, valore: BozzaLocale | null) => {
  try {
    if (valore) localStorage.setItem(chiaveBozza(id), JSON.stringify(valore))
    else localStorage.removeItem(chiaveBozza(id))
  } catch {
    // archivio del browser pieno o bloccato: resta l'avviso all'uscita
  }
}
const leggiPreferenza = (chiave: string) => {
  try {
    return localStorage.getItem(chiave) === "1"
  } catch {
    return false
  }
}
const intero = (testo: string) => {
  const n = Number.parseInt(testo.replace(/\D/g, ""), 10)
  return Number.isFinite(n) ? n : null
}

function Blocco({ numero, titolo, descrizione, azioni, children, id }: { numero: string; titolo: string; descrizione?: string; azioni?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="dt-blocco" id={id} aria-labelledby={`${id}-titolo`}>
      <header className="dt-blocco-testa">
        <span className="dt-blocco-n" aria-hidden>{numero}</span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-titolo`}>{titolo}</h2>
          {descrizione ? <p>{descrizione}</p> : null}
        </div>
        {azioni}
      </header>
      {children}
    </section>
  )
}

function CampoNumero({ etichetta, valore, onChange, unita, icona, segnaposto }: {
  etichetta: string; valore: number | null; onChange: (v: number | null) => void; unita: string; icona?: ReactNode; segnaposto?: string
}) {
  return (
    <label className="dt-numero">
      <span className="dt-numero-et">{icona}{etichetta}</span>
      <span className="dt-numero-campo">
        <input inputMode="numeric" value={valore ?? ""} placeholder={segnaposto ?? "—"} onChange={(e) => onChange(intero(e.target.value))} />
        <small>{unita}</small>
      </span>
    </label>
  )
}

function Macro({ c, onChange }: { c: ContenutoDieta; onChange: (c: ContenutoDieta) => void }) {
  const r = ripartizione(c)
  const stimate = kcalDaMacro(c)
  const scarto = c.kcal && stimate ? stimate - c.kcal : 0
  const voci = [
    { chiave: "proteine" as const, nome: "Proteine", classe: "p", pct: r?.proteine },
    { chiave: "carboidrati" as const, nome: "Carboidrati", classe: "c", pct: r?.carboidrati },
    { chiave: "grassi" as const, nome: "Grassi", classe: "g", pct: r?.grassi },
  ]
  return (
    <div className="dt-macro">
      <div className="dt-macro-barra" aria-hidden>
        {r ? voci.map((v) => (v.pct ? <span key={v.chiave} data-m={v.classe} style={{ width: `${v.pct}%` }} /> : null)) : <span data-m="vuota" />}
      </div>
      <div className="dt-macro-voci">
        {voci.map((v) => (
          <label key={v.chiave} className="dt-macro-voce">
            <span className="dt-macro-nome"><i data-m={v.classe} aria-hidden />{v.nome}</span>
            <span className="dt-numero-campo">
              <input inputMode="numeric" value={c[v.chiave] ?? ""} placeholder="—" onChange={(e) => onChange({ ...c, [v.chiave]: intero(e.target.value) })} />
              <small>g</small>
            </span>
            <span className="dt-macro-pct">{v.pct != null ? `${v.pct}% dell'energia` : " "}</span>
          </label>
        ))}
      </div>
      {stimate > 0 ? (
        <p className="dt-macro-nota" data-avviso={Math.abs(scarto) > 80 ? "" : undefined}>
          Dai macronutrienti: <b>{stimate.toLocaleString("it-IT")} kcal</b>
          {c.kcal ? (Math.abs(scarto) > 80 ? `, ${Math.abs(scarto).toLocaleString("it-IT")} ${scarto > 0 ? "in più" : "in meno"} rispetto all'energia indicata` : ", in linea con l'energia indicata")
            : ". Senza energia indicata il PDF usa questo valore."}
        </p>
      ) : null}
    </div>
  )
}

export default function Dieta() {
  const { id } = useParams()
  const dietaId = Number(id)
  const navigate = useNavigate()
  const azioni = useAzioni()
  const [salvata, setSalvata] = useState<DietaSalvata | null>(null)
  const [bozza, setBozza] = useState<Bozza | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [giornataAttiva, setGiornataAttiva] = useState(0)
  const [inCorso, setInCorso] = useState(false)
  const [anteprima, setAnteprima] = useState(false)
  const [tentativo, setTentativo] = useState(0)
  const [pastoAttivo, setPastoAttivo] = useState<string | null>(null)
  const [scheda, setScheda] = useState<"foglio" | "storico">("foglio")
  const [foglioGrande, setFoglioGrande] = useState(() => leggiPreferenza("edodoc-dieta-foglio-grande"))
  const [appenaSalvata, setAppenaSalvata] = useState(false)
  const [versioneNuova, setVersioneNuova] = useState<number | null>(null)
  const [recupero, setRecupero] = useState<BozzaLocale | null>(null)
  const [medico, setMedico] = useState({ nome: "Dott. Edoardo Bo", titoli: "Biologo Nutrizionista" })

  useEffect(() => {
    let annullato = false
    setErrore(null)
    dieteService.dettaglio(dietaId).then((d) => {
      if (annullato) return
      setSalvata(d)
      setBozza(daDieta(d))
      const locale = leggiBozza(dietaId)
      if (locale && impronta(locale.bozza) !== impronta(daDieta(d))) setRecupero(locale)
      else scriviBozza(dietaId, null)
    }).catch((e: Error) => !annullato && setErrore(e.message))
    return () => {
      annullato = true
    }
  }, [dietaId, tentativo])

  // Nome e titoli del dottore come in fattura: il foglio li mostra in copertina e in firma
  useEffect(() => {
    impostazioniService.carica().then((i) => {
      const voce = (k: string) => i.voci.find((v) => v.chiave === k)?.valore?.trim()
      setMedico((m) => ({ nome: voce("EMITTENTE_NOME") || m.nome, titoli: voce("EMITTENTE_TITOLI") || m.titoli }))
    }).catch(() => undefined)
  }, [])

  const sporca = useMemo(() => !!salvata && !!bozza && impronta(bozza) !== impronta(daDieta(salvata)), [salvata, bozza])

  // Mezzo secondo dopo l'ultimo tasto la bozza finisce nel browser; finché c'è un recupero da decidere non si tocca
  useEffect(() => {
    if (!salvata || !bozza || recupero) return
    const t = setTimeout(() => scriviBozza(salvata.id, sporca ? { bozza, quando: new Date().toISOString(), base: salvata.updatedAt } : null), 500)
    return () => clearTimeout(t)
  }, [bozza, salvata, sporca, recupero])

  useEffect(() => {
    if (!appenaSalvata) return
    const t = setTimeout(() => setAppenaSalvata(false), 1800)
    return () => clearTimeout(t)
  }, [appenaSalvata])

  const foglio = useDeferredValue(bozza)

  const salva = useCallback(async (silenziosa = false) => {
    if (!bozza || !salvata) return salvata
    if (!bozza.titolo.trim()) {
      toast.error("Dai un titolo alla dieta")
      return null
    }
    setInCorso(true)
    try {
      const d = await dieteService.salva(salvata.id, bozza)
      const nuovaVersione = d.versioni.length > salvata.versioni.length
      setSalvata(d)
      setBozza(daDieta(d))
      scriviBozza(d.id, null)
      setRecupero(null)
      if (nuovaVersione) {
        setVersioneNuova(d.versioni[0].numero)
        setAppenaSalvata(true)
      }
      if (!silenziosa && !nuovaVersione) toast("Nessuna modifica da salvare")
      azioni.aggiorna()
      return d
    } catch (e) {
      toastErrore(e)
      return null
    } finally {
      setInCorso(false)
    }
  }, [bozza, salvata, azioni])

  // ⌘S / Ctrl+S salva; chiudere la scheda con modifiche aperte chiede conferma al browser
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        void salva()
      }
    }
    const uscita = (e: BeforeUnloadEvent) => {
      if (sporca) e.preventDefault()
    }
    window.addEventListener("keydown", tasto)
    window.addEventListener("beforeunload", uscita)
    return () => {
      window.removeEventListener("keydown", tasto)
      window.removeEventListener("beforeunload", uscita)
    }
  }, [salva, sporca])

  const chiudiAnteprima = useCallback(() => setAnteprima(false), [])

  const cambiaFoglioGrande = () => {
    setFoglioGrande((g) => {
      try {
        localStorage.setItem("edodoc-dieta-foglio-grande", g ? "0" : "1")
      } catch {
        // solo una preferenza di comodo
      }
      return !g
    })
  }

  if (errore) return <Errore messaggio={errore} onRiprova={() => setTentativo((t) => t + 1)} />
  if (!salvata || !bozza) return <Caricamento />

  const c = bozza.contenuto
  const cambia = (contenuto: ContenutoDieta) => setBozza({ ...bozza, contenuto })
  const giornate = c.giornate
  const attiva = Math.min(giornataAttiva, Math.max(0, giornate.length - 1))
  const giornata: Giornata | undefined = giornate[attiva]
  const cambiaGiornata = (g: Giornata) => cambia({ ...c, giornate: giornate.map((x, i) => (i === attiva ? g : x)) })
  const cambiaPasti = (pasti: Pasto[]) => giornata && cambiaGiornata({ ...giornata, pasti })
  const numeri = conteggi(c)
  const modello = salvata.pazienteId == null
  const indietro = "/diete"

  /** Dal foglio all'editor: la giornata giusta, il pasto al centro, un lampo per ritrovarlo, il cursore sul primo campo. */
  const apriPasto = (gi: number, pastoId: string) => {
    setGiornataAttiva(gi)
    setPastoAttivo(pastoId)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById(`pasto-${pastoId}`)
      if (!el) return
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      el.classList.remove("dt-lampo")
      void el.offsetWidth
      el.classList.add("dt-lampo")
      const campo = el.querySelector<HTMLInputElement>(".dt-alimento-nome[value='']") ?? el.querySelector<HTMLInputElement>(".dt-alimento-nome")
      campo?.focus({ preventScroll: true })
    }))
  }

  const esci = () => {
    if (!sporca) {
      navigate(indietro)
      return
    }
    azioni.conferma({
      titolo: "Uscire senza salvare?",
      descrizione: "Le modifiche dall'ultimo salvataggio vanno perse. Le versioni già salvate restano nello storico.",
      etichetta: "Esci senza salvare",
      azione: async () => navigate(indietro),
    })
  }

  const aggiungiGiornata = (nome: string, copia = false) => {
    const nuova = copia && giornata ? duplicaGiornata(giornata, nome) : nuovaGiornata(nome)
    cambia({ ...c, giornate: [...giornate, nuova] })
    setGiornataAttiva(giornate.length)
  }
  const settimana = () => {
    const base = giornata ?? nuovaGiornata("Giornata tipo")
    cambia({ ...c, giornate: GIORNI_SETTIMANA.map((g) => duplicaGiornata(base, g)) })
    setGiornataAttiva(0)
    toast.success("Sette giornate pronte, tutte copiate dalla giornata che avevi aperta")
  }
  const rinominaGiornata = () => {
    if (!giornata) return
    azioni.conferma({
      titolo: "Rinomina la giornata",
      descrizione: "Es. Giornata tipo, Lunedì, Giorni di allenamento, Weekend.",
      etichetta: "Rinomina",
      richiediTesto: "Nome della giornata",
      azione: async (nome) => cambiaGiornata({ ...giornata, nome }),
    })
  }
  const eliminaGiornata = () => {
    if (!giornata) return
    azioni.conferma({
      titolo: `Eliminare "${giornata.nome}"?`,
      descrizione: `I suoi ${giornata.pasti.length} pasti spariscono da questa dieta. Le versioni già salvate restano nello storico.`,
      etichetta: "Elimina giornata",
      azione: async () => {
        cambia({ ...c, giornate: giornate.filter((_, i) => i !== attiva) })
        setGiornataAttiva(Math.max(0, attiva - 1))
      },
    })
  }
  const aggiungiPasto = (nome: string) => {
    if (!giornata) return
    const p = nuovoPasto(nome)
    cambiaPasti([...giornata.pasti, p])
    focalizza(p.opzioni[0].alimenti[0].id)
  }
  const ripristina = (numero: number) => azioni.conferma({
    titolo: `Ripristinare la versione ${numero}?`,
    descrizione: sporca
      ? "Le modifiche non salvate vanno perse. La dieta torna com'era e il ripristino diventa una nuova versione: lo storico resta intero."
      : "La dieta torna com'era e il ripristino diventa una nuova versione: lo storico resta intero.",
    etichetta: "Ripristina",
    azione: async () => {
      const d = await dieteService.ripristina(salvata.id, numero)
      setSalvata(d)
      setBozza(daDieta(d))
      scriviBozza(d.id, null)
      setVersioneNuova(d.versioni[0]?.numero ?? null)
      toast.success(`Ripristinata la versione ${numero}`)
      azioni.aggiorna()
    },
  })
  const apriAnteprima = async () => {
    if (sporca && !(await salva(true))) return
    setAnteprima(true)
  }
  const consegna = async (consegnata: boolean) => {
    try {
      const d = await dieteService.consegna(salvata.id, consegnata)
      setSalvata({ ...salvata, consegnataIl: d.consegnataIl })
      toast.success(consegnata ? "Segnata come consegnata" : "Consegna tolta")
      azioni.aggiorna()
    } catch (e) {
      toastErrore(e)
    }
  }
  const elimina = () => azioni.conferma({
    titolo: modello ? "Eliminare il modello?" : "Eliminare la dieta?",
    descrizione: modello
      ? "Il modello e tutte le sue versioni spariscono. Le diete già create da questo modello restano."
      : `La dieta e tutte le sue ${salvata.versioni.length} versioni spariscono dallo storico di ${salvata.pazienteNome}.`,
    etichetta: "Elimina",
    azione: async () => {
      await dieteService.elimina(salvata.id)
      toast.success(modello ? "Modello eliminato" : "Dieta eliminata")
      azioni.aggiorna()
      navigate("/diete")
    },
  })
  const salvaComeModello = async () => {
    try {
      const m = await dieteService.crea({ pazienteId: null, titolo: bozza.titolo, daDietaId: (sporca ? await salva(true) : salvata)?.id })
      toast.success("Modello creato: lo trovi nella pagina Diete", { action: { label: "Apri", onClick: () => navigate(`/diete/${m.id}`) } })
      azioni.aggiorna()
    } catch (e) {
      toastErrore(e)
    }
  }

  return (
    <div data-vl="" className="dt-pagina">
      <datalist id="dt-alimenti">{ALIMENTI_COMUNI.map((a) => <option key={a} value={a} />)}</datalist>
      <datalist id="dt-quantita">{QUANTITA_SUGGERITE.map((q) => <option key={q} value={q} />)}</datalist>

      <header className="dt-barra">
        <button type="button" className="dt-indietro" onClick={esci} aria-label="Torna alle diete"><ArrowLeft aria-hidden /></button>
        <div className="dt-barra-testo">
          <span className="dt-barra-occhiello">
            {modello ? <><LayoutTemplate aria-hidden />Modello</> : (
              <button type="button" onClick={() => salvata.pazienteId && azioni.apriPaziente(salvata.pazienteId)}><UserRound aria-hidden />{salvata.pazienteNome}</button>
            )}
          </span>
          <input className="dt-titolo" value={bozza.titolo} onChange={(e) => setBozza({ ...bozza, titolo: e.target.value })} aria-label="Titolo della dieta" placeholder="Titolo della dieta" />
        </div>
        <div className="dt-barra-stato" data-sporca={sporca ? "" : undefined} aria-live="polite">
          <span className="dt-stato-punto" aria-hidden />
          {sporca ? "Modifiche non salvate" : salvata.versioni[0] ? `Salvata ${quando(salvata.updatedAt)}` : "Nuova"}
        </div>
        <div className="dt-barra-azioni">
          <Button variant="outline" size="sm" onClick={() => void apriAnteprima()} disabled={inCorso}><Eye aria-hidden /><span className="dt-etichetta">Anteprima PDF</span></Button>
          <Button size="sm" onClick={() => void salva()} disabled={inCorso || (!sporca && !appenaSalvata)} className="dt-salva" data-fatto={appenaSalvata ? "" : undefined}>
            {appenaSalvata ? <><Check aria-hidden />Versione {salvata.versioni[0]?.numero}</> : <><Save aria-hidden />{inCorso ? "Salvo…" : "Salva"}<kbd>⌘S</kbd></>}
          </Button>
        </div>
      </header>

      {recupero ? (
        <div className="dt-recupero" role="status">
          <span className="dt-recupero-icona" aria-hidden><History /></span>
          <span className="min-w-0 flex-1">
            <strong>Hai lasciato delle modifiche senza salvarle</strong>
            <small>Le ho tenute da parte: {quando(recupero.quando)}.{recupero.base !== salvata.updatedAt ? " Nel frattempo la dieta è stata salvata di nuovo: riprendendole sostituisci quella versione." : ""}</small>
          </span>
          <button type="button" className="dt-pillola" onClick={() => {
            scriviBozza(salvata.id, null)
            setRecupero(null)
          }}>Scarta</button>
          <Button size="sm" onClick={() => {
            setBozza(recupero.bozza)
            setRecupero(null)
            toast.success("Modifiche riprese: ricordati di salvare")
          }}>Riprendile</Button>
        </div>
      ) : null}

      <div className="dt-griglia" data-foglio-grande={foglioGrande ? "" : undefined}>
        <div className="dt-colonna">
          <Blocco numero="01" id="dt-piano" titolo="Il piano" descrizione="Compaiono in copertina e nella pagina di sintesi del PDF.">
            <div className="dt-piano">
              <label className="dt-testo dt-span-2">
                <span className="dt-numero-et"><Target aria-hidden />Obiettivo</span>
                <input value={c.obiettivo ?? ""} placeholder="Es. Ricomposizione corporea, dimagrimento, energia" onChange={(e) => cambia({ ...c, obiettivo: e.target.value || null })} />
              </label>
              <label className="dt-testo">
                <span className="dt-numero-et"><CalendarDays aria-hidden />Dal</span>
                <input type="date" value={bozza.dataInizio ?? ""} onChange={(e) => setBozza({ ...bozza, dataInizio: e.target.value || null })} />
              </label>
              <CampoNumero etichetta="Energia al giorno" icona={<Flame aria-hidden />} unita="kcal" valore={c.kcal} onChange={(v) => cambia({ ...c, kcal: v })}
                segnaposto={kcalDaMacro(c) ? kcalDaMacro(c).toLocaleString("it-IT") : "—"} />
              <label className="dt-numero">
                <span className="dt-numero-et"><Droplets aria-hidden />Acqua al giorno</span>
                <span className="dt-numero-campo">
                  <input inputMode="decimal" value={c.acquaLitri ?? ""} placeholder="—" onChange={(e) => {
                    const n = Number.parseFloat(e.target.value.replace(",", "."))
                    cambia({ ...c, acquaLitri: Number.isFinite(n) ? n : null })
                  }} />
                  <small>litri</small>
                </span>
              </label>
            </div>
            <Macro c={c} onChange={cambia} />
          </Blocco>

          <Blocco numero="02" id="dt-messaggio" titolo="Messaggio al paziente" descrizione="Apre il PDF, firmato da te. Lascialo vuoto per saltare la pagina.">
            <textarea className="dt-lettera" rows={5} value={c.introduzione ?? ""} onChange={(e) => cambia({ ...c, introduzione: e.target.value || null })}
              placeholder={`Cara ${salvata.pazienteNome?.split(" ")[0] ?? "…"},\nquesto è il tuo piano per le prossime settimane…`} />
          </Blocco>

          <Blocco numero="03" id="dt-pasti" titolo="Pasti" descrizione="Una giornata tipo, oppure più giornate (allenamento, weekend, giorni della settimana). Ogni pasto può avere alternative.">
            <div className="dt-giornate" role="tablist" aria-label="Giornate">
              {giornate.map((g, i) => (
                <button key={g.id} type="button" role="tab" aria-selected={i === attiva} className="dt-giornata-tab" onClick={() => setGiornataAttiva(i)}>
                  {g.nome || "Senza nome"}<small>{g.pasti.length}</small>
                </button>
              ))}
              <button type="button" className="dt-giornata-tab dt-giornata-nuova" onClick={() => aggiungiGiornata(giornate.length ? `Giornata ${giornate.length + 1}` : "Giornata tipo")}>
                <Plus aria-hidden />Giornata
              </button>
            </div>

            {giornata ? (
              <>
                <div className="dt-giornata-barra">
                  <input className="dt-campo dt-giornata-nota" value={giornata.nota ?? ""} placeholder="Nota sotto il titolo della giornata (es. Le grammature sono a crudo)"
                    onChange={(e) => cambiaGiornata({ ...giornata, nota: e.target.value || null })} aria-label="Nota della giornata" />
                  <div className="dt-giornata-azioni">
                    <button type="button" className="dt-pillola" onClick={rinominaGiornata}><Pencil aria-hidden />Rinomina</button>
                    <button type="button" className="dt-pillola" onClick={() => aggiungiGiornata(`${giornata.nome} (copia)`, true)}><Copy aria-hidden />Duplica</button>
                    {giornate.length === 1 ? <button type="button" className="dt-pillola" onClick={settimana}><CalendarDays aria-hidden />Settimana intera</button> : null}
                    <button type="button" className="dt-pillola" data-tono="pericolo" onClick={eliminaGiornata}><Trash2 aria-hidden />Elimina</button>
                  </div>
                </div>

                <div className="dt-pasti">
                  {giornata.pasti.map((p, i) => (
                    <div key={p.id} id={`pasto-${p.id}`} className="dt-pasto-ancora" data-attivo={pastoAttivo === p.id ? "" : undefined}
                      onFocusCapture={() => setPastoAttivo(p.id)} onPointerDown={() => setPastoAttivo(p.id)}>
                    <EditorPasto pasto={p} numero={i + 1} totale={giornata.pasti.length}
                      onChange={(x) => cambiaPasti(giornata.pasti.map((y, j) => (j === i ? x : y)))}
                      onSposta={(delta) => {
                        const pasti = [...giornata.pasti]
                        const [preso] = pasti.splice(i, 1)
                        pasti.splice(i + delta, 0, preso)
                        cambiaPasti(pasti)
                      }}
                      onDuplica={() => {
                        const pasti = [...giornata.pasti]
                        pasti.splice(i + 1, 0, { ...duplicaPasto(p), nome: `${p.nome} (copia)` })
                        cambiaPasti(pasti)
                      }}
                      onElimina={() => cambiaPasti(giornata.pasti.filter((_, j) => j !== i))} />
                    </div>
                  ))}
                </div>

                <div className="dt-nuovo-pasto">
                  <span>Aggiungi un pasto</span>
                  {PASTI_SUGGERITI.filter((n) => !giornata.pasti.some((p) => p.nome.toLowerCase() === n.toLowerCase())).map((n) => (
                    <button key={n} type="button" className="dt-pillola" onClick={() => aggiungiPasto(n)}><Plus aria-hidden />{n}</button>
                  ))}
                  <button type="button" className="dt-pillola" onClick={() => aggiungiPasto("Nuovo pasto")}><Plus aria-hidden />Altro</button>
                </div>
              </>
            ) : (
              <div className="dt-vuoto">
                <p>Nessuna giornata. Inizia dalla giornata tipo con i cinque pasti.</p>
                <Button size="sm" onClick={() => aggiungiGiornata("Giornata tipo")}><Plus aria-hidden />Giornata tipo</Button>
              </div>
            )}
          </Blocco>

          <Blocco numero="04" id="dt-indicazioni" titolo="Indicazioni" descrizione="Le regole del gioco: consigli, alimenti liberi o da limitare, integrazione.">
            <div className="dt-sotto">
              <h3>Consigli</h3>
              <div className="dt-consigli">
                {c.consigli.map((k, i) => (
                  <div key={k.id} className="dt-consiglio">
                    <span className="dt-consiglio-n" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                    <div className="dt-consiglio-campi">
                      <input ref={prendiFuoco} className="dt-campo dt-consiglio-titolo" data-focus={k.id} value={k.titolo ?? ""} placeholder="Titolo (es. Pesa a crudo)"
                        onChange={(e) => cambia({ ...c, consigli: c.consigli.map((x) => (x.id === k.id ? { ...x, titolo: e.target.value } : x)) })} />
                      <textarea className="dt-campo" rows={2} value={k.testo ?? ""} placeholder="Spiegazione breve"
                        onChange={(e) => cambia({ ...c, consigli: c.consigli.map((x) => (x.id === k.id ? { ...x, testo: e.target.value } : x)) })} />
                    </div>
                    <button type="button" className="dt-icona" data-tono="pericolo" aria-label="Elimina consiglio"
                      onClick={() => cambia({ ...c, consigli: c.consigli.filter((x) => x.id !== k.id) })}><Trash2 aria-hidden /></button>
                  </div>
                ))}
              </div>
              <button type="button" className="dt-aggiungi-riga" onClick={() => {
                const id = nuovoId()
                cambia({ ...c, consigli: [...c.consigli, { id, titolo: "", testo: "" }] })
                focalizza(id)
              }}><Plus aria-hidden />Consiglio</button>
            </div>

            <div className="dt-due">
              <div className="dt-sotto" data-tono="liberi">
                <h3>Liberi</h3>
                <p>Quando vuole, nelle quantità che servono.</p>
                <Gettoni tono="liberi" valori={c.liberi} onChange={(liberi) => cambia({ ...c, liberi })} segnaposto="Verdure, tè, spezie… e Invio" />
              </div>
              <div className="dt-sotto" data-tono="limitare">
                <h3>Da limitare</h3>
                <p>Occasionali, non abituali.</p>
                <Gettoni tono="limitare" valori={c.limitare} onChange={(limitare) => cambia({ ...c, limitare })} segnaposto="Alcolici, dolci… e Invio" />
              </div>
            </div>

            <div className="dt-sotto">
              <h3>Integrazione</h3>
              {c.integrazione.length > 0 ? (
                <div className="dt-integrazione">
                  {c.integrazione.map((x) => {
                    const cambiaInt = (campo: "nome" | "dose" | "quando", valore: string) =>
                      cambia({ ...c, integrazione: c.integrazione.map((y) => (y.id === x.id ? { ...y, [campo]: valore } : y)) })
                    return (
                      <div key={x.id} className="dt-integratore">
                        <input ref={prendiFuoco} className="dt-campo" data-focus={x.id} value={x.nome} placeholder="Prodotto" onChange={(e) => cambiaInt("nome", e.target.value)} />
                        <input className="dt-campo" value={x.dose ?? ""} placeholder="Dose" onChange={(e) => cambiaInt("dose", e.target.value)} />
                        <input className="dt-campo" value={x.quando ?? ""} placeholder="Quando" onChange={(e) => cambiaInt("quando", e.target.value)} />
                        <button type="button" className="dt-icona" data-tono="pericolo" aria-label="Elimina integratore"
                          onClick={() => cambia({ ...c, integrazione: c.integrazione.filter((y) => y.id !== x.id) })}><Trash2 aria-hidden /></button>
                      </div>
                    )
                  })}
                </div>
              ) : null}
              <button type="button" className="dt-aggiungi-riga" onClick={() => {
                const id = nuovoId()
                cambia({ ...c, integrazione: [...c.integrazione, { id, nome: "", dose: null, quando: null }] })
                focalizza(id)
              }}><Plus aria-hidden />Integratore</button>
            </div>

            <label className="dt-interruttore">
              <span className="dt-interruttore-icona" aria-hidden><ShoppingBasket /></span>
              <span className="min-w-0 flex-1">
                <strong>Lista della spesa</strong>
                <small>Ultima pagina del PDF: tutti i {numeri.alimenti} alimenti del piano in ordine alfabetico, con la casella da spuntare.</small>
              </span>
              <Switch checked={c.listaSpesa} onCheckedChange={(listaSpesa) => cambia({ ...c, listaSpesa })} />
            </label>
          </Blocco>
        </div>

        <aside className="dt-lato">
          {!modello ? (
            <div className="dt-scheda dt-consegna" data-ok={salvata.consegnataIl ? "" : undefined}>
              <label className="dt-interruttore dt-interruttore--compatto">
                <span className="dt-interruttore-icona" data-ok={salvata.consegnataIl ? "" : undefined} aria-hidden><CheckCircle2 /></span>
                <span className="min-w-0 flex-1">
                  <strong>{salvata.consegnataIl ? "Consegnata" : "Da consegnare"}</strong>
                  <small>{salvata.consegnataIl ? quando(salvata.consegnataIl) : "Segnala quando l'hai mandata al paziente"}</small>
                </span>
                <Switch checked={!!salvata.consegnataIl} onCheckedChange={(v) => void consegna(v)} />
              </label>
            </div>
          ) : null}

          <div className="dt-lato-schede" role="tablist" aria-label="Foglio e storico">
            <button type="button" role="tab" aria-selected={scheda === "foglio"} onClick={() => setScheda("foglio")}>
              <ScrollText aria-hidden />Foglio<span className="dt-dal-vivo" aria-hidden />
            </button>
            <button type="button" role="tab" aria-selected={scheda === "storico"} onClick={() => setScheda("storico")}>
              <History aria-hidden />Storico<small>{salvata.versioni.length}</small>
            </button>
            {scheda === "foglio" ? (
              <button type="button" className="dt-allarga" onClick={cambiaFoglioGrande} aria-label={foglioGrande ? "Rimpicciolisci il foglio" : "Ingrandisci il foglio"} title={foglioGrande ? "Rimpicciolisci il foglio" : "Ingrandisci il foglio"}>
                {foglioGrande ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
              </button>
            ) : null}
          </div>

          {scheda === "foglio" && foglio ? (
            <div className="dt-foglio">
              <FoglioDieta pastoAttivo={pastoAttivo} onApriPasto={apriPasto} dati={{
                titolo: foglio.titolo, paziente: salvata.pazienteNome, dataInizio: foglio.dataInizio, contenuto: foglio.contenuto,
                consegnataIl: salvata.consegnataIl, medico: medico.nome, titoliMedico: medico.titoli,
              }} />
              <button type="button" className="dt-foglio-pdf" onClick={() => void apriAnteprima()}><Eye aria-hidden />Apri il PDF vero</button>
            </div>
          ) : (
            <>
              <div className="dt-scheda">
                <dl className="dt-date">
                  <div><dt>Creata</dt><dd>{quando(salvata.createdAt)}</dd></div>
                  <div><dt>Ultima modifica</dt><dd>{quando(salvata.updatedAt)}</dd></div>
                </dl>
                <Storico dieta={salvata} sporca={sporca} nuova={versioneNuova} onRipristina={ripristina} />
              </div>
              <div className="dt-scheda dt-scheda--azioni">
                {!modello ? <button type="button" className="dt-pillola" onClick={() => void salvaComeModello()}><LayoutTemplate aria-hidden />Salva come modello</button> : null}
                {!modello && salvata.pazienteId ? (
                  <button type="button" className="dt-pillola" onClick={() => azioni.nuovaDieta({ pazienteId: salvata.pazienteId!, daDietaId: salvata.id })}><Copy aria-hidden />Nuova dieta da questa</button>
                ) : (
                  <button type="button" className="dt-pillola" onClick={() => azioni.nuovaDieta({ daDietaId: salvata.id })}><UserRound aria-hidden />Usa per un paziente</button>
                )}
                <button type="button" className="dt-pillola" data-tono="pericolo" onClick={elimina}><Trash2 aria-hidden />Elimina</button>
              </div>
              <p className="dt-lato-nota"><Link to="/diete">Tutte le diete</Link></p>
            </>
          )}
        </aside>
      </div>

      <AnteprimaPdf dieta={salvata} aperta={anteprima} onClose={chiudiAnteprima} />
    </div>
  )
}
