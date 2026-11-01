import { useState } from 'react'
import { Check, Copy, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react'

const SCOPE = 'https://www.googleapis.com/auth/gmail.modify'

/** La casella non è collegata: cosa serve in Google Workspace e nelle Impostazioni. */
export function EmailSetup({ dettaglio, onRiprova }: { dettaglio: string; onRiprova: () => void }) {
  const [copiato, setCopiato] = useState(false)
  return (
    <div className="em-setup">
      <div className="em-setup-orb" aria-hidden><KeyRound /></div>
      <h2>La tua casella è quasi pronta</h2>
      <p className="em-setup-sotto">Il gestionale apre la casella Google Workspace del dottore con il Service Account. Mancano questi passaggi.</p>
      <ol className="em-setup-passi">
        <li>Apri <strong>admin.google.com</strong> → Sicurezza → Accesso e controllo dei dati → Controlli API.</li>
        <li>Entra in <strong>Gestisci delega a livello di dominio</strong> e modifica il client del Service Account del gestionale.</li>
        <li>
          Aggiungi questo ambito OAuth:
          <button
            type="button"
            className="em-setup-scope"
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
        <li>In <strong>Impostazioni</strong> compila l'account del dottore e abilita «Invio email da Gmail».</li>
      </ol>
      <p className="em-setup-dettaglio"><ShieldCheck aria-hidden /> {dettaglio}</p>
      <button type="button" className="em-btn em-btn--primario em-btn--grande" onClick={onRiprova}><RefreshCw aria-hidden /> Riprova</button>
    </div>
  )
}
