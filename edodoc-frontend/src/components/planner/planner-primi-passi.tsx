import { useEffect, useState } from 'react'
import { Check, Clock, Globe, Plug, Rocket, Sparkles, X } from 'lucide-react'
import { plannerService, type PlannerStato } from '@/services/planner-service'

const chiave = (brandId: number) => `planner.primi-passi.${brandId}`

function nascosta(brandId: number): boolean {
  try {
    return localStorage.getItem(chiave(brandId)) === '1'
  } catch {
    return false
  }
}

/**
 * Primi passi di uno spazio appena creato: account collegati, orari della coda, idee del piano, primo post, link in
 * bio. Ogni passo si spunta da solo quando è fatto; la guida sparisce quando sono fatti tutti o si chiude.
 */
export function PlannerPrimiPassi({
  stato,
  onImpostazioni,
  onGeneraAi,
  onNuovo,
}: {
  stato: PlannerStato
  onImpostazioni: () => void
  onGeneraAi: () => void
  onNuovo: () => void
}) {
  const [chiusa, setChiusa] = useState(() => nascosta(stato.brandId))
  const [slot, setSlot] = useState<number | null>(null)
  const [bio, setBio] = useState<boolean | null>(null)

  useEffect(() => {
    setChiusa(nascosta(stato.brandId))
    void plannerService.slot().then((l) => setSlot(l.length)).catch(() => setSlot(0))
    void plannerService.bio(stato.brandId).then((b) => setBio(!!b.id && b.attiva)).catch(() => setBio(false))
  }, [stato.brandId])

  const c = stato.contatori
  const passi = [
    {
      fatto: stato.destinazioni.some((d) => d.automatica),
      icona: Plug,
      titolo: 'Collega gli account',
      testo: 'Pagine Meta, YouTube, schede Google e TikTok pubblicano da soli; gli altri canali a mano.',
      azione: { etichetta: 'Spazi e account', fai: onImpostazioni },
    },
    {
      fatto: (slot ?? 0) > 0,
      icona: Clock,
      titolo: 'Scegli gli orari della coda',
      testo: '«Prossimo libero» e gli slot del calendario partono da qui.',
      azione: { etichetta: 'Orari', fai: onImpostazioni },
    },
    {
      fatto: c.idee + c.bozze > 0 || c.programmatiSettimana > 0 || c.pubblicatiMese > 0,
      icona: Sparkles,
      titolo: 'Riempi il piano',
      testo: "L'AI propone le idee del mese da rubriche e giornate mondiali.",
      azione: stato.aiDisponibile ? { etichetta: 'Genera il piano', fai: onGeneraAi } : null,
    },
    {
      fatto: c.programmatiSettimana > 0 || c.pubblicatiMese > 0,
      icona: Rocket,
      titolo: 'Programma il primo post',
      testo: 'Scrivi una volta, scegli i canali, controlla le anteprime.',
      azione: { etichetta: 'Nuovo post', fai: onNuovo },
    },
    {
      fatto: !!bio,
      icona: Globe,
      titolo: 'Attiva il link in bio',
      testo: 'Una pagina con pulsanti e ultimi post, da mettere nel profilo Instagram.',
      azione: { etichetta: 'Link in bio', fai: onImpostazioni },
    },
  ]
  const fatti = passi.filter((p) => p.fatto).length
  if (chiusa || slot == null || bio == null || fatti === passi.length) return null

  const chiudi = () => {
    try {
      localStorage.setItem(chiave(stato.brandId), '1')
    } catch {
      /* storage non disponibile */
    }
    setChiusa(true)
  }

  return (
    <section className="pl-primi-passi" aria-label="Primi passi">
      <div className="pl-primi-passi-testa">
        <div>
          <b>Primi passi in questo spazio</b>
          <span>
            {fatti} di {passi.length} fatti
          </span>
        </div>
        <div className="pl-primi-passi-barra" aria-hidden>
          <span style={{ width: `${(fatti / passi.length) * 100}%` }} />
        </div>
        <button type="button" className="pl-icon-btn" onClick={chiudi} aria-label="Nascondi i primi passi">
          <X className="size-4" />
        </button>
      </div>
      <ol>
        {passi.map((p) => {
          const Icona = p.icona
          return (
            <li key={p.titolo} data-fatto={p.fatto ? '' : undefined}>
              <span className="pl-primi-passi-icona">{p.fatto ? <Check className="size-4" /> : <Icona className="size-4" />}</span>
              <b>{p.titolo}</b>
              <span>{p.testo}</span>
              {!p.fatto && p.azione ? (
                <button type="button" className="pl-btn" data-variante="mini" onClick={p.azione.fai}>
                  {p.azione.etichetta}
                </button>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
