import { useState } from 'react'
import { CalendarCheck2, Check, Copy, RefreshCw, ShieldCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const SCOPE = 'https://www.googleapis.com/auth/calendar'

/** La delega Google Calendar non è autorizzata: cosa deve fare l'amministratore di Google Workspace. */
export function AgendaSetup({ dettaglio, onRiprova }: { dettaglio: string; onRiprova: () => void }) {
  const [copiato, setCopiato] = useState(false)
  return (
    <div className="ag-setup">
      <div className="ag-setup-orb" aria-hidden><CalendarCheck2 /></div>
      <h2>Il tuo calendario è quasi pronto</h2>
      <p className="ag-setup-sotto">
        Il gestionale apre il Google Calendar del dottore con il Service Account, come per la posta. Manca un permesso in Google Admin.
      </p>
      <ol className="ag-setup-passi">
        <li>Apri <strong>admin.google.com</strong> → Sicurezza → Accesso e controllo dei dati → Controlli API.</li>
        <li>Entra in <strong>Gestisci delega a livello di dominio</strong> e modifica il client del Service Account del gestionale.</li>
        <li>
          Aggiungi questo ambito OAuth agli altri, separato da virgola:
          <button
            type="button"
            className="ag-setup-scope"
            onClick={() => {
              void navigator.clipboard?.writeText(SCOPE).then(() => {
                setCopiato(true)
                setTimeout(() => setCopiato(false), 1800)
              })
            }}
          >
            <code>{SCOPE}</code>
            {copiato ? <Check aria-hidden /> : <Copy aria-hidden />}
          </button>
        </li>
        <li>Salva e attendi qualche minuto che Google propaghi il permesso.</li>
      </ol>
      <p className="ag-setup-dettaglio"><ShieldCheck aria-hidden /> {dettaglio}</p>
      <button type="button" className="ag-btn ag-btn--primario ag-btn--grande" onClick={onRiprova}><RefreshCw aria-hidden /> Riprova</button>
    </div>
  )
}

const GRUPPI: { titolo: string; voci: [string[], string][] }[] = [
  {
    titolo: 'Navigazione',
    voci: [
      [['T'], 'Vai a oggi'],
      [['J'], 'Periodo successivo'],
      [['K'], 'Periodo precedente'],
      [['←', '→'], 'Indietro / avanti'],
      [['/'], 'Cerca negli eventi'],
    ],
  },
  {
    titolo: 'Viste',
    voci: [
      [['D'], 'Giorno'],
      [['X'], '3 giorni'],
      [['W'], 'Settimana'],
      [['M'], 'Mese'],
      [['Y'], 'Anno'],
      [['A'], 'Elenco'],
    ],
  },
  {
    titolo: 'Eventi',
    voci: [
      [['C'], 'Nuovo evento'],
      [['V'], 'Fissa una visita'],
      [['E'], "Modifica l'evento aperto"],
      [['Canc'], "Elimina l'evento aperto"],
      [['Z'], "Annulla l'ultima azione"],
      [['R'], 'Sincronizza ora'],
      [['Esc'], 'Chiudi'],
    ],
  },
  {
    titolo: 'Con il mouse',
    voci: [
      [['clic'], 'Crea un evento di 1 ora'],
      [['trascina'], 'Disegna un evento'],
      [['trascina', 'evento'], 'Spostalo (anche in un altro giorno)'],
      [['bordo', 'basso'], 'Cambia la durata'],
      [['⌘', 'rotella'], "Zoom sull'orario"],
      [['⌥', 'clic'], 'Solo quel calendario'],
    ],
  },
]

export function AgendaScorciatoie({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl" data-vl="" data-vl-page="agenda">
        <DialogHeader>
          <DialogTitle>Scorciatoie da tastiera</DialogTitle>
          <DialogDescription>Il tempo alla velocità del pensiero.</DialogDescription>
        </DialogHeader>
        <div className="ag-scorciatoie">
          {GRUPPI.map((g) => (
            <section key={g.titolo}>
              <h4>{g.titolo}</h4>
              <dl>
                {g.voci.map(([tasti, cosa]) => (
                  <div key={cosa}>
                    <dt>{tasti.map((t) => <kbd key={t}>{t}</kbd>)}</dt>
                    <dd>{cosa}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
