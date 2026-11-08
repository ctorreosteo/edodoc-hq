import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { NuovaDietaDialog, type DatiNuovaDieta } from "@/components/diete/nuova-dieta-dialog"
import { CheckDialog } from "@/components/forms/check-dialog"
import { ConfermaDialog, type Conferma } from "@/components/forms/conferma-dialog"
import { EmailDialog } from "@/components/forms/email-dialog"
import { FatturaDialog } from "@/components/forms/fattura-dialog"
import { PagamentoDialog } from "@/components/forms/pagamento-dialog"
import { PazienteDialog } from "@/components/forms/paziente-dialog"
import { PercorsoDialog } from "@/components/forms/percorso-dialog"
import { RegistraPagamentoDialog } from "@/components/forms/registra-pagamento-dialog"
import { TaskDialog } from "@/components/forms/task-dialog"
import { VisitaDialog } from "@/components/forms/visita-dialog"
import { PazienteSheet } from "@/components/paziente-sheet"
import { VisitaSheet } from "@/components/visite/visita-sheet"
import type { RichiestaEmail } from "@/lib/email"
import { toastErrore } from "@/lib/toast"
import { taskService } from "@/services/gestionale"
import type { Pagamento, Paziente, Task, TaskForm, TaskStruttura, Visita } from "@/types"

type Azioni = {
  /** Cresce a ogni salvataggio: le pagine la usano per ricaricare. */
  versione: number
  aggiorna: () => void
  /** Cartelle e liste dei task: si ricaricano insieme a tutto il resto con aggiorna() */
  struttura: TaskStruttura
  apriPaziente: (id: number) => void
  /** Scheda laterale della visita, come quella del paziente. */
  apriVisita: (visita: Visita) => void
  nuovoPaziente: (stato?: string) => void
  modificaPaziente: (paziente: Paziente) => void
  nuovoPercorso: (pazienteId?: number) => void
  nuovaVisita: (dati?: { pazienteId?: number; inizio?: string }) => void
  modificaVisita: (visita: Visita) => void
  nuovoPagamento: (pazienteId?: number) => void
  modificaPagamento: (pagamento: Pagamento) => void
  registraPagamento: (pagamento: Pagamento) => void
  nuovaFattura: (dati?: { pagamento?: Pagamento; pazienteId?: number }) => void
  nuovoTask: (dati?: Partial<TaskForm>) => void
  modificaTask: (task: Task) => void
  /** Task del preset senza passare dal form: è l'azione rapida del menu contestuale. */
  inserisciCheck: (pazienteId?: number) => void
  conferma: (dati: Conferma) => void
  inviaEmail: (richiesta: RichiestaEmail) => void
  /** Dieta per un paziente (o modello): dopo la creazione si apre l'editor. */
  nuovaDieta: (dati?: DatiNuovaDieta) => void
}

const AzioniContext = createContext<Azioni | undefined>(undefined)

export function useAzioni() {
  const contesto = useContext(AzioniContext)
  if (!contesto) throw new Error("useAzioni deve stare dentro AzioniProvider")
  return contesto
}

type Aperta<T> = { aperta: boolean; dati: T }

function useFinestra<T>(iniziale: T) {
  const [stato, setStato] = useState<Aperta<T>>({ aperta: false, dati: iniziale })
  return {
    aperta: stato.aperta,
    dati: stato.dati,
    apri: useCallback((dati: T) => setStato({ aperta: true, dati }), []),
    onOpenChange: useCallback((aperta: boolean) => setStato((s) => ({ ...s, aperta })), []),
  }
}

export function AzioniProvider({ children }: { children: ReactNode }) {
  const [versione, setVersione] = useState(0)
  const [struttura, setStruttura] = useState<TaskStruttura>({ cartelle: [], liste: [] })
  const [pazienteAperto, setPazienteAperto] = useState<number | null>(null)
  const aggiorna = useCallback(() => setVersione((v) => v + 1), [])
  const chiudiPaziente = useCallback(() => setPazienteAperto(null), [])
  const [visitaAperta, setVisitaAperta] = useState<Visita | null>(null)
  const chiudiVisita = useCallback(() => setVisitaAperta(null), [])

  const paziente = useFinestra<{ paziente?: Paziente; stato?: string }>({})
  const percorso = useFinestra<{ pazienteId?: number }>({})
  const visita = useFinestra<{ visita?: Visita; pazienteId?: number; inizio?: string }>({})
  const pagamento = useFinestra<{ pagamento?: Pagamento; pazienteId?: number }>({})
  const registra = useFinestra<Pagamento | null>(null)
  const fattura = useFinestra<{ pagamento?: Pagamento; pazienteId?: number }>({})
  const task = useFinestra<{ task?: Task; iniziali?: Partial<TaskForm> }>({})
  const check = useFinestra<{ pazienteId?: number }>({})
  const conferma = useFinestra<Conferma | null>(null)
  const email = useFinestra<RichiestaEmail | null>(null)
  const dieta = useFinestra<DatiNuovaDieta>({})

  useEffect(() => {
    taskService.struttura().then(setStruttura).catch(toastErrore)
  }, [versione])

  const { apri: apriPazienteForm } = paziente
  const { apri: apriPercorso } = percorso
  const { apri: apriVisitaForm } = visita
  const { apri: apriPagamento } = pagamento
  const { apri: apriRegistra } = registra
  const { apri: apriFattura } = fattura
  const { apri: apriTask } = task
  const { apri: apriCheck } = check
  const { apri: apriConferma } = conferma
  const { apri: apriEmail } = email
  const { apri: apriDieta } = dieta

  const valore = useMemo<Azioni>(() => ({
    versione, aggiorna, struttura,
    apriPaziente: setPazienteAperto,
    apriVisita: setVisitaAperta,
    nuovoPaziente: (stato) => apriPazienteForm({ stato }),
    modificaPaziente: (p) => apriPazienteForm({ paziente: p }),
    nuovoPercorso: (pazienteId) => apriPercorso({ pazienteId }),
    nuovaVisita: (dati) => apriVisitaForm({ ...dati }),
    modificaVisita: (v) => apriVisitaForm({ visita: v }),
    nuovoPagamento: (pazienteId) => apriPagamento({ pazienteId }),
    modificaPagamento: (p) => apriPagamento({ pagamento: p }),
    registraPagamento: apriRegistra,
    nuovaFattura: (dati) => apriFattura({ ...dati }),
    nuovoTask: (iniziali) => apriTask({ iniziali }),
    modificaTask: (t) => apriTask({ task: t }),
    inserisciCheck: (pazienteId) => apriCheck({ pazienteId }),
    conferma: apriConferma,
    inviaEmail: apriEmail,
    nuovaDieta: (dati) => apriDieta({ ...dati }),
  }), [versione, aggiorna, struttura, apriPazienteForm, apriPercorso, apriVisitaForm, apriPagamento, apriRegistra, apriFattura, apriTask, apriCheck, apriConferma, apriEmail, apriDieta])

  return (
    <AzioniContext.Provider value={valore}>
      {children}
      <PazienteSheet pazienteId={pazienteAperto} onClose={chiudiPaziente} />
      <VisitaSheet visita={visitaAperta} onClose={chiudiVisita} />
      <PazienteDialog open={paziente.aperta} onOpenChange={paziente.onOpenChange} paziente={paziente.dati.paziente} statoIniziale={paziente.dati.stato} />
      <PercorsoDialog open={percorso.aperta} onOpenChange={percorso.onOpenChange} pazienteId={percorso.dati.pazienteId} />
      <VisitaDialog open={visita.aperta} onOpenChange={visita.onOpenChange} {...visita.dati} />
      <PagamentoDialog open={pagamento.aperta} onOpenChange={pagamento.onOpenChange} {...pagamento.dati} />
      <RegistraPagamentoDialog open={registra.aperta} onOpenChange={registra.onOpenChange} pagamento={registra.dati} />
      <FatturaDialog open={fattura.aperta} onOpenChange={fattura.onOpenChange} {...fattura.dati} />
      <TaskDialog open={task.aperta} onOpenChange={task.onOpenChange} {...task.dati} />
      <CheckDialog open={check.aperta} onOpenChange={check.onOpenChange} pazienteId={check.dati.pazienteId} />
      <EmailDialog open={email.aperta} onOpenChange={email.onOpenChange} richiesta={email.dati} />
      <NuovaDietaDialog open={dieta.aperta} onOpenChange={dieta.onOpenChange} dati={dieta.dati} />
      <ConfermaDialog open={conferma.aperta} onOpenChange={conferma.onOpenChange} conferma={conferma.dati} />
    </AzioniContext.Provider>
  )
}
