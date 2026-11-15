import type { CSSProperties } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { urlMedia, type PlannerBioPubblica } from '@/services/planner-service'

/*
  La pagina «link in bio» com'è vista da chi arriva da Instagram: foto, titolo, descrizione, pulsanti e gli ultimi
  post. La usano la pagina pubblica /bio/:slug e l'anteprima nelle impostazioni del Planner (hrefDi = null: niente link).
  Stile in lux-planner.css (.pl-bio-*), senza dipendere dal tema del gestionale.
*/
export function BioVista({ bio, hrefDi }: { bio: PlannerBioPubblica; hrefDi: ((chiave: string) => string) | null }) {
  const Elemento = hrefDi ? 'a' : 'span'
  return (
    <div className="pl-bio-vista" style={{ '--bio': bio.colore } as CSSProperties}>
      <div className="pl-bio-alone" aria-hidden />
      <div className="pl-bio-testa">
        {bio.immagineUrl ? <img className="pl-bio-foto" src={bio.immagineUrl} alt="" /> : <div className="pl-bio-foto pl-bio-foto--iniziale">{bio.titolo.charAt(0)}</div>}
        <div className="pl-bio-titolo">{bio.titolo}</div>
        {bio.descrizione ? <p className="pl-bio-descrizione">{bio.descrizione}</p> : null}
      </div>
      <div className="pl-bio-pulsanti">
        {bio.pulsanti.map((p, i) => (
          <Elemento key={p.id} className="pl-bio-pulsante" style={{ animationDelay: `${80 + i * 50}ms` }} {...(hrefDi ? { href: hrefDi(p.id), rel: 'noopener' } : {})}>
            <span>{p.etichetta}</span>
            <ArrowUpRight className="size-4" />
          </Elemento>
        ))}
      </div>
      {bio.post.length ? (
        <div className="pl-bio-post">
          {bio.post.map((p) => (
            <Elemento key={p.id} className="pl-bio-post-tile" title={p.titolo ?? ''} {...(hrefDi ? { href: hrefDi(`post:${p.id}`), rel: 'noopener' } : {})}>
              <img src={urlMedia(p.immagineUrl)} alt={p.titolo ?? ''} loading="lazy" />
            </Elemento>
          ))}
        </div>
      ) : null}
    </div>
  )
}
