import {
  Banknote, CalendarPlus, Check, ClipboardCheck, ClipboardPlus, Copy, ExternalLink, IdCard, Landmark, Mail,
  MessageCircle, PanelRight, Pencil, Plus, Receipt, Repeat, Route, Trash2, Undo2, UserPlus, UserRound, Video, X, type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuSub,
  ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useAzioni } from "@/contexts/azioni-context"
import { EMAIL, type RichiestaEmail, type TipoEmail } from "@/lib/email"
import { linkWhatsapp } from "@/lib/format"
import { toast, toastErrore } from "@/lib/toast"
import { fattureService, pagamentiService, pazientiService, percorsiService, taskService, visiteService } from "@/services/gestionale"
import type { Acquisto, Fattura, Pagamento, Paziente, RigaCheck, Task, Visita } from "@/types"

function VoceNuovoTask({ pazienteId }: { pazienteId?: number | null }) {
  const { nuovoTask } = useAzioni()
  return <ContextMenuItem onSelect={() => nuovoTask({ pazienteId })}><Plus aria-hidden />Nuovo task</ContextMenuItem>
}

/** Le tre email al paziente. Il popup parte dal riferimento più preciso che il menu conosce. */
function SottomenuEmail({ riferimento, disabilitate }: { riferimento: Omit<RichiestaEmail, "tipo">; disabilitate?: Partial<Record<TipoEmail, boolean>> }) {
  const { inviaEmail } = useAzioni()
  const icone: Record<TipoEmail, LucideIcon> = { SOLLECITO_PAGAMENTO: Banknote, DATI_FATTURAZIONE: IdCard, FATTURA: Receipt }
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger><Mail aria-hidden />Invia email</ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {(Object.keys(EMAIL) as TipoEmail[]).map((tipo) => {
          const Icona = icone[tipo]
          return (
            <ContextMenuItem key={tipo} disabled={disabilitate?.[tipo]} onSelect={() => inviaEmail({ ...riferimento, tipo })}>
              <Icona aria-hidden />{EMAIL[tipo].voce}
            </ContextMenuItem>
          )
        })}
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}

function apriWhatsapp(cellulare?: string | null) {
  const link = linkWhatsapp(cellulare)
  if (link) window.open(link, "_blank", "noopener")
}

function VociContatto({ cellulare, email }: { cellulare?: string | null; email?: string | null }) {
  return (
    <>
      <ContextMenuItem disabled={!cellulare} onSelect={() => apriWhatsapp(cellulare)}><MessageCircle aria-hidden />Scrivi su WhatsApp</ContextMenuItem>
      <ContextMenuItem disabled={!email} onSelect={() => window.open(`mailto:${email}`)}><Mail aria-hidden />Scrivi un'email</ContextMenuItem>
    </>
  )
}

function Guscio({ menu, children }: { menu: ReactNode; children: ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">{menu}</ContextMenuContent>
    </ContextMenu>
  )
}

export function MenuPaziente({ paziente, children }: { paziente: Paziente; children: ReactNode }) {
  const a = useAzioni()
  const invitaApp = async () => {
    try {
      const invito = await pazientiService.invitoApp(paziente.id)
      await navigator.clipboard.writeText(invito.link).catch(() => undefined)
      toast.success(invito.emailInviata ? "Invito inviato via email" : "Link di accesso copiato negli appunti")
    } catch (e) {
      toastErrore(e)
    }
  }
  const archivia = () => a.conferma({
    titolo: `Archiviare ${paziente.nome} ${paziente.cognome}?`,
    descrizione: "Sparisce dagli elenchi. Visite, pagamenti e fatture restano registrati.",
    etichetta: "Archivia",
    azione: async () => {
      await pazientiService.archivia(paziente.id)
      toast.success("Paziente archiviato")
      a.aggiorna()
    },
  })
  return (
    <Guscio menu={
      <>
        <ContextMenuLabel>{paziente.nome} {paziente.cognome}</ContextMenuLabel>
        <ContextMenuItem onSelect={() => a.apriPaziente(paziente.id)}><UserRound aria-hidden />Apri la scheda</ContextMenuItem>
        <ContextMenuItem onSelect={() => a.modificaPaziente(paziente)}><Pencil aria-hidden />Modifica anagrafica</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => a.nuovaVisita({ pazienteId: paziente.id })}><CalendarPlus aria-hidden />Nuova visita</ContextMenuItem>
        <ContextMenuItem onSelect={() => a.nuovoPercorso(paziente.id)}><Route aria-hidden />Nuovo acquisto</ContextMenuItem>
        <ContextMenuItem onSelect={() => a.nuovoPagamento(paziente.id)}><Banknote aria-hidden />Nuovo pagamento</ContextMenuItem>
        <ContextMenuItem onSelect={() => a.nuovaFattura({ pazienteId: paziente.id })}><Receipt aria-hidden />Nuova fattura</ContextMenuItem>
        <ContextMenuItem onSelect={() => a.inserisciCheck(paziente.id)}><ClipboardPlus aria-hidden />Inserisci check</ContextMenuItem>
        <VoceNuovoTask pazienteId={paziente.id} />
        <ContextMenuSeparator />
        <SottomenuEmail riferimento={{ pazienteId: paziente.id }} disabilitate={{ SOLLECITO_PAGAMENTO: paziente.residuo <= 0 }} />
        <VociContatto cellulare={paziente.cellulare} email={paziente.email} />
        <ContextMenuItem disabled={!paziente.email} onSelect={() => void invitaApp()}><Copy aria-hidden />Invito all'app</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={archivia}><Trash2 aria-hidden />Archivia</ContextMenuItem>
      </>
    }>{children}</Guscio>
  )
}

export function MenuVisita({ visita, children }: { visita: Visita; children: ReactNode }) {
  const a = useAzioni()
  const stato = async (nuovo: string, messaggio: string) => {
    try {
      await visiteService.cambiaStato(visita.id, nuovo)
      toast.success(messaggio)
      a.aggiorna()
    } catch (e) {
      toastErrore(e)
    }
  }
  const annullata = visita.stato === "ANNULLATA"
  return (
    <Guscio menu={
      <>
        <ContextMenuLabel>{visita.titoloCalendario}</ContextMenuLabel>
        <ContextMenuItem onSelect={() => a.apriVisita(visita)}><PanelRight aria-hidden />Dettagli della visita</ContextMenuItem>
        <ContextMenuItem onSelect={() => a.apriPaziente(visita.pazienteId)}><UserRound aria-hidden />Apri il paziente</ContextMenuItem>
        <ContextMenuItem disabled={annullata} onSelect={() => a.modificaVisita(visita)}><Pencil aria-hidden />Modifica o sposta</ContextMenuItem>
        <ContextMenuItem disabled={!visita.meetUrl} onSelect={() => window.open(visita.meetUrl!, "_blank", "noopener")}><Video aria-hidden />Apri Google Meet</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={visita.stato === "EFFETTUATA" || annullata} onSelect={() => void stato("EFFETTUATA", "Visita effettuata")}><Check aria-hidden />Segna effettuata</ContextMenuItem>
        <ContextMenuItem disabled={annullata} onSelect={() => void stato("NON_PRESENTATO", "Segnata come non presentato")}><X aria-hidden />Non presentato</ContextMenuItem>
        {visita.stato !== "PROGRAMMATA" ? (
          <ContextMenuItem onSelect={() => void stato("PROGRAMMATA", "Visita riaperta")}><Undo2 aria-hidden />Riporta a programmata</ContextMenuItem>
        ) : null}
        <ContextMenuItem onSelect={() => a.nuovaVisita({ pazienteId: visita.pazienteId })}><CalendarPlus aria-hidden />Fissa la successiva</ContextMenuItem>
        <VoceNuovoTask pazienteId={visita.pazienteId} />
        <ContextMenuSeparator />
        <SottomenuEmail riferimento={{ pazienteId: visita.pazienteId }} />
        <VociContatto cellulare={visita.pazienteCellulare} email={visita.pazienteEmail} />
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" disabled={annullata} onSelect={() => a.conferma({
          titolo: "Annullare la visita?",
          descrizione: "Sparisce dal calendario e il paziente riceve la notifica. Le visite successive vengono rinumerate.",
          etichetta: "Annulla visita",
          azione: () => stato("ANNULLATA", "Visita annullata"),
        })}><Trash2 aria-hidden />Annulla visita</ContextMenuItem>
      </>
    }>{children}</Guscio>
  )
}

export function MenuAcquisto({ acquisto, children }: { acquisto: Acquisto; children: ReactNode }) {
  const a = useAzioni()
  const { percorso, pazienteNome } = acquisto
  return (
    <Guscio menu={
      <>
        <ContextMenuLabel>{pazienteNome}</ContextMenuLabel>
        <ContextMenuItem onSelect={() => a.apriPaziente(percorso.pazienteId)}><UserRound aria-hidden />Apri il paziente</ContextMenuItem>
        <ContextMenuItem onSelect={() => a.nuovaVisita({ pazienteId: percorso.pazienteId })}><CalendarPlus aria-hidden />Nuova visita</ContextMenuItem>
        <ContextMenuItem onSelect={() => a.nuovoPercorso(percorso.pazienteId)}><Repeat aria-hidden />Rinnovo o mantenimento</ContextMenuItem>
        <ContextMenuItem onSelect={() => a.nuovoPagamento(percorso.pazienteId)}><Banknote aria-hidden />Nuovo pagamento</ContextMenuItem>
        <SottomenuEmail riferimento={{ pazienteId: percorso.pazienteId }} disabilitate={{ SOLLECITO_PAGAMENTO: acquisto.daPagare + acquisto.scaduto <= 0 }} />
        <VoceNuovoTask pazienteId={percorso.pazienteId} />
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" disabled={percorso.stato !== "ATTIVO"} onSelect={() => a.conferma({
          titolo: "Annullare l'acquisto?",
          descrizione: "Le rate ancora da pagare vengono annullate. Quelle incassate restano.",
          etichetta: "Annulla acquisto",
          azione: async () => {
            await percorsiService.annulla(percorso.id)
            toast.success("Acquisto annullato")
            a.aggiorna()
          },
        })}><Trash2 aria-hidden />Annulla acquisto</ContextMenuItem>
      </>
    }>{children}</Guscio>
  )
}

export function MenuPagamento({ pagamento, children }: { pagamento: Pagamento; children: ReactNode }) {
  const a = useAzioni()
  const pagato = pagamento.stato === "PAGATO"
  return (
    <Guscio menu={
      <>
        <ContextMenuLabel>{pagamento.pazienteNome}</ContextMenuLabel>
        <ContextMenuItem onSelect={() => a.apriPaziente(pagamento.pazienteId)}><UserRound aria-hidden />Apri il paziente</ContextMenuItem>
        <ContextMenuSeparator />
        {pagato ? (
          <ContextMenuItem disabled={pagamento.fatturato} onSelect={async () => {
            try {
              await pagamentiService.annullaRegistrazione(pagamento.id)
              toast.success("Registrazione annullata")
              a.aggiorna()
            } catch (e) {
              toastErrore(e)
            }
          }}><Undo2 aria-hidden />Segna come non pagato</ContextMenuItem>
        ) : (
          <ContextMenuItem onSelect={() => a.registraPagamento(pagamento)}><Check aria-hidden />Registra pagamento</ContextMenuItem>
        )}
        <ContextMenuItem disabled={!pagato || pagamento.fatturato} onSelect={() => a.nuovaFattura({ pagamento })}><Receipt aria-hidden />Emetti fattura</ContextMenuItem>
        <ContextMenuItem disabled={pagamento.fatturato} onSelect={() => a.modificaPagamento(pagamento)}><Pencil aria-hidden />Modifica</ContextMenuItem>
        <SottomenuEmail
          riferimento={{ pazienteId: pagamento.pazienteId, pagamentoId: pagamento.id }}
          disabilitate={{ SOLLECITO_PAGAMENTO: pagamento.stato !== "DA_PAGARE", FATTURA: !pagamento.fatturato }}
        />
        <VoceNuovoTask pazienteId={pagamento.pazienteId} />
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" disabled={pagamento.fatturato} onSelect={() => a.conferma({
          titolo: "Annullare il pagamento?",
          descrizione: `${pagamento.descrizione}: non comparirà più tra gli importi da incassare.`,
          etichetta: "Annulla pagamento",
          azione: async () => {
            await pagamentiService.annulla(pagamento.id)
            toast.success("Pagamento annullato")
            a.aggiorna()
          },
        })}><Trash2 aria-hidden />Annulla pagamento</ContextMenuItem>
      </>
    }>{children}</Guscio>
  )
}

export function MenuFattura({ fattura, children }: { fattura: Fattura; children: ReactNode }) {
  const a = useAzioni()
  const annullata = fattura.stato === "ANNULLATA"
  const tessera = async (inserita: boolean) => {
    try {
      await fattureService.segnaTessera(fattura.id, inserita)
      a.aggiorna()
    } catch (e) {
      toastErrore(e)
    }
  }
  return (
    <Guscio menu={
      <>
        <ContextMenuLabel>Fattura n. {fattura.numero}</ContextMenuLabel>
        <ContextMenuItem onSelect={() => void fattureService.apriPdf(fattura.id).catch(toastErrore)}><ExternalLink aria-hidden />Apri PDF</ContextMenuItem>
        <SottomenuEmail riferimento={{ pazienteId: fattura.pazienteId, fatturaId: fattura.id }} disabilitate={{ FATTURA: annullata }} />
        <ContextMenuItem onSelect={() => a.apriPaziente(fattura.pazienteId)}><UserRound aria-hidden />Apri il paziente</ContextMenuItem>
        <ContextMenuSeparator />
        {fattura.tsStato === "INSERITA" ? (
          <ContextMenuItem onSelect={() => void tessera(false)}><Undo2 aria-hidden />Togli "inserita" in Tessera Sanitaria</ContextMenuItem>
        ) : (
          <ContextMenuItem disabled={annullata || fattura.tsOpposizione} onSelect={() => void tessera(true)}><Landmark aria-hidden />Segna inserita in Tessera Sanitaria</ContextMenuItem>
        )}
        <VoceNuovoTask pazienteId={fattura.pazienteId} />
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" disabled={annullata} onSelect={() => a.conferma({
          titolo: `Annullare la fattura n. ${fattura.numero}?`,
          descrizione: "Il numero resta occupato. Se serve una nota di credito, va emessa a parte.",
          etichetta: "Annulla fattura",
          richiediTesto: "Motivo",
          azione: async (motivo) => {
            await fattureService.annulla(fattura.id, motivo)
            toast.success("Fattura annullata")
            a.aggiorna()
          },
        })}><Trash2 aria-hidden />Annulla fattura</ContextMenuItem>
      </>
    }>{children}</Guscio>
  )
}

export function MenuTask({ task, children }: { task: Task; children: ReactNode }) {
  const a = useAzioni()
  const fatto = task.stato === "FATTO"
  const cambia = async () => {
    try {
      await taskService.cambiaStato(task.id, !fatto)
      a.aggiorna()
    } catch (e) {
      toastErrore(e)
    }
  }
  return (
    <Guscio menu={
      <>
        <ContextMenuLabel>{task.titolo}</ContextMenuLabel>
        <ContextMenuItem onSelect={() => void cambia()}>{fatto ? <Undo2 aria-hidden /> : <Check aria-hidden />}{fatto ? "Riapri" : "Segna fatto"}</ContextMenuItem>
        <ContextMenuItem onSelect={() => a.modificaTask(task)}><Pencil aria-hidden />Modifica</ContextMenuItem>
        {task.pazienteId ? <ContextMenuItem onSelect={() => a.apriPaziente(task.pazienteId!)}><UserRound aria-hidden />Apri il paziente</ContextMenuItem> : null}
        {task.pazienteId ? <SottomenuEmail riferimento={{ pazienteId: task.pazienteId }} /> : null}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => a.conferma({
          titolo: "Eliminare il task?",
          descrizione: task.titolo,
          etichetta: "Elimina",
          azione: async () => {
            await taskService.elimina(task.id)
            toast.success("Task eliminato")
            a.aggiorna()
          },
        })}><Trash2 aria-hidden />Elimina</ContextMenuItem>
      </>
    }>{children}</Guscio>
  )
}

export function MenuRigaCheck({ riga, children }: { riga: RigaCheck; children: ReactNode }) {
  const a = useAzioni()
  return (
    <Guscio menu={
      <>
        <ContextMenuLabel>{riga.pazienteNome}</ContextMenuLabel>
        <ContextMenuItem onSelect={() => a.apriPaziente(riga.pazienteId)}><UserRound aria-hidden />Apri il paziente</ContextMenuItem>
        <ContextMenuItem onSelect={() => a.inserisciCheck(riga.pazienteId)}><ClipboardPlus aria-hidden />Inserisci check</ContextMenuItem>
        <VoceNuovoTask pazienteId={riga.pazienteId} />
        <ContextMenuSeparator />
        <SottomenuEmail riferimento={{ pazienteId: riga.pazienteId }} />
        <ContextMenuItem disabled={!riga.cellulare} onSelect={() => apriWhatsapp(riga.cellulare)}><MessageCircle aria-hidden />Scrivi su WhatsApp</ContextMenuItem>
      </>
    }>{children}</Guscio>
  )
}

/** Tasto destro ovunque nel gestionale: le righe hanno il loro menu, questo copre tutto il resto. */
export function MenuGenerale({ children }: { children: ReactNode }) {
  const a = useAzioni()
  return (
    <Guscio menu={
      <>
        <ContextMenuLabel>Crea</ContextMenuLabel>
        <ContextMenuItem onSelect={() => a.nuovoPaziente()}><UserPlus aria-hidden />Nuovo paziente</ContextMenuItem>
        <ContextMenuItem onSelect={() => a.nuovaVisita()}><CalendarPlus aria-hidden />Nuova visita</ContextMenuItem>
        <ContextMenuItem onSelect={() => a.nuovoPercorso()}><Route aria-hidden />Nuovo acquisto</ContextMenuItem>
        <ContextMenuItem onSelect={() => a.nuovoPagamento()}><Banknote aria-hidden />Nuovo pagamento</ContextMenuItem>
        <ContextMenuItem onSelect={() => a.nuovaFattura()}><Receipt aria-hidden />Nuova fattura</ContextMenuItem>
        <ContextMenuItem onSelect={() => a.inserisciCheck()}><ClipboardCheck aria-hidden />Inserisci check</ContextMenuItem>
        <ContextMenuSeparator />
        <SottomenuEmail riferimento={{}} />
        <VoceNuovoTask />
      </>
    }>{children}</Guscio>
  )
}
