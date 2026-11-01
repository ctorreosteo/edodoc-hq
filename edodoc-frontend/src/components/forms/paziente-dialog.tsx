import { useEffect, useState } from "react"
import { useAzioni } from "@/contexts/azioni-context"
import { Campo, Griglia, Scelta } from "@/components/forms/campo"
import { Finestra } from "@/components/forms/finestra"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FONTE, STATO_PAZIENTE } from "@/lib/etichette"
import { toast, toastErrore } from "@/lib/toast"
import { pazientiService } from "@/services/gestionale"
import type { Paziente, PazienteForm } from "@/types"

const VUOTO: PazienteForm = {
  nome: "", cognome: "", email: null, cellulare: null, codiceFiscale: null, dataNascita: null, indirizzo: null, cap: null,
  citta: null, provincia: null, stato: "LEAD", fonte: null, situazione: null, nota: null, pesoInizialeKg: null, pesoObiettivoKg: null,
}

const STATI = Object.fromEntries(Object.entries(STATO_PAZIENTE).map(([k, v]) => [k, v.testo]))

export function PazienteDialog({ open, onOpenChange, paziente, statoIniziale }: {
  open: boolean
  onOpenChange: (a: boolean) => void
  paziente?: Paziente
  statoIniziale?: string
}) {
  const { aggiorna } = useAzioni()
  const [form, setForm] = useState<PazienteForm>(VUOTO)
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => {
    if (open) setForm(paziente ? { ...VUOTO, ...paziente } : { ...VUOTO, stato: statoIniziale ?? "LEAD" })
  }, [open, paziente, statoIniziale])

  const testo = (campo: keyof PazienteForm) => ({
    id: `paziente-${campo}`,
    value: (form[campo] as string | null) ?? "",
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [campo]: e.target.value || null })),
  })
  const numero = (campo: "pesoInizialeKg" | "pesoObiettivoKg") => ({
    id: `paziente-${campo}`,
    type: "number",
    step: "0.1",
    value: form[campo] ?? "",
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [campo]: e.target.value ? Number(e.target.value) : null })),
  })

  const salva = async () => {
    setInCorso(true)
    try {
      if (paziente) await pazientiService.aggiorna(paziente.id, form)
      else await pazientiService.crea(form)
      toast.success(paziente ? "Paziente aggiornato" : "Paziente creato")
      aggiorna()
      onOpenChange(false)
    } catch (e) {
      toastErrore(e)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Finestra open={open} onOpenChange={onOpenChange} titolo={paziente ? "Modifica paziente" : "Nuovo paziente"} salva={salva} inCorso={inCorso} larga
      descrizione="Codice fiscale e indirizzo servono solo per la fattura: si possono aggiungere dopo il sì.">
      <Griglia>
        <Campo etichetta="Nome" id="paziente-nome"><Input {...testo("nome")} required /></Campo>
        <Campo etichetta="Cognome" id="paziente-cognome"><Input {...testo("cognome")} required /></Campo>
        <Campo etichetta="Email" id="paziente-email"><Input {...testo("email")} type="email" /></Campo>
        <Campo etichetta="Cellulare" id="paziente-cellulare"><Input {...testo("cellulare")} inputMode="tel" /></Campo>
        <Campo etichetta="Stato" id="paziente-stato">
          <Scelta id="paziente-stato" valore={form.stato} onChange={(stato) => setForm((f) => ({ ...f, stato }))} opzioni={STATI} />
        </Campo>
        <Campo etichetta="Come ti ha conosciuto" id="paziente-fonte">
          <Scelta id="paziente-fonte" valore={form.fonte} onChange={(fonte) => setForm((f) => ({ ...f, fonte }))} opzioni={FONTE} />
        </Campo>
        <Campo etichetta="Codice fiscale" id="paziente-codiceFiscale"><Input {...testo("codiceFiscale")} maxLength={16} className="uppercase" /></Campo>
        <Campo etichetta="Data di nascita" id="paziente-dataNascita"><Input {...testo("dataNascita")} type="date" /></Campo>
        <Campo etichetta="Indirizzo di residenza" id="paziente-indirizzo" className="sm:col-span-2"><Input {...testo("indirizzo")} /></Campo>
        <Campo etichetta="Città" id="paziente-citta"><Input {...testo("citta")} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etichetta="CAP" id="paziente-cap"><Input {...testo("cap")} maxLength={5} inputMode="numeric" /></Campo>
          <Campo etichetta="Provincia" id="paziente-provincia"><Input {...testo("provincia")} maxLength={2} className="uppercase" /></Campo>
        </div>
        <Campo etichetta="Peso iniziale (kg)" id="paziente-pesoInizialeKg"><Input {...numero("pesoInizialeKg")} /></Campo>
        <Campo etichetta="Peso obiettivo (kg)" id="paziente-pesoObiettivoKg"><Input {...numero("pesoObiettivoKg")} /></Campo>
      </Griglia>
      <Campo etichetta="Situazione" id="paziente-situazione"><Textarea {...testo("situazione")} placeholder="Il contesto da ricordare nel messaggio del mercoledì" /></Campo>
      <Campo etichetta="Nota" id="paziente-nota"><Textarea {...testo("nota")} /></Campo>
    </Finestra>
  )
}
