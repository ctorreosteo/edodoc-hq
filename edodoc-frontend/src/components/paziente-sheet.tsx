import { Banknote, CalendarPlus, CheckCircle2, FileText, ListChecks, Pencil, Receipt, Route, Salad } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { quandoBreve } from "@/components/diete/parti-editor"
import { Chip } from "@/components/chip"
import { MailingPazientePannello } from "@/components/mailing/mailing-paziente-pannello"
import { AccettazionePannello } from "@/components/pazienti/accettazione-pannello"
import { RisposteCheck } from "@/components/check-dettaglio"
import { MenuFattura, MenuPagamento, MenuTask, MenuVisita } from "@/components/menu-contestuali"
import { Caricamento, Vuoto } from "@/components/stati"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { SheetHero, SheetHeroChip, SheetKV, SheetKVGrid, SheetSection, SK_HERO_ACTION } from "@/components/ui/sheet-kit"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAzioni } from "@/contexts/azioni-context"
import { data, dataBreve, dataOra, euro, linkWhatsapp } from "@/lib/format"
import { FONTE, METODO_PAGAMENTO, MODALITA_VISITA, PIANO_PAGAMENTO, SITUAZIONE_PAGAMENTI, STATO_PAZIENTE, STATO_VISITA, TIPO_PERCORSO, TIPO_VISITA } from "@/lib/etichette"
import { toast, toastErrore } from "@/lib/toast"
import { dieteService, pazientiService, percorsiService } from "@/services/gestionale"
import type { CheckDettaglio, Fattura, ListaPagamenti, Paziente, Percorso, RigaDieta, Task, Visita } from "@/types"

type Scheda = {
  paziente: Paziente; percorsi: Percorso[]; visite: Visita[]; check: CheckDettaglio[]
  pagamenti: ListaPagamenti; fatture: Fattura[]; task: Task[]; diete: RigaDieta[]
}

async function caricaScheda(id: number): Promise<Scheda> {
  const [paziente, percorsi, visite, check, pagamenti, fatture, task, diete] = await Promise.all([
    pazientiService.dettaglio(id), pazientiService.percorsi(id), pazientiService.visite(id), pazientiService.check(id),
    pazientiService.pagamenti(id), pazientiService.fatture(id), pazientiService.task(id), dieteService.delPaziente(id),
  ])
  return { paziente, percorsi, visite, check, pagamenti, fatture, task, diete }
}

function RigaLista({ titolo, dettaglio, chip, importo, ...altro }: { titolo: string; dettaglio?: string; chip?: React.ReactNode; importo?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...altro} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2.5">
      <div className="min-w-40 flex-1">
        <p className="truncate text-sm font-semibold">{titolo}</p>
        {dettaglio ? <p className="truncate text-xs text-muted-foreground">{dettaglio}</p> : null}
      </div>
      {importo ? <span className="text-sm font-semibold tabular-nums">{importo}</span> : null}
      {chip}
    </div>
  )
}

export function PazienteSheet({ pazienteId, onClose }: { pazienteId: number | null; onClose: () => void }) {
  const azioni = useAzioni()
  const navigate = useNavigate()
  const [scheda, setScheda] = useState<Scheda | null>(null)

  useEffect(() => {
    if (pazienteId == null) {
      setScheda(null)
      return
    }
    caricaScheda(pazienteId).then(setScheda).catch((e) => {
      toastErrore(e)
      onClose()
    })
  }, [pazienteId, azioni.versione, onClose])

  const p = scheda?.paziente
  const prossimaRata = scheda?.pagamenti.righe.find((r) => r.stato === "DA_PAGARE")
  const whatsapp = linkWhatsapp(p?.cellulare)

  return (
    <Sheet open={pazienteId != null} onOpenChange={(aperto) => !aperto && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto gap-4 p-4 sm:p-6" data-vl="scope">
        {!scheda || !p ? <Caricamento /> : (
          <>
            <SheetHero
              initials={`${p.nome.charAt(0)}${p.cognome.charAt(0)}`}
              eyebrow={p.percorso ? TIPO_PERCORSO[p.percorso.tipo] : "Paziente"}
              title={`${p.nome} ${p.cognome}`}
              description={p.situazione ?? undefined}
              chips={
                <>
                  <SheetHeroChip>{STATO_PAZIENTE[p.stato]?.testo}</SheetHeroChip>
                  <SheetHeroChip>{SITUAZIONE_PAGAMENTI[p.situazionePagamenti]?.testo}</SheetHeroChip>
                  {p.percorso ? <SheetHeroChip>Visita {p.percorso.visiteFissate} su {p.percorso.visiteTotali}</SheetHeroChip> : null}
                </>
              }
              actions={<Button size="sm" className={SK_HERO_ACTION} onClick={() => azioni.modificaPaziente(p)}><Pencil aria-hidden />Modifica</Button>}
            />

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => azioni.nuovaVisita({ pazienteId: p.id })}><CalendarPlus aria-hidden />Visita</Button>
              <Button size="sm" variant="outline" onClick={() => azioni.nuovoPercorso(p.id)}><Route aria-hidden />Acquisto</Button>
              <Button size="sm" variant="outline" onClick={() => azioni.nuovoPagamento(p.id)}><Banknote aria-hidden />Pagamento</Button>
              <Button size="sm" variant="outline" onClick={() => azioni.nuovaFattura({ pazienteId: p.id })}><Receipt aria-hidden />Fattura</Button>
              <Button size="sm" variant="outline" onClick={() => azioni.nuovaDieta({ pazienteId: p.id })}><Salad aria-hidden />Dieta</Button>
              <Button size="sm" variant="outline" onClick={() => azioni.nuovoTask({ pazienteId: p.id })}><ListChecks aria-hidden />Task</Button>
              {whatsapp ? <Button size="sm" variant="outline" asChild><a href={whatsapp} target="_blank" rel="noreferrer">WhatsApp</a></Button> : null}
            </div>

            <Tabs defaultValue="anagrafica" className="min-w-0 w-full max-w-full">
              <TabsList className="flex h-auto w-full max-w-full min-w-0 sm:grid sm:grid-cols-7">
                <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
                <TabsTrigger value="visite">Visite</TabsTrigger>
                <TabsTrigger value="check">Check</TabsTrigger>
                <TabsTrigger value="diete">Diete</TabsTrigger>
                <TabsTrigger value="pagamenti">Pagamenti</TabsTrigger>
                <TabsTrigger value="fatture">Fatture</TabsTrigger>
                <TabsTrigger value="task">Task</TabsTrigger>
              </TabsList>

              <TabsContent value="anagrafica" className="grid grid-cols-1 gap-4 pt-3 min-w-0">
                <SheetSection title="Contatti e dati">
                  <SheetKVGrid cols={2}>
                    <SheetKV label="Email">{p.email || "—"}</SheetKV>
                    <SheetKV label="Cellulare">{p.cellulare || "—"}</SheetKV>
                    <SheetKV label="Codice fiscale">{p.codiceFiscale || "—"}</SheetKV>
                    <SheetKV label="Data di nascita">{data(p.dataNascita)}</SheetKV>
                    <SheetKV label="Indirizzo">{[p.indirizzo, p.cap, p.citta, p.provincia].filter(Boolean).join(" ") || "—"}</SheetKV>
                    <SheetKV label="Provenienza">{p.fonte ? FONTE[p.fonte] : "—"}</SheetKV>
                    <SheetKV label="Peso iniziale">{p.pesoInizialeKg != null ? `${p.pesoInizialeKg} kg` : "—"}</SheetKV>
                    <SheetKV label="Peso obiettivo">{p.pesoObiettivoKg != null ? `${p.pesoObiettivoKg} kg` : "—"}</SheetKV>
                  </SheetKVGrid>
                  {p.nota ? <p className="mt-3 text-sm">{p.nota}</p> : null}
                </SheetSection>
                <AccettazionePannello pazienteId={p.id} email={p.email} />
                <MailingPazientePannello pazienteId={p.id} onApri={onClose} />
                <SheetSection title="Acquisti">
                  {scheda.percorsi.length === 0 ? <Vuoto titolo="Nessun acquisto" /> : (
                    <div className="grid grid-cols-1 gap-2">
                      {scheda.percorsi.map((c) => (
                        <div key={c.id} className="flex flex-wrap items-center gap-2 min-w-0">
                          <div className="min-w-40 flex-1">
                            <RigaLista titolo={TIPO_PERCORSO[c.tipo]} dettaglio={`${data(c.dataInizio)} – ${data(c.dataFine)} · ${PIANO_PAGAMENTO[c.pianoPagamento]} · ${c.visiteFissate}/${c.visiteTotali} visite`}
                              importo={euro(c.importoTotale)} chip={<Chip tono={c.stato === "ATTIVO" ? "ok" : "muted"}>{c.stato === "ATTIVO" ? "Attivo" : c.stato === "CONCLUSO" ? "Concluso" : "Annullato"}</Chip>} />
                          </div>
                          {c.stato === "ATTIVO" ? (
                            <Button size="sm" variant="ghost" onClick={() => azioni.conferma({
                              titolo: "Annullare l'acquisto?",
                              descrizione: "Le rate ancora da pagare vengono annullate. Quelle incassate restano.",
                              etichetta: "Annulla acquisto",
                              azione: async () => {
                                await percorsiService.annulla(c.id)
                                toast.success("Acquisto annullato")
                                azioni.aggiorna()
                              },
                            })}>Annulla</Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </SheetSection>
              </TabsContent>

              <TabsContent value="visite" className="grid grid-cols-1 gap-2 pt-3 min-w-0">
                {scheda.visite.length === 0 ? <Vuoto titolo="Nessuna visita" /> : scheda.visite.map((v) => (
                  <MenuVisita key={v.id} visita={v}>
                    <RigaLista titolo={v.numeroVisita ? `${TIPO_VISITA[v.tipo]} · ${v.numeroVisita} su ${v.visiteTotali}` : TIPO_VISITA[v.tipo]}
                      dettaglio={`${dataOra(v.inizio)} · ${MODALITA_VISITA[v.modalita]}`}
                      chip={<Chip tono={STATO_VISITA[v.stato].tono}>{STATO_VISITA[v.stato].testo}</Chip>} />
                  </MenuVisita>
                ))}
              </TabsContent>

              <TabsContent value="check" className="grid grid-cols-1 gap-3 pt-3 min-w-0">
                {scheda.check.length === 0 ? <Vuoto titolo="Nessun check" descrizione="Compariranno qui, settimana per settimana." /> : scheda.check.map((c) => (
                  <SheetSection key={c.id} title={`Settimana del ${dataBreve(c.settimana)}`}>
                    <RisposteCheck check={c} />
                  </SheetSection>
                ))}
              </TabsContent>

              <TabsContent value="diete" className="grid grid-cols-1 gap-2 pt-3 min-w-0">
                {scheda.diete.length === 0 ? (
                  <Vuoto titolo="Nessuna dieta" icona={<Salad aria-hidden />} descrizione="Ogni nuova dieta si aggiunge qui, e la precedente resta nello storico." />
                ) : scheda.diete.map((d, i) => (
                  <div key={d.id} className="flex items-center gap-2 min-w-0">
                    <div className="min-w-0 flex-1 cursor-pointer" role="link" tabIndex={0} onClick={() => {
                      onClose()
                      navigate(`/diete/${d.id}`)
                    }} onKeyDown={(e) => {
                      if (e.key !== "Enter") return
                      onClose()
                      navigate(`/diete/${d.id}`)
                    }}>
                      <RigaLista titolo={d.titolo}
                        dettaglio={`Creata ${quandoBreve(d.createdAt)} · modificata ${quandoBreve(d.updatedAt)} · ${d.versioni} ${d.versioni === 1 ? "versione" : "versioni"}`}
                        chip={i === 0 ? <Chip tono={d.consegnataIl ? "ok" : "warn"}>{d.consegnataIl ? "In uso" : "In uso · da consegnare"}</Chip> : <Chip tono="muted">Precedente</Chip>} />
                    </div>
                    <Button size="icon" variant="ghost" aria-label={`PDF di ${d.titolo}`} title="Apri il PDF" onClick={() => dieteService.apriPdf(d.id).catch(toastErrore)}><FileText aria-hidden /></Button>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="pagamenti" className="grid grid-cols-1 gap-3 pt-3 min-w-0">
                <SheetKVGrid cols={3}>
                  <SheetKV label="Pagato">{euro(scheda.pagamenti.riepilogo.pagato)}</SheetKV>
                  <SheetKV label="Da pagare">{euro(scheda.pagamenti.riepilogo.daPagare)}</SheetKV>
                  <SheetKV label="Scaduto">{euro(scheda.pagamenti.riepilogo.scaduto)}</SheetKV>
                </SheetKVGrid>
                {prossimaRata ? <p className="text-sm text-muted-foreground">Prossima rata: {euro(prossimaRata.importo)} entro il {data(prossimaRata.scadenza)}</p> : null}
                {scheda.pagamenti.righe.length === 0 ? <Vuoto titolo="Nessun pagamento" /> : scheda.pagamenti.righe.map((r) => (
                  <MenuPagamento key={r.id} pagamento={r}>
                    <RigaLista titolo={r.descrizione} importo={euro(r.importo)}
                      dettaglio={r.stato === "PAGATO" ? `Pagato il ${data(r.dataPagamento)}${r.metodo ? ` · ${METODO_PAGAMENTO[r.metodo]}` : ""}` : `Entro il ${data(r.scadenza)}`}
                      chip={r.stato === "PAGATO" ? <Chip tono="ok">Pagato</Chip> : r.scaduto ? <Chip tono="danger">Scaduto</Chip> : <Chip tono="warn">Da pagare</Chip>} />
                  </MenuPagamento>
                ))}
              </TabsContent>

              <TabsContent value="fatture" className="grid grid-cols-1 gap-2 pt-3 min-w-0">
                {scheda.fatture.length === 0 ? <Vuoto titolo="Nessuna fattura" /> : scheda.fatture.map((f) => (
                  <MenuFattura key={f.id} fattura={f}>
                    <RigaLista titolo={`Fattura n. ${f.numero}`} dettaglio={`${data(f.dataEmissione)} · ${f.descrizione}`} importo={euro(f.importoTotale)}
                      chip={f.stato === "EMESSA" ? <Chip tono="ok">Emessa</Chip> : <Chip tono="muted">Annullata</Chip>} />
                  </MenuFattura>
                ))}
              </TabsContent>

              <TabsContent value="task" className="grid grid-cols-1 gap-2 pt-3 min-w-0">
                {scheda.task.length === 0 ? <Vuoto titolo="Nessun task" icona={<CheckCircle2 aria-hidden />} /> : scheda.task.map((t) => (
                  <MenuTask key={t.id} task={t}>
                    <RigaLista titolo={t.titolo} dettaglio={t.scadenza ? `Entro il ${data(t.scadenza)}` : undefined}
                      chip={t.stato === "FATTO" ? <Chip tono="ok">Fatto</Chip> : t.inRitardo ? <Chip tono="danger">In ritardo</Chip> : <Chip tono="info">Da fare</Chip>} />
                  </MenuTask>
                ))}
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
